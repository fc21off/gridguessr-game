/**
 * Geography Grid Guesses - Dynamic Map Data Downloader (Land + Lakes)
 * 
 * Downloads 1:50m Natural Earth country outlines and lakes,
 * and compiles them into maps_data.js.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const LAND_URL = 'https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_50m_admin_0_countries.geojson';
const LAKES_URL = 'https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_50m_lakes.geojson';
const OUTPUT_FILE = path.join(__dirname, 'maps_data.js');

const MAP_BOUNDS = {
  germany: { minLat: 47.2, maxLat: 55.1, minLng: 5.8, maxLng: 15.1 },
  france: { minLat: 41.3, maxLat: 51.1, minLng: -5.2, maxLng: 9.6 },
  spain: { minLat: 35.7, maxLat: 43.9, minLng: -9.5, maxLng: 3.4 },
  uk: { minLat: 49.8, maxLat: 58.8, minLng: -8.7, maxLng: 1.8 },
  us: { minLat: 24.3, maxLat: 49.4, minLng: -125.0, maxLng: -66.8 },
  japan: { minLat: 30.5, maxLat: 45.6, minLng: 129.0, maxLng: 145.9 }
};

function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to fetch map data from ${url}: Status Code ${res.statusCode}`));
        return;
      }
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => resolve(body));
    }).on('error', (err) => {
      reject(err);
    });
  });
}

function extractPolygons(geometry) {
  const rings = [];
  if (!geometry) return rings;

  if (geometry.type === 'Polygon') {
    for (const ring of geometry.coordinates) {
      rings.push(ring);
    }
  } else if (geometry.type === 'MultiPolygon') {
    for (const polygonCoords of geometry.coordinates) {
      for (const ring of polygonCoords) {
        rings.push(ring);
      }
    }
  }
  return rings;
}

function matchCountry(feature) {
  const props = feature.properties || {};
  const name = (props.name || props.NAME || '').toLowerCase();
  const adm0 = (props.adm0_a3 || props.ADM0_A3 || '').toLowerCase();
  const iso = (props.iso_a3 || props.ISO_A3 || '').toLowerCase();
  
  if (iso === 'deu' || adm0 === 'deu' || name === 'germany') return 'germany';
  if (iso === 'fra' || adm0 === 'fra' || name === 'france') return 'france';
  if (iso === 'esp' || adm0 === 'esp' || name === 'spain') return 'spain';
  if (iso === 'gbr' || adm0 === 'gbr' || name === 'united kingdom' || name === 'u.k.') return 'uk';
  if (iso === 'usa' || adm0 === 'usa' || name === 'united states' || name === 'united states of america') return 'us';
  if (iso === 'jpn' || adm0 === 'jpn' || name === 'japan') return 'japan';
  
  return null;
}

function ringOverlaps(ring, bounds) {
  for (const [lng, lat] of ring) {
    if (lat >= bounds.minLat && lat <= bounds.maxLat &&
        lng >= bounds.minLng && lng <= bounds.maxLng) {
      return true;
    }
  }
  return false;
}

async function run() {
  try {
    console.log('Downloading 1:50m Natural Earth countries...');
    const countriesBody = await download(LAND_URL);
    const countriesGeojson = JSON.parse(countriesBody);
    
    console.log('Downloading 1:50m Natural Earth lakes...');
    const lakesBody = await download(LAKES_URL);
    const lakesGeojson = JSON.parse(lakesBody);
    
    const compiledData = {};
    for (const c of Object.keys(MAP_BOUNDS)) {
      compiledData[c] = { land: [], lakes: [] };
    }

    // 1. Extract Land
    for (const feature of countriesGeojson.features) {
      const countryKey = matchCountry(feature);
      if (countryKey) {
        const polygons = extractPolygons(feature.geometry);
        compiledData[countryKey].land = compiledData[countryKey].land.concat(polygons);
      }
    }

    // 2. Extract Lakes
    for (const feature of lakesGeojson.features) {
      const polygons = extractPolygons(feature.geometry);
      for (const polygon of polygons) {
        // Find which country bounds this lake overlaps
        for (const [countryKey, bounds] of Object.entries(MAP_BOUNDS)) {
          if (ringOverlaps(polygon, bounds)) {
            compiledData[countryKey].lakes.push(polygon);
          }
        }
      }
    }

    // Print statistics
    console.log('\n--- Compilation Results ---');
    for (const country of Object.keys(compiledData)) {
      const landP = compiledData[country].land.length;
      const lakeP = compiledData[country].lakes.length;
      console.log(`✓ ${country}: ${landP} land polygons, ${lakeP} lake polygons.`);
    }

    // Write output JS file
    const jsContent = `/**
 * Geography Grid Guesses - Country Outlines Database (with Lakes)
 * 
 * Generated dynamically by download_maps.js.
 */

const COUNTRY_MAPS = ${JSON.stringify(compiledData, null, 2)};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { COUNTRY_MAPS };
}
`;

    fs.writeFileSync(OUTPUT_FILE, jsContent, 'utf8');
    console.log(`\nSuccessfully compiled map outlines to: ${OUTPUT_FILE}`);

  } catch (err) {
    console.error('Download or parsing failed:', err.message);
    process.exit(1);
  }
}

run();
