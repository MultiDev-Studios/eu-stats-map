let stats = {}; 
let sortDirection = { rank: 1, name: 1, value: 1 }; 
let geoJsonLayer = null;
let currentUnit = '';

// ------------------------------
// CACHES (BIG PERFORMANCE BOOST)
// ------------------------------
const dataCache = {};
const mapCache = {};

// ------------------------------
// TOOLTIP
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

// ------------------------------
// Theme handling
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
const mapSelect = document.getElementById('mapSelect');
const loadingEl = document.getElementById('loading');
const rangeBar = document.getElementById('rangeBar');
const dataTable = document.getElementById('dataTable').querySelector('tbody');
const mapContainer = document.getElementById('map');

// ------------------------------
// INIT
datasetSelect.addEventListener('change', () => loadEurostatData(datasetSelect.value));
mapSelect.addEventListener('change', () => loadMap(mapSelect.value));

// preload maps (instant switching later)
["eu", "world"].forEach(name => {
  fetch(`maps/${name}.svg`)
    .then(res => res.text())
    .then(svg => mapCache[name] = svg)
    .catch(() => {});
});

// initial load
loadMap(mapSelect.value);
loadEurostatData(datasetSelect.value);

// ------------------------------
// LOAD MAP (SVG)
async function loadMap(mapName) {
  try {
    loadingEl.style.display = 'block';

    if (mapCache[mapName]) {
      mapContainer.innerHTML = mapCache[mapName];
      applyDataToSVG();
      return;
    }

    const res = await fetch(`maps/${mapName}.svg`);
    const svgText = await res.text();

    mapCache[mapName] = svgText;
    mapContainer.innerHTML = svgText;

    applyDataToSVG();

  } catch (err) {
    console.error("Map load error:", err);
  } finally {
    loadingEl.style.display = 'none';
  }
}

