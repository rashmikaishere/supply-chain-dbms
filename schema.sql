-- ====================================================================
-- Supply Chain DBMS: Simplified 3NF Relational Architecture
-- 6 Core Tables + 1 Change Log Table + 2 Views
-- ====================================================================

PRAGMA foreign_keys = ON;

-- --------------------------------------------------------------------
-- 1. SUPPLIERS
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS suppliers (
    supplier_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    country TEXT,
    phone TEXT
);

-- --------------------------------------------------------------------
-- 2. FARMERS
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS farmers (
    farmer_id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(supplier_id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    village TEXT,
    deforestation_free INTEGER NOT NULL DEFAULT 1 CHECK(deforestation_free IN (0, 1))
);

-- --------------------------------------------------------------------
-- 3. PRODUCTS
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
    product_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
);

-- --------------------------------------------------------------------
-- 4. BATCHES
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS batches (
    batch_id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_code TEXT NOT NULL UNIQUE,
    farmer_id INTEGER NOT NULL REFERENCES farmers(farmer_id) ON DELETE RESTRICT,
    product_id INTEGER NOT NULL REFERENCES products(product_id) ON DELETE RESTRICT,
    quantity_kg REAL NOT NULL CHECK(quantity_kg > 0),
    harvest_date DATE NOT NULL
);

-- --------------------------------------------------------------------
-- 5. WAREHOUSES
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS warehouses (
    warehouse_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    city TEXT
);

-- --------------------------------------------------------------------
-- 6. SHIPMENTS
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shipments (
    shipment_id INTEGER PRIMARY KEY AUTOINCREMENT,
    shipment_code TEXT NOT NULL UNIQUE,
    destination TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Preparing' CHECK(status IN ('Preparing', 'In Transit', 'Delivered'))
);

-- --------------------------------------------------------------------
-- 7. MOVEMENTS
-- Exactly one of warehouse_id or shipment_id must be NOT NULL
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS movements (
    movement_id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id INTEGER NOT NULL REFERENCES batches(batch_id) ON DELETE RESTRICT,
    quantity_kg REAL NOT NULL CHECK(quantity_kg > 0),
    warehouse_id INTEGER REFERENCES warehouses(warehouse_id) ON DELETE RESTRICT,
    shipment_id INTEGER REFERENCES shipments(shipment_id) ON DELETE RESTRICT,
    moved_date DATE NOT NULL,
    CHECK (
        (warehouse_id IS NOT NULL AND shipment_id IS NULL) OR
        (warehouse_id IS NULL AND shipment_id IS NOT NULL)
    )
);

-- --------------------------------------------------------------------
-- 8. CHANGE LOG
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS change_log (
    log_id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name TEXT NOT NULL,
    action TEXT NOT NULL CHECK(action IN ('INSERT', 'UPDATE', 'DELETE')),
    summary TEXT NOT NULL,
    row_data TEXT,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- --------------------------------------------------------------------
-- INDEXES ON EVERY FOREIGN KEY
-- --------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_farmers_supplier ON farmers(supplier_id);
CREATE INDEX IF NOT EXISTS idx_batches_farmer ON batches(farmer_id);
CREATE INDEX IF NOT EXISTS idx_batches_product ON batches(product_id);
CREATE INDEX IF NOT EXISTS idx_movements_batch ON movements(batch_id);
CREATE INDEX IF NOT EXISTS idx_movements_warehouse ON movements(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_movements_shipment ON movements(shipment_id);

-- --------------------------------------------------------------------
-- VIEWS
-- --------------------------------------------------------------------
DROP VIEW IF EXISTS v_batch_balance;
CREATE VIEW v_batch_balance AS
SELECT 
    b.batch_id,
    b.batch_code,
    b.quantity_kg AS total_kg,
    COALESCE(SUM(m.quantity_kg), 0.0) AS sent_kg,
    ROUND(b.quantity_kg - COALESCE(SUM(m.quantity_kg), 0.0), 2) AS remaining_kg
FROM batches b
LEFT JOIN movements m ON b.batch_id = m.batch_id
GROUP BY b.batch_id, b.batch_code, b.quantity_kg;

DROP VIEW IF EXISTS v_trace;
CREATE VIEW v_trace AS
SELECT 
    s.shipment_code,
    w.name AS warehouse_name,
    b.batch_code,
    p.name AS product,
    m.quantity_kg,
    m.moved_date,
    f.name AS farmer_name,
    f.village,
    f.deforestation_free,
    sup.name AS supplier_name,
    sup.country AS supplier_country
FROM movements m
JOIN batches b ON m.batch_id = b.batch_id
JOIN products p ON b.product_id = p.product_id
JOIN farmers f ON b.farmer_id = f.farmer_id
JOIN suppliers sup ON f.supplier_id = sup.supplier_id
LEFT JOIN warehouses w ON m.warehouse_id = w.warehouse_id
LEFT JOIN shipments s ON m.shipment_id = s.shipment_id;
