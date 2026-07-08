/**
 * Geography Grid Guesses - High Resolution Map Data Downloader (1:10m Outlines + Lake Michigan)
 * 
 * Downloads 1:10m Natural Earth country outlines for maximum detail (Fills Germany's detail requirements)
 * and extracts Lake Michigan only (ignores other lakes).
 * 
 * Run using Node:
 *   node download_maps.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const LAND_URL = 'https://raw.githubusercontent.com/martynafford/natural-earth-geojson/master/10m/cultural/ne_10m_admin_0_countries.json';
const LAKES_URL = 'https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_50m_lakes.geojson';
const OUTPUT_FILE = path.join(__dirname, 'maps_data.js');

function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to fetch map data: Status Code ${res.statusCode}`));
        return;
      }
      let body = [];
      res.on('data', (chunk) => body.push(chunk));
      res.on('end', () => resolve(Buffer.concat(body).toString('utf8')));
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

async function run() {
  try {
    console.log('Downloading high-resolution (1:10m) Natural Earth countries (approx 15MB)...');
    const countriesBody = await download(LAND_URL);
    const countriesGeojson = JSON.parse(countriesBody);
    
    console.log('Downloading lakes data...');
    const lakesBody = await download(LAKES_URL);
    const lakesGeojson = JSON.parse(lakesBody);
    
    const compiledData = {};
    const countries = ['germany', 'france', 'spain', 'uk', 'us', 'japan'];
    for (const c of countries) {
      compiledData[c] = { land: [], lakes: [] };
    }

    // 1. Extract Land (1:10m resolution)
    console.log('Extracting land boundaries...');
    for (const feature of countriesGeojson.features) {
      const countryKey = matchCountry(feature);
      if (countryKey) {
        const polygons = extractPolygons(feature.geometry);
        compiledData[countryKey].land = compiledData[countryKey].land.concat(polygons);
      }
    }

    // 2. Extract Lakes (Only keep Lake Michigan for USA)
    console.log('Extracting Lake Michigan...');
    for (const feature of lakesGeojson.features) {
      const props = feature.properties || {};
      const name = (props.name || props.NAME || '');
      if (name === 'Lake Michigan') {
        const polygons = extractPolygons(feature.geometry);
        compiledData.us.lakes = compiledData.us.lakes.concat(polygons);
      }
    }

    // Print statistics
    console.log('\n--- Compilation Results ---');
    for (const country of Object.keys(compiledData)) {
      const landP = compiledData[country].land.length;
      let landPts = 0;
      compiledData[country].land.forEach(r => landPts += r.length);
      
      const lakeP = compiledData[country].lakes.length;
      console.log(`✓ ${country}: ${landP} land polygons (${landPts} points), ${lakeP} lake polygons.`);
    }

    // Write output JS file
    const jsContent = `/**
 * Geography Grid Guesses - Country Outlines Database (1:10m outlines, Lake Michigan only)
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
