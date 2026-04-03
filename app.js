const map = L.map('map').setView([54, 15], 4);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

fetch('eu.geo.json')
  .then(res => res.json())
  .then(data => {
    L.geoJSON(data).addTo(map);
  });

fetch('https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/DEMO_R_D3DENS?lang=EN')
    .then(res => res.json())
    .then(data => {
    console.log(data);
});

function extractLatest(data) {
  const values = data.value;
  const result = {};

  Object.keys(values).forEach(key => {
    result[key] = values[key];
  });

  return result;
}

function getColor(value) {
  return value > 300 ? '#800026' :
         value > 200 ? '#BD0026' :
         value > 100 ? '#E31A1C' :
         value > 50  ? '#FC4E2A' :
                       '#FFEDA0';
}

function style(feature) {
  const countryCode = feature.properties.ISO_A2;
  const value = stats[countryCode];

  return {
    fillColor: getColor(value || 0),
    weight: 1,
    color: 'white',
    fillOpacity: 0.7
  };
}


function onEachFeature(feature, layer) {
  const code = feature.properties.ISO_A2;
  const value = stats[code];

  layer.bindPopup(
    `<b>${feature.properties.NAME}</b><br>Value: ${value || 'N/A'}`
  );
}