// ------------------------------
// LOAD DATA (WITH CACHE)
async function loadEurostatData(dataset) {
  try {
    loadingEl.style.display = 'block';

    let data;

    // 1️⃣ check cache first
    if (dataCache[dataset]) {
      console.log("Using cached data:", dataset);
      data = dataCache[dataset];
    } else {
      const res = await fetch(`https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/${dataset}?lang=EN&geoLevel=country`);
      data = await res.json();
      dataCache[dataset] = data;
    }

    console.log("RAW EUROSTAT RESPONSE:", data);

    // 2️⃣ now safe to read the unit
    if (data.dimension && data.dimension.unit) {
      const unitKey = Object.keys(data.dimension.unit.category.label)[0];
      currentUnit = data.dimension.unit.category.label[unitKey];
    } else {
      currentUnit = '';
    }

    // 3️⃣ extract stats & update UI
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
// EXTRACT DATA (FIXED + DEBUG)
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
    const timeKeys = Object.keys(data.dimension.time.category.index);
    latestTimeKey = timeKeys.sort().pop();
  }

  const preferredFilters = {
    unit: "CP_MEUR",
    na_item: "B1GQ"
  };

  const geoKeys = Object.keys(data.dimension.geo.category.index);

  geoKeys.forEach(geoCode => {
    const indices = [];

    dims.forEach((dim, i) => {
      if (dim === "geo") {
        indices[i] = data.dimension.geo.category.index[geoCode];
      } else if (dim === "time") {
        indices[i] = latestTimeKey != null
          ? data.dimension.time.category.index[latestTimeKey]
          : 0;
      } else if (preferredFilters[dim]) {
        const idx = data.dimension[dim].category.index[preferredFilters[dim]];
        indices[i] = idx !== undefined ? idx : 0;
      } else {
        indices[i] = 0;
      }
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
// APPLY DATA TO SVG (FAST)
function applyDataToSVG() {
  const vals = Object.values(stats).filter(v => v != null);
  if (!vals.length) return;

  const min = Math.min(...vals);
  const max = Math.max(...vals);

  document.querySelectorAll('#map svg path').forEach(el => {

    let iso = el.id?.toUpperCase();

    if (!iso || iso.length !== 2) {
      const parent = el.closest('g');
      if (parent && parent.id) {
        iso = parent.id.toUpperCase();
      }
    }

    if (!iso || iso.length !== 2) return;

    el.classList.remove(
      'fill00','fill10','fill20','fill30','fill40',
      'fill50','fill60','fill70','fill80','fill90','fillNA'
    );

    const value = stats[iso];

    if (value === undefined || value === null || value === ":") {
      el.classList.add('fillNA');
    } else {
      const logMin = Math.log(min + 1);
      const logMax = Math.log(max + 1);
      const logVal = Math.log(value + 1);

      const ratio = (logVal - logMin) / (logMax - logMin || 1);
      const bucket = Math.floor(ratio * 10);
      const safeBucket = Math.min(Math.max(bucket, 0), 9);
      el.classList.add(`fill${safeBucket}0`);
    }

    // ------------------------------
    // TOOLTIP
    el.onmouseenter = e => {
      const currentValue = stats[iso];
      el.style.stroke = 'black';
      el.style.strokeWidth = '2';
      const name = el.dataset.name || iso;
      tooltip.innerHTML = currentValue != null
        ? `<b>${name}</b>: ${currentValue} ${currentUnit}`
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
      const currentValue = stats[iso];
      if (currentValue != null) highlightOnBar(currentValue);
      highlightTableRow(iso);
      zoomToCountry(el);
    };
  });
}

// ------------------------------
function zoomToCountry(el) {
  const bbox = el.getBBox();
  const svg = document.querySelector('#map svg');

  const scale = 0.6 * Math.min(
    svg.clientWidth / bbox.width,
    svg.clientHeight / bbox.height
  );

  const cx = bbox.x + bbox.width / 2;
  const cy = bbox.y + bbox.height / 2;

  const tx = svg.clientWidth / 2 - cx * scale;
  const ty = svg.clientHeight / 2 - cy * scale;

  svg.style.transition = 'transform 0.5s';
  svg.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
}

// ------------------------------
// RANGE BAR
// ------------------------------
// RANGE BAR
function updateRangeBar() {
  rangeBar.innerHTML = ''; // clear previous content

  const vals = Object.values(stats).filter(v => v != null);
  if (!vals.length) return;

  const min = Math.min(...vals);
  const max = Math.max(...vals);

  // COLORS MATCH SVG BUCKETS
  const colors = [
    'rgb(253,247,254)',
    'rgb(244,219,250)',
    'rgb(226,185,245)',
    'rgb(204,153,240)',
    'rgb(180,120,235)',
    'rgb(150,90,220)',
    'rgb(120,60,200)',
    'rgb(90,40,170)',
    'rgb(60,20,140)',
    'rgb(40,10,110)'
  ];

  // CREATE LINEAR GRADIENT
  const stops = colors.map((color, i) => {
    const pct = (i / (colors.length - 1)) * 100;
    return `${color} ${pct}%`;
  }).join(', ');

  rangeBar.style.background = `linear-gradient(to right, ${stops})`;
  rangeBar.style.position = 'relative';
  rangeBar.style.height = '20px';
  rangeBar.style.borderRadius = '4px';

  // MIN LABEL
  const minLabel = document.createElement('div');
  minLabel.className = 'label';
  minLabel.style.position = 'absolute';
  minLabel.style.left = '0%';
  minLabel.style.top = '22px';
  minLabel.style.fontSize = '12px';
  minLabel.style.color = '#000';
  minLabel.innerText = `${min.toFixed(0)} ${currentUnit}`;
  rangeBar.appendChild(minLabel);

  // MAX LABEL
  const maxLabel = document.createElement('div');
  maxLabel.className = 'label';
  maxLabel.style.position = 'absolute';
  maxLabel.style.right = '0%';
  maxLabel.style.top = '22px';
  maxLabel.style.fontSize = '12px';
  maxLabel.style.color = '#000';
  maxLabel.innerText = `${max.toFixed(0)} ${currentUnit}`;
  rangeBar.appendChild(maxLabel);
}

// ------------------------------
// MARKER ON RANGE BAR (SVG-COLOR MATCHED)
function highlightOnBar(value) {
  const old = rangeBar.querySelector('.marker');
  if (old) old.remove();

  const vals = Object.values(stats).filter(v => v != null);
  if (!vals.length || value == null) return;

  const min = Math.min(...vals);
  const max = Math.max(...vals);

  // ---------------- LOGARITHMIC BUCKET MATCHING SVG
  const logMin = Math.log(min + 1);
  const logMax = Math.log(max + 1);
  const logVal = Math.log(value + 1);

  const ratio = (logVal - logMin) / (logMax - logMin || 1);
  let bucket = Math.floor(ratio * 10);
  bucket = Math.min(Math.max(bucket, 0), 9);

  // COLORS MATCH SVG BUCKETS
  const colors = [
    'rgb(253,247,254)',
    'rgb(244,219,250)',
    'rgb(226,185,245)',
    'rgb(204,153,240)',
    'rgb(180,120,235)',
    'rgb(150,90,220)',
    'rgb(120,60,200)',
    'rgb(90,40,170)',
    'rgb(60,20,140)',
    'rgb(40,10,110)'
  ];

  const marker = document.createElement('div');
  marker.className = 'marker';
  marker.style.position = 'absolute';
  marker.style.top = '0';
  marker.style.width = '2px';
  marker.style.height = '100%';
  marker.style.background = colors[bucket]; // <-- match SVG fill
  marker.style.left = `${ratio * 100}%`; // still linear placement
  rangeBar.appendChild(marker);
}

// ------------------------------
// TABLE
function populateTable() {
  dataTable.innerHTML = '';

  const entries = Object.entries(stats)
    .filter(([_, v]) => v != null)
    .sort((a, b) => b[1] - a[1]);

  entries.forEach(([iso, value], index) => {
    const rank = index + 1;
    const flagUrl = `https://flagcdn.com/24x18/${iso.toLowerCase()}.png`;

    const tr = document.createElement('tr');
    tr.dataset.iso = iso;

    tr.innerHTML = `
      <td>${rank}</td>
      <td><img src="${flagUrl}" style="vertical-align:middle; margin-right:6px;"> ${iso}</td>
      <td>${value}</td>
    `;

    dataTable.appendChild(tr);
  });

  attachTableClick();
}