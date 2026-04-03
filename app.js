let stats = {}; // Global object for country stats

// Initialize Leaflet map
const map = L.map('map', { zoomControl: true }).setView([54, 15], 4);

// Adaptive background
function setMapBackground() {
  const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  map.getContainer().style.background = isDark ? '#000000' : '#ffffff';
}
setMapBackground();
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', setMapBackground);

// Restrict bounds to Europe
const euBounds = [[34, -25],[72, 45]];
map.setMaxBounds(euBounds);
map.fitBounds(euBounds);

// Dataset selection
const datasetSelect = document.getElementById('dataset');
datasetSelect.addEventListener('change', () => {
  loadEurostatData(datasetSelect.value);
});

// DOM elements
const loadingEl = document.getElementById('loading');
const rangeBar = document.getElementById('rangeBar');

// Initial load
loadEurostatData(datasetSelect.value);

// ------------------------------
// Load Eurostat data
// ------------------------------
async function loadEurostatData(dataset) {
  try {
    loadingEl.style.display = 'block';

    const dataRes = await fetch(`https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/${dataset}?lang=EN`);
    const data = await dataRes.json();

    const geoRes = await fetch('europe.geojson');
    const geojson = await geoRes.json();

    stats = extractLatest(data, geojson);

    // Remove old layers
    map.eachLayer(l => { if (l instanceof L.GeoJSON) map.removeLayer(l); });

    // Add GeoJSON
    L.geoJSON(geojson, { style, onEachFeature }).addTo(map);

    // Update range bar with gradient
    updateRangeBar();

  } catch (err) {
    console.error('Fetch error:', err);
  } finally {
    loadingEl.style.display = 'none';
  }
}

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

// ------------------------------
// Color scale
// ------------------------------
function getColor(value) {
  if (value == null) return '#ccc';
  const vals = Object.values(stats).filter(v => v != null);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const ratio = (value - min) / (max - min);
  return ratio > 0.8 ? '#800026' :
         ratio > 0.6 ? '#BD0026' :
         ratio > 0.4 ? '#E31A1C' :
         ratio > 0.2 ? '#FC4E2A' :
                       '#FFEDA0';
}

function style(feature) {
  const countryCode = feature.properties.ISO2;
  const value = stats[countryCode];
  return {
    fillColor: getColor(value),
    weight: 1,
    color: 'white',
    fillOpacity: 0.7
  };
}

// ------------------------------
// Popups and country click
// ------------------------------
function onEachFeature(feature, layer) {
  const countryCode = feature.properties.ISO2;
  const countryName = feature.properties.NAME || feature.properties.ADMIN;
  const value = stats[countryCode];
  const datasetName = datasetSelect.options[datasetSelect.selectedIndex].text;

  layer.bindPopup(`<b>${countryName}</b><br>${datasetName}: ${value != null ? value : 'N/A'}`);

  layer.on('click', () => {
    highlightOnBar(value);
  });
}

// ------------------------------
// Range bar with gradient
// ------------------------------
function updateRangeBar() {
  rangeBar.innerHTML = '';
  const vals = Object.values(stats).filter(v => v != null);
  if (!vals.length) return;

  const min = Math.min(...vals);
  const max = Math.max(...vals);

  // Apply gradient background
  rangeBar.style.background = `linear-gradient(to right, 
      ${getColor(min)} 0%, 
      ${getColor(min + (max-min)*0.2)} 20%, 
      ${getColor(min + (max-min)*0.4)} 40%, 
      ${getColor(min + (max-min)*0.6)} 60%, 
      ${getColor(min + (max-min)*0.8)} 80%, 
      ${getColor(max)} 100%)`;

  // Min label
  const minLabel = document.createElement('div');
  minLabel.className = 'label';
  minLabel.style.left = '0%';
  minLabel.innerText = min.toFixed(0);
  rangeBar.appendChild(minLabel);

  // Max label
  const maxLabel = document.createElement('div');
  maxLabel.className = 'label';
  maxLabel.style.left = '100%';
  maxLabel.innerText = max.toFixed(0);
  rangeBar.appendChild(maxLabel);
}

// Highlight country on bar
function highlightOnBar(value) {
  const oldMarker = rangeBar.querySelector('.marker');
  if (oldMarker) oldMarker.remove();

  const vals = Object.values(stats).filter(v => v != null);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const percent = ((value - min) / (max - min)) * 100;

  const marker = document.createElement('div');
  marker.className = 'marker';
  marker.style.left = `${percent}%`;
  rangeBar.appendChild(marker);
}