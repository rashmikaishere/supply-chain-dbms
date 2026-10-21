/**
 * Supply Chain Traceability DBMS Project
 * Frontend Application Controller
 */

// ====================================================================
// STATE
// ====================================================================
const state = {
  currentTab: 'dashboard',
  viewMode: 'simple', // 'simple' | 'database'
  suppliers: [],
  farmers: [],
  batches: [],
  warehouses: [],
  shipments: [],
  products: [],
  schema: null,
  activeBatchForSend: null,
  lastDbAction: null,
  rawTableCurrent: 'suppliers',
  rawTableData: [],
  tableDetailsCurrentTable: null,
  tableDetailsHistory: [],
  tableDetailsData: null,
  tableDetailsLastRows: [],
  tableDetailsSearchQuery: '',
  tableDetailsPageSize: 25,
  tableDetailsCurrentPage: 1,
  sseSource: null,
  sseConnected: false
};

// ====================================================================
// INITIALIZATION
// ====================================================================
document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) lucide.createIcons();
  
  // Set default harvest date in add-batch modal to today
  const dateInput = document.getElementById('batch-modal-date-input');
  if (dateInput) {
    dateInput.value = new Date().toISOString().split('T')[0];
  }

  // Load view mode from storage if available
  const savedView = localStorage.getItem('chain_view_mode') || 'simple';
  setViewMode(savedView);

  // Restore sidebar state if saved
  restoreSidebarAccordionStates();

  // Load all initial data, then switch to the correct initial tab
  refreshAllData().then(() => {
    const initialTab = window.location.hash.replace('#', '') || 'dashboard';
    switchTab(initialTab);
  });

  // Initialize Server-Sent Events live stream
  initSSEStream();

  // Global Esc key listener for dialogs and slide-over panel
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeTableDetailsCard();
      resolveConfirmDialog(false);
    }
  });
});

// ====================================================================
// DATA REFRESH & FETCH HELPERS
// ====================================================================
async function refreshAllData() {
  await Promise.all([
    loadStats(),
    loadSuppliers(),
    loadFarmers(),
    loadBatches(),
    loadWarehouses(),
    loadShipments(),
    loadProducts(),
    loadSchema(),
    loadChangeHistory()
  ]);
  updateTraceDropdowns();
  if (window.lucide) lucide.createIcons();
}

async function fetchJSON(url, options = {}) {
  try {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    });
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 500, data: { message: err.message } };
  }
}

// ====================================================================
// NAVIGATION & TABS
// ====================================================================
function switchTab(tabId) {
  state.currentTab = tabId;
  window.location.hash = tabId;

  // Update sidebar buttons
  document.querySelectorAll('.nav-item-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
  });

  // Hide all tabs, show active tab
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.add('hidden');
  });
  const activePane = document.getElementById(`tab-${tabId}`);
  if (activePane) {
    activePane.classList.remove('hidden');
  }

  // Update breadcrumb title
  const titleMap = {
    'dashboard': 'Home',
    'suppliers': '1. Suppliers',
    'farmers': '2. Farmers',
    'batches': '3. Batches',
    'warehouses': '4. Warehouses',
    'shipments': '5. Shipments',
    'track-product': 'Track a Product',
    'db-table-diagram': 'Table Diagram',
    'db-data-tables': 'Data Tables',
    'db-sql-console': 'Ask the Database (SQL)',
    'db-change-history': 'Change History'
  };
  const titleEl = document.getElementById('breadcrumb-title');
  if (titleEl) titleEl.textContent = titleMap[tabId] || tabId;

  // On-demand rendering
  if (tabId === 'db-data-tables') {
    loadRawTableData(state.rawTableCurrent);
  } else if (tabId === 'db-table-diagram') {
    renderTableDiagram(); // async — will fetch schema if needed
  }

  // Close mobile sidebar if open
  toggleSidebar(false);
  if (window.lucide) lucide.createIcons();
}

function toggleSidebar(forceState) {
  const sidebar = document.getElementById('app-sidebar');
  const backdrop = document.getElementById('mobile-sidebar-backdrop');
  if (!sidebar) return;
  const isOpen = sidebar.classList.contains('sidebar-open');
  const next = forceState !== undefined ? forceState : !isOpen;
  if (next) {
    sidebar.classList.add('sidebar-open');
    if (backdrop) backdrop.classList.remove('hidden');
  } else {
    sidebar.classList.remove('sidebar-open');
    if (backdrop) backdrop.classList.add('hidden');
  }
}

function toggleSidebarSection(secId) {
  const sec = document.getElementById(secId);
  if (!sec) return;
  sec.classList.toggle('collapsed');
  try {
    localStorage.setItem(`chain_sec_${secId}`, sec.classList.contains('collapsed') ? 'collapsed' : 'open');
  } catch (e) {}
}

function restoreSidebarAccordionStates() {
  ['sec-the-chain', 'sec-track', 'sec-see-database'].forEach(secId => {
    const sec = document.getElementById(secId);
    if (!sec) return;
    try {
      if (localStorage.getItem(`chain_sec_${secId}`) === 'collapsed') {
        sec.classList.add('collapsed');
      }
    } catch (e) {}
  });
}

// ====================================================================
// VIEW MODE SWITCHER (Simple View vs Database View)
// ====================================================================
function setViewMode(mode) {
  state.viewMode = mode;
  try { localStorage.setItem('chain_view_mode', mode); } catch (e) {}

  const simpleBtn = document.getElementById('view-mode-simple-btn');
  const dbBtn = document.getElementById('view-mode-db-btn');
  if (simpleBtn && dbBtn) {
    simpleBtn.classList.toggle('active', mode === 'simple');
    dbBtn.classList.toggle('active', mode === 'database');
  }

  // Toggle visibility of .view-simple vs .view-db elements
  document.querySelectorAll('.view-simple').forEach(el => {
    el.style.display = mode === 'simple' ? '' : 'none';
  });
  document.querySelectorAll('.view-db').forEach(el => {
    el.style.display = mode === 'database' ? '' : 'none';
  });

  // Re-render Table Details if open
  if (state.tableDetailsCurrentTable && state.tableDetailsData) {
    renderTableDetailsRows();
  }
}

// ====================================================================
// TOAST NOTIFICATIONS & DRAWER
// ====================================================================
function showToast(msg, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  const bg = type === 'success' ? 'bg-forest-900 border-emerald-500 text-white' : 'bg-rose-900 border-rose-500 text-white';
  toast.className = `p-3 rounded-lg shadow-xl border text-xs flex items-center space-x-2 transition-all transform translate-y-0 opacity-100 ${bg}`;
  toast.innerHTML = `<span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function toggleDatabaseActionDrawer(forceState) {
  const drawer = document.getElementById('db-action-drawer');
  if (!drawer) return;
  const isOpen = !drawer.classList.contains('translate-x-full');
  const next = forceState !== undefined ? forceState : !isOpen;
  if (next) {
    drawer.classList.remove('translate-x-full');
  } else {
    drawer.classList.add('translate-x-full');
  }
}

function updateDatabaseChangesDrawer(actionData) {
  state.lastDbAction = actionData;
  const summaryEl = document.getElementById('drawer-summary');
  const badgeEl = document.getElementById('drawer-table-badge');
  const diffEl = document.getElementById('drawer-row-diff');
  const sqlEl = document.getElementById('drawer-sql');
  const keysEl = document.getElementById('drawer-keys');
  const counterEl = document.getElementById('sql-counter-badge');

  if (summaryEl) summaryEl.textContent = actionData.message || 'Action executed successfully.';
  if (badgeEl) {
    const tableChanged = (actionData.tables_changed && actionData.tables_changed[0]) ? actionData.tables_changed[0].table : 'Database';
    badgeEl.textContent = tableChanged;
  }
  if (diffEl) {
    diffEl.textContent = JSON.stringify(actionData.tables_changed || actionData.data || {}, null, 2);
  }
  if (sqlEl) {
    sqlEl.textContent = (actionData.sql && actionData.sql.length) ? actionData.sql.join('\n\n') : '-- SQLite internal execution';
  }
  if (keysEl) {
    if (actionData.keys_used && actionData.keys_used.length) {
      keysEl.innerHTML = actionData.keys_used.map(k => `<div class="p-1 bg-slate-950 rounded">&bull; ${k}</div>`).join('');
    } else {
      keysEl.innerHTML = '<div>Primary Key auto-assigned</div>';
    }
  }
  if (counterEl) {
    counterEl.textContent = 'Updated';
  }

  // Open drawer automatically on every write action
  toggleDatabaseActionDrawer(true);
}

function jumpToDataTablesFromDrawer() {
  if (!state.lastDbAction || !state.lastDbAction.tables_changed || !state.lastDbAction.tables_changed[0]) {
    switchTab('db-data-tables');
    return;
  }
  const table = state.lastDbAction.tables_changed[0].table;
  toggleDatabaseActionDrawer(false);
  switchTab('db-data-tables');
  const selector = document.getElementById('raw-table-selector');
  if (selector) selector.value = table;
  loadRawTableData(table, true); // flash first row
}

// ====================================================================
// MODAL MANAGEMENT
// ====================================================================
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('hidden');
    // Pre-populate dropdowns
    if (modalId === 'modal-add-farmer') populateFarmerModalSuppliers();
    if (modalId === 'modal-add-batch') populateBatchModalDropdowns();
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('hidden');
}

// ====================================================================
// PAGE: STATS & HOME
// ====================================================================
async function loadStats() {
  const { ok, data } = await fetchJSON('/api/stats');
  if (!ok) return;

  const counts = data.counts || {};
  ['suppliers', 'farmers', 'batches', 'warehouses', 'shipments'].forEach(k => {
    const el = document.getElementById(`count-${k}`);
    const chainEl = document.getElementById(`chain-count-${k}`);
    if (el) el.textContent = counts[k] ?? '-';
    if (chainEl) chainEl.textContent = counts[k] ?? '-';
  });

  const recentEl = document.getElementById('home-recent-changes');
  if (recentEl && data.recent_changes) {
    if (data.recent_changes.length === 0) {
      recentEl.innerHTML = '<div class="text-slate-400 py-2">No database changes recorded yet.</div>';
    } else {
      recentEl.innerHTML = data.recent_changes.map(c => `
        <div class="flex items-start justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-100">
          <div class="flex items-center space-x-2">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            <span class="text-slate-800 font-medium">${c.summary}</span>
          </div>
          <span class="text-[10px] text-slate-400 font-mono ml-2 whitespace-nowrap">${c.changed_at || ''}</span>
        </div>
      `).join('');
    }
  }
}

// ====================================================================
// PAGE 1: SUPPLIERS
// ====================================================================
async function loadSuppliers() {
  const { ok, data } = await fetchJSON('/api/suppliers');
  if (!ok) return;
  state.suppliers = data.data || [];
  renderSuppliersTable();
  populateFarmerFilterDropdown();
}

function renderSuppliersTable() {
  const tbody = document.getElementById('suppliers-table-body');
  if (!tbody) return;

  if (state.suppliers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-slate-400">No suppliers found. Click "Add Supplier" to create one.</td></tr>`;
    return;
  }

  tbody.innerHTML = state.suppliers.map(s => `
    <tr class="hover:bg-slate-50 transition-colors" id="row-suppliers-${s.supplier_id}">
      <td class="p-3 font-mono text-slate-500">${s.supplier_id}</td>
      <td class="p-3 font-bold text-slate-900">${s.name}</td>
      <td class="p-3 text-slate-600">${s.country || '-'}</td>
      <td class="p-3 font-mono text-slate-600">${s.phone || '-'}</td>
      <td class="p-3">
        <span class="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800">
          ${s.farmer_count} farmer${s.farmer_count === 1 ? '' : 's'}
        </span>
      </td>
      <td class="p-3 text-right">
        <button onclick="handleDeleteSupplier(${s.supplier_id})" class="px-2.5 py-1 text-xs text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded transition-colors font-semibold" title="Delete Supplier">
          Delete
        </button>
      </td>
    </tr>
  `).join('');

  setViewMode(state.viewMode);
}

