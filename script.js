const GOOGLE_SHEET_URL = "https://script.google.com/macros/s/AKfycbyK910iZGU_jHIDtP-r4hcPlR6bJ5hbwCcyJGVpFmr1SuRtCIDA8OQ6fbTVJ1PLA_0R/exec";
const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRHLEWGm-Lja4uAEihN9Awf64DBfgC0lRCyiuKDb2bZs6DduEDELnOXYZbDYeOAjbuFNqH4pSJvVC7P/pub?gid=0&single=true&output=csv";

const map = new maplibregl.Map({
  container: 'map',
  style: 'https://tiles.basemaps.cartocdn.com/gl/positron-gl-style/style.json',
  center: [-77.0369, 38.9072], 
  zoom: 12
});

let activeSales = [];
const markers = [];

function parseCSVRow(row) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < row.length; i++) {
    const char = row[i];
    if (char === '"') inQuotes = !inQuotes;
    else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else current += char;
  }
  result.push(current.trim());
  return result;
}

function getStatus(timeStr) {
  try {
    const now = new Date();
    const parts = timeStr.split('–').map(t => t.trim().toLowerCase());
    if (parts.length < 2) return { label: 'Scheduled', class: 'closed-now' };
    const parseTime = (t) => {
      const match = t.match(/(\d+)(am|pm)/);
      if (!match) return new Date();
      let h = parseInt(match[1]);
      if (match[2] === 'pm' && h < 12) h += 12;
      if (match[2] === 'am' && h === 12) h = 0;
      const d = new Date(); d.setHours(h, 0, 0, 0); return d;
    };
    return (now >= parseTime(parts[0]) && now <= parseTime(parts[1])) ? 
      { label: 'Open Now', class: 'open-now' } : { label: 'Closed', class: 'closed-now' };
  } catch(e) { return { label: 'Scheduled', class: 'closed-now' }; }
}

async function loadSales() {
  try {
    const response = await fetch(CSV_URL);
    const text = await response.text();
    const rows = text.split('\n').slice(1); 
    activeSales = rows.map(row => {
      const cols = parseCSVRow(row);
      if (cols.length < 8) return null;
      return {
        title: cols[0], address: cols[1], category: cols[2],
        date: cols[3], time: cols[4], highlights: cols[5],
        lat: parseFloat(cols[6]), lng: parseFloat(cols[7])
      };
    }).filter(s => s !== null && !isNaN(s.lat));
    
    if (activeSales.length > 0) map.setCenter([activeSales[0].lng, activeSales[0].lat]);
    updateDisplay();
  } catch (err) { console.error("Error loading sales:", err); }
}

function updateDisplay() {
  const searchTerm = document.getElementById('search-input').value.toLowerCase();
  const catFilter = document.querySelector('#filters button.active').dataset.category;
  markers.forEach(m => m.remove());
  markers.length = 0;

  const filtered = activeSales.filter(s => {
    const matchSearch = s.title.toLowerCase().includes(searchTerm) || s.category.toLowerCase().includes(searchTerm);
    const matchCat = (catFilter === 'All' || s.category === catFilter);
    return matchSearch && matchCat;
  });

  document.getElementById('list-content').innerHTML = filtered.map(s => `
    <div class="list-item" onclick="focusSale(${s.lat}, ${s.lng})">
      <h4>${s.title} <span class="status-pill ${getStatus(s.time).class}">${getStatus(s.time).label}</span></h4>
      <p>📍 ${s.address}</p>
    </div>
  `).join('');

  filtered.forEach(sale => {
    const status = getStatus(sale.time);
    const cat = sale.category.toLowerCase();
    const color = cat.includes("furniture") ? "#FF9500" : cat.includes("clothes") ? "#AF52DE" : "#5856D6";
    
    const popup = new maplibregl.Popup({ offset: 25 }).setHTML(`
      <div style="padding:10px">
        <div class="status-pill ${status.class}">${status.label}</div>
        <h3 style="margin:5px 0">${sale.title}</h3>
        <p style="margin:5px 0">🕒 ${sale.time}</p>
        <a href="https://www.google.com/maps/dir/?api=1&destination=${sale.lat},${sale.lng}" target="_blank" style="display:block; text-align:center; background:#007AFF; color:white; text-decoration:none; padding:10px; border-radius:8px; font-weight:bold; margin-top:10px;">Directions</a>
        <button onclick="shareSale('${sale.title.replace(/'/g, "\\'")}', '${sale.address.replace(/'/g, "\\'")}')" style="width:100%; background:#f0f0f0; color:#333; border:1px solid #ccc; padding:8px; border-radius:8px; font-weight:bold; margin-top:5px; cursor:pointer;">Share</button>
      </div>
    `);
    
    const m = new maplibregl.Marker({ color: color }).setLngLat([sale.lng, sale.lat]).setPopup(popup).addTo(map);
    markers.push(m);
  });
}

window.focusSale = (lat, lng) => {
  map.flyTo({ center: [lng, lat], zoom: 15 });
  document.getElementById('list-panel').classList.remove('open');
};

window.shareSale = (title, addr) => {
  if (navigator.share) {
    navigator.share({ title: title, text: `Check out this sale: ${title} at ${addr}`, url: window.location.href });
  } else { alert("Link copied to clipboard!"); }
};

document.getElementById('list-toggle').onclick = () => {
  const open = document.getElementById('list-panel').classList.toggle('open');
  document.getElementById('list-toggle').innerText = open ? "Close List" : "Show List";
};

document.getElementById('search-input').oninput = updateDisplay;

document.querySelectorAll('#filters button').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('#filters button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    updateDisplay();
  };
});

const modal = document.getElementById("form-modal");
document.getElementById("add-sale-btn").onclick = () => modal.style.display = "block";
document.querySelector(".close-modal").onclick = () => modal.style.display = "none";

// LOCATE ME LOGIC
document.getElementById('locate-me-btn').onclick = function() {
  const btn = this;
  btn.innerText = "⏳";
  navigator.geolocation.getCurrentPosition(async (pos) => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`);
      const data = await res.json();
      document.getElementById('form-address').value = data.display_name;
    } finally { btn.innerText = "📍"; }
  }, () => { alert("GPS failed!"); btn.innerText = "📍"; });
};

document.getElementById('post-sale-form').onsubmit = async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.innerText = "Posting..."; btn.disabled = true;
  try {
    const addr = document.getElementById('form-address').value;
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addr)}`);
    const data = await res.json();
    if (data.length === 0) throw new Error("Address not found!");
    
    const newSale = {
      title: document.getElementById('form-title').value,
      address: addr,
      category: document.getElementById('form-category').value,
      date: document.getElementById('form-date').value,
      time: document.getElementById('form-time').value,
      highlights: document.getElementById('form-highlights').value,
      lat: parseFloat(data[0].lat), 
      lng: parseFloat(data[0].lon)
    };
    
    await fetch(GOOGLE_SHEET_URL, { method: "POST", mode: "no-cors", body: JSON.stringify(newSale) });
    alert("Success!");
    location.reload();
  } catch (err) { alert(err.message); btn.innerText = "Post to Map"; btn.disabled = false; }
};

loadSales();
