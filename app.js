// ------------------------------
// app.js
// ------------------------------

let stats = {}; // Global object for country stats

// 1️⃣ Initialize Leaflet map
const map = L.map('map').setView([54, 15], 4); // Center on Europe

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// 2️⃣ Sample Eurostat data fetch
// For simplicity, we use the DEMO_R_D3DENS dataset
fetch('https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/DEMO_R_D3DENS?lang=EN')
  .then(res => res.json())
  .then(data => {
    stats = extractLatest(data);
    loadGeoJSON(); // Only load map after stats are ready
  })
  .catch(err => console.error('Eurostat fetch error:', err));

// 3️⃣ Load GeoJSON
function loadGeoJSON() {
  fetch('europe.geojson') // make sure this file is in the same folder as index.html
    .then(res => {
      if (!res.ok) throw new Error('GeoJSON not found');
      return res.json();
    })
    .then(data => {
      // Add GeoJSON to map
      L.geoJSON(data, {
        style: style,
        onEachFeature: onEachFeature
      }).addTo(map);
    })
    .catch(err => console.error('GeoJSON load error:', err));
}

// ------------------------------
// Helper functions
// ------------------------------

// Convert Eurostat numeric codes to ISO_A2 codes
function extractLatest(data) {
  const values = data.value;
  const result = {};
  
  const mapping = {
    "150": "FR", "276": "DE", "528": "NL", "642": "RO",
    "208": "DK", "246": "EE", "250": "FI", "372": "IE",
    "380": "IT", "233": "LV", "428": "LT", "470": "LT",
    "528": "NL", "724": "ES", "752": "SE", "826": "GB"
    // Add remaining EU countries as needed
  };

  Object.keys(values).forEach(key => {
    const iso = mapping[key];
    if (iso) result[iso] = values[key];
  });

  return result;
}

// Choose fill color based on value
function getColor(value) {
  return value > 300 ? '#800026' :
         value > 200 ? '#BD0026' :
         value > 100 ? '#E31A1C' :
         value > 50  ? '#FC4E2A' :
                       '#FFEDA0';
}

// Leaflet style function
function style(feature) {
  const countryCode = feature.properties.ISO_A2; // match property in your GeoJSON
  const value = stats[countryCode];
  return {
    fillColor: getColor(value || 0),
    weight: 1,
    color: 'white',
    fillOpacity: 0.7
  };
}

// Add popup to each feature
function onEachFeature(feature, layer) {
  const code = feature.properties.ISO_A2;
  const value = stats[code];
  layer.bindPopup(
    `<b>${feature.properties.NAME}</b><br>Population density: ${value || 'N/A'}`
  );
}