let stats = {}; 
let sortDirection = { name: 1, value: 1 }; // 1 = ascending, -1 = descending
let geoJsonLayer = null; // store the map layer to simulate clicks

// ------------------------------
// Initialize Leaflet map
// ------------------------------
const map = L.map('map', { zoomControl: true }).setView([54, 15], 4);

// Adaptive map & page background + table colors
function setMapBackground() {
  const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  map.getContainer().style.background = isDark ? '#111' : '#fff';
  document.body.style.background = isDark ? '#111' : '#fff';
  // Table style
  const table = document.getElementById('dataTable');
  table.style.background = isDark ? '#222' : '#fff';
  table.style.color = isDark ? '#eee' : '#000';
  table.querySelectorAll('th').forEach(th => th.style.background = isDark ? '#333' : '#f2f2f2');
  table.querySelectorAll('td').forEach(td => td.style.background = isDark ? '#222' : '#fff');
}
setMapBackground();
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', setMapBackground);

// Restrict bounds to Europe
const euBounds = [[34, -25],[72, 45]];
map.setMaxBounds(euBounds);
map.fitBounds(euBounds);

// DOM elements
const datasetSelect = document.getElementById('dataset');
const loadingEl = document.getElementById('loading');
const rangeBar = document.getElementById('rangeBar');
const dataTable = document.getElementById('dataTable').querySelector('tbody');

datasetSelect.addEventListener('change', () => loadEurostatData(datasetSelect.value));
loadEurostatData(datasetSelect.value);

// ------------------------------
// ISO mapping
// ------------------------------
const mapping = {
  40:"AT",56:"BE",100:"BG",196:"CY",203:"HR",191:"CZ",208:"DK",
  233:"EE",246:"FI",250:"FR",276:"DE",300:"GR",
  348:"HU",372:"IE",380:"IT",428:"LT",440:"LU",
  442:"LV",470:"MT",528:"NL",616:"PL",620:"PT",
  703:"SK",642:"RO",705:"SI",724:"ES",752:"SE",
  702:"NO",826:"GB",352:"IS",756:"CH",792:"TR",
  804:"UA",112:"BY",498:"MD",
  688:"RS",499:"ME",807:"MK",8:"AL",70:"BA",383:"XK",
  51:"AM",31:"AZ",268:"GE"
};

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
    // Log for cross-reference
    console.group(`Eurostat dataset: ${dataset}`);
    console.log('Raw data.value:', data.value);
    console.log('Geo dimension keys:', data.dimension?.geo?.category?.index);
    console.log('Mapped stats (ISO -> value):', stats);
    console.groupEnd();
    
    if(geoJsonLayer) map.removeLayer(geoJsonLayer);

    geoJsonLayer = L.geoJSON(geojson, { style, onEachFeature }).addTo(map);

    updateRangeBar();
    populateTable();

  } catch (err) { console.error(err); }
  finally { loadingEl.style.display = 'none'; }
}

// ------------------------------
// Extract latest dataset values
// ------------------------------
function extractLatest(data, geojson) {
  const values = data.value;
  const result = {};
  Object.keys(values).forEach(key => {
    const iso = mapping[key];
    if (iso && geojson.features.some(f => f.properties.ISO2 === iso)) result[iso] = values[key];
  });
  return result;
}

// ------------------------------
// Color scale
// ------------------------------
function getColor(value) {
  if(value==null) return '#ccc';
  const vals = Object.values(stats).filter(v=>v!=null);
  const min = Math.min(...vals), max = Math.max(...vals);
  const ratio = (value - min) / (max - min);
  return ratio>0.8?'#800026':ratio>0.6?'#BD0026':ratio>0.4?'#E31A1C':ratio>0.2?'#FC4E2A':'#FFEDA0';
}

function style(feature){
  const iso = feature.properties.ISO2;
  return { fillColor:getColor(stats[iso]), weight:1, color:'white', fillOpacity:0.7 };
}

// ------------------------------
// Map popups & click
// ------------------------------
function onEachFeature(feature, layer){
  const iso = feature.properties.ISO2;
  const name = feature.properties.NAME || feature.properties.ADMIN;
  const value = stats[iso];
  const datasetName = datasetSelect.options[datasetSelect.selectedIndex].text;
  layer.bindPopup(`<b>${name}</b><br>${datasetName}: ${value != null ? value : 'N/A'}`);
  layer.on('click', () => { 
    highlightOnBar(value); 
    highlightTableRow(iso); 
  });
}

