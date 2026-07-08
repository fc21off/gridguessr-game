/**
 * Geography Grid Guesses - Game Logic Controller
 */

// Bounding boxes for metropolitan/mainland areas of each country
const MAP_BOUNDS = {
  germany: { minLat: 47.2, maxLat: 55.1, minLng: 5.8, maxLng: 15.1 },
  france: { minLat: 41.3, maxLat: 51.1, minLng: -5.2, maxLng: 9.6 },
  spain: { minLat: 35.7, maxLat: 43.9, minLng: -9.5, maxLng: 3.4 },
  uk: { minLat: 49.8, maxLat: 58.8, minLng: -8.7, maxLng: 1.8 },
  us: { minLat: 24.3, maxLat: 49.4, minLng: -125.0, maxLng: -66.8 },
  japan: { minLat: 30.5, maxLat: 45.6, minLng: 129.0, maxLng: 145.9 }
};

const DIFFICULTY_SETTINGS = {
  '2': { points: 1, label: 'Easy' },
  '3': { points: 2, label: 'Medium' },
  '4': { points: 3, label: 'Hard' },
  '6': { points: 4, label: 'Expert' },
  '8': { points: 5, label: 'Master' },
  '16': { points: 7, label: 'Final Boss' }
};

class GeoguessGame {
  constructor() {
    this.selectedCountry = null;
    this.currentRound = 0;
    this.score = 0;
    this.maxPossibleScore = 0;
    this.roundsPlayed = []; // array of { city, gridSize, guessCell, correctCell, success, pointsGained }
    
    // Current round state
    this.currentGridSize = 6; // Default to 6x6
    this.currentCity = null;
    this.gameActive = false;
    this.gameState = 'WELCOME'; // WELCOME, PLAYING, FEEDBACK, GAMEOVER
    
    // Canvas dimensions
    this.canvas = document.getElementById('mapCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.projection = null;
    
    // Hover tracking
    this.hoveredCell = null; // { col, row }
    
    // Statistics
    this.highScores = JSON.parse(localStorage.getItem('geoguess_highscores')) || {};

    // Bind event listeners
    this.initEventListeners();
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
  }

  initEventListeners() {
    // Country buttons click
    document.querySelectorAll('.country-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const button = e.currentTarget;
        document.querySelectorAll('.country-btn').forEach(b => b.classList.remove('selected'));
        button.classList.add('selected');
        this.selectedCountry = button.dataset.country;
        
        // Sound tick
        Sound.playTick();
        
        // Show start button
        document.getElementById('startBtn').removeAttribute('disabled');
      });
    });

    // Start Game Button
    document.getElementById('startBtn').addEventListener('click', () => {
      if (this.selectedCountry) {
        this.startGame();
      }
    });

    // Grid Size Options buttons
    document.querySelectorAll('.grid-opt-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        if (this.gameState !== 'PLAYING') return;
        
        const button = e.currentTarget;
        document.querySelectorAll('.grid-opt-btn').forEach(b => b.classList.remove('selected'));
        button.classList.add('selected');
        
        this.currentGridSize = parseInt(button.dataset.grid);
        Sound.playTick();
        this.drawGame();
      });
    });

    // Canvas Mouse Events
    this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    this.canvas.addEventListener('mouseleave', () => {
      this.hoveredCell = null;
      if (this.gameState === 'PLAYING') {
        this.drawGame();
      }
    });
    this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));

    // Next Round Button
    document.getElementById('nextRoundBtn').addEventListener('click', () => {
      this.nextRound();
    });

    // Play Again Button
    document.getElementById('playAgainBtn').addEventListener('click', () => {
      this.resetToWelcome();
    });

    // Mute Button
    document.getElementById('muteBtn').addEventListener('click', () => {
      const isMuted = Sound.toggleMute();
      const icon = document.querySelector('#muteBtn i');
      if (isMuted) {
        icon.className = 'fas fa-volume-mute';
        document.getElementById('muteBtn').style.borderColor = 'var(--accent-danger)';
      } else {
        icon.className = 'fas fa-volume-up';
        document.getElementById('muteBtn').style.borderColor = 'var(--border-color)';
      }
    });
  }

  resizeCanvas() {
    if (!this.canvas) return;
    const parent = this.canvas.parentElement;
    if (!parent) return;
    
    // Temporarily clear styling to get accurate container width from browser layout
    parent.style.width = '';
    parent.style.height = '';
    
    const availableWidth = parent.clientWidth || 500;
    
    // Cap height at 75% of screen height to guarantee no scrolling, max width 780px
    const maxViewportHeight = Math.min(window.innerHeight - 200, 780);
    const size = Math.min(availableWidth, maxViewportHeight);
    
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = size * dpr;
    this.canvas.height = size * dpr;
    
    this.canvas.style.width = `${size}px`;
    this.canvas.style.height = `${size}px`;
    
    // Lock parent container to match canvas size exactly
    parent.style.width = `${size}px`;
    parent.style.height = `${size}px`;
    
    this.ctx.scale(dpr, dpr);
    this.canvasWidth = size;
    this.canvasHeight = size;
    
    if (this.selectedCountry) {
      this.updateProjection();
      this.drawGame();
    }
  }

  updateProjection() {
    if (!this.selectedCountry) return;
    const bounds = MAP_BOUNDS[this.selectedCountry];
    this.projection = getProjection(bounds, this.canvasWidth, this.canvasHeight);
  }

  startGame() {
    this.currentRound = 1;
    this.score = 0;
    this.maxPossibleScore = 0;
    this.roundsPlayed = [];
    this.gameActive = true;
    this.gameState = 'PLAYING';
    
    // Toggle body class for fullscreen game mode
    document.body.classList.add('game-active');
    
    // Update screen visibility
    document.getElementById('welcomeScreen').classList.remove('active');
    document.getElementById('playScreen').classList.add('active');
    
    this.resizeCanvas(); // Update canvas sizing now that the container is visible
    this.updateProjection();
    this.loadRound();
  }

  loadRound() {
    this.gameState = 'PLAYING';
    
    // Choose a random city that hasn't been used yet (or reset if all used)
    const allCities = COUNTRY_CITIES[this.selectedCountry];
    const usedCities = this.roundsPlayed.map(r => r.city.name);
    let availableCities = allCities.filter(c => !usedCities.includes(c.name));
    
    if (availableCities.length === 0) {
      availableCities = allCities; // Fallback: reuse
    }
    
    this.currentCity = availableCities[Math.floor(Math.random() * availableCities.length)];
    
    // Reset difficulty to default 6x6 or keep current selection
    document.querySelectorAll('.grid-opt-btn').forEach(btn => {
      if (parseInt(btn.dataset.grid) === this.currentGridSize) {
        btn.classList.add('selected');
      } else {
        btn.classList.remove('selected');
      }
    });

    // Enable selecting difficulty buttons
    document.querySelectorAll('.grid-opt-btn').forEach(btn => btn.removeAttribute('disabled'));

    // Hide feedback overlay
    document.getElementById('feedbackOverlay').classList.remove('active');

    // Update stats UI
    document.getElementById('currentRound').innerText = `${this.currentRound} / 15`;
    document.getElementById('currentScore').innerText = this.score;
    document.getElementById('maxScore').innerText = this.maxPossibleScore;
    document.getElementById('targetCityName').innerText = this.currentCity.name;
    
    this.hoveredCell = null;
    this.drawGame();
  }

  handleMouseMove(e) {
    if (this.gameState !== 'PLAYING' || !this.projection) return;

    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const proj = this.projection;
    
    // Check if mouse is inside the grid
    if (mx >= proj.gridX && mx <= proj.gridX + proj.gridWidth &&
        my >= proj.gridY && my <= proj.gridY + proj.gridHeight) {
      
      const pctX = (mx - proj.gridX) / proj.gridWidth;
      const pctY = (my - proj.gridY) / proj.gridHeight;
      
      const col = Math.floor(pctX * this.currentGridSize);
      const row = Math.floor(pctY * this.currentGridSize);
      
      const newHover = { col, row };
      
      if (!this.hoveredCell || this.hoveredCell.col !== col || this.hoveredCell.row !== row) {
        this.hoveredCell = newHover;
        Sound.playTick();
        this.drawGame();
      }
    } else {
      if (this.hoveredCell !== null) {
        this.hoveredCell = null;
        this.drawGame();
      }
    }
  }

  handleCanvasClick(e) {
    if (this.gameState !== 'PLAYING' || !this.projection) return;
    
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const proj = this.projection;
    
    if (mx >= proj.gridX && mx <= proj.gridX + proj.gridWidth &&
        my >= proj.gridY && my <= proj.gridY + proj.gridHeight) {
      
      const pctX = (mx - proj.gridX) / proj.gridWidth;
      const pctY = (my - proj.gridY) / proj.gridHeight;
      
      const col = Math.floor(pctX * this.currentGridSize);
      const row = Math.floor(pctY * this.currentGridSize);
      
      const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      const guessCell = alphabet[col] + (row + 1);
      
      // Calculate correct cell
      const cityProj = proj.project(this.currentCity.lat, this.currentCity.lng);
      const correctPctX = Math.max(0, Math.min(0.999, (cityProj.x - proj.gridX) / proj.gridWidth));
      const correctPctY = Math.max(0, Math.min(0.999, (cityProj.y - proj.gridY) / proj.gridHeight));
      const correctCol = Math.floor(correctPctX * this.currentGridSize);
      const correctRow = Math.floor(correctPctY * this.currentGridSize);
      const correctCell = alphabet[correctCol] + (correctRow + 1);
      
      const success = (col === correctCol && row === correctRow);
      const pointsGained = success ? DIFFICULTY_SETTINGS[this.currentGridSize].points : 0;
      
      this.score += pointsGained;
      this.maxPossibleScore += DIFFICULTY_SETTINGS[this.currentGridSize].points;
      
      this.roundsPlayed.push({
        city: this.currentCity,
        gridSize: this.currentGridSize,
        guessCell,
        correctCell,
        guessCoords: proj.unproject(mx, my),
        clickPos: { x: mx, y: my },
        success,
        pointsGained
      });

      this.showFeedback(success, guessCell, correctCell, pointsGained);
    }
  }

  showFeedback(success, guessCell, correctCell, points) {
    this.gameState = 'FEEDBACK';
    
    // Disable difficulty buttons during feedback
    document.querySelectorAll('.grid-opt-btn').forEach(btn => btn.setAttribute('disabled', 'true'));
    
    const card = document.getElementById('feedbackCard');
    const title = document.getElementById('feedbackTitle');
    const icon = document.getElementById('feedbackIcon');
    const detail = document.getElementById('feedbackDetail');
    
    if (success) {
      card.className = 'feedback-card correct';
      title.innerText = 'CORRECT!';
      icon.innerText = '🏆';
      detail.innerHTML = `You correctly identified that <strong>${this.currentCity.name}</strong> is in cell <strong>${correctCell}</strong>.<br>+${points} points earned!`;
      Sound.playSuccess();
    } else {
      card.className = 'feedback-card incorrect';
      title.innerText = 'INCORRECT';
      icon.innerText = '❌';
      detail.innerHTML = `You guessed cell <strong>${guessCell}</strong>, but <strong>${this.currentCity.name}</strong> is actually located in cell <strong>${correctCell}</strong>.<br>No points earned.`;
      Sound.playFailure();
    }
    
    // Redraw game to show the visual target line, guess dot, and correct dot
    this.drawGame();

    // Show feedback overlay
    document.getElementById('feedbackOverlay').classList.add('active');
  }

  nextRound() {
    if (this.currentRound < 15) {
      this.currentRound++;
      this.loadRound();
    } else {
      this.endGame();
    }
  }

  endGame() {
    this.gameState = 'GAMEOVER';
    
    // Toggle body class to exit fullscreen mode
    document.body.classList.remove('game-active');
    
    document.getElementById('playScreen').classList.remove('active');
    document.getElementById('gameOverScreen').classList.add('active');
    
    // Play triumph sound
    Sound.playTriumph();

    // Compute stats
    const correctCount = this.roundsPlayed.filter(r => r.success).length;
    const accuracy = Math.round((correctCount / 15) * 100);
    
    // Display stats
    document.getElementById('finalScore').innerText = `${this.score} / ${this.maxPossibleScore}`;
    document.getElementById('totalCorrect').innerText = `${correctCount} / 15`;
    document.getElementById('gameAccuracy').innerText = `${accuracy}%`;
    
    // Map accuracy rating text
    let rating = 'Novice Explorer 🧭';
    if (accuracy >= 90) rating = 'Global Supercomputer 🧠🤖';
    else if (accuracy >= 70) rating = 'Master Navigator 🌐';
    else if (accuracy >= 50) rating = 'Professional Geographer 🗺️';
    else if (accuracy >= 30) rating = 'Regional Guide 🚗';
    document.getElementById('accuracyRating').innerText = rating;

    // Check & Save Highscore
    const prevHighScore = this.highScores[this.selectedCountry] || 0;
    if (this.score > prevHighScore) {
      this.highScores[this.selectedCountry] = this.score;
      localStorage.setItem('geoguess_highscores', JSON.stringify(this.highScores));
      document.getElementById('highScoreBadge').style.display = 'block';
    } else {
      document.getElementById('highScoreBadge').style.display = 'none';
    }
    
    document.getElementById('localHighScore').innerText = `Best: ${this.highScores[this.selectedCountry] || this.score} pts`;

    // Render recap map
    this.drawRecapMap();
  }

  resetToWelcome() {
    this.selectedCountry = null;
    this.gameState = 'WELCOME';
    this.gameActive = false;
    
    // Toggle body class to exit fullscreen mode
    document.body.classList.remove('game-active');
    
    document.getElementById('gameOverScreen').classList.remove('active');
    document.getElementById('welcomeScreen').classList.add('active');
    
    // Reset flags
    document.querySelectorAll('.country-btn').forEach(btn => btn.classList.remove('selected'));
    document.getElementById('startBtn').setAttribute('disabled', 'true');
  }

  drawGame() {
    const ctx = this.ctx;
    const width = this.canvasWidth;
    const height = this.canvasHeight;
    
    // 1. Clear background
    ctx.fillStyle = '#0a0e17'; // Match CSS primary background
    ctx.fillRect(0, 0, width, height);
    
    if (!this.projection || !this.selectedCountry) return;
    const proj = this.projection;
    
    // 2. Draw landmass
    const mapData = COUNTRY_MAPS[this.selectedCountry];
    ctx.fillStyle = '#111927'; // Subtle dark-blue/grey fill for landmass
    ctx.strokeStyle = 'rgba(240, 244, 248, 0.4)'; // Silver outline
    ctx.lineWidth = 1.5;
    ctx.shadowBlur = 0;
    
    for (const polygon of mapData.land) {
      if (polygon.length < 3) continue;
      ctx.beginPath();
      let first = true;
      for (const [lng, lat] of polygon) {
        const pt = proj.project(lat, lng);
        if (first) {
          ctx.moveTo(pt.x, pt.y);
          first = false;
        } else {
          ctx.lineTo(pt.x, pt.y);
        }
      }
      ctx.fill();
      ctx.stroke();
    }
    
    // 3. Draw lakes (cutouts in landmass)
    ctx.fillStyle = '#0a0e17'; // Filled with background color
    ctx.strokeStyle = 'rgba(240, 244, 248, 0.2)'; // Faint border for lake
    ctx.lineWidth = 1.0;
    
    for (const polygon of mapData.lakes || []) {
      if (polygon.length < 3) continue;
      ctx.beginPath();
      let first = true;
      for (const [lng, lat] of polygon) {
        const pt = proj.project(lat, lng);
        if (first) {
          ctx.moveTo(pt.x, pt.y);
          first = false;
        } else {
          ctx.lineTo(pt.x, pt.y);
        }
      }
      ctx.fill();
      ctx.stroke();
    }
    
    // 3. Draw grid cell hover highlight (only in PLAYING state)
    if (this.gameState === 'PLAYING' && this.hoveredCell) {
      const { col, row } = this.hoveredCell;
      const cellW = proj.gridWidth / this.currentGridSize;
      const cellH = proj.gridHeight / this.currentGridSize;
      const cellX = proj.gridX + col * cellW;
      const cellY = proj.gridY + row * cellH;
      
      // Draw inner cell glow
      ctx.fillStyle = 'rgba(0, 255, 102, 0.08)';
      ctx.fillRect(cellX, cellY, cellW, cellH);
      
      // Draw neon border glow
      ctx.strokeStyle = 'rgba(0, 255, 102, 0.8)';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = 'rgba(0, 255, 102, 0.8)';
      ctx.shadowBlur = 10;
      ctx.strokeRect(cellX, cellY, cellW, cellH);
      ctx.shadowBlur = 0; // reset
    }

    // 4. Draw Feedback markings if in FEEDBACK state
    if (this.gameState === 'FEEDBACK') {
      const round = this.roundsPlayed[this.roundsPlayed.length - 1];
      const cellW = proj.gridWidth / this.currentGridSize;
      const cellH = proj.gridHeight / this.currentGridSize;
      const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      
      // Find guess cell box
      const guessCol = alphabet.indexOf(round.guessCell[0]);
      const guessRow = parseInt(round.guessCell.slice(1)) - 1;
      const gX = proj.gridX + guessCol * cellW;
      const gY = proj.gridY + guessRow * cellH;

      // Find correct cell box
      const correctCol = alphabet.indexOf(round.correctCell[0]);
      const correctRow = parseInt(round.correctCell.slice(1)) - 1;
      const cX = proj.gridX + correctCol * cellW;
      const cY = proj.gridY + correctRow * cellH;

      // Fill guess box red if wrong, green if correct
      ctx.fillStyle = round.success ? 'rgba(0, 255, 102, 0.12)' : 'rgba(255, 0, 85, 0.12)';
      ctx.fillRect(gX, gY, cellW, cellH);
      ctx.strokeStyle = round.success ? 'rgba(0, 255, 102, 0.8)' : 'rgba(255, 0, 85, 0.8)';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(gX, gY, cellW, cellH);

      // Draw correct box green (if they guessed wrong)
      if (!round.success) {
        ctx.fillStyle = 'rgba(0, 255, 102, 0.08)';
        ctx.fillRect(cX, cY, cellW, cellH);
        
        ctx.strokeStyle = 'rgba(0, 255, 102, 0.8)';
        ctx.lineWidth = 2.5;
        // Make correct box border pulse
        const pulse = 4 + Math.sin(Date.now() / 150) * 2;
        ctx.shadowColor = 'rgba(0, 255, 102, 0.8)';
        ctx.shadowBlur = pulse;
        ctx.strokeRect(cX, cY, cellW, cellH);
        ctx.shadowBlur = 0;
      }

      // Draw exact city pin
      const cityPos = proj.project(round.city.lat, round.city.lng);
      
      // Draw line connecting click to exact location
      ctx.beginPath();
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.moveTo(round.clickPos.x, round.clickPos.y);
      ctx.lineTo(cityPos.x, cityPos.y);
      ctx.stroke();
      ctx.setLineDash([]); // reset

      // Draw click marker (cross)
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      const crossSize = 6;
      ctx.moveTo(round.clickPos.x - crossSize, round.clickPos.y - crossSize);
      ctx.lineTo(round.clickPos.x + crossSize, round.clickPos.y + crossSize);
      ctx.moveTo(round.clickPos.x + crossSize, round.clickPos.y - crossSize);
      ctx.lineTo(round.clickPos.x - crossSize, round.clickPos.y + crossSize);
      ctx.stroke();

      // Draw exact city location (glowing dot)
      ctx.fillStyle = 'var(--accent-secondary)';
      ctx.shadowColor = 'var(--accent-secondary)';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(cityPos.x, cityPos.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0; // reset
      
      // Draw city name label
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px Outfit, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(round.city.name, cityPos.x + 10, cityPos.y + 4);
    }
    
    // 5. Draw grid overlay lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    
    const cellW = proj.gridWidth / this.currentGridSize;
    const cellH = proj.gridHeight / this.currentGridSize;
    
    // Vertical lines
    for (let i = 0; i <= this.currentGridSize; i++) {
      ctx.beginPath();
      ctx.moveTo(proj.gridX + i * cellW, proj.gridY);
      ctx.lineTo(proj.gridX + i * cellW, proj.gridY + proj.gridHeight);
      ctx.stroke();
    }
    
    // Horizontal lines
    for (let i = 0; i <= this.currentGridSize; i++) {
      ctx.beginPath();
      ctx.moveTo(proj.gridX, proj.gridY + i * cellH);
      ctx.lineTo(proj.gridX + proj.gridWidth, proj.gridY + i * cellH);
      ctx.stroke();
    }
    
    // 6. Draw grid labels (A-P, 1-16)
    ctx.fillStyle = 'rgba(240, 244, 248, 0.7)';
    
    // Set font size dynamically to fit 16x16 neatly
    let labelFontSize = 14;
    if (this.currentGridSize === 8) labelFontSize = 12;
    else if (this.currentGridSize === 16) labelFontSize = 9;
    ctx.font = `bold ${labelFontSize}px Outfit, sans-serif`;
    
    // Draw columns (letters A, B, C...)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    for (let i = 0; i < this.currentGridSize; i++) {
      const label = alphabet[i];
      const lx = proj.gridX + (i + 0.5) * cellW;
      const ly = proj.gridY - 10;
      ctx.fillText(label, lx, ly);
    }
    
    // Draw rows (numbers 1, 2, 3...)
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < this.currentGridSize; i++) {
      const label = (i + 1).toString();
      const lx = proj.gridX - 12;
      const ly = proj.gridY + (i + 0.5) * cellH;
      ctx.fillText(label, lx, ly);
    }
  }

  drawRecapMap() {
    const canvas = document.getElementById('recapCanvas');
    const ctx = canvas.getContext('2d');
    const size = Math.min(canvas.parentElement.clientWidth || 400, 500);
    
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.scale(dpr, dpr);
    
    // Clear recap background
    ctx.fillStyle = '#0a0e17';
    ctx.fillRect(0, 0, size, size);
    
    const bounds = MAP_BOUNDS[this.selectedCountry];
    const recapProj = getProjection(bounds, size, size);
    
    // Draw landmass
    const mapData = COUNTRY_MAPS[this.selectedCountry];
    ctx.fillStyle = '#111927';
    ctx.strokeStyle = 'rgba(240, 244, 248, 0.3)';
    ctx.lineWidth = 1;
    
    for (const polygon of mapData.land) {
      if (polygon.length < 3) continue;
      ctx.beginPath();
      let first = true;
      for (const [lng, lat] of polygon) {
        const pt = recapProj.project(lat, lng);
        if (first) {
          ctx.moveTo(pt.x, pt.y);
          first = false;
        } else {
          ctx.lineTo(pt.x, pt.y);
        }
      }
      ctx.fill();
      ctx.stroke();
    }
    
    // Draw lakes
    ctx.fillStyle = '#0a0e17';
    ctx.strokeStyle = 'rgba(240, 244, 248, 0.15)';
    ctx.lineWidth = 0.8;
    
    for (const polygon of mapData.lakes || []) {
      if (polygon.length < 3) continue;
      ctx.beginPath();
      let first = true;
      for (const [lng, lat] of polygon) {
        const pt = recapProj.project(lat, lng);
        if (first) {
          ctx.moveTo(pt.x, pt.y);
          first = false;
        } else {
          ctx.lineTo(pt.x, pt.y);
        }
      }
      ctx.fill();
      ctx.stroke();
    }
    
    // Draw all pins
    for (const round of this.roundsPlayed) {
      const cityPos = recapProj.project(round.city.lat, round.city.lng);
      
      // Line connecting correct location to click location
      ctx.beginPath();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 1;
      
      // Calculate clicked position in recap scale
      const clickPos = recapProj.project(round.guessCoords.lat, round.guessCoords.lng);
      ctx.moveTo(clickPos.x, clickPos.y);
      ctx.lineTo(cityPos.x, cityPos.y);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Click cross
      ctx.strokeStyle = round.success ? 'var(--accent-color)' : 'var(--accent-danger)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const s = 4;
      ctx.moveTo(clickPos.x - s, clickPos.y - s);
      ctx.lineTo(clickPos.x + s, clickPos.y + s);
      ctx.moveTo(clickPos.x + s, clickPos.y - s);
      ctx.lineTo(clickPos.x - s, clickPos.y + s);
      ctx.stroke();
      
      // City point
      ctx.fillStyle = 'var(--accent-secondary)';
      ctx.beginPath();
      ctx.arc(cityPos.x, cityPos.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// Projection helper
// Projection helper
function getProjection(bounds, canvasWidth, canvasHeight) {
  // Convert all to radians for Mercator space calculations
  const minLatRad = bounds.minLat * Math.PI / 180;
  const maxLatRad = bounds.maxLat * Math.PI / 180;
  const minLngRad = bounds.minLng * Math.PI / 180;
  const maxLngRad = bounds.maxLng * Math.PI / 180;
  
  let minYMerc = Math.log(Math.tan(Math.PI / 4 + minLatRad / 2));
  let maxYMerc = Math.log(Math.tan(Math.PI / 4 + maxLatRad / 2));
  
  let minX = minLngRad;
  let maxX = maxLngRad;
  
  let xRange = maxX - minX;
  let yRange = maxYMerc - minYMerc;
  
  // Maintain 1:1 aspect ratio in Mercator space by padding the smaller range
  if (xRange > yRange) {
    const diff = xRange - yRange;
    minYMerc -= diff / 2;
    maxYMerc += diff / 2;
    yRange = xRange;
  } else {
    const diff = yRange - xRange;
    minX -= diff / 2;
    maxX += diff / 2;
    xRange = yRange;
  }
  
  // Padding for headers
  const paddingLeft = 45;
  const paddingTop = 45;
  const paddingRight = 15;
  const paddingBottom = 15;
  
  const drawWidth = canvasWidth - paddingLeft - paddingRight;
  const drawHeight = canvasHeight - paddingTop - paddingBottom;
  
  // Force square grid area
  const size = Math.min(drawWidth, drawHeight);
  
  const gridX = paddingLeft + (drawWidth - size) / 2;
  const gridY = paddingTop + (drawHeight - size) / 2;
  
  return {
    project: (lat, lng) => {
      const latRad = lat * Math.PI / 180;
      const lngRad = lng * Math.PI / 180;
      const yMerc = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
      
      const pctX = (lngRad - minX) / xRange;
      const pctY = (yMerc - minYMerc) / yRange;
      
      const x = gridX + pctX * size;
      const y = gridY + (1 - pctY) * size;
      return { x, y };
    },
    unproject: (x, y) => {
      const pctX = (x - gridX) / size;
      const pctY = 1 - (y - gridY) / size;
      
      const lngRad = minX + pctX * xRange;
      const yMerc = minYMerc + pctY * yRange;
      
      const lng = lngRad * 180 / Math.PI;
      const latRad = 2 * Math.atan(Math.exp(yMerc)) - Math.PI / 2;
      const lat = latRad * 180 / Math.PI;
      return { lat, lng };
    },
    gridX,
    gridY,
    gridWidth: size,
    gridHeight: size
  };
}

// Pulse animation for correctness border highlights
let lastTime = 0;
function animate(time) {
  if (window.game && window.game.gameState === 'FEEDBACK') {
    // Redraw game to make the pulsing box outline animation smooth
    window.game.drawGame();
  }
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

// Initialize Game once DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
  window.game = new GeoguessGame();
});
