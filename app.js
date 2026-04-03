// ------------------------------
// app.js
// ------------------------------

let stats = {}; // Global object for country stats

// 1️⃣ Initialize Leaflet map centered on Europe
const map = L.map('map', {
  zoomControl: true
}).setView([54, 15], 4);

// Adaptive background for light/dark mode
function setMapBackground() {
  const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  map.getContainer().style.background = isDark ? '#000000' : '#ffffff';
}

// Set background on load
setMapBackground();

// Update background if system theme changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', setMapBackground);

// Restrict map bounds to Europe
const euBounds = [
  [34, -25], // SW corner extended to include Iberia & Turkey
  [72, 45]   // NE corner extended to include Russia & Baltic
];
map.setMaxBounds(euBounds);
map.fitBounds(euBounds);

// 2️⃣ Fetch Eurostat population density data
fetch('https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/DEMO_R_D3DENS?lang=EN')
  .then(res => res.json())
  .then(data => {
    fetch('europe.geojson')
      .then(res => res.json())
      .then(geojson => {
        // Keep all countries in Europe, no filtering

        stats = extractLatest(data, geojson);
        console.log('Stats loaded:', stats);

        // Add GeoJSON to map
        L.geoJSON(geojson, { style, onEachFeature }).addTo(map);
      });
  })
  .catch(err => console.error('Fetch error:', err));

// ------------------------------
// Helper functions
// ------------------------------

function extractLatest(data, geojson) {
  const values = data.value;
  const result = {};

  const mapping = {
    "40": "AT","56": "BE","100": "BG","191": "CZ","208": "DK",
    "233": "EE","246": "FI","250": "FR","276": "DE","300": "GR",
    "348": "HU","372": "IE","380": "IT","428": "LT","440": "LU",
    "442": "LV","470": "MT","528": "NL","616": "PL","620": "PT",
    "642": "RO","705": "SI","724": "ES","752": "SE"
  };

  Object.keys(values).forEach(key => {
    const iso = mapping[key];
    if (iso && geojson.features.some(f => f.properties.ISO2 === iso)) {
      result[iso] = values[key];
    }
  });

  return result;
}

// Color scale
function getColor(value) {
  if (value == null) return '#ccc'; // grey for non-EU or missing data
  return value > 300 ? '#800026' :
         value > 200 ? '#BD0026' :
         value > 100 ? '#E31A1C' :
         value > 50  ? '#FC4E2A' :
                       '#FFEDA0';
}

// Style function: EU countries get color, others grey
function style(feature) {
  const countryCode = feature.properties.ISO2;
  const value = stats[countryCode]; // undefined for non-EU
  return {
    fillColor: getColor(value),
    weight: 1,
    color: 'white',
    fillOpacity: 0.7
  };
}

// Popup for each country
function onEachFeature(feature, layer) {
  const countryCode = feature.properties.ISO2;
  const countryName = feature.properties.NAME || feature.properties.ADMIN;
  const value = stats[countryCode];
  layer.bindPopup(
    `<b>${countryName}</b><br>Population density: ${value != null ? value : 'N/A'}`
  );
}