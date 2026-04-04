let stats = {}; 
let sortDirection = { rank: 1, name: 1, value: 1 }; 
let geoJsonLayer = null;

// ------------------------------
// Theme handling
// ------------------------------
function setMapBackground() {
  const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

  document.body.style.background = isDark ? '#111' : '#f4f6f8';

  const table = document.getElementById('dataTable');
  table.style.background = isDark ? '#1e1e1e' : '#fff';
  table.style.color = isDark ? '#eee' : '#000';

  table.querySelectorAll('th').forEach(th => th.style.background = isDark ? '#2c2c2c' : '#f0f0f0');
  table.querySelectorAll('td').forEach(td => td.style.background = isDark ? '#1e1e1e' : '#fff');
}
setMapBackground();
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', setMapBackground);



// ------------------------------
const datasetSelect = document.getElementById('dataset');
const loadingEl = document.getElementById('loading');
const rangeBar = document.getElementById('rangeBar');
const dataTable = document.getElementById('dataTable').querySelector('tbody');

datasetSelect.addEventListener('change', () => loadEurostatData(datasetSelect.value));
loadEurostatData(datasetSelect.value);

// ------------------------------
// Load data
// ------------------------------
async function loadEurostatData(dataset) {
  try {
    loadingEl.style.display = 'block';

    const dataRes = await fetch(`https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/${dataset}?lang=EN&geoLevel=country`);
    const data = await dataRes.json();

    stats = extractLatest(data); // no geojson anymore

    applyDataToSVG(); // 👈 NEW

    updateRangeBar();
    populateTable();

  } catch (err) { 
    console.error(err); 
  } finally { 
    loadingEl.style.display = 'none'; 
  }
}

// ------------------------------
// Extract data
// ------------------------------
function extractLatest(data) {
  const result = {};
  if (!data.dimension || !data.value) return result;

  const dims = Object.keys(data.dimension);
  const dimSizes = dims.map(d => Object.keys(data.dimension[d].category.index).length);

  const multipliers = [];
  let prod = 1;
  for (let i = dims.length - 1; i >= 0; i--) {
    multipliers[i] = prod;
    prod *= dimSizes[i];
  }

  let latestTimeKey = null;
  if (data.dimension.time) {
    const timeKeys = Object.keys(data.dimension.time.category.index)
      .map(k => parseInt(k)).filter(n => !isNaN(n));
    latestTimeKey = Math.max(...timeKeys);
  }

  const geoKeys = Object.keys(data.dimension.geo.category.index);

  geoKeys.forEach(geoCode => {
    const indices = [];

    dims.forEach((dim, i) => {
      if (dim === "geo") indices[i] = data.dimension.geo.category.index[geoCode];
      else if (dim === "time") indices[i] = latestTimeKey !== null ? data.dimension.time.category.index[latestTimeKey] : 0;
      else indices[i] = 0;
    });

    let flatIndex = 0;
    indices.forEach((idx, i) => flatIndex += idx * multipliers[i]);

    const val = data.value[flatIndex];
    if (val != null && val !== ":" && geoCode.length === 2) {
      result[geoCode] = val;
    }
  });

  return result;
}

// ------------------------------
// Smooth color scale
// ------------------------------
function getColor(value) {
  if (value == null) return '#ccc';

  const vals = Object.values(stats).filter(v => v != null);
  const min = Math.min(...vals), max = Math.max(...vals);
  const ratio = (value - min) / (max - min);

  const hue = 60 - ratio * 60; // yellow → red
  return `hsl(${hue}, 100%, 50%)`;
}

function style(feature){ 
  return { 
    fillColor:getColor(stats[feature.properties.ISO2]), 
    weight:1, 
    color:'white', 
    fillOpacity:0.8 
  }; 
}

