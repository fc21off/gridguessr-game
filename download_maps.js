/**
 * Geography Grid Guesses - High Resolution Map Data Downloader
 * 
 * This script downloads medium-high resolution (1:50m) Natural Earth country outlines
 * and extracts coordinates for the 6 target countries. It compiles them into a 
 * single javascript file (maps_data.js).
 * 
 * Run using Node:
 *   node download_maps.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// CloudFront CDN URL for 50m Natural Earth Countries GeoJSON (very reliable and fast)
const MAPS_URL = 'https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_50m_admin_0_countries.geojson';
const OUTPUT_FILE = path.join(__dirname, 'maps_data.js');

function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to fetch map data: Status Code ${res.statusCode}`));
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

async function run() {
  console.log('Downloading high-resolution (1:50m) Natural Earth world map data...');
  try {
    const body = await download(MAPS_URL);
    const geojson = JSON.parse(body);
    
    console.log('Parsing country boundaries...');
    const compiledData = {
      germany: [], france: [], spain: [], uk: [], us: [], japan: []
    };

    if (geojson.type !== 'FeatureCollection') {
      throw new Error('Downloaded data is not a valid FeatureCollection');
    }

    for (const feature of geojson.features) {
      const countryKey = matchCountry(feature);
      if (countryKey) {
        const polygons = extractPolygons(feature.geometry);
        compiledData[countryKey] = compiledData[countryKey].concat(polygons);
      }
    }

    // Print summary statistics
    for (const country of Object.keys(compiledData)) {
      const polygons = compiledData[country];
      let pts = 0;
      polygons.forEach(r => pts += r.length);
      console.log(`✓ Extracted ${country}: ${polygons.length} polygon rings, ${pts} detail points.`);
    }

    // Write output JS file
    const jsContent = `/**
 * Geography Grid Guesses - Country Outlines Database
 * 
 * Generated dynamically by download_maps.js (1:50m Natural Earth).
 * Contains detailed polygon rings [[lng, lat], ...] for each country outline.
 */

const COUNTRY_MAPS = ${JSON.stringify(compiledData, null, 2)};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { COUNTRY_MAPS };
}
`;

    fs.writeFileSync(OUTPUT_FILE, jsContent, 'utf8');
    console.log(`\nSuccessfully compiled high-detail map outlines to: ${OUTPUT_FILE}`);

  } catch (err) {
    console.error('Extraction failed:', err.message);
    process.exit(1);
  }
}

run();
