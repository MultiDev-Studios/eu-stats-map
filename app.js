let stats = {}; 
let sortDirection = { rank: 1, name: 1, value: 1 }; 
let geoJsonLayer = null;
let currentUnit = '';

// ------------------------------
const dataCache = {};

// ------------------------------
// COLORS
const colors = [
  'rgb(253,247,254)','rgb(244,219,250)','rgb(226,185,245)',
  'rgb(204,153,240)','rgb(180,120,235)','rgb(150,90,220)',
  'rgb(120,60,200)','rgb(90,40,170)','rgb(60,20,140)',
  'rgb(40,10,110)'
];

// ------------------------------
// TOOLTIP
const tooltip = document.createElement('div');
Object.assign(tooltip.style, {
  position:'absolute', pointerEvents:'none', padding:'4px 8px',
  background:'rgba(0,0,0,0.7)', color:'#fff',
  borderRadius:'4px', fontSize:'12px', display:'none'
});
document.body.appendChild(tooltip);

// ------------------------------
// THEME
function setMapBackground() {
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.body.style.background = dark ? '#111' : '#f4f6f8';

  const table = document.getElementById('dataTable');
  if (!table) return;

  table.style.background = dark ? '#1e1e1e' : '#fff';
  table.style.color = dark ? '#eee' : '#000';

  table.querySelectorAll('th').forEach(th => th.style.background = dark ? '#2c2c2c' : '#f0f0f0');
  table.querySelectorAll('td').forEach(td => td.style.background = dark ? '#1e1e1e' : '#fff');
}
setMapBackground();
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', setMapBackground);

// ------------------------------
const datasetSelect = document.getElementById('dataset');
const loadingEl = document.getElementById('loading');
const rangeBar = document.getElementById('rangeBar');
const dataTable = document.getElementById('dataTable')?.querySelector('tbody');
const mapContainer = document.getElementById('map');

mapContainer.style.position = 'relative';

const svg = mapContainer.querySelector('svg');
let originalViewBox = svg.getAttribute('viewBox') || "3200 1115 6284 6991";

// ------------------------------
// RESET BUTTON
const resetBtn = document.createElement('button');
resetBtn.innerText = 'Reset Zoom';
Object.assign(resetBtn.style, {
  position:'absolute', top:'10px', right:'10px',
  padding:'8px 16px', border:'none',
  background:'#007bff', color:'#fff',
  borderRadius:'4px', cursor:'pointer',
  zIndex:10000
});
mapContainer.appendChild(resetBtn);

resetBtn.onclick = () => {
  animateViewBox(svg, originalViewBox, 500);
};

// ------------------------------
// INIT
datasetSelect?.addEventListener('change', () => loadEurostatData(datasetSelect.value));

// initial load
loadEurostatData(datasetSelect.value);
applyDataToSVG(); // color the map initially

// ------------------------------
// LOAD DATA
async function loadEurostatData(dataset) {
  try {
    loadingEl.style.display = 'block';

    const data = dataCache[dataset] ??
      await (await fetch(`https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/${dataset}?lang=EN&geoLevel=country`)).json();

    dataCache[dataset] = data;

    currentUnit = data.dimension?.unit
      ? Object.values(data.dimension.unit.category.label)[0]
      : '';

    stats = extractLatest(data);

    applyDataToSVG();
    updateRangeBar();
    populateTable();

  } catch (err) { 
    console.error(err); 
  } finally { 
    loadingEl.style.display = 'none'; 
  }
}

// ------------------------------
function extractLatest(data) {
  if (!data.dimension || !data.value) return {};

  const dims = Object.keys(data.dimension);
  const sizes = dims.map(d => Object.keys(data.dimension[d].category.index).length);

  const multipliers = dims.map((_,i)=>sizes.slice(i+1).reduce((a,b)=>a*b,1));
  const latestTime = data.dimension.time ? Object.keys(data.dimension.time.category.index).sort().pop() : null;
  const filters = { unit:"CP_MEUR", na_item:"B1GQ" };

  return Object.keys(data.dimension.geo.category.index).reduce((res,geo)=>{
    const indices = dims.map((dim,i)=>
      dim==="geo" ? data.dimension.geo.category.index[geo] :
      dim==="time" ? (latestTime ? data.dimension.time.category.index[latestTime] : 0) :
      filters[dim] ? data.dimension[dim].category.index[filters[dim]] ?? 0 : 0
    );

    const flat = indices.reduce((a,v,i)=>a+v*multipliers[i],0);
    const val = data.value[flat];

    if (val != null && val !== ":" && geo.length === 2) res[geo] = val;
    return res;
  },{});
}

// ------------------------------
function applyDataToSVG() {
  const vals = Object.values(stats).filter(v => v != null);
  if (!vals.length) return;

  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const logMin = Math.log(min + 1);
  const logMax = Math.log(max + 1);

  svg.querySelectorAll('path').forEach(el => {
    let iso = (el.id || el.closest('g')?.id)?.toUpperCase();
    if (!iso || iso.length !== 2) return;

    el.classList.remove(
      'fill00','fill10','fill20','fill30','fill40',
      'fill50','fill60','fill70','fill80','fill90','fillNA'
    );

    const value = stats[iso];

    if (value == null || value === ":") {
      el.classList.add('fillNA');
    } else {
      const ratio = (Math.log(value + 1) - logMin) / (logMax - logMin || 1);
      const bucket = Math.min(Math.max(Math.floor(ratio * 10), 0), 9);
      el.classList.add(`fill${bucket}0`);
    }

    // tooltip
    el.onmouseenter = () => {
      el.style.stroke = 'black';
      el.style.strokeWidth = '2';
      tooltip.innerHTML = `<b>${el.dataset.name || iso}</b>: ${value ?? 'N/A'} ${currentUnit}`;
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
      if (value != null) highlightOnBar(value, iso);
      highlightTableRow(iso);
      zoomToCountry(el);
    };
  });
}