// ------------------------------
function onEachFeature(feature, layer){
  const iso = feature.properties.ISO2;
  const name = feature.properties.NAME || feature.properties.ADMIN;
  const value = stats[iso];

  const datasetName = datasetSelect.options[datasetSelect.selectedIndex].text;

  layer.bindPopup(`<b>${name}</b><br>${datasetName}: ${value ?? 'N/A'}`);

  layer.on('click', () => { 
    highlightOnBar(value); 
    highlightTableRow(iso); 
  });
}

// ------------------------------
const tooltip = document.createElement('div');
tooltip.style.position = 'absolute';
tooltip.style.pointerEvents = 'none';
tooltip.style.padding = '4px 8px';
tooltip.style.background = 'rgba(0,0,0,0.7)';
tooltip.style.color = '#fff';
tooltip.style.borderRadius = '4px';
tooltip.style.fontSize = '12px';
tooltip.style.display = 'none';
document.body.appendChild(tooltip);
function applyDataToSVG() {
  const vals = Object.values(stats).filter(v => v != null);
  if (!vals.length) return;
  const min = Math.min(...vals);
  const max = Math.max(...vals);

 document.querySelectorAll('#euMap path').forEach(el => {
let iso = el.id.toUpperCase();

// handle cases like "ru-main"
if (iso.length !== 2) {
  const parent = el.closest('g');
  if (parent && parent.id) {
    iso = parent.id.toUpperCase();
  }
}

// still not valid → skip (legend etc.)
if (iso.length !== 2) return;

  // now safe to modify
  el.classList.remove(
    'fill00','fill10','fill20','fill30','fill40',
    'fill50','fill60','fill70','fill80','fill90','fillNA'
  );

  const value = stats[iso];

  if (value == null) {
    el.classList.add('fillNA');
  } else {
    const sorted = vals.slice().sort((a,b) => a - b);
    const index = sorted.indexOf(value);
    const ratio = index / (sorted.length - 1);
    const bucket = Math.floor(ratio * 10);
    const safeBucket = Math.min(bucket, 9);

    el.classList.add(`fill${safeBucket}0`);
  }

    // tooltip
    el.onmouseenter = e => {
      el.style.stroke = 'black';
      el.style.strokeWidth = '2';
      highlightTableRow(iso);

      // try to get the country name from SVG 'data-name' or fallback to ISO
      const name = el.dataset.name || iso.toUpperCase();
      tooltip.innerHTML = value != null
        ? `<b>${name}</b>: ${value}`
        : `<b>${name}</b>: N/A`;
      tooltip.style.display = 'block';
    };
    el.onmousemove = e => {
      tooltip.style.left = e.pageX + 10 + 'px';
      tooltip.style.top = e.pageY + 10 + 'px';
    };
    el.onmouseleave = () => {
      el.style.stroke = '';
      tooltip.style.display = 'none';
    };

    el.onclick = () => {
      if (value != null) highlightOnBar(value);
      highlightTableRow(iso);
      zoomToCountry(el);
    };
  });
}

function zoomToCountry(el) {
  const bbox = el.getBBox();
  const svg = document.getElementById('euMap');

  const svgWidth = svg.clientWidth;
  const svgHeight = svg.clientHeight;

  const scaleX = svgWidth / bbox.width;
  const scaleY = svgHeight / bbox.height;
  const scale = Math.min(scaleX, scaleY) * 0.6; // leave padding

  const cx = bbox.x + bbox.width / 2;
  const cy = bbox.y + bbox.height / 2;

  const tx = svgWidth / 2 - cx * scale;
  const ty = svgHeight / 2 - cy * scale;

  svg.style.transition = 'transform 0.5s';
  svg.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
}

