/**
 * EUDR TraceChain: Frontend Client Application
 * Database Architecture & Compliance Management
 */

// ====================================================================
// GLOBAL STATE
// ====================================================================
const state = {
  currentTab: 'dashboard',
  currentMasterTable: 'organizations',
  plots: [],
  batches: [],
  organizations: [],
  countries: [],
  commodities: [],
  leafMap: null,
  mapMarkers: [],
  mapPolygons: [],
  chartCompliance: null,
  chartCountryRisk: null,
  telemetryLog: [],
  currentTableBrowser: {
    table: 'batches',
    page: 1,
    limit: 15,
    search: '',
    totalRows: 0
  }
};

// ====================================================================
// INITIALIZATION ON DOM LOAD
// ====================================================================
document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
  mermaid.initialize({ startOnLoad: false, theme: 'neutral' });

  // Handle URL hash or default tab
  const initialTab = window.location.hash.replace('#', '') || 'dashboard';
  switchTab(initialTab);

  // Setup Keyboard Shortcuts (Ctrl+K for palette)
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      openCommandPalette();
    }
    if (e.key === 'Escape') {
      closeCommandPalette();
      closeAllModals();
    }
  });

  // Pre-load essential lookups
  loadLookups();
  loadSampleQueriesList();
});

// ====================================================================
// TAB NAVIGATION SYSTEM
// ====================================================================
function switchTab(tabId) {
  // Validate tab ID
  const targetPane = document.getElementById(`tab-${tabId}`);
  if (!targetPane) tabId = 'dashboard';

  state.currentTab = tabId;
  window.location.hash = tabId;

  // Update Breadcrumb & Nav styles
  const breadcrumb = document.getElementById('breadcrumb-title');
  if (breadcrumb) {
    const titleMap = {
      'dashboard': 'Dashboard',
      'plots-map': 'Plots & Geospatial Map',
      'batches-trace': 'Batches & Traceability',
      'risk-diligence': 'Risk & Due Diligence',
      'master-data': 'Master Data & Actors',
      'db-er-diagram': 'Database Architecture / ER Diagram',
      'db-table-browser': 'Database Architecture / Live Table Browser',
      'db-sql-console': 'Database Architecture / SQL Console',
      'db-triggers-views': 'Database Architecture / Triggers & Views',
      'db-audit-log': 'Database Architecture / Audit Log Timeline',
      'db-normalization': 'Database Architecture / 3NF Proofs'
    };
    breadcrumb.textContent = titleMap[tabId] || 'Dashboard';
  }

  // Update Sidebar active classes
  document.querySelectorAll('.nav-item').forEach(btn => {
    if (btn.dataset.tab === tabId) {
      btn.classList.add('bg-forest-800', 'text-white', 'font-bold');
      btn.classList.remove('text-slate-300');
    } else {
      btn.classList.remove('bg-forest-800', 'text-white', 'font-bold');
      btn.classList.add('text-slate-300');
    }
  });

  // Toggle Visibility of Tab Panes
  document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.add('hidden'));
  document.getElementById(`tab-${tabId}`).classList.remove('hidden');

  // Trigger tab-specific loaders
  if (tabId === 'dashboard') loadDashboardData();
  else if (tabId === 'plots-map') initOrRefreshPlotsMap();
  else if (tabId === 'batches-trace') loadBatchesTraceData();
  else if (tabId === 'risk-diligence') loadRiskAndDDSData();
  else if (tabId === 'master-data') loadMasterTable(state.currentMasterTable);
  else if (tabId === 'db-er-diagram') renderERDiagram();
  else if (tabId === 'db-table-browser') initTableBrowser();
  else if (tabId === 'db-sql-console') initSQLConsole();
  else if (tabId === 'db-triggers-views') loadTriggersAndViews();
  else if (tabId === 'db-audit-log') loadAuditLog();

  lucide.createIcons();
}

// ====================================================================
// NOTIFICATION & TELEMETRY SYSTEM
// ====================================================================
function showToast(message, type = 'success', duration = 4000) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  
  const bgClasses = type === 'error' ? 'bg-rose-900 border-rose-700 text-rose-100' : (type === 'warning' ? 'bg-amber-900 border-amber-700 text-amber-100' : 'bg-forest-900 border-emerald-500 text-emerald-100');
  const icon = type === 'error' ? 'alert-circle' : (type === 'warning' ? 'alert-triangle' : 'check-circle-2');

  toast.className = `pointer-events-auto flex items-start p-3.5 rounded-xl border shadow-xl text-xs space-x-3 transition-all duration-300 transform translate-x-12 opacity-0 max-w-sm ${bgClasses}`;
  toast.innerHTML = `
    <i data-lucide="${icon}" class="w-4 h-4 mt-0.5 flex-shrink-0"></i>
    <div class="flex-1 font-medium leading-relaxed">${message}</div>
    <button onclick="this.parentElement.remove()" class="text-slate-400 hover:text-white"><i data-lucide="x" class="w-3.5 h-3.5"></i></button>
  `;

  container.appendChild(toast);
  lucide.createIcons();

  requestAnimationFrame(() => {
    toast.classList.remove('translate-x-12', 'opacity-0');
  });

  setTimeout(() => {
    toast.classList.add('translate-x-12', 'opacity-0');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function recordTelemetry(telemetry) {
  if (!telemetry || !telemetry.queries) return;
  
  telemetry.queries.forEach(q => {
    state.telemetryLog.unshift(q);
  });

  const badge = document.getElementById('sql-counter-badge');
  if (badge && telemetry.queries.length > 0) {
    const lastQ = telemetry.queries[0];
    badge.textContent = `${lastQ.elapsed_ms} ms`;
    badge.classList.add('bg-emerald-300');
    setTimeout(() => badge.classList.remove('bg-emerald-300'), 800);
  }

  renderTelemetryLog();
}

function toggleUnderTheHood() {
  const drawer = document.getElementById('under-the-hood-drawer');
  drawer.classList.toggle('translate-x-full');
}

function renderTelemetryLog() {
  const container = document.getElementById('telemetry-log-container');
  if (!container) return;

  if (state.telemetryLog.length === 0) {
    container.innerHTML = `<div class="text-center py-12 text-slate-500 font-sans text-xs"><p>No queries executed yet in this session.</p></div>`;
    return;
  }

  container.innerHTML = state.telemetryLog.slice(0, 30).map(item => `
    <div class="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5">
      <div class="flex items-center justify-between text-[10px] text-slate-400">
        <span class="font-bold text-emerald-400">${item.elapsed_ms} ms</span>
        <span>${item.timestamp.split('T')[1].split('.')[0]}</span>
      </div>
      <div class="text-slate-200 leading-snug whitespace-pre-wrap break-all">${escapeHTML(item.sql)}</div>
      ${item.params && item.params.length > 0 ? `<div class="text-[10px] text-slate-400">Params: ${escapeHTML(JSON.stringify(item.params))}</div>` : ''}
      ${item.error ? `<div class="text-[10px] text-rose-400 font-semibold">Error: ${escapeHTML(item.error)}</div>` : ''}
    </div>
  `).join('');
}

function clearTelemetryLog() {
  state.telemetryLog = [];
  renderTelemetryLog();
}

// ====================================================================
// 1. DASHBOARD & ANALYTICS
// ====================================================================
async function loadDashboardData() {
  try {
    const res = await fetch('/api/dashboard/stats');
    const data = await res.json();
    if (data._telemetry) recordTelemetry(data._telemetry);

    // KPIs
    document.getElementById('kpi-total-batches').textContent = data.kpis.total_batches;
    document.getElementById('kpi-compliant-batches').textContent = data.kpis.compliant_batches;
    document.getElementById('kpi-pending-batches').textContent = `${data.kpis.pending_batches} pending review`;
    document.getElementById('kpi-compliance-rate').textContent = `${data.kpis.compliance_rate}%`;
    document.getElementById('kpi-total-plots').textContent = data.kpis.total_plots;
    document.getElementById('kpi-high-risk-plots').textContent = data.kpis.high_risk_plots;
    document.getElementById('kpi-total-dds').textContent = data.kpis.total_dds;

    // Chart: Compliance by Commodity
    renderComplianceChart(data.commodity_stats || []);

    // Chart: Country Risk Radar
    renderCountryRiskChart(data.country_risk_stats || []);

    // Recent Audit Table
    renderDashboardAuditTable(data.recent_audit || []);
  } catch (err) {
    console.error("Dashboard error:", err);
  }
}

function renderComplianceChart(stats) {
  const ctx = document.getElementById('chartComplianceByCommodity');
  if (!ctx) return;

  if (state.chartCompliance) state.chartCompliance.destroy();

  const labels = stats.map(s => s.commodity);
  const compliantData = stats.map(s => s.compliant);
  const nonCompliantData = stats.map(s => s.non_compliant);
  const pendingData = stats.map(s => s.pending);

  state.chartCompliance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        { label: 'Compliant', data: compliantData, backgroundColor: '#10B981', borderRadius: 4 },
        { label: 'Pending', data: pendingData, backgroundColor: '#F59E0B', borderRadius: 4 },
        { label: 'Non-Compliant', data: nonCompliantData, backgroundColor: '#EF4444', borderRadius: 4 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { boxWidth: 10, font: { size: 11 } } }
      },
      scales: {
        x: { stacked: true, grid: { display: false } },
        y: { stacked: true, beginAtZero: true, grid: { color: '#F1F5F9' } }
      }
    }
  });
}

function renderCountryRiskChart(stats) {
  const ctx = document.getElementById('chartCountryRisk');
  if (!ctx) return;

  if (state.chartCountryRisk) state.chartCountryRisk.destroy();

  const labels = stats.map(s => `${s.country} (${s.risk_level})`);
  const plotCounts = stats.map(s => s.plots_count);
  const batchCounts = stats.map(s => s.batches_count);

  state.chartCountryRisk = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Parcels Registered',
          data: plotCounts,
          backgroundColor: 'rgba(16, 185, 129, 0.2)',
          borderColor: '#10B981',
          pointBackgroundColor: '#10B981'
        },
        {
          label: 'Batches Handled',
          data: batchCounts,
          backgroundColor: 'rgba(15, 61, 46, 0.2)',
          borderColor: '#0F3D2E',
          pointBackgroundColor: '#0F3D2E'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { boxWidth: 10, font: { size: 11 } } }
      },
      scales: {
        r: { beginAtZero: true }
      }
    }
  });
}