// ------------------------------
// ANIMATION HELPER
function animateViewBox(svgEl, targetViewBox, duration=500) {
  const startViewBox = svgEl.getAttribute('viewBox').split(' ').map(Number);
  const endViewBox = targetViewBox.split(' ').map(Number);
  const startTime = performance.now();

  function animate(now) {
    const t = Math.min((now - startTime) / duration, 1);
    const easedT = t < 0.5 ? 2*t*t : -1 + (4 - 2*t)*t; // easeInOutQuad

    const current = startViewBox.map((v,i) => v + (endViewBox[i]-v) * easedT);
    svgEl.setAttribute('viewBox', current.join(' '));

    if (t < 1) requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
}

// ------------------------------
function zoomToCountry(el) {
  const bbox = el.getBBox();
  const margin = 20;
  const scale = 0.8;

  const cx = bbox.x + bbox.width / 2;
  const cy = bbox.y + bbox.height / 2;
  const newWidth = bbox.width / scale + margin;
  const newHeight = bbox.height / scale + margin;

  const newViewBox = `${cx - newWidth/2} ${cy - newHeight/2} ${newWidth} ${newHeight}`;
  animateViewBox(svg, newViewBox, 500);
}

// ------------------------------
// RANGE BAR
function updateRangeBar() {
  rangeBar.innerHTML = '';

  const vals = Object.values(stats).filter(v => v != null);
  if (!vals.length) return;

  const min = Math.min(...vals);
  const max = Math.max(...vals);

  rangeBar.style.background = `linear-gradient(to right, ${
    colors.map((c,i)=>`${c} ${(i/(colors.length-1))*100}%`).join(',')
  })`;

  Object.assign(rangeBar.style,{position:'relative',height:'20px',borderRadius:'4px'});

  rangeBar.appendChild(makeLabel(`${min.toFixed(0)} ${currentUnit}`, 'left'));
  rangeBar.appendChild(makeLabel(`${max.toFixed(0)} ${currentUnit}`, 'right'));
}

function makeLabel(text, side) {
  const d = document.createElement('div');
  d.innerText = text;
  Object.assign(d.style,{
    position:'absolute',
    [side]:'0%',
    top:'22px',
    fontSize:'12px',
    color:'#000'
  });
  return d;
}

// ------------------------------
function highlightOnBar(value, iso) {
  document.querySelectorAll('.marker,.marker-flag').forEach(el => el.remove());

  const vals = Object.values(stats).filter(v => v != null);
  if (!vals.length) return;

  const min = Math.min(...vals);
  const max = Math.max(...vals);

  const ratio = (Math.log(value+1)-Math.log(min+1))/(Math.log(max+1)-Math.log(min+1)||1);
  const bucket = Math.min(Math.max(Math.floor(ratio*10),0),9);

  const marker = document.createElement('div');
  Object.assign(marker.style,{
    position:'absolute',bottom:'0',width:'4px',height:'120%',
    background:colors[bucket],left:`${ratio*100}%`,
    transform:'translateX(-50%)'
  });
  marker.className='marker';
  rangeBar.appendChild(marker);

  if (iso) {
    const flag = document.createElement('img');
    flag.src = `https://flagcdn.com/20x15/${iso.toLowerCase()}.png`;
    Object.assign(flag.style,{
      position:'absolute',bottom:'125%',left:`${ratio*100}%`,
      transform:'translateX(-50%)',width:'20px'
    });
    flag.className='marker-flag';
    rangeBar.appendChild(flag);
  }
}

// ------------------------------
function populateTable() {
  dataTable.innerHTML = '';

  Object.entries(stats)
    .filter(([_,v])=>v!=null)
    .sort((a,b)=>b[1]-a[1])
    .forEach(([iso,value],i)=>{
      const tr=document.createElement('tr');
      tr.dataset.iso=iso;
      tr.innerHTML=`<td>${i+1}</td><td><img src="https://flagcdn.com/24x18/${iso.toLowerCase()}.png"> ${iso}</td><td>${value}</td>`;
      dataTable.appendChild(tr);
    });

  attachTableClick();
}

// ------------------------------
function attachTableClick() {
  document.querySelectorAll('#dataTable tbody tr').forEach(tr=>{
    tr.onclick=()=>{
      const iso=tr.dataset.iso;
      highlightTableRow(iso);
      highlightOnBar(stats[iso], iso);
      const el=svg.querySelector(`#${iso}, g#${iso}`);
      if(el) zoomToCountry(el);
    };
  });
}

function highlightTableRow(iso) {
  document.querySelectorAll('#dataTable tbody tr').forEach(tr=>{
    tr.classList.toggle('highlight', tr.dataset.iso===iso);
  });
}