// ------------------------------
// Range bar (smooth gradient)
// ------------------------------
function updateRangeBar(){
  rangeBar.innerHTML='';

  const vals = Object.values(stats).filter(v=>v!=null);
  if(!vals.length) return;

  const min = Math.min(...vals), max = Math.max(...vals);

  rangeBar.style.background = `linear-gradient(to right, 
    ${getColor(min)} 0%, 
    ${getColor(min + (max-min)*0.25)} 25%, 
    ${getColor(min + (max-min)*0.5)} 50%, 
    ${getColor(min + (max-min)*0.75)} 75%, 
    ${getColor(max)} 100%)`;

  const minLabel = document.createElement('div');
  minLabel.className='label';
  minLabel.style.left='0%';
  minLabel.innerText=min.toFixed(0);

  const maxLabel = document.createElement('div');
  maxLabel.className='label';
  maxLabel.style.left='100%';
  maxLabel.innerText=max.toFixed(0);

  rangeBar.appendChild(minLabel);
  rangeBar.appendChild(maxLabel);
}

function highlightOnBar(value){
  const old=rangeBar.querySelector('.marker');
  if(old) old.remove();

  const vals = Object.values(stats).filter(v=>v!=null);
  const min = Math.min(...vals), max = Math.max(...vals);

  const percent = ((value-min)/(max-min))*100;

  const marker = document.createElement('div');
  marker.className='marker';
  marker.style.left=`${percent}%`;

  rangeBar.appendChild(marker);
}

// ------------------------------
// TABLE WITH RANK
// ------------------------------
function populateTable(){
  dataTable.innerHTML='';

  const entries = Object.entries(stats)
    .filter(([_, v]) => v != null)
    .sort((a,b)=>b[1]-a[1]);

  entries.forEach(([iso,value],index)=>{
    const rank = index + 1;
    const flagUrl=`https://flagcdn.com/24x18/${iso.toLowerCase()}.png`;

    const tr=document.createElement('tr');
    tr.dataset.iso=iso;

    tr.innerHTML=`
      <td>${rank}</td>
      <td><img src="${flagUrl}" style="vertical-align:middle; margin-right:6px;"> ${iso}</td>
      <td>${value}</td>
    `;

    dataTable.appendChild(tr);
  });

  attachTableClick();

  // default sorted by rank
  document.querySelectorAll('#dataTable th').forEach(h=>h.classList.remove('asc','desc'));
  document.querySelector('#dataTable th[data-sort="rank"]').classList.add('asc');
}

function highlightTableRow(iso){
  dataTable.querySelectorAll('tr').forEach(r=>r.classList.remove('highlight'));
  const tr = dataTable.querySelector(`tr[data-iso='${iso}']`);
  if(tr) tr.classList.add('highlight');
}

function attachTableClick(){
  dataTable.querySelectorAll('tr').forEach(tr=>{
    tr.onclick=()=>{ 
      const iso = tr.dataset.iso; 
      highlightOnBar(stats[iso]); 
      highlightTableRow(iso); 

      geoJsonLayer.eachLayer(layer=>{
        if(layer.feature.properties.ISO2 === iso){
          layer.openPopup();
          map.flyTo(layer.getBounds().getCenter(), 5);
        }
      });
    };
  });
}

// ------------------------------
// SORTING WITH ARROWS
// ------------------------------
document.querySelectorAll('#dataTable th').forEach(th=>{
  th.onclick=()=>{
    const type=th.dataset.sort;
    const rows=Array.from(dataTable.querySelectorAll('tr'));

    document.querySelectorAll('#dataTable th').forEach(h=>h.classList.remove('asc','desc'));

    rows.sort((a,b)=>{
      if(type==='rank') return sortDirection.rank*(a.cells[0].innerText - b.cells[0].innerText);
      if(type==='name') return sortDirection.name*(a.cells[1].innerText.localeCompare(b.cells[1].innerText));
      return sortDirection.value*(a.cells[2].innerText - b.cells[2].innerText);
    });

    rows.forEach(r=>dataTable.appendChild(r));

    th.classList.add(sortDirection[type]===1?'asc':'desc');
    sortDirection[type]*=-1;
  };
});