function renderDashboardAuditTable(auditRows) {
  const tbody = document.getElementById('dashboard-audit-tbody');
  if (!tbody) return;

  if (auditRows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="py-4 text-center text-slate-400">No audit records found.</td></tr>`;
    return;
  }

  tbody.innerHTML = auditRows.map(row => {
    const actionBadge = row.action === 'INSERT' ? 'bg-emerald-100 text-emerald-800' : (row.action === 'UPDATE' ? 'bg-blue-100 text-blue-800' : 'bg-rose-100 text-rose-800');
    return `
      <tr class="hover:bg-slate-50 transition-colors">
        <td class="py-2.5 font-mono text-[11px]">#${row.log_id}</td>
        <td class="py-2.5 font-mono text-[11px] font-semibold text-slate-900">${row.table_name}</td>
        <td class="py-2.5"><span class="px-2 py-0.5 rounded text-[10px] font-bold ${actionBadge}">${row.action}</span></td>
        <td class="py-2.5 font-mono text-[11px] max-w-xs truncate text-slate-500">${escapeHTML(row.new_value || row.old_value || '-')}</td>
        <td class="py-2.5 text-slate-400 text-[11px]">${row.changed_at}</td>
      </tr>
    `;
  }).join('');
}

// ====================================================================
// 2. PLOTS & GEOSPATIAL MAP (LEAFLET)
// ====================================================================
async function initOrRefreshPlotsMap() {
  // Load Plot Data from API
  const res = await fetch('/api/plots');
  const data = await res.json();
  if (data._telemetry) recordTelemetry(data._telemetry);

  state.plots = data.plots || [];
  renderPlotsTable(state.plots);

  // Initialize Map if not yet created
  if (!state.leafMap) {
    state.leafMap = L.map('plots-leaflet-map').setView([10.0, 10.0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(state.leafMap);
  } else {
    state.leafMap.invalidateSize();
  }

  // Clear existing markers & polygons
  state.mapMarkers.forEach(m => state.leafMap.removeLayer(m));
  state.mapPolygons.forEach(p => state.leafMap.removeLayer(p));
  state.mapMarkers = [];
  state.mapPolygons = [];

  const bounds = [];

  // Plot each point and polygon
  state.plots.forEach(plot => {
    const isCompliant = plot.deforestation_free === 1;
    const color = isCompliant ? '#10B981' : '#EF4444';

    // 1. Point Marker
    const marker = L.circleMarker([plot.latitude, plot.longitude], {
      radius: 7,
      fillColor: color,
      color: '#FFFFFF',
      weight: 2,
      opacity: 1,
      fillOpacity: 0.9
    }).addTo(state.leafMap);

    marker.bindPopup(`
      <div class="font-sans text-xs">
        <div class="font-bold text-slate-900">${escapeHTML(plot.region_name)}</div>
        <div class="text-[11px] text-slate-600 mt-1">Owner: <strong>${escapeHTML(plot.owner_name)}</strong></div>
        <div class="text-[11px] text-slate-600">Area: ${plot.area_hectares} ha (${plot.geo_type})</div>
        <div class="text-[11px] font-mono text-slate-500 mt-1">${plot.latitude.toFixed(6)}, ${plot.longitude.toFixed(6)}</div>
        <div class="mt-2">
          <span class="px-2 py-0.5 rounded text-[10px] font-bold ${isCompliant ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">
            ${isCompliant ? 'Cut-off Compliant' : 'ALERT: Deforested'}
          </span>
        </div>
      </div>
    `);

    marker.on('click', () => inspectPlotDetails(plot));
    state.mapMarkers.push(marker);
    bounds.push([plot.latitude, plot.longitude]);

    // 2. Polygon Boundaries
    if (plot.geo_type === 'POLYGON' && plot.polygon_coords && plot.polygon_coords.length >= 3) {
      const polygon = L.polygon(plot.polygon_coords, {
        color: color,
        fillColor: color,
        fillOpacity: 0.2,
        weight: 2
      }).addTo(state.leafMap);

      polygon.on('click', () => inspectPlotDetails(plot));
      state.mapPolygons.push(polygon);
      plot.polygon_coords.forEach(pt => bounds.push(pt));
    }
  });

  if (bounds.length > 0) {
    state.leafMap.fitBounds(bounds, { padding: [30, 30] });
  }

  // Pre-select the first plot in inspector
  if (state.plots.length > 0) {
    inspectPlotDetails(state.plots[0]);
  }
}

function inspectPlotDetails(plot) {
  const container = document.getElementById('plot-inspector-content');
  const badge = document.getElementById('selected-plot-badge');
  if (!container) return;

  const isCompliant = plot.deforestation_free === 1;
  badge.textContent = `Plot #${plot.plot_id}`;
  badge.className = `px-2 py-0.5 text-[10px] font-semibold rounded ${isCompliant ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`;

  container.innerHTML = `
    <div class="space-y-4">
      <div>
        <h4 class="font-bold text-sm text-slate-900">${escapeHTML(plot.region_name)}</h4>
        <div class="text-[11px] text-slate-500">${escapeHTML(plot.country_name)} &bull; Risk: <span class="font-bold">${plot.country_risk}</span></div>
      </div>

      <div class="grid grid-cols-2 gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
        <div>
          <span class="text-[10px] uppercase text-slate-400 font-bold block">Commodity</span>
          <span class="font-semibold text-slate-800">${escapeHTML(plot.commodity_name)}</span>
        </div>
        <div>
          <span class="text-[10px] uppercase text-slate-400 font-bold block">Area / Geometry</span>
          <span class="font-semibold text-slate-800">${plot.area_hectares} ha (${plot.geo_type})</span>
        </div>
      </div>

      <div>
        <span class="text-[10px] uppercase text-slate-400 font-bold block mb-1">6-Decimal Coordinates (Art. 9)</span>
        <div class="font-mono text-[11px] bg-slate-100 p-2 rounded border border-slate-200 text-slate-800">
          Lat: ${plot.latitude.toFixed(6)}<br>Lon: ${plot.longitude.toFixed(6)}
        </div>
      </div>

      <div>
        <span class="text-[10px] uppercase text-slate-400 font-bold block mb-1">Satellite Earth Observation (Cut-off 31 Dec 2020)</span>
        <div class="p-3 rounded-lg border ${isCompliant ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'}">
          <div class="font-bold text-xs flex items-center">
            <i data-lucide="${isCompliant ? 'check' : 'alert-octagon'}" class="w-3.5 h-3.5 mr-1.5"></i>
            ${isCompliant ? 'Deforestation-Free Verified' : 'NON-COMPLIANT: Tree Cover Loss'}
          </div>
          <p class="text-[11px] mt-1 leading-relaxed">${escapeHTML(plot.satellite_remarks || 'Baseline verification recorded.')}</p>
          <div class="text-[10px] text-slate-500 mt-2">Check Date: ${plot.satellite_check_date || '2026-01-10'}</div>
        </div>
      </div>

      <div>
        <span class="text-[10px] uppercase text-slate-400 font-bold block mb-1">Verified Legality Documents (${plot.verified_docs_count}/${plot.total_docs_count})</span>
        <div class="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-[11px] text-slate-700">
          ${plot.verified_docs_count > 0 ? `<span class="text-emerald-700 font-semibold">&check; Land Tenure &amp; Environmental Permit Verified</span>` : `<span class="text-amber-700 font-semibold">&excl; Missing Verified Land Title</span>`}
        </div>
      </div>
    </div>
  `;
  lucide.createIcons();
}

function renderPlotsTable(plots) {
  const tbody = document.getElementById('plots-table-tbody');
  if (!tbody) return;

  if (plots.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="py-4 text-center text-slate-400">No plots registered.</td></tr>`;
    return;
  }

  tbody.innerHTML = plots.map(p => {
    const isCompliant = p.deforestation_free === 1;
    return `
      <tr class="hover:bg-slate-50 transition-colors cursor-pointer" onclick="inspectPlotDetails(${JSON.stringify(p).replace(/"/g, '&quot;')})">
        <td class="py-2.5 px-3 font-mono text-[11px]">#${p.plot_id}</td>
        <td class="py-2.5 px-3 font-semibold text-slate-900">${escapeHTML(p.region_name)}</td>
        <td class="py-2.5 px-3 text-slate-600">${escapeHTML(p.owner_name)}</td>
        <td class="py-2.5 px-3 text-slate-600">${escapeHTML(p.country_name)}</td>
        <td class="py-2.5 px-3 text-slate-600">${escapeHTML(p.commodity_name)}</td>
        <td class="py-2.5 px-3 font-mono">${p.area_hectares}</td>
        <td class="py-2.5 px-3"><span class="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-slate-100 text-slate-700">${p.geo_type}</span></td>
        <td class="py-2.5 px-3">
          <span class="px-2 py-0.5 rounded text-[10px] font-bold ${isCompliant ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">
            ${isCompliant ? 'Compliant' : 'Deforested'}
          </span>
        </td>
        <td class="py-2.5 px-3">
          <button onclick="event.stopPropagation(); deletePlot(${p.plot_id})" class="text-slate-400 hover:text-rose-600"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
        </td>
      </tr>
    `;
  }).join('');
  lucide.createIcons();
}

function filterPlotsTable() {
  const query = (document.getElementById('plots-table-search').value || '').toLowerCase();
  const filtered = state.plots.filter(p => 
    p.region_name.toLowerCase().includes(query) ||
    p.owner_name.toLowerCase().includes(query) ||
    p.country_name.toLowerCase().includes(query) ||
    p.commodity_name.toLowerCase().includes(query)
  );
  renderPlotsTable(filtered);
}

function openAddPlotModal() {
  populateSelectOptions('plot-form-owner-select', state.organizations, 'org_id', 'name');
  populateSelectOptions('plot-form-country-select', state.countries, 'country_id', 'name');
  populateSelectOptions('plot-form-commodity-select', state.commodities, 'commodity_id', 'name');
  openModal('modal-add-plot');
}

function autoCheckGeoType(areaVal) {
  const area = parseFloat(areaVal);
  const geoSelect = document.getElementById('plot-form-geo-type');
  if (area > 4.0) {
    geoSelect.value = 'POLYGON';
  }
}

async function submitAddPlot(e) {
  e.preventDefault();
  const form = e.target;
  const formData = new FormData(form);
  
  let polygon_coords = [];
  const rawPoly = formData.get('polygon_coords_raw');
  if (rawPoly && rawPoly.trim()) {
    try {
      polygon_coords = JSON.parse(rawPoly.trim());
    } catch (err) {
      showToast("Invalid JSON format for polygon vertices. Use [[lat, lon], ...]", "error");
      return;
    }
  }

  const payload = {
    owner_org_id: parseInt(formData.get('owner_org_id')),
    country_id: parseInt(formData.get('country_id')),
    commodity_id: parseInt(formData.get('commodity_id')),
    area_hectares: parseFloat(formData.get('area_hectares')),
    geo_type: formData.get('geo_type'),
    latitude: parseFloat(formData.get('latitude')),
    longitude: parseFloat(formData.get('longitude')),
    region_name: formData.get('region_name'),
    polygon_coords: polygon_coords
  };

  try {
    const res = await fetch('/api/plots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data._telemetry) recordTelemetry(data._telemetry);

    if (data.success) {
      showToast(data.message, 'success');
      closeModal('modal-add-plot');
      form.reset();
      initOrRefreshPlotsMap();
    } else {
      showToast(data.error || "Failed to create plot", 'error');
    }
  } catch (err) {
    showToast("Network error creating plot", 'error');
  }
}

async function deletePlot(plotId) {
  if (!confirm(`Are you sure you want to delete Plot #${plotId}? This will cascade delete linked polygon vertices and production checks.`)) return;

  try {
    const res = await fetch(`/api/plots/${plotId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data._telemetry) recordTelemetry(data._telemetry);

    if (data.success) {
      showToast(data.message, 'success');
      initOrRefreshPlotsMap();
    } else {
      showToast(data.error || "Failed to delete plot", 'error');
    }
  } catch (err) {
    showToast("Delete error", 'error');
  }
}

// ====================================================================
// 3. BATCHES & TRACEABILITY ENGINE
// ====================================================================
async function loadBatchesTraceData() {
  const res = await fetch('/api/batches');
  const data = await res.json();
  if (data._telemetry) recordTelemetry(data._telemetry);

  state.batches = data.batches || [];
  renderBatchesTable(state.batches);

  // Update batch count badge
  document.getElementById('batches-count-pill').textContent = `${state.batches.length} Batches Registered`;

  // Trigger initial trace for default selected batch
  const traceSelect = document.getElementById('trace-batch-select');
  if (traceSelect && traceSelect.value) {
    runBatchTrace(traceSelect.value);
  }
}

function renderBatchesTable(batches) {
  const tbody = document.getElementById('batches-table-tbody');
  if (!tbody) return;

  if (batches.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="py-4 text-center text-slate-400">No batches registered.</td></tr>`;
    return;
  }

  tbody.innerHTML = batches.map(b => {
    const statusBadge = b.compliance_status === 'Compliant' ? 'bg-emerald-100 text-emerald-800' : (b.compliance_status === 'Pending' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800');
    return `
      <tr class="hover:bg-slate-50 transition-colors">
        <td class="py-2.5 px-3 font-mono font-bold text-slate-900">${escapeHTML(b.batch_code)}</td>
        <td class="py-2.5 px-3 text-slate-700">${escapeHTML(b.commodity_name)}</td>
        <td class="py-2.5 px-3 font-mono text-slate-700">${b.quantity_kg.toLocaleString()} kg</td>
        <td class="py-2.5 px-3 text-slate-600">${escapeHTML(b.created_by_org_name)}</td>
        <td class="py-2.5 px-3"><span class="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-100 text-slate-700">${b.batch_type}</span></td>
        <td class="py-2.5 px-3"><span class="px-2 py-0.5 rounded text-[10px] font-bold ${statusBadge}">${b.compliance_status}</span></td>
        <td class="py-2.5 px-3 font-semibold ${b.risk_result === 'Negligible' ? 'text-emerald-600' : (b.risk_result ? 'text-rose-600' : 'text-slate-400')}">${b.risk_result || 'Unassessed'}</td>
        <td class="py-2.5 px-3 font-mono text-slate-500">${b.dds_reference_number || '-'}</td>
        <td class="py-2.5 px-3">
          <button onclick="runBatchTrace('${b.batch_code}')" class="px-2.5 py-1 text-[11px] font-semibold bg-forest-900 text-white rounded hover:bg-forest-800 transition-colors flex items-center">
            <i data-lucide="git-branch" class="w-3 h-3 mr-1"></i> Trace
          </button>
        </td>
      </tr>
    `;
  }).join('');
  lucide.createIcons();
}

async function runBatchTrace(batchCode) {
  const container = document.getElementById('trace-tree-canvas');
  const detailsBox = document.getElementById('trace-details-container');
  container.innerHTML = `<div class="text-center py-12"><i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto text-emerald-600 mb-2"></i><p class="text-xs text-slate-500">Executing Recursive CTE Trace for ${batchCode}...</p></div>`;
  lucide.createIcons();

  try {
    const res = await fetch(`/api/batches/trace/${batchCode}`);
    const data = await res.json();
    if (data._telemetry) recordTelemetry(data._telemetry);

    if (!res.ok) {
      container.innerHTML = `<div class="p-4 text-center text-rose-600 text-xs">${data.error || 'Batch not found'}</div>`;
      return;
    }

    renderTraceGraph(data, container);
    renderTraceDetails(data);
    detailsBox.classList.remove('hidden');
  } catch (err) {
    container.innerHTML = `<div class="p-4 text-center text-rose-600 text-xs">Error loading trace data</div>`;
  }
}

function renderTraceGraph(data, container) {
  const target = data.target_batch;
  const ancestors = data.ancestors || [];
  const plots = data.origin_plots || [];

  let html = `<div class="flex flex-col items-center space-y-6 max-w-2xl mx-auto py-2">`;

  // 1. Root Origin Plots (Top of Chain)
  if (plots.length > 0) {
    html += `
      <div class="w-full">
        <div class="text-[10px] uppercase font-bold text-slate-400 text-center mb-2 tracking-wider">Tier 1: Origin Farm Plots (${plots.length} Linked)</div>
        <div class="grid grid-cols-${Math.min(plots.length, 3)} gap-3">
          ${plots.map(p => `
            <div class="p-3 bg-white border border-slate-200 rounded-xl shadow-sm text-center">
              <div class="w-7 h-7 mx-auto rounded-full ${p.deforestation_free ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'} flex items-center justify-center mb-1">
                <i data-lucide="map-pin" class="w-3.5 h-3.5"></i>
              </div>
              <div class="font-bold text-xs text-slate-900">${escapeHTML(p.region_name)}</div>
              <div class="text-[10px] font-mono text-slate-500">${p.latitude.toFixed(4)}, ${p.longitude.toFixed(4)}</div>
              <div class="mt-1 text-[9px] font-bold ${p.deforestation_free ? 'text-emerald-600' : 'text-rose-600'}">
                ${p.deforestation_free ? '2020 Compliant' : 'Deforestation Alert'}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="text-slate-300"><i data-lucide="arrow-down" class="w-5 h-5"></i></div>
    `;
  }

  // 2. Ancestor Intermediate Batches
  if (ancestors.length > 0) {
    html += `
      <div class="w-full">
        <div class="text-[10px] uppercase font-bold text-slate-400 text-center mb-2 tracking-wider">Tier 2: Upstream Processing &amp; Aggregation Batches</div>
        <div class="grid grid-cols-${Math.min(ancestors.length, 2)} gap-3">
          ${ancestors.map(a => `
            <div class="p-3.5 bg-white border border-slate-200 rounded-xl shadow-sm text-center">
              <div class="font-bold font-mono text-xs text-slate-900">${escapeHTML(a.batch_code)}</div>
              <div class="text-[11px] text-slate-600">${escapeHTML(a.commodity_name)} &bull; ${a.quantity_kg.toLocaleString()} kg</div>
              <div class="text-[10px] text-slate-500 mt-0.5">Org: <strong>${escapeHTML(a.org_name)}</strong></div>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="text-slate-300"><i data-lucide="arrow-down" class="w-5 h-5"></i></div>
    `;
  }

  // 3. Target Batch (EU Destination / Product)
  const isTargetCompliant = target.compliance_status === 'Compliant';
  html += `
    <div class="w-full max-w-md p-4 rounded-xl bg-forest-900 text-white border border-forest-700 shadow-md text-center">
      <div class="text-[10px] uppercase tracking-wider text-emerald-400 font-bold">Target Placed Batch</div>
      <div class="text-sm font-bold font-mono text-white mt-1">${escapeHTML(target.batch_code)}</div>
      <div class="text-xs text-slate-200 mt-1">${escapeHTML(target.commodity_name)} (${target.cn_hs_code}) &bull; ${target.quantity_kg.toLocaleString()} kg</div>
      <div class="text-xs text-emerald-300 mt-1">Operator: <strong>${escapeHTML(target.org_name)}</strong> (${escapeHTML(target.country_name)})</div>
      <div class="mt-2 inline-block px-2.5 py-0.5 rounded text-[10px] font-bold ${isTargetCompliant ? 'bg-emerald-500 text-forest-950' : 'bg-rose-500 text-white'}">
        Compliance Status: ${target.compliance_status}
      </div>
    </div>
  </div>`;

  container.innerHTML = html;
  lucide.createIcons();
}

function renderTraceDetails(data) {
  const plotsList = document.getElementById('trace-plots-list');
  const txnsList = document.getElementById('trace-txns-list');

  // Plots
  plotsList.innerHTML = (data.origin_plots || []).map(p => `
    <div class="p-2.5 bg-white rounded-lg border border-slate-200 flex items-center justify-between">
      <div>
        <div class="font-bold text-slate-900">${escapeHTML(p.region_name)}</div>
        <div class="text-[10px] text-slate-500">Owner: ${escapeHTML(p.farm_owner)} (${escapeHTML(p.country_name)})</div>
        <div class="font-mono text-[10px] text-slate-600 mt-0.5">${p.latitude.toFixed(6)}, ${p.longitude.toFixed(6)}</div>
      </div>
      <div class="text-right">
        <span class="px-2 py-0.5 rounded text-[10px] font-bold ${p.deforestation_free ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">
          ${p.deforestation_free ? 'Compliant' : 'Deforested'}
        </span>
      </div>
    </div>
  `).join('');

  // Transactions
  txnsList.innerHTML = (data.transactions || []).map(t => `
    <div class="p-2.5 bg-white rounded-lg border border-slate-200 space-y-1">
      <div class="flex items-center justify-between">
        <span class="font-bold text-slate-900">${escapeHTML(t.from_org_name)} &rarr; ${escapeHTML(t.to_org_name)}</span>
        <span class="font-mono text-[10px] text-slate-500">${t.txn_date}</span>
      </div>
      <div class="text-[11px] text-slate-600">Voyage: <strong>${escapeHTML(t.origin_port || 'Origin')} &rarr; ${escapeHTML(t.destination_port || 'Destination')}</strong> (${t.transport_mode || 'Maritime'})</div>
      <div class="text-[10px] font-mono text-slate-500">Ref: ${escapeHTML(t.document_ref || '-')}</div>
    </div>
  `).join('');

  // Update print certificate preview
  const target = data.target_batch;
  document.getElementById('cert-batch-code').textContent = target.batch_code;
  document.getElementById('cert-commodity').textContent = `${target.commodity_name} (${target.cn_hs_code})`;
  document.getElementById('cert-qty').textContent = `${target.quantity_kg.toLocaleString()} kg`;
  document.getElementById('cert-dds-ref').textContent = target.dds_reference_number || '26EUDDS88491A';
  
  document.getElementById('cert-plots-table').innerHTML = (data.origin_plots || []).map(p => `
    <div>&bull; Plot #${p.plot_id} [${escapeHTML(p.region_name)}]: Lat ${p.latitude.toFixed(6)}, Lon ${p.longitude.toFixed(6)} (Area: ${p.area_hectares} ha, Deforestation-Free: ${p.deforestation_free ? 'YES' : 'NO'})</div>
  `).join('');
}

function printTraceCertificate() {
  window.print();
}

function openCreateBatchModal() {
  populateSelectOptions('batch-form-commodity-select', state.commodities, 'commodity_id', 'name');
  populateSelectOptions('batch-form-org-select', state.organizations, 'org_id', 'name');
  populateMultiSelect('batch-source-plots-select', state.plots, 'plot_id', (p) => `#${p.plot_id} - ${p.region_name} (${p.area_hectares} ha)`);
  populateMultiSelect('batch-parent-lineage-select', state.batches, 'batch_id', (b) => `${b.batch_code} (${b.commodity_name} - ${b.quantity_kg}kg)`);
  openModal('modal-create-batch');
}

function toggleBatchSourceInputs(batchType) {
  const plotsGroup = document.getElementById('batch-source-plots-group');
  const lineageGroup = document.getElementById('batch-parent-lineage-group');
  if (batchType === 'RAW') {
    plotsGroup.classList.remove('hidden');
    lineageGroup.classList.add('hidden');
  } else {
    plotsGroup.classList.add('hidden');
    lineageGroup.classList.remove('hidden');
  }
}

async function submitCreateBatch(e) {
  e.preventDefault();
  const form = e.target;
  const formData = new FormData(form);

  const plotSelect = document.getElementById('batch-source-plots-select');
  const selectedPlots = Array.from(plotSelect.selectedOptions).map(opt => parseInt(opt.value));

  const lineageSelect = document.getElementById('batch-parent-lineage-select');
  const selectedParents = Array.from(lineageSelect.selectedOptions).map(opt => parseInt(opt.value));

  const payload = {
    batch_code: formData.get('batch_code'),
    commodity_id: parseInt(formData.get('commodity_id')),
    quantity_kg: parseFloat(formData.get('quantity_kg')),
    created_by_org_id: parseInt(formData.get('created_by_org_id')),
    batch_type: formData.get('batch_type'),
    compliance_status: 'Pending',
    source_plot_ids: selectedPlots,
    parent_batch_ids: selectedParents
  };

  try {
    const res = await fetch('/api/batches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data._telemetry) recordTelemetry(data._telemetry);

    if (data.success) {
      showToast(data.message, 'success');
      closeModal('modal-create-batch');
      form.reset();
      loadBatchesTraceData();
    } else {
      showToast(data.error || "Failed to create batch", 'error');
    }
  } catch (err) {
    showToast("Error creating batch", 'error');
  }
}

// ====================================================================
// 4. RISK ASSESSMENTS & DUE DILIGENCE STATEMENTS (DDS)
// ====================================================================
async function loadRiskAndDDSData() {
  // Load DDS Statements
  const ddsRes = await fetch('/api/dds');
  const ddsData = await ddsRes.json();
  if (ddsData._telemetry) recordTelemetry(ddsData._telemetry);
  renderDDSTable(ddsData.statements || []);

  // Load Risk Assessments
  const riskRes = await fetch('/api/risk-assessments');
  const riskData = await riskRes.json();
  if (riskData._telemetry) recordTelemetry(riskData._telemetry);
  renderAssessmentsTable(riskData.assessments || []);
}

function renderDDSTable(statements) {
  const tbody = document.getElementById('dds-table-tbody');
  if (!tbody) return;

  if (statements.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="py-4 text-center text-slate-400">No statements registered.</td></tr>`;
    return;
  }

  tbody.innerHTML = statements.map(s => {
    const statusBadge = s.status === 'Accepted' ? 'bg-emerald-100 text-emerald-800' : (s.status === 'Submitted' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-700');
    return `
      <tr class="hover:bg-slate-50 transition-colors">
        <td class="py-2.5 px-3 font-mono font-bold text-slate-900">${escapeHTML(s.dds_reference_number)}</td>
        <td class="py-2.5 px-3 font-semibold text-slate-800">${escapeHTML(s.operator_name)}</td>
        <td class="py-2.5 px-3 font-mono text-slate-500">${s.eori_number || '-'}</td>
        <td class="py-2.5 px-3 font-mono">${s.linked_batches_count} batches</td>
        <td class="py-2.5 px-3 font-mono">${s.total_quantity_kg ? s.total_quantity_kg.toLocaleString() + ' kg' : '-'}</td>
        <td class="py-2.5 px-3 text-slate-500">${s.submission_date}</td>
        <td class="py-2.5 px-3"><span class="px-2 py-0.5 rounded text-[10px] font-bold ${statusBadge}">${s.status}</span></td>
      </tr>
    `;
  }).join('');
}

function renderAssessmentsTable(assessments) {
  const tbody = document.getElementById('assessments-table-tbody');
  if (!tbody) return;

  if (assessments.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="py-4 text-center text-slate-400">No assessments executed.</td></tr>`;
    return;
  }

  tbody.innerHTML = assessments.map(a => {
    const resultBadge = a.risk_result === 'Negligible' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800';
    return `
      <tr class="hover:bg-slate-50 transition-colors">
        <td class="py-2.5 px-3 font-mono text-[11px]">#${a.assessment_id}</td>
        <td class="py-2.5 px-3 font-mono font-bold text-slate-900">${escapeHTML(a.batch_code)}</td>
        <td class="py-2.5 px-3 text-slate-600">${escapeHTML(a.commodity_name)}</td>
        <td class="py-2.5 px-3 font-mono">${a.country_risk}</td>
        <td class="py-2.5 px-3 font-mono">${a.plot_risk}</td>
        <td class="py-2.5 px-3 font-mono">${a.deforestation_risk}</td>
        <td class="py-2.5 px-3 font-mono font-bold text-slate-900">${a.total_score}</td>
        <td class="py-2.5 px-3"><span class="px-2 py-0.5 rounded text-[10px] font-bold ${resultBadge}">${a.risk_result}</span></td>
        <td class="py-2.5 px-3 text-slate-600">${a.completed_mitigations}/${a.total_mitigations} actions</td>
        <td class="py-2.5 px-3">
          <button onclick="openAddMitigationModal(${a.assessment_id})" class="text-xs text-emerald-700 hover:underline font-semibold">+ Mitigation</button>
        </td>
      </tr>
    `;
  }).join('');
}

function openRiskAssessmentModal() {
  populateSelectOptions('risk-form-batch-select', state.batches, 'batch_id', 'batch_code');
  openModal('modal-risk-assessment');
}

async function submitRiskAssessment(e) {
  e.preventDefault();
  const form = e.target;
  const formData = new FormData(form);

  const payload = {
    batch_id: parseInt(formData.get('batch_id')),
    assessed_by_user_id: 1
  };

  try {
    const res = await fetch('/api/risk-assessments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data._telemetry) recordTelemetry(data._telemetry);

    if (data.success) {
      showToast(data.message, 'success');
      closeModal('modal-risk-assessment');
      loadRiskAndDDSData();
    } else {
      showToast(data.error || "Assessment failed", 'error');
    }
  } catch (err) {
    showToast("Error running assessment", 'error');
  }
}

function openGenerateDDSModal() {
  // Only operators can generate DDS
  const operators = state.organizations.filter(o => o.org_type === 'Importer-Operator');
  populateSelectOptions('dds-form-operator-select', operators, 'org_id', 'name');

  // Compliant batches
  const compliantBatches = state.batches.filter(b => b.compliance_status === 'Compliant');
  populateMultiSelect('dds-form-batches-select', compliantBatches, 'batch_id', (b) => `${b.batch_code} (${b.commodity_name} - ${b.quantity_kg}kg)`);

  openModal('modal-generate-dds');
}

async function submitGenerateDDS(e) {
  e.preventDefault();
  const form = e.target;
  const formData = new FormData(form);

  const batchSelect = document.getElementById('dds-form-batches-select');
  const selectedBatches = Array.from(batchSelect.selectedOptions).map(opt => parseInt(opt.value));

  const payload = {
    operator_org_id: parseInt(formData.get('operator_org_id')),
    batch_ids: selectedBatches
  };

  try {
    const res = await fetch('/api/dds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data._telemetry) recordTelemetry(data._telemetry);

    if (data.success) {
      showToast(data.message, 'success');
      closeModal('modal-generate-dds');
      loadRiskAndDDSData();
    } else {
      showToast(data.error || "DDS generation failed", 'error');
    }
  } catch (err) {
    showToast("Error generating DDS", 'error');
  }
}

// ====================================================================
// 5. MASTER DATA CRUD
// ====================================================================
async function loadMasterTable(tableName) {
  state.currentMasterTable = tableName;

  // Update nav buttons
  document.querySelectorAll('.master-nav-btn').forEach(btn => {
    if (btn.dataset.master === tableName) {
      btn.className = 'master-nav-btn px-3 py-1.5 text-xs font-semibold rounded-lg bg-forest-900 text-white';
    } else {
      btn.className = 'master-nav-btn px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200';
    }
  });

  const res = await fetch(`/api/master/${tableName}`);
  const data = await res.json();
  if (data._telemetry) recordTelemetry(data._telemetry);

  const titleMap = {
    'organizations': 'Organizations (Supply Chain Operators & Farmers)',
    'commodities': 'Regulated Commodities & Derived HS Codes',
    'countries': 'Country Risk Benchmarks (Article 29)',
    'legality_documents': 'Legality & Land Tenure Documents',
    'users': 'System Users & Auditor Accounts'
  };
  document.getElementById('master-table-title').textContent = titleMap[tableName] || tableName;

  const thead = document.getElementById('master-table-thead');
  const tbody = document.getElementById('master-table-tbody');

  if (!data.rows || data.rows.length === 0) {
    thead.innerHTML = '';
    tbody.innerHTML = `<tr><td class="py-4 text-center text-slate-400">No records found.</td></tr>`;
    return;
  }

  const columns = Object.keys(data.rows[0]);
  thead.innerHTML = `<tr>${columns.map(c => `<th class="py-2.5 px-3 font-semibold uppercase text-[10px] text-slate-400">${c}</th>`).join('')}</tr>`;
  tbody.innerHTML = data.rows.map(row => `
    <tr class="hover:bg-slate-50 transition-colors">
      ${columns.map(c => `<td class="py-2.5 px-3 font-mono text-[11px] max-w-xs truncate">${escapeHTML(String(row[c] !== null ? row[c] : '-'))}</td>`).join('')}
    </tr>
  `).join('');
}

function openAddMasterRecordModal() {
  document.getElementById('modal-master-title').textContent = `Add Record to ${state.currentMasterTable}`;
  const inputsContainer = document.getElementById('master-dynamic-inputs');
  
  // Dynamic fields by table
  if (state.currentMasterTable === 'countries') {
    inputsContainer.innerHTML = `
      <div><label class="block font-semibold mb-1">Country Name *</label><input type="text" name="name" required class="w-full px-3 py-1.5 border rounded"></div>
      <div><label class="block font-semibold mb-1">ISO Code (2 chars) *</label><input type="text" name="iso_code" maxlength="2" required class="w-full px-3 py-1.5 border rounded uppercase font-mono"></div>
      <div><label class="block font-semibold mb-1">Risk Level *</label><select name="risk_level" class="w-full px-3 py-1.5 border rounded"><option value="Low">Low</option><option value="Standard">Standard</option><option value="High">High</option></select></div>
    `;
  } else if (state.currentMasterTable === 'commodities') {
    inputsContainer.innerHTML = `
      <div><label class="block font-semibold mb-1">Commodity Name *</label><input type="text" name="name" required class="w-full px-3 py-1.5 border rounded"></div>
      <div><label class="block font-semibold mb-1">CN/HS Code *</label><input type="text" name="cn_hs_code" required class="w-full px-3 py-1.5 border rounded font-mono"></div>
      <div><label class="block font-semibold mb-1">Is Derived? *</label><select name="is_derived" class="w-full px-3 py-1.5 border rounded"><option value="0">0 (Raw Primary)</option><option value="1">1 (Derived)</option></select></div>
    `;
  } else if (state.currentMasterTable === 'organizations') {
    inputsContainer.innerHTML = `
      <div><label class="block font-semibold mb-1">Organization Name *</label><input type="text" name="name" required class="w-full px-3 py-1.5 border rounded"></div>
      <div><label class="block font-semibold mb-1">Country *</label><select name="country_id" id="master-country-select" class="w-full px-3 py-1.5 border rounded"></select></div>
      <div><label class="block font-semibold mb-1">Org Type *</label><select name="org_type" class="w-full px-3 py-1.5 border rounded"><option value="Farmer">Farmer</option><option value="Cooperative">Cooperative</option><option value="Processor">Processor</option><option value="Trader">Trader</option><option value="Exporter">Exporter</option><option value="Importer-Operator">Importer-Operator</option></select></div>
      <div><label class="block font-semibold mb-1">Address *</label><input type="text" name="address" required class="w-full px-3 py-1.5 border rounded"></div>
    `;
    setTimeout(() => populateSelectOptions('master-country-select', state.countries, 'country_id', 'name'), 50);
  } else {
    inputsContainer.innerHTML = `<p class="text-slate-500">Insert through specific feature panels.</p>`;
  }

  openModal('modal-add-master-record');
}

async function submitAddMasterRecord(e) {
  e.preventDefault();
  const formData = new FormData(e.target);
  const payload = {};
  formData.forEach((val, key) => { payload[key] = val; });

  try {
    const res = await fetch(`/api/master/${state.currentMasterTable}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data._telemetry) recordTelemetry(data._telemetry);

    if (data.success) {
      showToast(data.message, 'success');
      closeModal('modal-add-master-record');
      loadMasterTable(state.currentMasterTable);
      loadLookups();
    } else {
      showToast(data.error || "Constraint violation", 'error');
    }
  } catch (err) {
    showToast("Error adding record", 'error');
  }
}

// ====================================================================
// 6. DATABASE ARCHITECTURE - ER DIAGRAM & SCHEMA STUDIO
// ====================================================================
state.erZoomLevel = 0.85;
state.erPanX = 60;
state.erPanY = 40;
state.isErPanning = false;
state.erPanStartX = 0;
state.erPanStartY = 0;
state.erCurrentView = 'studio';
state.erSchemaData = null;
state.erTablePositions = {};
state.erDraggingTable = null;
state.erDragOffset = { x: 0, y: 0 };

function switchERView(viewMode) {
  state.erCurrentView = viewMode;
  const studioView = document.getElementById('er-studio-view');
  const cardsView = document.getElementById('er-cards-view');
  const mermaidView = document.getElementById('er-mermaid-view');
  const zoomControls = document.getElementById('er-zoom-controls');

  const btnStudio = document.getElementById('er-view-btn-studio');
  const btnCards = document.getElementById('er-view-btn-cards');
  const btnMermaid = document.getElementById('er-view-btn-mermaid');

  [studioView, cardsView, mermaidView].forEach(v => v.classList.add('hidden'));
  [btnStudio, btnCards, btnMermaid].forEach(b => {
    b.className = 'px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-md transition-all flex items-center';
  });

  if (viewMode === 'studio') {
    studioView.classList.remove('hidden');
    zoomControls.classList.remove('hidden');
    btnStudio.className = 'px-3 py-1.5 text-xs font-bold bg-white text-forest-900 shadow-sm rounded-md transition-all flex items-center';
    setTimeout(() => {
      applyERTransform();
      drawERConnections();
    }, 50);
  } else if (viewMode === 'cards') {
    cardsView.classList.remove('hidden');
    zoomControls.classList.add('hidden');
    btnCards.className = 'px-3 py-1.5 text-xs font-bold bg-white text-forest-900 shadow-sm rounded-md transition-all flex items-center';
  } else if (viewMode === 'mermaid') {
    mermaidView.classList.remove('hidden');
    zoomControls.classList.add('hidden');
    btnMermaid.className = 'px-3 py-1.5 text-xs font-bold bg-white text-forest-900 shadow-sm rounded-md transition-all flex items-center';
  }
}

async function renderERDiagram() {
  try {
    const res = await fetch('/api/db/schema');
    const data = await res.json();
    if (data._telemetry) recordTelemetry(data._telemetry);
    state.erSchemaData = data;

    // Populate focus dropdown
    const focusSelect = document.getElementById('er-focus-table-select');
    if (focusSelect) {
      focusSelect.innerHTML = `<option value="">-- Jump to Table --</option>` + Object.keys(data.tables).map(t => `<option value="${t}">${t} (${data.tables[t].row_count} rows)</option>`).join('');
    }

    // 1. Render Studio Canvas Nodes
    initERStudioLayout(data);

    // 2. Render Cards Grid View
    renderERCards(data);

    // 3. Generate Mermaid Raw Code
    generateMermaidCode(data);

    // Setup Interactive Events
    setupERCanvasInteractions();

    applyERTransform();
    setTimeout(drawERConnections, 100);
  } catch (err) {
    console.error("ER Schema Render Error:", err);
  }
}

function initERStudioLayout(data) {
  const nodesLayer = document.getElementById('er-nodes-layer');
  if (!nodesLayer) return;
  nodesLayer.innerHTML = '';

  // Default optimal relational layout coordinates (X, Y in px)
  const defaultLayout = {
    // Top Row: Core Masters & Classifications
    'countries': { x: 80, y: 50 },
    'commodities': { x: 480, y: 50 },
    'organizations': { x: 880, y: 50 },
    'users': { x: 1300, y: 50 },

    // Middle-Upper: Land & Production
    'plots': { x: 480, y: 440 },
    'plot_polygon_points': { x: 80, y: 440 },
    'plot_production_records': { x: 80, y: 780 },
    'legality_documents': { x: 880, y: 440 },

    // Center: Batches & Lineage Trace
    'batches': { x: 480, y: 880 },
    'batch_plot_sources': { x: 880, y: 880 },
    'batch_lineage': { x: 80, y: 1180 },

    // Middle-Right: Logistics & Custody
    'transactions': { x: 1300, y: 440 },
    'shipments': { x: 1300, y: 880 },

    // Lower: Risk & Due Diligence
    'risk_assessments': { x: 480, y: 1320 },
    'mitigation_actions': { x: 880, y: 1320 },
    'due_diligence_statements': { x: 1300, y: 1320 },
    'dds_batches': { x: 880, y: 1680 },

    // Immutable Audit
    'audit_log': { x: 80, y: 1540 }
  };

  const domainColors = {
    'batches': 'from-emerald-600 to-emerald-700',
    'batch_plot_sources': 'from-emerald-600 to-emerald-700',
    'batch_lineage': 'from-emerald-600 to-emerald-700',
    'plots': 'from-green-600 to-green-700',
    'plot_polygon_points': 'from-green-600 to-green-700',
    'plot_production_records': 'from-green-600 to-green-700',
    'risk_assessments': 'from-amber-600 to-amber-700',
    'mitigation_actions': 'from-amber-600 to-amber-700',
    'due_diligence_statements': 'from-purple-600 to-purple-700',
    'dds_batches': 'from-purple-600 to-purple-700',
    'organizations': 'from-blue-600 to-blue-700',
    'users': 'from-blue-600 to-blue-700',
    'countries': 'from-teal-600 to-teal-700',
    'commodities': 'from-teal-600 to-teal-700',
    'transactions': 'from-indigo-600 to-indigo-700',
    'shipments': 'from-indigo-600 to-indigo-700',
    'legality_documents': 'from-cyan-600 to-cyan-700',
    'audit_log': 'from-rose-600 to-rose-700'
  };

  state.erTablePositions = {};

  Object.keys(data.tables).forEach(tName => {
    const table = data.tables[tName];
    const pos = defaultLayout[tName] || { x: 100, y: 100 };
    state.erTablePositions[tName] = { x: pos.x, y: pos.y };

    const headerGradient = domainColors[tName] || 'from-slate-700 to-slate-800';
    const fkCols = new Set((table.foreign_keys || []).map(f => f.from));

    const node = document.createElement('div');
    node.id = `er-node-${tName}`;
    node.className = 'absolute bg-slate-900 text-slate-100 rounded-xl border border-slate-700 shadow-2xl overflow-hidden w-80 select-none transition-shadow hover:ring-2 hover:ring-emerald-400/80';
    node.style.left = `${pos.x}px`;
    node.style.top = `${pos.y}px`;

    node.innerHTML = `
      <!-- Draggable Header -->
      <div class="er-node-header p-3 bg-gradient-to-r ${headerGradient} text-white flex items-center justify-between cursor-move">
        <div class="flex items-center space-x-2">
          <i data-lucide="table" class="w-4 h-4 text-white"></i>
          <span class="font-bold font-mono text-sm tracking-wide">${tName}</span>
        </div>
        <span class="px-2 py-0.5 text-[11px] font-mono font-bold bg-black/30 rounded text-white">${table.row_count} rows</span>
      </div>

      <!-- Columns List -->
      <div class="p-3 space-y-1.5 font-mono text-xs max-h-72 overflow-y-auto bg-slate-900/95 divide-y divide-slate-800">
        ${table.columns.map(col => {
          const isPK = col.pk === 1;
          const isFK = fkCols.has(col.name);
          return `
            <div class="pt-1.5 first:pt-0 flex items-center justify-between">
              <div class="flex items-center space-x-2 overflow-hidden">
                ${isPK ? '<span class="px-1.5 py-0.2 bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold rounded">PK</span>' : ''}
                ${isFK ? '<span class="px-1.5 py-0.2 bg-blue-500/20 text-blue-300 border border-blue-500/40 text-[10px] font-bold rounded">FK</span>' : ''}
                <span class="${isPK ? 'font-bold text-white' : 'text-slate-200'} truncate">${col.name}</span>
              </div>
              <span class="text-[11px] text-slate-400 uppercase font-sans font-semibold ml-2">${col.type || 'TEXT'}</span>
            </div>
          `;
        }).join('')}
      </div>

      <!-- Outgoing FK Badges Footer -->
      ${table.foreign_keys && table.foreign_keys.length > 0 ? `
        <div class="p-2 bg-slate-950/80 border-t border-slate-800 text-[10px] font-mono text-slate-400 space-y-0.5">
          ${table.foreign_keys.map(fk => `
            <div class="truncate text-blue-300 flex items-center">
              <span class="text-slate-500 mr-1">&bull;</span>
              <span><strong>${fk.from}</strong> &rarr; <span class="text-white font-bold">${fk.table}</span></span>
            </div>
          `).join('')}
        </div>
      ` : ''}
    `;

    // Drag Table Handler
    const header = node.querySelector('.er-node-header');
    header.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      state.erDraggingTable = tName;
      const stageRect = document.getElementById('er-canvas-viewport').getBoundingClientRect();
      state.erDragOffset = {
        x: (e.clientX - stageRect.left) / state.erZoomLevel - state.erTablePositions[tName].x,
        y: (e.clientY - stageRect.top) / state.erZoomLevel - state.erTablePositions[tName].y
      };
      node.classList.add('ring-2', 'ring-emerald-400', 'z-50');
      node.style.zIndex = '100';
    });

    nodesLayer.appendChild(node);
  });

  lucide.createIcons();
}

function drawERConnections() {
  const svgGroup = document.getElementById('er-svg-paths-group');
  if (!svgGroup || !state.erSchemaData) return;
  svgGroup.innerHTML = '';

  const relationships = state.erSchemaData.relationships || [];

  relationships.forEach(rel => {
    const fromNode = document.getElementById(`er-node-${rel.from_table}`);
    const toNode = document.getElementById(`er-node-${rel.to_table}`);
    if (!fromNode || !toNode) return;

    const fromPos = state.erTablePositions[rel.from_table];
    const toPos = state.erTablePositions[rel.to_table];
    if (!fromPos || !toPos) return;

    const fromW = fromNode.offsetWidth || 320;
    const fromH = fromNode.offsetHeight || 200;
    const toW = toNode.offsetWidth || 320;
    const toH = toNode.offsetHeight || 200;

    // Anchor calculation (center points)
    const fromCenterX = fromPos.x + fromW / 2;
    const fromCenterY = fromPos.y + fromH / 2;
    const toCenterX = toPos.x + toW / 2;
    const toCenterY = toPos.y + toH / 2;

    let startX, startY, endX, endY;

    if (fromCenterX < toCenterX) {
      startX = fromPos.x + fromW;
      startY = fromPos.y + 35;
      endX = toPos.x;
      endY = toPos.y + 35;
    } else {
      startX = fromPos.x;
      startY = fromPos.y + 35;
      endX = toPos.x + toW;
      endY = toPos.y + 35;
    }

    // Bezier control point offset
    const dx = Math.abs(endX - startX) * 0.5;
    const pathD = `M ${startX} ${startY} C ${startX + (endX > startX ? dx : -dx)} ${startY}, ${endX - (endX > startX ? dx : -dx)} ${endY}, ${endX} ${endY}`;

    // SVG path
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathD);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#38BDF8');
    path.setAttribute('stroke-width', '2.5');
    path.setAttribute('stroke-opacity', '0.6');
    path.setAttribute('marker-end', 'url(#er-arrow)');
    path.setAttribute('marker-start', 'url(#er-dot)');
    path.classList.add('hover:stroke-emerald-400', 'hover:stroke-opacity-100', 'transition-all');

    svgGroup.appendChild(path);
  });
}

function setupERCanvasInteractions() {
  // Use er-canvas-viewport as the pan target so it matches the drag coordinate system
  const viewport = document.getElementById('er-canvas-viewport');
  if (!viewport || viewport.dataset.interactSetup === 'true') return;
  viewport.dataset.interactSetup = 'true';

  // Mouse drag to pan canvas (only when not dragging a table)
  viewport.addEventListener('mousedown', (e) => {
    if (state.erDraggingTable) return;
    state.isErPanning = true;
    state.erPanStartX = e.clientX - state.erPanX;
    state.erPanStartY = e.clientY - state.erPanY;
    viewport.style.cursor = 'grabbing';
  });

  window.addEventListener('mousemove', (e) => {
    // 1. Table dragging
    if (state.erDraggingTable) {
      const stageRect = viewport.getBoundingClientRect();
      const newX = Math.max(0, (e.clientX - stageRect.left) / state.erZoomLevel - state.erDragOffset.x);
      const newY = Math.max(0, (e.clientY - stageRect.top) / state.erZoomLevel - state.erDragOffset.y);
      state.erTablePositions[state.erDraggingTable] = { x: newX, y: newY };
      
      const node = document.getElementById(`er-node-${state.erDraggingTable}`);
      if (node) {
        node.style.left = `${newX}px`;
        node.style.top = `${newY}px`;
      }
      drawERConnections();
      return;
    }

    // 2. Canvas panning
    if (state.isErPanning) {
      state.erPanX = e.clientX - state.erPanStartX;
      state.erPanY = e.clientY - state.erPanStartY;
      applyERTransform();
    }
  });

  window.addEventListener('mouseup', () => {
    if (state.erDraggingTable) {
      const node = document.getElementById(`er-node-${state.erDraggingTable}`);
      if (node) node.classList.remove('ring-2', 'ring-emerald-400', 'z-50');
      state.erDraggingTable = null;
    }
    if (state.isErPanning) {
      viewport.style.cursor = 'grab';
    }
    state.isErPanning = false;
  });

  // Wheel zoom
  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    zoomERDiagram(delta);
  }, { passive: false });
}

function zoomERDiagram(delta) {
  state.erZoomLevel = Math.max(0.2, Math.min(4.0, state.erZoomLevel + delta));
  applyERTransform();
}

function resetERZoom() {
  state.erZoomLevel = 1.0;
  state.erPanX = 60;
  state.erPanY = 40;
  applyERTransform();
}

function fitAllERTables() {
  state.erZoomLevel = 0.55;
  state.erPanX = 40;
  state.erPanY = 30;
  applyERTransform();
}

function applyERTransform() {
  const stage = document.getElementById('er-canvas-stage');
  const label = document.getElementById('er-zoom-level-label');
  if (stage) {
    stage.style.transform = `translate(${state.erPanX}px, ${state.erPanY}px) scale(${state.erZoomLevel})`;
  }
  if (label) {
    label.textContent = `${Math.round(state.erZoomLevel * 100)}%`;
  }
}

function focusERTable(tableName) {
  if (!tableName || !state.erTablePositions[tableName]) return;
  const pos = state.erTablePositions[tableName];
  const viewport = document.getElementById('er-studio-view');
  if (!viewport) return;

  // Zoom into 130% centered directly on target table
  state.erZoomLevel = 1.3;
  const vW = viewport.offsetWidth || 1000;
  const vH = viewport.offsetHeight || 750;

  state.erPanX = vW / 2 - (pos.x + 160) * state.erZoomLevel;
  state.erPanY = vH / 2 - (pos.y + 120) * state.erZoomLevel;
  applyERTransform();

  // Highlight table with radiant pulse
  const node = document.getElementById(`er-node-${tableName}`);
  if (node) {
    node.classList.add('ring-4', 'ring-emerald-400', 'shadow-emerald-500/50');
    setTimeout(() => {
      node.classList.remove('ring-4', 'ring-emerald-400', 'shadow-emerald-500/50');
    }, 2500);
  }
}

function generateMermaidCode(data) {
  let code = 'erDiagram\n';
  Object.keys(data.tables).forEach(tName => {
    const t = data.tables[tName];
    code += `    ${tName} {\n`;
    t.columns.forEach(col => {
      const pkMarker = col.pk ? 'PK' : '';
      code += `        ${col.type || 'TEXT'} ${col.name} ${pkMarker}\n`;
    });
    code += `    }\n`;
  });

  (data.relationships || []).forEach(r => {
    code += `    ${r.to_table} ||--o{ ${r.from_table} : "${r.from_col}"\n`;
  });

  const pre = document.getElementById('er-mermaid-code-pre');
  if (pre) pre.textContent = code;
}

function copyMermaidCode() {
  const pre = document.getElementById('er-mermaid-code-pre');
  if (pre) {
    navigator.clipboard.writeText(pre.textContent);
    showToast("Mermaid schema code copied to clipboard!", "success");
  }
}

// ====================================================================
// CARDS GRID VIEW - Full legibility schema explorer
// ====================================================================
const DOMAIN_LABELS = {
  batches: { label: 'Batch Core', color: 'emerald' },
  batch_plot_sources: { label: 'Batch Link', color: 'emerald' },
  batch_lineage: { label: 'Lineage', color: 'emerald' },
  plots: { label: 'Land', color: 'green' },
  plot_polygon_points: { label: 'Geospatial', color: 'green' },
  plot_production_records: { label: 'Production', color: 'green' },
  risk_assessments: { label: 'Risk', color: 'amber' },
  mitigation_actions: { label: 'Mitigation', color: 'amber' },
  due_diligence_statements: { label: 'DDS', color: 'purple' },
  dds_batches: { label: 'DDS Link', color: 'purple' },
  organizations: { label: 'Org', color: 'blue' },
  users: { label: 'Users', color: 'blue' },
  countries: { label: 'Geography', color: 'teal' },
  commodities: { label: 'Commodity', color: 'teal' },
  transactions: { label: 'Logistics', color: 'indigo' },
  shipments: { label: 'Shipment', color: 'indigo' },
  legality_documents: { label: 'Legal', color: 'cyan' },
  audit_log: { label: 'Audit', color: 'rose' }
};

const COLOR_MAP = {
  emerald: { header: 'bg-emerald-600', badge: 'bg-emerald-100 text-emerald-800', pk: 'bg-amber-100 text-amber-800 border border-amber-300', fk: 'bg-blue-100 text-blue-800 border border-blue-300', dot: 'bg-emerald-500' },
  green:   { header: 'bg-green-600',   badge: 'bg-green-100 text-green-800',   pk: 'bg-amber-100 text-amber-800 border border-amber-300', fk: 'bg-blue-100 text-blue-800 border border-blue-300', dot: 'bg-green-500' },
  amber:   { header: 'bg-amber-600',   badge: 'bg-amber-100 text-amber-800',   pk: 'bg-amber-100 text-amber-800 border border-amber-300', fk: 'bg-blue-100 text-blue-800 border border-blue-300', dot: 'bg-amber-500' },
  purple:  { header: 'bg-purple-600',  badge: 'bg-purple-100 text-purple-800', pk: 'bg-amber-100 text-amber-800 border border-amber-300', fk: 'bg-blue-100 text-blue-800 border border-blue-300', dot: 'bg-purple-500' },
  blue:    { header: 'bg-blue-600',    badge: 'bg-blue-100 text-blue-800',     pk: 'bg-amber-100 text-amber-800 border border-amber-300', fk: 'bg-blue-100 text-blue-800 border border-blue-300', dot: 'bg-blue-500' },
  teal:    { header: 'bg-teal-600',    badge: 'bg-teal-100 text-teal-800',     pk: 'bg-amber-100 text-amber-800 border border-amber-300', fk: 'bg-blue-100 text-blue-800 border border-blue-300', dot: 'bg-teal-500' },
  indigo:  { header: 'bg-indigo-600',  badge: 'bg-indigo-100 text-indigo-800', pk: 'bg-amber-100 text-amber-800 border border-amber-300', fk: 'bg-blue-100 text-blue-800 border border-blue-300', dot: 'bg-indigo-500' },
  cyan:    { header: 'bg-cyan-600',    badge: 'bg-cyan-100 text-cyan-800',     pk: 'bg-amber-100 text-amber-800 border border-amber-300', fk: 'bg-blue-100 text-blue-800 border border-blue-300', dot: 'bg-cyan-500' },
  rose:    { header: 'bg-rose-600',    badge: 'bg-rose-100 text-rose-800',     pk: 'bg-amber-100 text-amber-800 border border-amber-300', fk: 'bg-blue-100 text-blue-800 border border-blue-300', dot: 'bg-rose-500' }
};

function renderERCards(data) {
  const grid = document.getElementById('er-cards-grid');
  if (!grid) return;

  const tableNames = Object.keys(data.tables);
  const badge = document.getElementById('er-cards-count-badge');
  if (badge) badge.textContent = `${tableNames.length} Tables \u2022 3NF Validated`;

  grid.innerHTML = tableNames.map(tName => {
    const table = data.tables[tName];
    const fkSet = new Set((table.foreign_keys || []).map(f => f.from));
    const domain = DOMAIN_LABELS[tName] || { label: 'Core', color: 'slate' };
    const c = COLOR_MAP[domain.color] || COLOR_MAP['teal'];

    const colRows = table.columns.map(col => {
      const isPK = col.pk === 1;
      const isFK = fkSet.has(col.name);
      return `
        <tr class="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
          <td class="py-2 px-3 font-mono text-xs font-semibold ${isPK ? 'text-amber-700' : isFK ? 'text-blue-700' : 'text-slate-800'} whitespace-nowrap">
            ${isPK ? `<span class="inline-block mr-1 px-1 py-0.5 rounded text-[9px] font-bold ${c.pk}">PK</span>` : ''}
            ${isFK && !isPK ? `<span class="inline-block mr-1 px-1 py-0.5 rounded text-[9px] font-bold ${c.fk}">FK</span>` : ''}
            ${col.name}
          </td>
          <td class="py-2 px-3 text-[10px] font-mono text-slate-400 uppercase">${col.type || 'TEXT'}</td>
          <td class="py-2 px-3 text-[10px] text-slate-400">${col.notnull ? '<span class="text-red-500 font-bold">NOT NULL</span>' : '<span class="text-slate-300">nullable</span>'}</td>
        </tr>`;
    }).join('');

    const fkBadges = (table.foreign_keys || []).map(fk =>
      `<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono bg-blue-50 text-blue-700 border border-blue-200">
        <span class="font-bold">${fk.from}</span>&nbsp;&rarr;&nbsp;<span class="font-bold text-slate-700">${fk.table}.${fk.to}</span>
       </span>`
    ).join('');

    return `
      <div class="er-card bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col"
           data-table="${tName}" data-cols="${table.columns.map(c => c.name).join(' ')}">
        <!-- Card Header -->
        <div class="${c.header} px-4 py-3 text-white flex items-center justify-between">
          <div class="flex items-center space-x-2">
            <span class="w-2 h-2 rounded-full bg-white/60 inline-block"></span>
            <span class="font-bold font-mono text-sm tracking-wide">${tName}</span>
          </div>
          <div class="flex items-center space-x-2">
            <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-black/25 text-white font-mono">${table.row_count} rows</span>
            <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-white/20 text-white">${domain.label}</span>
          </div>
        </div>

        <!-- Column Table -->
        <div class="flex-1 overflow-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="bg-slate-50 border-b border-slate-200">
                <th class="py-1.5 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Column</th>
                <th class="py-1.5 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Type</th>
                <th class="py-1.5 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Constraint</th>
              </tr>
            </thead>
            <tbody>${colRows}</tbody>
          </table>
        </div>

        <!-- FK Relationships Footer -->
        ${fkBadges ? `
          <div class="px-3 py-2 bg-slate-50 border-t border-slate-100 flex flex-wrap gap-1">
            ${fkBadges}
          </div>` : ''}

        <!-- Stats Footer -->
        <div class="px-4 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <span class="text-[10px] text-slate-400 font-mono">${table.columns.length} columns</span>
          <span class="text-[10px] text-slate-400 font-mono">${(table.foreign_keys||[]).length} FKs</span>
          <button onclick="switchERView('studio'); setTimeout(()=>focusERTable('${tName}'),150)"
                  class="text-[10px] font-bold text-emerald-600 hover:text-emerald-800 transition-colors">
            View in Canvas &rarr;
          </button>
        </div>
      </div>`;
  }).join('');
}

function filterERCards(query) {
  const q = (query || '').toLowerCase().trim();
  document.querySelectorAll('.er-card').forEach(card => {
    if (!q) {
      card.classList.remove('hidden');
      return;
    }
    const tableName = (card.dataset.table || '').toLowerCase();
    const cols = (card.dataset.cols || '').toLowerCase();
    card.classList.toggle('hidden', !tableName.includes(q) && !cols.includes(q));
  });
}

// ====================================================================
// 7. DATABASE ARCHITECTURE - LIVE TABLE BROWSER
// ====================================================================
async function initTableBrowser() {
  const select = document.getElementById('db-browser-table-select');
  if (!select) return;

  const res = await fetch('/api/db/schema');
  const data = await res.json();
  if (data._telemetry) recordTelemetry(data._telemetry);

  const tables = Object.keys(data.tables);
  select.innerHTML = tables.map(t => `<option value="${t}" ${t === state.currentTableBrowser.table ? 'selected' : ''}>${t} (${data.tables[t].row_count} rows)</option>`).join('');

  loadTableBrowserData(state.currentTableBrowser.table, 1);
}

async function loadTableBrowserData(tableName, page = 1) {
  state.currentTableBrowser.table = tableName;
  state.currentTableBrowser.page = page;

  const search = state.currentTableBrowser.search;
  const url = `/api/db/tables/${tableName}?page=${page}&limit=${state.currentTableBrowser.limit}&search=${encodeURIComponent(search)}`;

  const res = await fetch(url);
  const data = await res.json();
  if (data._telemetry) recordTelemetry(data._telemetry);

  state.currentTableBrowser.totalRows = data.total_rows;

  document.getElementById('db-browser-rowcount-label').textContent = `${data.total_rows} total rows`;
  document.getElementById('db-browser-latency-label').textContent = `${data.elapsed_ms} ms`;
  document.getElementById('db-browser-page-info').textContent = `Page ${data.page} of ${Math.ceil(data.total_rows / data.limit) || 1}`;

  const thead = document.getElementById('db-browser-thead');
  const tbody = document.getElementById('db-browser-tbody');

  // Columns Header
  thead.innerHTML = `<tr>${data.columns.map(c => `
    <th class="py-2.5 px-3">
      <div class="font-bold text-slate-800">${c.name} ${c.pk ? '<span class="text-amber-600 font-normal">[PK]</span>' : ''}</div>
      <div class="text-[9px] text-slate-400 font-normal">${c.type}</div>
    </th>
  `).join('')}</tr>`;

  if (!data.rows || data.rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${data.columns.length}" class="py-6 text-center text-slate-400">No rows in table.</td></tr>`;
    return;
  }

  tbody.innerHTML = data.rows.map(row => `
    <tr class="hover:bg-slate-50 transition-colors">
      ${data.columns.map(c => {
        const val = row[c.name];
        return `<td class="py-2.5 px-3 font-mono text-[11px] max-w-xs truncate">${val !== null ? escapeHTML(String(val)) : '<span class="text-slate-300">NULL</span>'}</td>`;
      }).join('')}
    </tr>
  `).join('');
}

function executeTableBrowserSearch() {
  state.currentTableBrowser.search = document.getElementById('db-browser-search').value.trim();
  loadTableBrowserData(state.currentTableBrowser.table, 1);
}

function paginateTableBrowser(direction) {
  const newPage = state.currentTableBrowser.page + direction;
  const maxPage = Math.ceil(state.currentTableBrowser.totalRows / state.currentTableBrowser.limit);
  if (newPage >= 1 && newPage <= maxPage) {
    loadTableBrowserData(state.currentTableBrowser.table, newPage);
  }
}

// ====================================================================
// 8. DATABASE ARCHITECTURE - SQL QUERY CONSOLE
// ====================================================================
function initSQLConsole() {
  const editor = document.getElementById('sql-console-editor');
  if (editor && !editor.value) {
    editor.value = "SELECT * FROM v_compliance_summary;";
  }
}

async function loadSampleQueriesList() {
  try {
    const res = await fetch('/api/sample-queries');
    const data = await res.json();
    const select = document.getElementById('sample-queries-select');
    if (!select) return;

    state.sampleQueries = data.queries || [];
    select.innerHTML = `<option value="">-- Load Pre-built Viva Query --</option>` + state.sampleQueries.map((q, idx) => `
      <option value="${idx}">${q.title}</option>
    `).join('');
  } catch (err) {
    console.error("Failed to load sample queries:", err);
  }
}

function loadSampleQueryIntoConsole(queryIdx) {
  if (queryIdx === '' || !state.sampleQueries) return;
  const q = state.sampleQueries[parseInt(queryIdx)];
  if (q) {
    document.getElementById('sql-console-editor').value = q.sql;
    runConsoleQuery();
  }
}

async function runConsoleQuery() {
  const query = document.getElementById('sql-console-editor').value.trim();
  const errorBox = document.getElementById('sql-console-error');
  const statsLabel = document.getElementById('sql-console-stats');
  const thead = document.getElementById('sql-results-thead');
  const tbody = document.getElementById('sql-results-tbody');
  const explainContent = document.getElementById('console-explain-content');

  errorBox.classList.add('hidden');
  tbody.innerHTML = `<tr><td class="py-6 text-center text-slate-400">Executing query on SQLite engine...</td></tr>`;

  try {
    const res = await fetch('/api/db/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: query })
    });
    const data = await res.json();
    if (data._telemetry) recordTelemetry(data._telemetry);

    if (!res.ok) {
      errorBox.textContent = `SQLite Error: ${data.error}`;
      errorBox.classList.remove('hidden');
      tbody.innerHTML = `<tr><td class="py-4 text-center text-rose-500 font-sans">Query Failed.</td></tr>`;
      return;
    }

    statsLabel.textContent = `${data.row_count} rows &bull; ${data.elapsed_ms} ms`;

    // Render Table
    if (data.columns && data.columns.length > 0) {
      thead.innerHTML = `<tr>${data.columns.map(c => `<th class="py-2.5 px-3 font-semibold text-slate-700">${c}</th>`).join('')}</tr>`;
      tbody.innerHTML = data.rows.map(row => `
        <tr class="hover:bg-slate-50 transition-colors">
          ${data.columns.map(c => `<td class="py-2.5 px-3 max-w-xs truncate">${row[c] !== null ? escapeHTML(String(row[c])) : '<span class="text-slate-300">NULL</span>'}</td>`).join('')}
        </tr>
      `).join('');
    } else {
      thead.innerHTML = '';
      tbody.innerHTML = `<tr><td class="py-4 text-center text-slate-400 font-sans">Query returned 0 rows.</td></tr>`;
    }

    // Render Explain Plan
    if (data.explain_plan && data.explain_plan.length > 0) {
      explainContent.innerHTML = data.explain_plan.map(p => `
        <div class="py-1 border-b border-slate-200">
          <span class="text-emerald-700 font-bold">[Step ${p.id || p.order}]</span> ${escapeHTML(p.detail || JSON.stringify(p))}
        </div>
      `).join('');
    }
  } catch (err) {
    errorBox.textContent = "Network failure executing query.";
    errorBox.classList.remove('hidden');
  }
}

function clearSQLConsole() {
  document.getElementById('sql-console-editor').value = '';
}

function switchConsoleResultTab(tabType) {
  const resPane = document.getElementById('console-results-pane');
  const expPane = document.getElementById('console-explain-pane');
  const resBtn = document.getElementById('console-tab-btn-results');
  const expBtn = document.getElementById('console-tab-btn-explain');

  if (tabType === 'results') {
    resPane.classList.remove('hidden');
    expPane.classList.add('hidden');
    resBtn.className = 'text-xs font-bold text-emerald-600 border-b-2 border-emerald-600 pb-1';
    expBtn.className = 'text-xs font-medium text-slate-500 hover:text-slate-800 pb-1';
  } else {
    resPane.classList.add('hidden');
    expPane.classList.remove('hidden');
    expBtn.className = 'text-xs font-bold text-emerald-600 border-b-2 border-emerald-600 pb-1';
    resBtn.className = 'text-xs font-medium text-slate-500 hover:text-slate-800 pb-1';
  }
}

// ====================================================================
// 9. DATABASE ARCHITECTURE - TRIGGERS, VIEWS & INDEXES
// ====================================================================
async function loadTriggersAndViews() {
  const res = await fetch('/api/db/objects');
  const data = await res.json();
  if (data._telemetry) recordTelemetry(data._telemetry);

  // Triggers
  const triggersContainer = document.getElementById('triggers-list-container');
  triggersContainer.innerHTML = (data.triggers || []).map(trg => `
    <div class="p-4 rounded-xl bg-slate-900 text-slate-200 font-mono text-xs space-y-2">
      <div class="flex items-center justify-between text-emerald-400 font-bold">
        <span>TRIGGER: ${trg.name}</span>
        <span class="text-slate-400 font-normal">Table: ${trg.tbl_name}</span>
      </div>
      <pre class="overflow-x-auto text-[11px] text-slate-300 leading-relaxed whitespace-pre-wrap">${escapeHTML(trg.sql)}</pre>
    </div>
  `).join('');

  // Views
  const viewsContainer = document.getElementById('views-list-container');
  viewsContainer.innerHTML = (data.views || []).map(v => `
    <div class="p-4 rounded-xl bg-slate-900 text-slate-200 font-mono text-xs space-y-2">
      <div class="text-blue-400 font-bold">VIEW: ${v.name}</div>
      <pre class="overflow-x-auto text-[11px] text-slate-300 leading-relaxed whitespace-pre-wrap">${escapeHTML(v.sql)}</pre>
    </div>
  `).join('');

  // Indexes
  const indexesContainer = document.getElementById('indexes-list-container');
  indexesContainer.innerHTML = (data.indexes || []).map(idx => `
    <div class="p-3 rounded-lg bg-slate-50 border border-slate-200 font-mono text-xs">
      <div class="font-bold text-slate-900">${idx.name}</div>
      <div class="text-[10px] text-slate-500 mt-0.5">Table: ${idx.tbl_name}</div>
    </div>
  `).join('');
}

// ====================================================================
// 10. DATABASE ARCHITECTURE - AUDIT LOG TIMELINE
// ====================================================================
async function loadAuditLog() {
  const res = await fetch('/api/db/audit-log?limit=50');
  const data = await res.json();
  if (data._telemetry) recordTelemetry(data._telemetry);

  const container = document.getElementById('audit-timeline-container');
  if (!container) return;

  if (!data.audit_logs || data.audit_logs.length === 0) {
    container.innerHTML = `<div class="text-center py-12 text-slate-400">No audit log records recorded yet.</div>`;
    return;
  }

  container.innerHTML = data.audit_logs.map(log => {
    const actionColor = log.action === 'INSERT' ? 'bg-emerald-500' : (log.action === 'UPDATE' ? 'bg-blue-500' : 'bg-rose-500');
    return `
      <div class="relative space-y-1.5">
        <span class="absolute -left-9 top-1 w-3 h-3 rounded-full ${actionColor} ring-4 ring-white"></span>
        <div class="flex items-center space-x-2 text-xs">
          <span class="font-bold font-mono text-slate-900">${log.action}</span>
          <span class="text-slate-400">&bull;</span>
          <span class="font-mono text-slate-600 font-semibold">${log.table_name} #${log.record_id}</span>
          <span class="text-slate-400">&bull;</span>
          <span class="text-slate-400 text-[11px]">${log.changed_at}</span>
        </div>
        <div class="p-3 bg-slate-50 rounded-lg border border-slate-200 font-mono text-[11px] space-y-1 text-slate-700">
          ${log.old_value ? `<div><strong class="text-slate-400">OLD:</strong> ${escapeHTML(log.old_value)}</div>` : ''}
          ${log.new_value ? `<div><strong class="text-emerald-700">NEW:</strong> ${escapeHTML(log.new_value)}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

// ====================================================================
// 11. GUIDED DEMO MODE FOR TEACHER PRESENTATION
// ====================================================================
function startGuidedDemo() {
  const steps = [
    {
      tab: 'db-er-diagram',
      title: 'Step 1: 18-Table 3NF Database Schema',
      message: 'Demonstrate live SQLite schema introspection using PRAGMA foreign_key_list to construct the dynamic ER diagram.'
    },
    {
      tab: 'plots-map',
      title: 'Step 2: Geolocation & Polygon Constraint (Art. 9)',
      message: 'Showcase 6-decimal coordinates and database trigger validation: plots over 4.0 hectares must be stored as POLYGONs.'
    },
    {
      tab: 'batches-trace',
      title: 'Step 3: Multi-Tier Recursive Traceability',
      message: 'Demonstrate how a single EU chocolate batch resolves backwards through cooperatives and processors to Ghana farm plots.'
    },
    {
      tab: 'db-sql-console',
      title: 'Step 4: SQL Recursive CTE Execution',
      message: 'Execute raw recursive Common Table Expressions directly in the SQL console, verifying execution time and query plan.'
    },
    {
      tab: 'db-audit-log',
      title: 'Step 5: Trigger-Driven Compliance Audits',
      message: 'Show immutable trigger logs capturing every INSERT/UPDATE and safeguarding the 31 Dec 2020 cut-off date.'
    }
  ];

  let currentStep = 0;

  function showStep(idx) {
    if (idx >= steps.length) {
      showToast("Guided Demo Completed! Feel free to explore live queries.", "success", 5000);
      return;
    }

    const s = steps[idx];
    switchTab(s.tab);

    const banner = document.createElement('div');
    banner.id = 'demo-tour-banner';
    banner.className = 'fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 bg-slate-900 text-white p-4 rounded-2xl shadow-2xl border border-amber-400 flex items-center space-x-6 text-xs max-w-xl';
    banner.innerHTML = `
      <div class="flex-1">
        <div class="font-bold text-amber-400 text-sm">${s.title}</div>
        <p class="text-slate-300 mt-1">${s.message}</p>
      </div>
      <div class="flex items-center space-x-2">
        <button onclick="document.getElementById('demo-tour-banner').remove();" class="px-3 py-1.5 text-slate-400 hover:text-white">Exit</button>
        <button id="demo-tour-next-btn" class="px-4 py-1.5 bg-amber-400 text-slate-900 font-bold rounded-lg hover:bg-amber-300 transition-colors">
          ${idx === steps.length - 1 ? 'Finish Tour' : 'Next Step &rarr;'}
        </button>
      </div>
    `;

    const existing = document.getElementById('demo-tour-banner');
    if (existing) existing.remove();
    document.body.appendChild(banner);

    document.getElementById('demo-tour-next-btn').onclick = () => {
      banner.remove();
      showStep(idx + 1);
    };
  }

  showStep(0);
}

async function resetDemoDatabase() {
  if (!confirm("Reset database to initial seed state?")) return;

  try {
    const res = await fetch('/api/system/reset-db', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast("Database successfully reset to seed data.", "success");
      loadLookups();
      switchTab(state.currentTab);
    }
  } catch (err) {
    showToast("Failed to reset database", "error");
  }
}

// ====================================================================
// LOOKUPS & HELPERS
// ====================================================================
async function loadLookups() {
  try {
    const [orgsRes, cntryRes, commRes, batchRes] = await Promise.all([
      fetch('/api/master/organizations'),
      fetch('/api/master/countries'),
      fetch('/api/master/commodities'),
      fetch('/api/batches')
    ]);

    state.organizations = (await orgsRes.json()).rows || [];
    state.countries = (await cntryRes.json()).rows || [];
    state.commodities = (await commRes.json()).rows || [];
    state.batches = (await batchRes.json()).batches || [];
  } catch (err) {
    console.error("Lookups error:", err);
  }
}

function populateSelectOptions(selectId, items, valKey, labelKey) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = items.map(item => `<option value="${item[valKey]}">${escapeHTML(item[labelKey])}</option>`).join('');
}

function populateMultiSelect(selectId, items, valKey, labelFn) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = items.map(item => `<option value="${item[valKey]}">${escapeHTML(labelFn(item))}</option>`).join('');
}

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('hidden');
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('hidden');
}

function closeAllModals() {
  document.querySelectorAll('[id^="modal-"]').forEach(m => m.classList.add('hidden'));
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  sidebar.classList.toggle('-translate-x-full');
}

function openCommandPalette() {
  document.getElementById('command-palette-modal').classList.remove('hidden');
  document.getElementById('palette-search-input').focus();
}

function closeCommandPalette() {
  document.getElementById('command-palette-modal').classList.add('hidden');
}

function runPaletteSearch(query) {
  const q = query.toLowerCase().trim();
  const list = document.getElementById('palette-results-list');
  if (!q) {
    list.innerHTML = `<div class="p-4 text-center text-slate-400">Type to search batches, plots, or database tabs...</div>`;
    return;
  }

  const results = [];

  // 1. Tabs
  const tabMatches = [
    { title: 'Interactive ER Diagram', tab: 'db-er-diagram', type: 'Database' },
    { title: 'SQL Query Console', tab: 'db-sql-console', type: 'Database' },
    { title: 'Plots & Geospatial Map', tab: 'plots-map', type: 'Supply Chain' },
    { title: 'Batches & Traceability', tab: 'batches-trace', type: 'Supply Chain' }
  ].filter(t => t.title.toLowerCase().includes(q));

  tabMatches.forEach(t => results.push({ title: t.title, subtitle: `Jump to ${t.type}`, action: () => { switchTab(t.tab); closeCommandPalette(); } }));

  // 2. Batches
  state.batches.filter(b => b.batch_code.toLowerCase().includes(q) || b.commodity_name.toLowerCase().includes(q)).forEach(b => {
    results.push({
      title: b.batch_code,
      subtitle: `Batch &bull; ${b.commodity_name} (${b.quantity_kg} kg)`,
      action: () => { switchTab('batches-trace'); runBatchTrace(b.batch_code); closeCommandPalette(); }
    });
  });

  if (results.length === 0) {
    list.innerHTML = `<div class="p-4 text-center text-slate-400">No matching records found.</div>`;
    return;
  }

  list.innerHTML = results.slice(0, 8).map((r, i) => `
    <div onclick="window.__paletteActions[${i}]()" class="p-2.5 hover:bg-slate-50 rounded-lg cursor-pointer flex items-center justify-between">
      <div>
        <div class="font-bold text-slate-900">${escapeHTML(r.title)}</div>
        <div class="text-[10px] text-slate-500">${r.subtitle}</div>
      </div>
      <i data-lucide="arrow-right" class="w-3.5 h-3.5 text-slate-400"></i>
    </div>
  `).join('');

  window.__paletteActions = results.map(r => r.action);
  lucide.createIcons();
}

function escapeHTML(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/[&<>'"]/g, tag => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[tag] || tag));
}
