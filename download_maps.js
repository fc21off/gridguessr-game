/**
 * Geography Grid Guesses - Map Data Downloader
 * 
 * This script downloads simplified country outlines in GeoJSON format
 * and compiles them into a single JavaScript file (maps_data.js) 
 * to bypass CORS issues when running the game via file://.
 * 
 * Run this script using Node.js:
 *   node download_maps.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// URL mapping for country GeoJSON files (glynnbird/countriesgeojson repo)
const COUNTRY_URLS = {
  germany: 'https://raw.githubusercontent.com/glynnbird/countriesgeojson/master/germany.geojson',
  france: 'https://raw.githubusercontent.com/glynnbird/countriesgeojson/master/france.geojson',
  spain: 'https://raw.githubusercontent.com/glynnbird/countriesgeojson/master/spain.geojson',
  uk: 'https://raw.githubusercontent.com/glynnbird/countriesgeojson/master/united%20kingdom.geojson',
  us: 'https://raw.githubusercontent.com/glynnbird/countriesgeojson/master/united%20states%20of%20america.geojson',
  japan: 'https://raw.githubusercontent.com/glynnbird/countriesgeojson/master/japan.geojson'
};

// Target output file
const OUTPUT_FILE = path.join(__dirname, 'maps_data.js');

// Helper to download a URL and return a promise with the text body
function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to fetch map from ${url}: Status Code ${res.statusCode}`));
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

// Extracts polygons from a GeoJSON object and flattens them into a list of rings [[lng, lat], ...]
function extractPolygons(geojson) {
  const rings = [];

  function processGeometry(geometry) {
    if (!geometry) return;
    if (geometry.type === 'Polygon') {
      // GeoJSON Polygon coordinates: array of rings (outer ring, then holes)
      for (const ring of geometry.coordinates) {
        rings.push(ring);
      }
    } else if (geometry.type === 'MultiPolygon') {
      // GeoJSON MultiPolygon coordinates: array of Polygons
      for (const polygonCoords of geometry.coordinates) {
        for (const ring of polygonCoords) {
          rings.push(ring);
        }
      }
    }
  }

  if (geojson.type === 'FeatureCollection') {
    for (const feature of geojson.features) {
      processGeometry(feature.geometry);
    }
  } else if (geojson.type === 'Feature') {
    processGeometry(geojson.geometry);
  } else if (geojson.type === 'GeometryCollection') {
    for (const geometry of geojson.geometries) {
      processGeometry(geometry);
    }
  } else {
    processGeometry(geojson);
  }

  return rings;
}

async function run() {
  console.log('Starting download of country outline maps...');
  const compiledData = {};

  for (const [country, url] of Object.entries(COUNTRY_URLS)) {
    try {
      console.log(`Downloading outline for: ${country}...`);
      const body = await download(url);
      const geojson = JSON.parse(body);
      const polygons = extractPolygons(geojson);
      
      // Calculate a basic mainland boundary box for sanity checking
      // (This will also help us see if the data downloaded correctly)
      let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
      let pointCount = 0;
      
      for (const ring of polygons) {
        for (const [lng, lat] of ring) {
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
          if (lng < minLng) minLng = lng;
          if (lng > maxLng) maxLng = lng;
          pointCount++;
        }
      }

      compiledData[country] = polygons;
      console.log(`Successfully compiled ${country}: ${polygons.length} polygons, ${pointCount} points.`);
      console.log(`  Bounds: Lat [${minLat.toFixed(2)}, ${maxLat.toFixed(2)}], Lng [${minLng.toFixed(2)}, ${maxLng.toFixed(2)}]\n`);
      
    } catch (err) {
      console.error(`Error processing ${country}:`, err.message);
      process.exit(1);
    }
  }

  // Write out as a JS file that defines a global variable
  const jsContent = `/**
 * Geography Grid Guesses - Country Outlines Database
 * 
 * Generated dynamically by download_maps.js.
 * Contains flattened polygon rings [[lng, lat], ...] for each country outline.
 */

const COUNTRY_MAPS = ${JSON.stringify(compiledData, null, 2)};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { COUNTRY_MAPS };
}
`;

  fs.writeFileSync(OUTPUT_FILE, jsContent, 'utf8');
  console.log(`Done! Written compiled map outlines to: ${OUTPUT_FILE}`);
}

run();