// ------------------------------
// Range bar
// ------------------------------
function updateRangeBar(){
  rangeBar.innerHTML='';
  const vals = Object.values(stats).filter(v=>v!=null);
  if(!vals.length) return;
  const min = Math.min(...vals), max = Math.max(...vals);

  rangeBar.style.background=`linear-gradient(to right, 
    ${getColor(min)} 0%, 
    ${getColor(min + (max-min)*0.2)} 20%, 
    ${getColor(min + (max-min)*0.4)} 40%, 
    ${getColor(min + (max-min)*0.6)} 60%, 
    ${getColor(min + (max-min)*0.8)} 80%, 
    ${getColor(max)} 100%)`;

  const minLabel = document.createElement('div'); minLabel.className='label'; minLabel.style.left='0%'; minLabel.innerText=min.toFixed(0);
  const maxLabel = document.createElement('div'); maxLabel.className='label'; maxLabel.style.left='100%'; maxLabel.innerText=max.toFixed(0);
  rangeBar.appendChild(minLabel); rangeBar.appendChild(maxLabel);
}

function highlightOnBar(value){
  const old=rangeBar.querySelector('.marker'); if(old) old.remove();
  const vals = Object.values(stats).filter(v=>v!=null);
  const min = Math.min(...vals), max = Math.max(...vals);
  const percent = ((value-min)/(max-min))*100;
  const marker = document.createElement('div'); marker.className='marker'; marker.style.left=`${percent}%`;
  rangeBar.appendChild(marker);
}

// ------------------------------
// Table with flags
// ------------------------------
function populateTable(){
  dataTable.innerHTML='';
  for(const [iso,value] of Object.entries(stats)){
    const feature=iso2Feature(iso);
    const name=feature?.properties.NAME||feature?.properties.ADMIN||iso;
    const flagUrl=`https://flagcdn.com/24x18/${iso.toLowerCase()}.png`;
    const tr=document.createElement('tr'); tr.dataset.iso=iso;
    tr.innerHTML=`<td><img src="${flagUrl}" style="vertical-align:middle; margin-right:5px;"> ${name}</td><td>${value!=null?value:'N/A'}</td>`;
    dataTable.appendChild(tr);
  }
  attachTableClick();
}

function highlightTableRow(iso){
  dataTable.querySelectorAll('tr').forEach(r=>r.classList.remove('highlight'));
  const tr = dataTable.querySelector(`tr[data-iso='${iso}']`);
  if(tr) tr.classList.add('highlight');
}

// ------------------------------
// Table click triggers map popup
// ------------------------------
function attachTableClick(){
  dataTable.querySelectorAll('tr').forEach(tr=>{
    tr.onclick=()=>{ 
      const iso = tr.dataset.iso; 
      highlightOnBar(stats[iso]); 
      highlightTableRow(iso); 
      
      // Simulate click on map feature
      geoJsonLayer.eachLayer(layer=>{
        if(layer.feature && layer.feature.properties.ISO2 === iso){
          layer.openPopup();
          map.flyTo(layer.getBounds().getCenter(), 5); // zoom a bit
        }
      });
    };
  });
}

// Helper
function iso2Feature(iso){
  for(const key in map._layers){
    const layer=map._layers[key];
    if(layer.feature && layer.feature.properties.ISO2===iso) return layer.feature;
  }
  return null;
}

// ------------------------------
// Table sorting with arrows
// ------------------------------
document.querySelectorAll('#dataTable th').forEach(th=>{
  th.onclick=()=>{
    const type=th.dataset.sort;
    const rows=Array.from(dataTable.querySelectorAll('tr'));

    // Remove arrows from all headers
    document.querySelectorAll('#dataTable th').forEach(h=>h.classList.remove('asc','desc'));

    rows.sort((a,b)=>{
      if(type==='name') return sortDirection.name*(a.cells[0].innerText.localeCompare(b.cells[0].innerText));
      return sortDirection.value*(parseFloat(a.cells[1].innerText)-parseFloat(b.cells[1].innerText));
    });
    rows.forEach(r=>dataTable.appendChild(r));

    // Update arrow on this column
    th.classList.add(sortDirection[type]===1?'asc':'desc');
    sortDirection[type]*=-1; // toggle
  };
});