async function submitAddSupplier(e) {
  e.preventDefault();
  const form = e.target;
  const payload = {
    name: form.name.value,
    country: form.country.value,
    phone: form.phone.value
  };

  const { ok, data } = await fetchJSON('/api/suppliers', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  if (ok) {
    closeModal('modal-add-supplier');
    form.reset();
    showToast(data.message, 'success');
    updateDatabaseChangesDrawer(data);
    await refreshAllData();
  } else {
    showToast(data.message, 'error');
  }
}

async function handleDeleteSupplier(supplierId) {
  const confirmed = await showConfirmDialog("Delete Supplier", "Are you sure you want to delete this supplier?");
  if (!confirmed) return;

  const { ok, data } = await fetchJSON(`/api/suppliers/${supplierId}`, {
    method: 'DELETE'
  });

  if (ok) {
    showToast(data.message, 'success');
    updateDatabaseChangesDrawer(data);
    await refreshAllData();
  } else {
    // Friendly block message when farmers exist
    showToast(data.message, 'error');
  }
}

// ====================================================================
// PAGE 2: FARMERS
// ====================================================================
async function loadFarmers(filterSupplierId = '') {
  let url = '/api/farmers';
  if (filterSupplierId) {
    url += `?supplier_id=${encodeURIComponent(filterSupplierId)}`;
  }
  const { ok, data } = await fetchJSON(url);
  if (!ok) return;
  state.farmers = data.data || [];
  renderFarmersTable();
}

function renderFarmersTable() {
  const tbody = document.getElementById('farmers-table-body');
  if (!tbody) return;

  if (state.farmers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-slate-400">No farmers found for this supplier.</td></tr>`;
    return;
  }

  tbody.innerHTML = state.farmers.map(f => {
    const isDeforestFree = f.deforestation_free === 1;
    const badge = isDeforestFree 
      ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">Yes (Compliant)</span>`
      : `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">No (Cleared after 2020)</span>`;

    return `
      <tr class="hover:bg-slate-50 transition-colors" id="row-farmers-${f.farmer_id}">
        <td class="p-3 font-mono text-slate-500">${f.farmer_id}</td>
        <td class="p-3 font-bold text-slate-900">${f.name}</td>
        <td class="p-3 text-slate-700">
          <span class="view-simple">${f.supplier_name}</span>
          <span class="view-db font-mono text-blue-600">supplier_id: ${f.supplier_id} (${f.supplier_name})</span>
        </td>
        <td class="p-3 text-slate-600">${f.village || '-'}</td>
        <td class="p-3">${badge}</td>
        <td class="p-3 font-mono text-slate-600">${f.batch_count || 0}</td>
        <td class="p-3 text-right">
          <button onclick="handleDeleteFarmer(${f.farmer_id})" class="px-2.5 py-1 text-xs text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded transition-colors font-semibold" title="Delete Farmer">
            Delete
          </button>
        </td>
      </tr>
    `;
  }).join('');

  setViewMode(state.viewMode);
}

function populateFarmerFilterDropdown() {
  const filter = document.getElementById('farmer-supplier-filter');
  if (!filter) return;
  const currentVal = filter.value;
  filter.innerHTML = `<option value="">All Suppliers (${state.suppliers.length})</option>` + 
    state.suppliers.map(s => `<option value="${s.supplier_id}">${s.name}</option>`).join('');
  filter.value = currentVal;
}

function populateFarmerModalSuppliers() {
  const select = document.getElementById('farmer-modal-supplier-select');
  if (!select) return;
  select.innerHTML = '<option value="">-- Choose a Supplier --</option>' +
    state.suppliers.map(s => `<option value="${s.supplier_id}">${s.name} (${s.country || 'N/A'})</option>`).join('');
}

async function submitAddFarmer(e) {
  e.preventDefault();
  const form = e.target;
  const payload = {
    supplier_id: form.supplier_id.value,
    name: form.name.value,
    village: form.village.value,
    deforestation_free: parseInt(form.deforestation_free.value)
  };

  const { ok, data } = await fetchJSON('/api/farmers', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  if (ok) {
    closeModal('modal-add-farmer');
    form.reset();
    showToast(data.message, 'success');
    updateDatabaseChangesDrawer(data);
    await refreshAllData();
  } else {
    showToast(data.message, 'error');
  }
}

async function handleDeleteFarmer(farmerId) {
  const confirmed = await showConfirmDialog("Delete Farmer", "Are you sure you want to delete this farmer?");
  if (!confirmed) return;

  const { ok, data } = await fetchJSON(`/api/farmers/${farmerId}`, {
    method: 'DELETE'
  });

  if (ok) {
    showToast(data.message, 'success');
    updateDatabaseChangesDrawer(data);
    await refreshAllData();
  } else {
    showToast(data.message, 'error');
  }
}

// ====================================================================
// PAGE 3: BATCHES & SEND FLOW
// ====================================================================
async function loadBatches() {
  const { ok, data } = await fetchJSON('/api/batches');
  if (!ok) return;
  state.batches = data.data || [];
  renderBatchesTable();
}

function renderBatchesTable() {
  const tbody = document.getElementById('batches-table-body');
  if (!tbody) return;

  if (state.batches.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="p-6 text-center text-slate-400">No product batches found. Click "Add Batch" to register a harvest.</td></tr>`;
    return;
  }

  tbody.innerHTML = state.batches.map(b => {
    const isZero = b.remaining_kg <= 0;
    const remainingBadge = isZero
      ? `<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-500">0 kg (Fully Sent)</span>`
      : `<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800">${b.remaining_kg} kg left</span>`;

    return `
      <tr class="hover:bg-slate-50 transition-colors" id="row-batches-${b.batch_id}">
        <td class="p-3 font-mono font-bold text-slate-900">${b.batch_code}</td>
        <td class="p-3 text-slate-800 font-medium">
          <span class="view-simple">${b.farmer_name}</span>
          <span class="view-db font-mono text-blue-600">farmer_id: ${b.farmer_id} (${b.farmer_name})</span>
        </td>
        <td class="p-3 text-slate-600">${b.supplier_name}</td>
        <td class="p-3 text-slate-700 font-semibold">${b.product_name}</td>
        <td class="p-3 font-mono font-semibold">${b.total_kg} kg</td>
        <td class="p-3">${remainingBadge}</td>
        <td class="p-3 font-mono text-slate-500 text-[11px]">${b.harvest_date}</td>
        <td class="p-3 text-right space-x-1.5 whitespace-nowrap">
          <button onclick="openSendModal(${b.batch_id}, 'warehouse')" ${isZero ? 'disabled' : ''} class="px-2.5 py-1 text-xs font-semibold bg-emerald-50 text-forest-900 hover:bg-emerald-100 border border-emerald-300 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            To Warehouse
          </button>
          <button onclick="openSendModal(${b.batch_id}, 'shipment')" ${isZero ? 'disabled' : ''} class="px-2.5 py-1 text-xs font-semibold bg-forest-900 text-white hover:bg-forest-800 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            To Shipment
          </button>
        </td>
      </tr>
    `;
  }).join('');

  setViewMode(state.viewMode);
}

async function loadProducts() {
  const { ok, data } = await fetchJSON('/api/products');
  if (ok) state.products = data.data || [];
}

function populateBatchModalDropdowns() {
  const fSelect = document.getElementById('batch-modal-farmer-select');
  const pSelect = document.getElementById('batch-modal-product-select');

  if (fSelect) {
    fSelect.innerHTML = '<option value="">-- Choose Farmer --</option>' +
      state.farmers.map(f => `<option value="${f.farmer_id}">${f.name} &bull; Supplier: ${f.supplier_name}</option>`).join('');
  }
  if (pSelect) {
    pSelect.innerHTML = '<option value="">-- Choose Product --</option>' +
      state.products.map(p => `<option value="${p.product_id}">${p.name}</option>`).join('');
  }
}

async function submitAddBatch(e) {
  e.preventDefault();
  const form = e.target;
  const payload = {
    farmer_id: form.farmer_id.value,
    product_id: form.product_id.value,
    quantity_kg: parseFloat(form.quantity_kg.value),
    harvest_date: form.harvest_date.value
  };

  const { ok, data } = await fetchJSON('/api/batches', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  if (ok) {
    closeModal('modal-add-batch');
    form.reset();
    showToast(data.message, 'success');
    updateDatabaseChangesDrawer(data);
    await refreshAllData();
  } else {
    showToast(data.message, 'error');
  }
}

// --------------------------------------------------------------------
// SEND MODAL (WAREHOUSE OR SHIPMENT)
// --------------------------------------------------------------------
function openSendModal(batchId, defaultDestinationType = 'warehouse') {
  const batch = state.batches.find(b => b.batch_id === batchId);
  if (!batch) return;
  state.activeBatchForSend = batch;

  document.getElementById('send-form-batch-id').value = batch.batch_id;
  document.getElementById('send-info-code').textContent = batch.batch_code;
  document.getElementById('send-info-total').textContent = `${batch.total_kg} kg`;
  document.getElementById('send-info-remaining').textContent = `${batch.remaining_kg} kg`;
  
  const qtyInput = document.getElementById('send-quantity-input');
  qtyInput.value = batch.remaining_kg;
  qtyInput.max = batch.remaining_kg;

  // Set radio choice
  const radios = document.getElementsByName('destination_type');
  radios.forEach(r => {
    r.checked = (r.value === defaultDestinationType);
  });

  updateSendDestinationOptions();
  openModal('modal-send-batch');
}

function updateSendDestinationOptions() {
  const type = document.querySelector('input[name="destination_type"]:checked').value;
  const select = document.getElementById('send-destination-select');
  const label = document.getElementById('send-destination-label');
  if (!select) return;

  if (type === 'warehouse') {
    label.textContent = "Select Warehouse * (movements.warehouse_id)";
    select.innerHTML = '<option value="">-- Choose Warehouse --</option>' +
      state.warehouses.map(w => `<option value="${w.warehouse_id}">${w.name} (${w.city || 'N/A'})</option>`).join('');
  } else {
    label.textContent = "Select Shipment * (movements.shipment_id)";
    select.innerHTML = '<option value="">-- Choose Shipment --</option>' +
      state.shipments.map(s => `<option value="${s.shipment_id}">${s.shipment_code} &rarr; ${s.destination} (${s.status})</option>`).join('');
  }
}

async function submitSendBatch(e) {
  e.preventDefault();
  const form = e.target;
  const payload = {
    batch_id: parseInt(form.batch_id.value),
    destination_type: form.destination_type.value,
    destination_id: parseInt(form.destination_id.value),
    quantity_kg: parseFloat(form.quantity_kg.value)
  };

  const { ok, data } = await fetchJSON('/api/movements', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  if (ok) {
    closeModal('modal-send-batch');
    form.reset();
    showToast(data.message, 'success');
    updateDatabaseChangesDrawer(data);
    await refreshAllData();
  } else {
    // Shows plain English failure (e.g. Only 20 kg left or Deforestation land blocked)
    showToast(data.message, 'error');
  }
}

// ====================================================================
// PAGE 4: WAREHOUSES
// ====================================================================
async function loadWarehouses() {
  const { ok, data } = await fetchJSON('/api/warehouses');
  if (!ok) return;
  state.warehouses = data.data || [];
  renderWarehousesTable();
}

function renderWarehousesTable() {
  const tbody = document.getElementById('warehouses-table-body');
  if (!tbody) return;

  if (state.warehouses.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-slate-400">No warehouses registered.</td></tr>`;
    return;
  }

  tbody.innerHTML = state.warehouses.map(w => `
    <tr class="hover:bg-slate-50 transition-colors cursor-pointer" onclick="showWarehouseDetails(${w.warehouse_id})" id="row-warehouses-${w.warehouse_id}">
      <td class="p-3 font-mono text-slate-500">${w.warehouse_id}</td>
      <td class="p-3 font-bold text-slate-900">${w.name}</td>
      <td class="p-3 text-slate-600">${w.city || '-'}</td>
      <td class="p-3 font-mono font-bold text-emerald-800">${w.total_kg_stored} kg</td>
      <td class="p-3">
        <span class="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700">
          ${w.batch_count} lot${w.batch_count === 1 ? '' : 's'} inside
        </span>
      </td>
      <td class="p-3 text-right">
        <button class="text-xs text-emerald-700 hover:text-emerald-900 font-semibold">View Batches &rarr;</button>
      </td>
    </tr>
  `).join('');

  setViewMode(state.viewMode);
}

function showWarehouseDetails(warehouseId) {
  const w = state.warehouses.find(item => item.warehouse_id === warehouseId);
  if (!w) return;

  const card = document.getElementById('warehouse-detail-card');
  const title = document.getElementById('warehouse-detail-title');
  const content = document.getElementById('warehouse-detail-content');

  title.textContent = `Batches Inside: ${w.name} (${w.city || 'N/A'}) - Total: ${w.total_kg_stored} kg`;

  if (!w.batches_inside || w.batches_inside.length === 0) {
    content.innerHTML = '<div class="text-slate-400 py-2">No batches stored in this warehouse yet.</div>';
  } else {
    content.innerHTML = `
      <table class="w-full text-left font-mono">
        <thead class="border-b text-slate-500">
          <tr><th class="py-1">Batch Code</th><th class="py-1">Product</th><th class="py-1">Farmer</th><th class="py-1">kg Stored</th><th class="py-1">Moved Date</th></tr>
        </thead>
        <tbody class="divide-y divide-slate-200">
          ${w.batches_inside.map(b => `
            <tr>
              <td class="py-1 font-bold text-emerald-900">${b.batch_code}</td>
              <td class="py-1">${b.product}</td>
              <td class="py-1">${b.farmer_name}</td>
              <td class="py-1 font-bold">${b.quantity_kg} kg</td>
              <td class="py-1 text-slate-500">${b.moved_date}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }
  card.classList.remove('hidden');
}

async function submitAddWarehouse(e) {
  e.preventDefault();
  const form = e.target;
  const payload = {
    name: form.name.value,
    city: form.city.value
  };

  const { ok, data } = await fetchJSON('/api/warehouses', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  if (ok) {
    closeModal('modal-add-warehouse');
    form.reset();
    showToast(data.message, 'success');
    updateDatabaseChangesDrawer(data);
    await refreshAllData();
  } else {
    showToast(data.message, 'error');
  }
}

// ====================================================================
// PAGE 5: SHIPMENTS
// ====================================================================
async function loadShipments() {
  const { ok, data } = await fetchJSON('/api/shipments');
  if (!ok) return;
  state.shipments = data.data || [];
  renderShipmentsTable();
}

function renderShipmentsTable() {
  const tbody = document.getElementById('shipments-table-body');
  if (!tbody) return;

  if (state.shipments.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-slate-400">No shipments found.</td></tr>`;
    return;
  }

  tbody.innerHTML = state.shipments.map(s => {
    let statusColor = 'bg-amber-100 text-amber-800 border-amber-300';
    if (s.status === 'In Transit') statusColor = 'bg-blue-100 text-blue-800 border-blue-300';
    if (s.status === 'Delivered') statusColor = 'bg-emerald-100 text-emerald-800 border-emerald-300';

    return `
      <tr class="hover:bg-slate-50 transition-colors" id="row-shipments-${s.shipment_id}">
        <td class="p-3 font-mono font-bold text-slate-900">${s.shipment_code}</td>
        <td class="p-3 text-slate-800">${s.destination}</td>
        <td class="p-3">
          <select onchange="handleUpdateShipmentStatus(${s.shipment_id}, this.value)" class="text-[11px] font-bold px-2 py-0.5 rounded border ${statusColor} cursor-pointer">
            <option value="Preparing" ${s.status === 'Preparing' ? 'selected' : ''}>Preparing</option>
            <option value="In Transit" ${s.status === 'In Transit' ? 'selected' : ''}>In Transit</option>
            <option value="Delivered" ${s.status === 'Delivered' ? 'selected' : ''}>Delivered</option>
          </select>
        </td>
        <td class="p-3 font-mono font-bold text-emerald-800">${s.total_kg} kg</td>
        <td class="p-3">
          <span class="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700">
            ${s.batch_count} lot${s.batch_count === 1 ? '' : 's'} inside
          </span>
        </td>
        <td class="p-3 text-right">
          <button onclick="showShipmentDetails(${s.shipment_id})" class="text-xs text-emerald-700 hover:text-emerald-900 font-semibold">View Batches &rarr;</button>
        </td>
      </tr>
    `;
  }).join('');

  setViewMode(state.viewMode);
}

function showShipmentDetails(shipmentId) {
  const s = state.shipments.find(item => item.shipment_id === shipmentId);
  if (!s) return;

  const card = document.getElementById('shipment-detail-card');
  const title = document.getElementById('shipment-detail-title');
  const content = document.getElementById('shipment-detail-content');

  title.textContent = `Batches Inside: ${s.shipment_code} (${s.destination}) - Status: ${s.status} - Total: ${s.total_kg} kg`;

  if (!s.batches_inside || s.batches_inside.length === 0) {
    content.innerHTML = '<div class="text-slate-400 py-2">No batches loaded on this shipment yet.</div>';
  } else {
    content.innerHTML = `
      <table class="w-full text-left font-mono">
        <thead class="border-b text-slate-500">
          <tr><th class="py-1">Batch Code</th><th class="py-1">Product</th><th class="py-1">Farmer</th><th class="py-1">Supplier</th><th class="py-1">kg</th><th class="py-1">Moved Date</th></tr>
        </thead>
        <tbody class="divide-y divide-slate-200">
          ${s.batches_inside.map(b => `
            <tr>
              <td class="py-1 font-bold text-emerald-900">${b.batch_code}</td>
              <td class="py-1">${b.product}</td>
              <td class="py-1">${b.farmer_name}</td>
              <td class="py-1">${b.supplier_name}</td>
              <td class="py-1 font-bold">${b.quantity_kg} kg</td>
              <td class="py-1 text-slate-500">${b.moved_date}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }
  card.classList.remove('hidden');
}

async function handleUpdateShipmentStatus(shipmentId, newStatus) {
  const { ok, data } = await fetchJSON(`/api/shipments/${shipmentId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status: newStatus })
  });

  if (ok) {
    showToast(data.message, 'success');
    updateDatabaseChangesDrawer(data);
    await refreshAllData();
  } else {
    showToast(data.message, 'error');
  }
}

async function submitAddShipment(e) {
  e.preventDefault();
  const form = e.target;
  const payload = {
    destination: form.destination.value,
    status: form.status.value
  };

  const { ok, data } = await fetchJSON('/api/shipments', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  if (ok) {
    closeModal('modal-add-shipment');
    form.reset();
    showToast(data.message, 'success');
    updateDatabaseChangesDrawer(data);
    await refreshAllData();
  } else {
    showToast(data.message, 'error');
  }
}

// ====================================================================
// PAGE: TRACK A PRODUCT (TRACE FORWARD & BACKWARD)
// ====================================================================
function updateTraceDropdowns() {
  const bSelect = document.getElementById('trace-batch-select');
  const sSelect = document.getElementById('trace-shipment-select');

  if (bSelect) {
    bSelect.innerHTML = state.batches.map(b => `
      <option value="${b.batch_code}">${b.batch_code} (${b.product_name} - ${b.total_kg} kg, Farmer: ${b.farmer_name})</option>
    `).join('');
  }
  if (sSelect) {
    sSelect.innerHTML = state.shipments.map(s => `
      <option value="${s.shipment_code}">${s.shipment_code} (${s.destination} - ${s.status})</option>
    `).join('');
  }
}

async function runTrace(type) {
  const code = type === 'batch' 
    ? document.getElementById('trace-batch-select').value 
    : document.getElementById('trace-shipment-select').value;

  if (!code) return;

  const resEl = document.getElementById('trace-result-container');
  resEl.innerHTML = '<div class="text-center py-8 text-slate-400">Tracing product through connected tables...</div>';

  const { ok, data } = await fetchJSON(`/api/trace/${encodeURIComponent(code)}`);
  if (!ok) {
    resEl.innerHTML = `<div class="p-4 bg-rose-50 text-rose-800 rounded-lg">${data.message}</div>`;
    return;
  }

  renderTracePathway(data);
}

function renderTracePathway(traceData) {
  const resEl = document.getElementById('trace-result-container');
  if (!resEl) return;

  if (traceData.mode === 'shipment_to_farmer') {
    // Trace backward from shipment to farm
    if (!traceData.records || traceData.records.length === 0) {
      resEl.innerHTML = `<div class="p-4 bg-slate-50 text-slate-600 rounded-lg">Shipment ${traceData.target_code} does not contain any batches yet.</div>`;
      return;
    }

    resEl.innerHTML = `
      <div class="space-y-6">
        <div class="flex items-center justify-between pb-3 border-b">
          <div>
            <h3 class="font-black text-slate-900 text-sm">Trace Back to Farm (Shipment &rarr; Farmer)</h3>
            <div class="text-[11px] text-slate-500 font-mono">Target: ${traceData.target_code}</div>
          </div>
          <span class="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-100 text-emerald-800">5-Table JOIN Chain</span>
        </div>

        <div class="space-y-4">
          ${traceData.records.map((r, i) => `
            <div class="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
              <div class="flex items-center justify-between">
                <span class="font-bold text-xs text-forest-900">Batch Record #${i + 1}: ${r.batch_code} (${r.product_name})</span>
                <span class="text-xs font-mono font-bold text-emerald-700">${r.moved_kg} kg transferred</span>
              </div>

              <!-- Vertical Step by Step Flow -->
              <div class="grid grid-cols-1 md:grid-cols-4 gap-2 text-xs">
                
                <!-- Step 1: Shipment -->
                <div class="p-3 bg-white rounded-lg border border-slate-200">
                  <div class="text-[10px] uppercase font-bold text-slate-400">5. Shipment</div>
                  <div class="font-bold text-slate-900">${r.shipment_code}</div>
                  <div class="text-[11px] text-slate-500">${r.destination}</div>
                  <div class="text-[9px] text-slate-400 font-mono mt-1">shipment_id: ${r.shipment_id}</div>
                </div>

                <!-- Step 2: Batch -->
                <div class="p-3 bg-white rounded-lg border border-slate-200">
                  <div class="text-[10px] uppercase font-bold text-slate-400">3. Harvest Batch</div>
                  <div class="font-bold text-slate-900">${r.batch_code}</div>
                  <div class="text-[11px] text-slate-500">${r.product_name} (${r.batch_total_kg} kg total)</div>
                  <div class="text-[9px] text-slate-400 font-mono mt-1">movements.batch_id &rarr; batches.batch_id (${r.batch_id})</div>
                </div>

                <!-- Step 3: Farmer -->
                <div class="p-3 bg-white rounded-lg border border-slate-200">
                  <div class="text-[10px] uppercase font-bold text-slate-400">2. Farmer &amp; Plot</div>
                  <div class="font-bold text-slate-900">${r.farmer_name}</div>
                  <div class="text-[11px] text-slate-500">Village: ${r.village || 'N/A'}</div>
                  <div class="text-[9px] text-slate-400 font-mono mt-1">batches.farmer_id &rarr; farmers.farmer_id (${r.farmer_id})</div>
                </div>

                <!-- Step 4: Supplier -->
                <div class="p-3 bg-white rounded-lg border border-slate-200">
                  <div class="text-[10px] uppercase font-bold text-slate-400">1. Supplier (Origin)</div>
                  <div class="font-bold text-slate-900">${r.supplier_name}</div>
                  <div class="text-[11px] text-slate-500">${r.supplier_country || 'N/A'}</div>
                  <div class="text-[9px] text-slate-400 font-mono mt-1">farmers.supplier_id &rarr; suppliers.supplier_id (${r.supplier_id})</div>
                </div>

              </div>
            </div>
          `).join('')}
        </div>

        <div class="p-3 bg-slate-900 text-emerald-300 rounded-lg font-mono text-[11px]">
          <span class="text-slate-400">Keys Path:</span> ${traceData.keys_path}
        </div>
      </div>
    `;

  } else {
    // Trace forward from batch
    const b = traceData.batch;
    resEl.innerHTML = `
      <div class="space-y-6">
        <div class="flex items-center justify-between pb-3 border-b">
          <div>
            <h3 class="font-black text-slate-900 text-sm">Trace Forward (Farmer &rarr; Destinations)</h3>
            <div class="text-[11px] text-slate-500 font-mono">Batch: ${b.batch_code} (${b.product_name})</div>
          </div>
          <span class="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-100 text-emerald-800">Remaining: ${b.remaining_kg} kg</span>
        </div>

        <!-- Vertical Path -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          
          <!-- Origin Supplier -->
          <div class="p-4 bg-slate-50 rounded-xl border border-slate-200">
            <span class="text-[10px] uppercase font-bold text-slate-400">Origin Supplier</span>
            <div class="font-bold text-sm text-slate-900 mt-1">${b.supplier_name}</div>
            <div class="text-slate-500 text-[11px]">${b.supplier_country || 'N/A'} &bull; ${b.supplier_phone || ''}</div>
            <div class="mt-2 text-[10px] text-slate-400 font-mono">suppliers.supplier_id: ${b.supplier_id} (PK)</div>
          </div>

          <!-- Origin Farmer -->
          <div class="p-4 bg-slate-50 rounded-xl border border-slate-200">
            <span class="text-[10px] uppercase font-bold text-slate-400">Farmer</span>
            <div class="font-bold text-sm text-slate-900 mt-1">${b.farmer_name}</div>
            <div class="text-slate-500 text-[11px]">Village: ${b.village || 'N/A'}</div>
            <div class="mt-2 text-[10px] text-slate-400 font-mono">farmers.supplier_id &rarr; suppliers.supplier_id</div>
          </div>

          <!-- Batch Info -->
          <div class="p-4 bg-emerald-50 rounded-xl border border-emerald-200">
            <span class="text-[10px] uppercase font-bold text-forest-800">Harvest Batch</span>
            <div class="font-bold text-sm text-forest-950 mt-1">${b.batch_code}</div>
            <div class="text-forest-800 text-[11px]">${b.batch_total_kg} kg harvested on ${b.harvest_date}</div>
            <div class="mt-2 text-[10px] text-forest-700 font-mono">batches.farmer_id &rarr; farmers.farmer_id</div>
          </div>

        </div>

        <!-- Downstream Destinations -->
        <div>
          <h4 class="text-xs font-bold uppercase text-slate-500 mb-2">Downstream Destinations (Movements):</h4>
          ${(!b.movements || b.movements.length === 0) 
            ? '<div class="text-slate-400 text-xs py-2">No movements yet. 100% of kg remains with supplier.</div>'
            : `<div class="space-y-2">
                ${b.movements.map(m => `
                  <div class="p-3 bg-white rounded-lg border border-slate-200 flex items-center justify-between text-xs">
                    <div>
                      <span class="font-bold ${m.warehouse_id ? 'text-blue-700' : 'text-purple-700'}">
                        ${m.warehouse_id ? `Warehouse: ${m.warehouse_name} (${m.warehouse_city})` : `Shipment: ${m.shipment_code} &rarr; ${m.shipment_destination}`}
                      </span>
                      <span class="text-[10px] text-slate-400 font-mono ml-2">on ${m.moved_date}</span>
                    </div>
                    <div class="font-mono font-bold text-slate-900">${m.quantity_kg} kg</div>
                  </div>
                `).join('')}
              </div>`
          }
        </div>

        <div class="p-3 bg-slate-900 text-emerald-300 rounded-lg font-mono text-[11px]">
          <span class="text-slate-400">Keys Path:</span> ${traceData.keys_path}
        </div>
      </div>
    `;
  }
}

// ====================================================================
// PAGE: TABLE DIAGRAM (SEE THE DATABASE)
// ====================================================================
async function loadSchema() {
  const { ok, data } = await fetchJSON('/api/schema');
  if (ok) state.schema = data.tables || {};
}

async function renderTableDiagram() {
  const container = document.getElementById('table-diagram-cards');
  if (!container) return;

  // If schema not yet loaded (e.g. tab opened before refreshAllData resolved), fetch it now
  if (!state.schema || Object.keys(state.schema).length === 0) {
    container.innerHTML = `<div class="col-span-3 flex items-center justify-center py-16 text-slate-400 text-sm"><i data-lucide="loader" class="w-5 h-5 mr-2 animate-spin"></i> Loading schema...</div>`;
    if (window.lucide) lucide.createIcons();
    await loadSchema();
  }

  if (!state.schema || Object.keys(state.schema).length === 0) {
    container.innerHTML = `<div class="col-span-3 text-center py-16 text-red-400 text-sm">Could not load schema from database.</div>`;
    return;
  }

  container.innerHTML = Object.entries(state.schema).map(([name, info]) => {
    return `
      <div id="diagram-card-${name}" class="p-4 bg-slate-900 text-slate-100 rounded-xl border border-slate-800 shadow space-y-3 cursor-pointer hover:border-emerald-500 transition-all hover:shadow-lg" onclick="openTableDetailsCard('${name}')">
        <div class="flex items-center justify-between pb-2 border-b border-slate-800">
          <div class="flex items-center space-x-2">
            <i data-lucide="table" class="w-4 h-4 text-emerald-400"></i>
            <span class="font-mono font-bold text-sm text-white">${name}</span>
          </div>
          <span id="diagram-card-count-${name}" class="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-semibold transition-all">${info.row_count} rows</span>
        </div>

        <p class="text-[11px] text-slate-400 leading-tight">${tableDescriptions[name] || ''}</p>

        <!-- Column list -->
        <div class="space-y-1 font-mono text-[11px]">
          ${info.columns.map(c => {
            const isPK = c.pk === 1;
            const fk = info.foreign_keys.find(f => f.from === c.name);
            return `
              <div class="flex items-center justify-between py-0.5">
                <span class="${isPK ? 'text-amber-300 font-bold' : (fk ? 'text-sky-300' : 'text-slate-300')}">
                  ${c.name}
                </span>
                <span class="text-[9px] text-slate-500">
                  ${isPK ? '<span class="px-1 bg-amber-400/20 text-amber-300 rounded font-bold">PK</span>' : ''}
                  ${fk ? `<span class="px-1 bg-sky-400/20 text-sky-300 rounded font-bold">FK &rarr; ${fk.table}</span>` : ''}
                  ${c.type}
                </span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

// ====================================================================
// CONFIRMATION DIALOG (In-Page Modal, replaces window.confirm)
// ====================================================================
let confirmDialogResolver = null;

function showConfirmDialog(title, message) {
  return new Promise((resolve) => {
    confirmDialogResolver = resolve;
    const modal = document.getElementById('confirm-modal');
    if (!modal) {
      resolve(true);
      return;
    }
    const titleEl = document.getElementById('confirm-modal-title');
    const msgEl = document.getElementById('confirm-modal-msg');
    if (titleEl) titleEl.textContent = title || 'Confirm Action';
    if (msgEl) msgEl.textContent = message || 'Are you sure you want to proceed?';
    modal.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
  });
}

function resolveConfirmDialog(result) {
  const modal = document.getElementById('confirm-modal');
  if (modal) modal.classList.add('hidden');
  if (confirmDialogResolver) {
    confirmDialogResolver(result);
    confirmDialogResolver = null;
  }
}

// ====================================================================
// FK DISPLAY RESOLVER (Simple View vs Database View)
// ====================================================================
function resolveFKDisplayName(fkTable, fkValue) {
  if (fkValue === null || fkValue === undefined || fkValue === '') return 'null';
  if (!fkTable) return String(fkValue);

  const valStr = String(fkValue);

  if (fkTable === 'suppliers') {
    const s = state.suppliers.find(x => String(x.supplier_id) === valStr);
    return s ? s.name : `Supplier #${valStr}`;
  }
  if (fkTable === 'farmers') {
    const f = state.farmers.find(x => String(x.farmer_id) === valStr);
    return f ? f.name : `Farmer #${valStr}`;
  }
  if (fkTable === 'products') {
    const p = state.products.find(x => String(x.product_id) === valStr);
    return p ? p.name : `Product #${valStr}`;
  }
  if (fkTable === 'batches') {
    const b = state.batches.find(x => String(x.batch_id) === valStr);
    return b ? b.batch_code : `Batch #${valStr}`;
  }
  if (fkTable === 'warehouses') {
    const w = state.warehouses.find(x => String(x.warehouse_id) === valStr);
    return w ? w.name : `Warehouse #${valStr}`;
  }
  if (fkTable === 'shipments') {
    const sh = state.shipments.find(x => String(x.shipment_id) === valStr);
    return sh ? sh.shipment_code : `Shipment #${valStr}`;
  }

  return valStr;
}

// ====================================================================
// TABLE DETAILS SLIDE-OVER CARD
// ====================================================================
async function openTableDetailsCard(tableName, pushHistory = true) {
  if (!tableName) return;

  if (pushHistory && state.tableDetailsCurrentTable && state.tableDetailsCurrentTable !== tableName) {
    state.tableDetailsHistory.push(state.tableDetailsCurrentTable);
  }

  state.tableDetailsCurrentTable = tableName;
  state.tableDetailsSearchQuery = '';
  state.tableDetailsCurrentPage = 1;

  // Update back button
  const backWrapper = document.getElementById('td-back-wrapper');
  const backLabel = document.getElementById('td-back-label');
  if (backWrapper && backLabel) {
    if (state.tableDetailsHistory.length > 0) {
      const prevTable = state.tableDetailsHistory[state.tableDetailsHistory.length - 1];
      backLabel.textContent = `Back to ${prevTable}`;
      backWrapper.classList.remove('hidden');
    } else {
      backWrapper.classList.add('hidden');
    }
  }

  // Header info
  const titleEl = document.getElementById('td-table-name');
  if (titleEl) titleEl.textContent = tableName;

  const descEl = document.getElementById('td-table-desc');
  if (descEl) descEl.textContent = tableDescriptions[tableName] || "Database table";

  // Reset search box and page selector
  const searchInput = document.getElementById('td-search-input');
  if (searchInput) searchInput.value = '';
  const pageSizeSelect = document.getElementById('td-page-size');
  if (pageSizeSelect) pageSizeSelect.value = String(state.tableDetailsPageSize || 25);

  // Show backdrop & slide-over panel
  const backdrop = document.getElementById('table-details-backdrop');
  const panel = document.getElementById('table-details-panel');
  if (backdrop) backdrop.classList.remove('hidden');
  if (panel) panel.classList.remove('translate-x-full');

  hideCardToast();

  await fetchAndRenderTableDetails(tableName);
  if (window.lucide) lucide.createIcons();
}

function closeTableDetailsCard() {
  const panel = document.getElementById('table-details-panel');
  const backdrop = document.getElementById('table-details-backdrop');
  if (panel) panel.classList.add('translate-x-full');
  if (backdrop) {
    setTimeout(() => {
      backdrop.classList.add('hidden');
    }, 280);
  }
  state.tableDetailsCurrentTable = null;
  state.tableDetailsHistory = [];
  state.tableDetailsLastRows = [];
  hideCardToast();
}

function goBackTableDetails() {
  if (state.tableDetailsHistory.length > 0) {
    const prevTable = state.tableDetailsHistory.pop();
    openTableDetailsCard(prevTable, false);
  }
}

function navigateToTableDetails(targetTable, rowVal) {
  if (!targetTable) return;
  openTableDetailsCard(targetTable, true);
}

async function fetchAndRenderTableDetails(tableName, highlightRowId = null, flashType = null, diffMap = null) {
  if (!tableName || state.tableDetailsCurrentTable !== tableName) return;

  const url = `/api/tables/${tableName}/rows?limit=100&offset=0`;
  const { ok, data } = await fetchJSON(url);

  if (!ok) {
    showToast(data.message || `Failed to load table ${tableName}`, 'error');
    return;
  }

  state.tableDetailsData = data;
  state.tableDetailsLastRows = data.rows || [];

  // Animate row count badge
  const rowCountBadge = document.getElementById('td-row-count-badge');
  if (rowCountBadge) {
    rowCountBadge.textContent = `${data.total} row${data.total === 1 ? '' : 's'}`;
    rowCountBadge.classList.add('scale-110', 'text-emerald-300');
    setTimeout(() => {
      rowCountBadge.classList.remove('scale-110', 'text-emerald-300');
    }, 350);
  }

  // Section A: Columns
  renderTableDetailsColumns(data.columns);

  // Section C: SQL Used
  const sqlEl = document.getElementById('td-sql-text');
  const msEl = document.getElementById('td-sql-ms');
  if (sqlEl) sqlEl.textContent = data.sql || `SELECT * FROM ${tableName} ORDER BY 1 DESC LIMIT 100`;
  if (msEl) msEl.textContent = `${data.ms || 0} ms`;

  // Section B: Filter & render rows
  renderTableDetailsRows(highlightRowId, flashType, diffMap);

  if (window.lucide) lucide.createIcons();
}

function renderTableDetailsColumns(columns) {
  const container = document.getElementById('td-columns-list');
  const countEl = document.getElementById('td-col-count');
  if (!container) return;

  if (countEl) countEl.textContent = `${columns.length} columns`;

  container.innerHTML = columns.map(c => {
    const isPK = c.pk === 1 || c.pk === true;
    const fk = c.fk;

    let badge = '';
    if (isPK) {
      badge = `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30">PK</span>`;
    }
    if (fk) {
      const targetStr = typeof fk === 'object' ? `${fk.table}.${fk.to}` : fk;
      badge += ` <span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-400/20 text-sky-300 border border-sky-400/30">&rarr; ${targetStr}</span>`;
    }

    return `
      <div class="flex items-center justify-between py-1 px-2 rounded hover:bg-slate-900/50">
        <div class="flex items-center space-x-2">
          <span class="font-bold ${isPK ? 'text-amber-300' : (fk ? 'text-sky-300' : 'text-slate-200')}">${c.name}</span>
          ${badge}
        </div>
        <span class="text-[10px] text-slate-500 font-mono">${c.type}</span>
      </div>
    `;
  }).join('');
}

function renderTableDetailsRows(highlightRowId = null, flashType = null, diffMap = null) {
  if (!state.tableDetailsData) return;

  const thead = document.getElementById('td-rows-thead');
  const tbody = document.getElementById('td-rows-tbody');
  if (!thead || !tbody) return;

  const columns = state.tableDetailsData.columns || [];
  let allRows = state.tableDetailsData.rows || [];

  // Filter with search query
  const q = (state.tableDetailsSearchQuery || '').toLowerCase().trim();
  let filteredRows = allRows;
  if (q) {
    filteredRows = allRows.filter(r => {
      return Object.values(r).some(val => {
        if (val === null || val === undefined) return false;
        return String(val).toLowerCase().includes(q);
      });
    });
  }

  // Pagination calculation
  const total = filteredRows.length;
  let pageSize = state.tableDetailsPageSize;
  let pageRows = filteredRows;
  let totalPages = 1;

  if (pageSize !== 'all') {
    pageSize = parseInt(pageSize, 10) || 25;
    totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (state.tableDetailsCurrentPage > totalPages) state.tableDetailsCurrentPage = totalPages;
    if (state.tableDetailsCurrentPage < 1) state.tableDetailsCurrentPage = 1;
    const startIdx = (state.tableDetailsCurrentPage - 1) * pageSize;
    pageRows = filteredRows.slice(startIdx, startIdx + pageSize);
  }

  // Update pagination bar
  const pageInfoEl = document.getElementById('td-page-info');
  const pageNumEl = document.getElementById('td-current-page-num');
  const prevBtn = document.getElementById('td-prev-btn');
  const nextBtn = document.getElementById('td-next-btn');

  if (pageInfoEl) {
    if (total === 0) {
      pageInfoEl.textContent = '0 rows found';
    } else if (pageSize === 'all') {
      pageInfoEl.textContent = `Showing all ${total} rows`;
    } else {
      const startIdx = (state.tableDetailsCurrentPage - 1) * pageSize + 1;
      const endIdx = Math.min(startIdx + pageRows.length - 1, total);
      pageInfoEl.textContent = `Showing ${startIdx}-${endIdx} of ${total}`;
    }
  }
  if (pageNumEl) pageNumEl.textContent = String(state.tableDetailsCurrentPage);
  if (prevBtn) prevBtn.disabled = (state.tableDetailsCurrentPage <= 1 || pageSize === 'all');
  if (nextBtn) nextBtn.disabled = (state.tableDetailsCurrentPage >= totalPages || pageSize === 'all');

  // Render Table Header (sticky)
  thead.innerHTML = `
    <tr>
      ${columns.map(c => `
        <th class="px-3 py-2 whitespace-nowrap text-left border-b border-slate-700 bg-slate-800 font-bold ${c.pk ? 'text-amber-300' : (c.fk ? 'text-sky-300' : 'text-slate-300')}">
          ${c.name}
          ${c.pk ? '<span class="text-[9px] text-amber-400 ml-1">PK</span>' : ''}
          ${c.fk ? '<span class="text-[9px] text-sky-400 ml-1">FK</span>' : ''}
        </th>
      `).join('')}
    </tr>
  `;

  if (pageRows.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="${columns.length}" class="p-6 text-center text-slate-500 font-sans">
          No matching rows found.
        </td>
      </tr>
    `;
    return;
  }

  // Find primary key column
  const pkCol = columns.find(c => c.pk === 1 || c.pk === true);
  const pkName = pkCol ? pkCol.name : null;

  tbody.innerHTML = pageRows.map(row => {
    const rowIdVal = pkName ? row[pkName] : null;
    let flashClass = '';
    if (highlightRowId !== null && String(rowIdVal) === String(highlightRowId)) {
      if (flashType === 'INSERT') flashClass = 'row-new-flash';
      else if (flashType === 'UPDATE') flashClass = 'row-update-flash';
      else if (flashType === 'DELETE') flashClass = 'row-delete-flash';
    }

    const rowDomId = rowIdVal !== null ? `id="td-row-${rowIdVal}"` : '';

    return `
      <tr class="even:bg-slate-800/40 hover:bg-slate-800/70 transition-colors ${flashClass}" ${rowDomId}>
        ${columns.map(col => {
          const val = row[col.name];
          let cellHtml = '';

          if (val === null || val === undefined) {
            cellHtml = `<span class="text-slate-500 italic font-normal">null</span>`;
          } else if (diffMap && String(rowIdVal) === String(highlightRowId) && diffMap[col.name]) {
            const oldVal = diffMap[col.name].oldVal;
            cellHtml = `<del class="text-rose-400 line-through mr-1 opacity-70">${oldVal === null ? 'null' : oldVal}</del><ins class="text-emerald-300 no-underline font-bold">${val}</ins>`;
          } else if (col.fk) {
            const fkTable = col.fk.table;
            const friendlyName = resolveFKDisplayName(fkTable, val);
            const isSimple = state.viewMode === 'simple';
            cellHtml = `
              <button onclick="navigateToTableDetails('${fkTable}', '${val}')" class="text-sky-400 hover:text-sky-300 hover:underline font-bold transition-colors cursor-pointer text-left font-mono" title="Jump to ${fkTable} (${val})">
                <span class="view-simple" style="${isSimple ? '' : 'display:none;'}">${escapeHtml(friendlyName)}</span>
                <span class="view-db" style="${isSimple ? 'display:none;' : ''}">${escapeHtml(String(val))}</span>
              </button>
            `;
          } else {
            cellHtml = `<span>${escapeHtml(String(val))}</span>`;
          }

          return `<td class="td-cell ${col.pk ? 'font-bold text-amber-200' : 'text-slate-300'}">${cellHtml}</td>`;
        }).join('')}
      </tr>
    `;
  }).join('');
}

function handleTableDetailsSearch(query) {
  state.tableDetailsSearchQuery = query;
  state.tableDetailsCurrentPage = 1;
  renderTableDetailsRows();
}

function handleTableDetailsPageSize(size) {
  state.tableDetailsPageSize = size === 'all' ? 'all' : parseInt(size, 10);
  state.tableDetailsCurrentPage = 1;
  renderTableDetailsRows();
}

function tableDetailsPrevPage() {
  if (state.tableDetailsCurrentPage > 1) {
    state.tableDetailsCurrentPage--;
    renderTableDetailsRows();
  }
}

function tableDetailsNextPage() {
  state.tableDetailsCurrentPage++;
  renderTableDetailsRows();
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function downloadCurrentTableCSV() {
  const tbl = state.tableDetailsCurrentTable;
  const rows = state.tableDetailsLastRows;
  if (!tbl || !rows || rows.length === 0) {
    showToast("No rows to export.", "error");
    return;
  }

  const columns = state.tableDetailsData ? state.tableDetailsData.columns.map(c => c.name) : Object.keys(rows[0]);
  const lines = [columns.join(',')];

  for (const r of rows) {
    const rowValues = columns.map(col => {
      let v = r[col];
      if (v === null || v === undefined) return '';
      v = String(v).replace(/"/g, '""');
      return `"${v}"`;
    });
    lines.push(rowValues.join(','));
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${tbl}_export_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`Downloaded ${tbl}.csv`, "success");
}

function openCurrentTableInDataTables() {
  const tbl = state.tableDetailsCurrentTable;
  if (!tbl) return;
  closeTableDetailsCard();
  switchTab('db-data-tables');
  const selector = document.getElementById('raw-table-selector');
  if (selector) {
    selector.value = tbl;
    loadRawTableData(tbl);
  }
}

// Card Toast
let cardToastTimeout = null;

function showCardToast(text, highlightRowId = null) {
  const toast = document.getElementById('td-card-toast');
  const toastText = document.getElementById('td-card-toast-text');
  const toastBtn = document.getElementById('td-card-toast-btn');
  if (!toast || !toastText) return;

  toastText.textContent = text;
  if (highlightRowId !== null && toastBtn) {
    toastBtn.style.display = 'inline-block';
    toastBtn.onclick = () => highlightNewestRow(highlightRowId);
  } else if (toastBtn) {
    toastBtn.style.display = 'none';
  }

  toast.classList.remove('hidden');
  if (cardToastTimeout) clearTimeout(cardToastTimeout);
  cardToastTimeout = setTimeout(() => {
    hideCardToast();
  }, 6000);
}

function hideCardToast() {
  const toast = document.getElementById('td-card-toast');
  if (toast) toast.classList.add('hidden');
  if (cardToastTimeout) {
    clearTimeout(cardToastTimeout);
    cardToastTimeout = null;
  }
}

function highlightNewestRow(rowId = null) {
  let targetRow = null;
  if (rowId !== null && rowId !== undefined) {
    targetRow = document.getElementById(`td-row-${rowId}`);
  }
  if (!targetRow) {
    const tbody = document.getElementById('td-rows-tbody');
    if (tbody && tbody.firstElementChild) {
      targetRow = tbody.firstElementChild;
    }
  }
  if (targetRow) {
    targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
    targetRow.classList.remove('row-new-flash', 'row-update-flash');
    void targetRow.offsetWidth;
    targetRow.classList.add('row-new-flash');
  }
}

function pulseDiagramCard(tableName) {
  if (!tableName) return;
  const card = document.getElementById(`diagram-card-${tableName}`);
  if (card) {
    card.classList.remove('card-pulse-change');
    void card.offsetWidth;
    card.classList.add('card-pulse-change');
    setTimeout(() => {
      card.classList.remove('card-pulse-change');
    }, 1300);
  }

  // Update small row count on diagram card
  fetchJSON('/api/schema').then(({ ok, data }) => {
    if (ok && data.tables) {
      state.schema = data.tables;
      Object.entries(data.tables).forEach(([name, info]) => {
        const countEl = document.getElementById(`diagram-card-count-${name}`);
        if (countEl) countEl.textContent = `${info.row_count} rows`;
      });
    }
  });
}

// ====================================================================
// LIVE SSE STREAM & FALLBACK POLLING
// ====================================================================
let fallbackPollInterval = null;
let lastPollSignature = null;

function initSSEStream() {
  if (state.sseSource) {
    try { state.sseSource.close(); } catch (e) {}
  }

  try {
    state.sseSource = new EventSource('/api/stream');

    state.sseSource.onopen = () => {
      state.sseConnected = true;
      stopFallbackPolling();
    };

    state.sseSource.onmessage = (e) => {
      try {
        if (!e.data || e.data.startsWith(':')) return;
        const event = JSON.parse(e.data);
        handleDatabaseLiveEvent(event);
      } catch (err) {
        console.error("SSE parse error", err);
      }
    };

    state.sseSource.onerror = () => {
      state.sseConnected = false;
      startFallbackPolling();
    };
  } catch (err) {
    startFallbackPolling();
  }
}

async function handleDatabaseLiveEvent(event) {
  if (!event || !event.table) return;

  // 1. Always update row counts & pulse on table diagram cards
  pulseDiagramCard(event.table);

  // 2. If the details card is open and matches this table (or all)
  if (state.tableDetailsCurrentTable && (state.tableDetailsCurrentTable === event.table || event.table === 'all')) {
    const tbl = state.tableDetailsCurrentTable;
    const oldRows = state.tableDetailsLastRows ? [...state.tableDetailsLastRows] : [];

    if (event.action === 'INSERT') {
      await fetchAndRenderTableDetails(tbl, event.row_id, 'INSERT');
      showCardToast(`New row added: ${tbl} #${event.row_id || ''}`, event.row_id);
    } else if (event.action === 'UPDATE') {
      // Compute column diff if row exists in oldRows
      let diffMap = null;
      const { ok, data } = await fetchJSON(`/api/tables/${tbl}/rows?limit=100&offset=0`);
      if (ok && data.rows) {
        const pkCol = data.columns.find(c => c.pk === 1 || c.pk === true);
        const pkName = pkCol ? pkCol.name : null;
        if (pkName && event.row_id !== null) {
          const oldRow = oldRows.find(r => String(r[pkName]) === String(event.row_id));
          const newRow = data.rows.find(r => String(r[pkName]) === String(event.row_id));
          if (oldRow && newRow) {
            diffMap = {};
            data.columns.forEach(col => {
              if (String(oldRow[col.name]) !== String(newRow[col.name])) {
                diffMap[col.name] = { oldVal: oldRow[col.name], newVal: newRow[col.name] };
              }
            });
          }
        }
      }
      await fetchAndRenderTableDetails(tbl, event.row_id, 'UPDATE', diffMap);
      showCardToast(`Row updated: ${tbl} #${event.row_id || ''}`, event.row_id);
    } else if (event.action === 'DELETE') {
      const rowEl = document.getElementById(`td-row-${event.row_id}`);
      if (rowEl) {
        rowEl.classList.remove('row-new-flash', 'row-update-flash');
        rowEl.classList.add('row-delete-flash');
      }
      setTimeout(async () => {
        await fetchAndRenderTableDetails(tbl, null, null);
      }, 900);
      showCardToast(`Row deleted from ${tbl}: #${event.row_id || ''}`);
    } else {
      await fetchAndRenderTableDetails(tbl, null, null);
    }
  }

  // 3. Keep stats and history synced in background
  loadStats();
  loadChangeHistory();
}

function startFallbackPolling() {
  if (fallbackPollInterval) return;
  fallbackPollInterval = setInterval(async () => {
    if (!state.tableDetailsCurrentTable) return;
    const tbl = state.tableDetailsCurrentTable;

    const { ok, data } = await fetchJSON('/api/changes?limit=1');
    if (ok && data.records && data.records.length > 0) {
      const rec = data.records[0];
      const sig = `${rec.log_id}-${rec.table_name}-${rec.action}`;
      if (lastPollSignature && lastPollSignature !== sig) {
        if (rec.table_name === tbl || rec.table_name === 'all') {
          handleDatabaseLiveEvent({
            table: rec.table_name,
            action: rec.action,
            row_id: null
          });
        }
      }
      lastPollSignature = sig;
    }
  }, 2000);
}

function stopFallbackPolling() {
  if (fallbackPollInterval) {
    clearInterval(fallbackPollInterval);
    fallbackPollInterval = null;
  }
}

// ====================================================================
// PAGE: DATA TABLES BROWSER
// ====================================================================
async function loadRawTableData(tableName, flashFirst = false) {
  state.rawTableCurrent = tableName;
  const thead = document.getElementById('raw-browser-thead');
  const tbody = document.getElementById('raw-browser-tbody');
  if (!thead || !tbody) return;

  tbody.innerHTML = '<tr><td class="p-4 text-center text-slate-400">Loading data...</td></tr>';

  const { ok, data } = await fetchJSON(`/api/table-data/${tableName}`);
  if (!ok) {
    tbody.innerHTML = `<tr><td class="p-4 text-center text-rose-500">${data.message}</td></tr>`;
    return;
  }

  state.rawTableData = data.data || [];
  renderRawTable(state.rawTableData, flashFirst);
}

function renderRawTable(rows, flashFirst = false) {
  const thead = document.getElementById('raw-browser-thead');
  const tbody = document.getElementById('raw-browser-tbody');

  if (!rows || rows.length === 0) {
    thead.innerHTML = '<tr><th class="p-3">Empty Table</th></tr>';
    tbody.innerHTML = '<tr><td class="p-4 text-center text-slate-400">0 rows in table.</td></tr>';
    return;
  }

  const columns = Object.keys(rows[0]);
  thead.innerHTML = `<tr>${columns.map(c => `<th class="p-3 whitespace-nowrap">${c}</th>`).join('')}</tr>`;

  tbody.innerHTML = rows.map((r, i) => {
    const flashClass = (flashFirst && i === 0) ? 'bg-emerald-100 animate-pulse' : 'hover:bg-slate-50';
    return `
      <tr class="${flashClass}">
        ${columns.map(c => {
          const val = r[c] !== null ? r[c] : '<span class="text-slate-300">NULL</span>';
          return `<td class="p-3 whitespace-nowrap">${val}</td>`;
        }).join('')}
      </tr>
    `;
  }).join('');
}

function filterRawTable(searchQuery) {
  if (!searchQuery) {
    renderRawTable(state.rawTableData);
    return;
  }
  const q = searchQuery.toLowerCase();
  const filtered = state.rawTableData.filter(row => {
    return Object.values(row).some(v => String(v).toLowerCase().includes(q));
  });
  renderRawTable(filtered);
}

// ====================================================================
// PAGE: ASK THE DATABASE (SQL CONSOLE)
// ====================================================================
const PRESET_QUERIES = {
  1: `-- 1. Farmers under each supplier\nSELECT s.name AS supplier_name, s.country, f.name AS farmer_name, f.village, CASE WHEN f.deforestation_free = 1 THEN 'Yes' ELSE 'No' END AS deforestation_free FROM suppliers s JOIN farmers f ON s.supplier_id = f.supplier_id ORDER BY s.name;`,
  2: `-- 2. Kg per farmer\nSELECT f.name AS farmer_name, f.village, s.name AS supplier_name, COUNT(b.batch_id) AS total_batches, COALESCE(SUM(b.quantity_kg), 0.0) AS total_kg_harvested FROM farmers f JOIN suppliers s ON f.supplier_id = s.supplier_id LEFT JOIN batches b ON f.farmer_id = b.farmer_id GROUP BY f.farmer_id, f.name, f.village, s.name ORDER BY total_kg_harvested DESC;`,
  3: `-- 3. What is inside each warehouse?\nSELECT w.name AS warehouse_name, w.city, b.batch_code, p.name AS product, m.quantity_kg, f.name AS farmer_name, m.moved_date FROM warehouses w JOIN movements m ON w.warehouse_id = m.warehouse_id JOIN batches b ON m.batch_id = b.batch_id JOIN products p ON b.product_id = p.product_id JOIN farmers f ON b.farmer_id = f.farmer_id ORDER BY w.name;`,
  4: `-- 4. What is inside each shipment?\nSELECT s.shipment_code, s.destination, s.status, b.batch_code, p.name AS product, m.quantity_kg, f.name AS farmer_name, sup.name AS supplier_name FROM shipments s JOIN movements m ON s.shipment_id = m.shipment_id JOIN batches b ON m.batch_id = b.batch_id JOIN products p ON b.product_id = p.product_id JOIN farmers f ON b.farmer_id = f.farmer_id JOIN suppliers sup ON f.supplier_id = sup.supplier_id ORDER BY s.shipment_code;`,
  5: `-- 5. Full trace of a shipment (JOIN across 5 tables)\nSELECT s.shipment_code, s.destination, s.status, m.quantity_kg AS shipment_kg, b.batch_code, p.name AS product, f.name AS farmer_name, f.village, sup.name AS supplier_name, sup.country AS supplier_country FROM shipments s JOIN movements m ON s.shipment_id = m.shipment_id JOIN batches b ON m.batch_id = b.batch_id JOIN products p ON b.product_id = p.product_id JOIN farmers f ON b.farmer_id = f.farmer_id JOIN suppliers sup ON f.supplier_id = sup.supplier_id WHERE s.shipment_code = 'SHP-0001' ORDER BY m.moved_date;`,
  6: `-- 6. Total kg per product\nSELECT p.name AS product_name, COUNT(b.batch_id) AS batch_count, COALESCE(SUM(b.quantity_kg), 0.0) AS total_kg FROM products p LEFT JOIN batches b ON p.product_id = b.product_id GROUP BY p.product_id, p.name ORDER BY total_kg DESC;`
};

function runPresetQuery(id) {
  const query = PRESET_QUERIES[id];
  if (!query) return;
  const input = document.getElementById('sql-console-input');
  if (input) input.value = query;
  executeCustomSQL();
}

async function executeCustomSQL() {
  const input = document.getElementById('sql-console-input');
  const thead = document.getElementById('sql-result-thead');
  const tbody = document.getElementById('sql-result-tbody');
  const timing = document.getElementById('sql-query-timing');
  if (!input || !thead || !tbody) return;

  const sql = input.value.trim();
  if (!sql) return;

  tbody.innerHTML = '<tr><td class="p-4 text-center text-slate-400">Running query...</td></tr>';
  const start = performance.now();

  const { ok, data } = await fetchJSON('/api/sql', {
    method: 'POST',
    body: JSON.stringify({ sql })
  });

  const duration = Math.round(performance.now() - start);
  if (timing) timing.textContent = `Query time: ${duration} ms (${data.row_count ?? 0} rows)`;

  if (!ok) {
    thead.innerHTML = '<tr><th class="p-3 text-rose-500">Query Error</th></tr>';
    tbody.innerHTML = `<tr><td class="p-4 text-rose-600 font-mono text-xs">${data.message}</td></tr>`;
    return;
  }

  const columns = data.columns || [];
  const rows = data.data || [];

  if (columns.length === 0) {
    thead.innerHTML = '<tr><th class="p-3 text-slate-400">No output columns</th></tr>';
    tbody.innerHTML = '<tr><td class="p-4 text-center text-slate-400">0 rows returned.</td></tr>';
    return;
  }

  thead.innerHTML = `<tr>${columns.map(c => `<th class="p-3 whitespace-nowrap">${c}</th>`).join('')}</tr>`;

  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${columns.length}" class="p-4 text-center text-slate-400">Query succeeded, 0 rows returned.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(r => `
    <tr class="hover:bg-slate-50">
      ${columns.map(c => `<td class="p-3 whitespace-nowrap">${r[c] !== null ? r[c] : 'NULL'}</td>`).join('')}
    </tr>
  `).join('');
}

// ====================================================================
// PAGE: CHANGE HISTORY
// ====================================================================
async function loadChangeHistory() {
  const tbody = document.getElementById('change-history-tbody');
  if (!tbody) return;

  const { ok, data } = await fetchJSON('/api/changes?limit=100');
  if (!ok) return;

  const logs = data.data || [];
  if (logs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-slate-400">No changes logged.</td></tr>';
    return;
  }

  tbody.innerHTML = logs.map(l => {
    let actionBadge = 'bg-slate-100 text-slate-700';
    if (l.action === 'INSERT') actionBadge = 'bg-emerald-100 text-emerald-800';
    if (l.action === 'UPDATE') actionBadge = 'bg-blue-100 text-blue-800';
    if (l.action === 'DELETE') actionBadge = 'bg-rose-100 text-rose-800';

    return `
      <tr class="hover:bg-slate-50">
        <td class="p-3 font-mono text-slate-500">${l.log_id}</td>
        <td class="p-3 font-mono font-bold text-slate-900">${l.table_name}</td>
        <td class="p-3"><span class="px-2 py-0.5 rounded text-[10px] font-bold ${actionBadge}">${l.action}</span></td>
        <td class="p-3 text-slate-800 font-medium">${l.summary}</td>
        <td class="p-3 font-mono text-[10px] text-slate-400">${l.changed_at}</td>
      </tr>
    `;
  }).join('');
}

// ====================================================================
// RESET DEMO DATA
// ====================================================================
async function resetDemoData() {
  const confirmed = await showConfirmDialog("Reset Database", "Reset database to clean initial state? All test edits will be replaced with original demo records.");
  if (!confirmed) return;

  const { ok, data } = await fetchJSON('/api/reset', { method: 'POST' });
  if (ok) {
    showToast(data.message, 'success');
    await refreshAllData();
  } else {
    showToast(data.message, 'error');
  }
}
