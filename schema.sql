-- ====================================================================
-- EUDR TraceChain: Database Schema
-- Regulation (EU) 2023/1115 as amended by (EU) 2025/2650
-- 3rd Normal Form (3NF) Relational Architecture for SQLite
-- ====================================================================

PRAGMA foreign_keys = ON;

-- --------------------------------------------------------------------
-- 1. COUNTRIES
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS countries (
    country_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    iso_code TEXT NOT NULL UNIQUE CHECK(length(iso_code) = 2),
    risk_level TEXT NOT NULL DEFAULT 'Standard' CHECK(risk_level IN ('Low', 'Standard', 'High'))
);

-- --------------------------------------------------------------------
-- 2. COMMODITIES & DERIVED PRODUCTS
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS commodities (
    commodity_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    cn_hs_code TEXT NOT NULL,
    is_derived INTEGER NOT NULL DEFAULT 0 CHECK(is_derived IN (0, 1)),
    parent_commodity_id INTEGER REFERENCES commodities(commodity_id) ON DELETE SET NULL
);

-- --------------------------------------------------------------------
-- 3. ORGANIZATIONS (Supply Chain Actors)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organizations (
    org_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    country_id INTEGER NOT NULL REFERENCES countries(country_id) ON DELETE RESTRICT,
    org_type TEXT NOT NULL CHECK(org_type IN ('Farmer', 'Cooperative', 'Collector', 'Processor', 'Trader', 'Exporter', 'Importer-Operator')),
    eori_number TEXT UNIQUE,
    address TEXT NOT NULL,
    is_sme INTEGER NOT NULL DEFAULT 1 CHECK(is_sme IN (0, 1))
);

-- --------------------------------------------------------------------
-- 4. USERS & ROLES
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id INTEGER REFERENCES organizations(org_id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('Admin', 'Operator', 'Auditor')),
    email TEXT NOT NULL UNIQUE
);

-- --------------------------------------------------------------------
-- 5. PRODUCTION PLOTS (Land Parcels)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plots (
    plot_id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_org_id INTEGER NOT NULL REFERENCES organizations(org_id) ON DELETE RESTRICT,
    country_id INTEGER NOT NULL REFERENCES countries(country_id) ON DELETE RESTRICT,
    commodity_id INTEGER NOT NULL REFERENCES commodities(commodity_id) ON DELETE RESTRICT,
    area_hectares REAL NOT NULL CHECK(area_hectares > 0),
    geo_type TEXT NOT NULL CHECK(geo_type IN ('POINT', 'POLYGON')),
    latitude REAL NOT NULL CHECK(latitude BETWEEN -90.0 AND 90.0),
    longitude REAL NOT NULL CHECK(longitude BETWEEN -180.0 AND 180.0),
    region_name TEXT NOT NULL
);

-- --------------------------------------------------------------------
-- 6. PLOT POLYGON VERTICES (For Plots > 4 Hectares)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plot_polygon_points (
    point_id INTEGER PRIMARY KEY AUTOINCREMENT,
    plot_id INTEGER NOT NULL REFERENCES plots(plot_id) ON DELETE CASCADE,
    seq_no INTEGER NOT NULL CHECK(seq_no >= 1),
    latitude REAL NOT NULL CHECK(latitude BETWEEN -90.0 AND 90.0),
    longitude REAL NOT NULL CHECK(longitude BETWEEN -180.0 AND 180.0),
    UNIQUE(plot_id, seq_no)
);

-- --------------------------------------------------------------------
-- 7. PLOT PRODUCTION RECORDS (Harvests & Deforestation Checks)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plot_production_records (
    record_id INTEGER PRIMARY KEY AUTOINCREMENT,
    plot_id INTEGER NOT NULL REFERENCES plots(plot_id) ON DELETE CASCADE,
    production_start DATE NOT NULL,
    production_end DATE NOT NULL CHECK(production_end >= production_start),
    harvest_year INTEGER NOT NULL CHECK(harvest_year >= 2015),
    deforestation_free INTEGER NOT NULL DEFAULT 1 CHECK(deforestation_free IN (0, 1)),
    satellite_check_date DATE,
    remarks TEXT
);

-- --------------------------------------------------------------------
-- 8. LEGALITY DOCUMENTS (Land tenure, labour, tax, permits)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS legality_documents (
    doc_id INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id INTEGER REFERENCES organizations(org_id) ON DELETE CASCADE,
    plot_id INTEGER REFERENCES plots(plot_id) ON DELETE CASCADE,
    doc_type TEXT NOT NULL CHECK(doc_type IN ('Land Title', 'Environmental Permit', 'Tax Certificate', 'Labour Compliance', 'Customs Clearance', 'Harvest License')),
    issued_by TEXT NOT NULL,
    valid_from DATE NOT NULL,
    valid_to DATE NOT NULL CHECK(valid_to >= valid_from),
    file_reference TEXT NOT NULL,
    verified INTEGER NOT NULL DEFAULT 0 CHECK(verified IN (0, 1)),
    CHECK(org_id IS NOT NULL OR plot_id IS NOT NULL)
);

-- --------------------------------------------------------------------
-- 9. BATCHES (Commodity Batches)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS batches (
    batch_id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_code TEXT NOT NULL UNIQUE,
    commodity_id INTEGER NOT NULL REFERENCES commodities(commodity_id) ON DELETE RESTRICT,
    quantity_kg REAL NOT NULL CHECK(quantity_kg > 0),
    created_by_org_id INTEGER NOT NULL REFERENCES organizations(org_id) ON DELETE RESTRICT,
    created_date DATE NOT NULL,
    batch_type TEXT NOT NULL CHECK(batch_type IN ('RAW', 'PROCESSED', 'MIXED')),
    compliance_status TEXT NOT NULL DEFAULT 'Pending' CHECK(compliance_status IN ('Pending', 'Compliant', 'Non-Compliant'))
);

-- --------------------------------------------------------------------
-- 10. BATCH PLOT SOURCES (M:N Raw Batches -> Origin Plots)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS batch_plot_sources (
    batch_id INTEGER NOT NULL REFERENCES batches(batch_id) ON DELETE CASCADE,
    plot_id INTEGER NOT NULL REFERENCES plots(plot_id) ON DELETE RESTRICT,
    quantity_kg REAL NOT NULL CHECK(quantity_kg > 0),
    PRIMARY KEY(batch_id, plot_id)
);

-- --------------------------------------------------------------------
-- 11. BATCH LINEAGE (M:N Self-Relation: Processing & Mixing)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS batch_lineage (
    parent_batch_id INTEGER NOT NULL REFERENCES batches(batch_id) ON DELETE RESTRICT,
    child_batch_id INTEGER NOT NULL REFERENCES batches(batch_id) ON DELETE CASCADE,
    quantity_kg REAL NOT NULL CHECK(quantity_kg > 0),
    PRIMARY KEY(parent_batch_id, child_batch_id),
    CHECK(parent_batch_id != child_batch_id)
);

-- --------------------------------------------------------------------
-- 12. TRANSACTIONS (Custody Transfers)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transactions (
    txn_id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id INTEGER NOT NULL REFERENCES batches(batch_id) ON DELETE RESTRICT,
    from_org_id INTEGER NOT NULL REFERENCES organizations(org_id) ON DELETE RESTRICT,
    to_org_id INTEGER NOT NULL REFERENCES organizations(org_id) ON DELETE RESTRICT,
    txn_date DATE NOT NULL,
    quantity_kg REAL NOT NULL CHECK(quantity_kg > 0),
    document_ref TEXT,
    CHECK(from_org_id != to_org_id)
);

-- --------------------------------------------------------------------
-- 13. SHIPMENTS (Logistics & Port Tracking)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shipments (
    shipment_id INTEGER PRIMARY KEY AUTOINCREMENT,
    txn_id INTEGER NOT NULL UNIQUE REFERENCES transactions(txn_id) ON DELETE CASCADE,
    transport_mode TEXT NOT NULL CHECK(transport_mode IN ('Maritime', 'Air', 'Road', 'Rail')),
    origin_port TEXT NOT NULL,
    destination_port TEXT NOT NULL,
    departure_date DATE NOT NULL,
    arrival_date DATE CHECK(arrival_date IS NULL OR arrival_date >= departure_date)
);

-- --------------------------------------------------------------------
-- 14. RISK ASSESSMENTS (3-Tier Risk Modeling)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS risk_assessments (
    assessment_id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id INTEGER NOT NULL REFERENCES batches(batch_id) ON DELETE CASCADE,
    assessed_by_user_id INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
    country_risk REAL NOT NULL CHECK(country_risk BETWEEN 0.0 AND 100.0),
    plot_risk REAL NOT NULL CHECK(plot_risk BETWEEN 0.0 AND 100.0),
    supplier_risk REAL NOT NULL CHECK(supplier_risk BETWEEN 0.0 AND 100.0),
    deforestation_risk REAL NOT NULL CHECK(deforestation_risk BETWEEN 0.0 AND 100.0),
    total_score REAL NOT NULL CHECK(total_score BETWEEN 0.0 AND 100.0),
    risk_result TEXT NOT NULL CHECK(risk_result IN ('Negligible', 'Non-negligible')),
    assessment_date DATE NOT NULL
);

-- --------------------------------------------------------------------
-- 15. MITIGATION ACTIONS
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mitigation_actions (
    action_id INTEGER PRIMARY KEY AUTOINCREMENT,
    assessment_id INTEGER NOT NULL REFERENCES risk_assessments(assessment_id) ON DELETE CASCADE,
    action_type TEXT NOT NULL CHECK(action_type IN ('On-Site Audit', 'Additional Documentation', 'Satellite Re-verification', 'Supplier Capacity Training', 'Supply Chain Segregation')),
    status TEXT NOT NULL DEFAULT 'Planned' CHECK(status IN ('Planned', 'In-Progress', 'Completed', 'Cancelled')),
    due_date DATE NOT NULL,
    completed_date DATE
);

-- --------------------------------------------------------------------
-- 16. DUE DILIGENCE STATEMENTS (DDS)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS due_diligence_statements (
    dds_id INTEGER PRIMARY KEY AUTOINCREMENT,
    dds_reference_number TEXT NOT NULL UNIQUE,
    operator_org_id INTEGER NOT NULL REFERENCES organizations(org_id) ON DELETE RESTRICT,
    submission_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'Draft' CHECK(status IN ('Draft', 'Submitted', 'Accepted', 'Rejected'))
);

-- --------------------------------------------------------------------
-- 17. DDS BATCHES (M:N Statements to Batches)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dds_batches (
    dds_id INTEGER NOT NULL REFERENCES due_diligence_statements(dds_id) ON DELETE CASCADE,
    batch_id INTEGER NOT NULL REFERENCES batches(batch_id) ON DELETE RESTRICT,
    PRIMARY KEY(dds_id, batch_id)
);

-- --------------------------------------------------------------------
-- 18. AUDIT LOG (Immutable Trigger-Driven Change Log)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
    log_id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name TEXT NOT NULL,
    record_id INTEGER NOT NULL,
    action TEXT NOT NULL CHECK(action IN ('INSERT', 'UPDATE', 'DELETE')),
    old_value TEXT,
    new_value TEXT,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    user_id INTEGER REFERENCES users(user_id) ON DELETE SET NULL
);

-- ====================================================================
-- INDEXES FOR FOREIGN KEYS & PERFORMANCE
-- ====================================================================
CREATE INDEX IF NOT EXISTS idx_org_country ON organizations(country_id);
CREATE INDEX IF NOT EXISTS idx_users_org ON users(org_id);
CREATE INDEX IF NOT EXISTS idx_plots_owner ON plots(owner_org_id);
CREATE INDEX IF NOT EXISTS idx_plots_country ON plots(country_id);
CREATE INDEX IF NOT EXISTS idx_plots_commodity ON plots(commodity_id);
CREATE INDEX IF NOT EXISTS idx_plot_poly_plot ON plot_polygon_points(plot_id);
CREATE INDEX IF NOT EXISTS idx_prod_plot ON plot_production_records(plot_id);
CREATE INDEX IF NOT EXISTS idx_docs_org ON legality_documents(org_id);
CREATE INDEX IF NOT EXISTS idx_docs_plot ON legality_documents(plot_id);
CREATE INDEX IF NOT EXISTS idx_batches_code ON batches(batch_code);
CREATE INDEX IF NOT EXISTS idx_batches_commodity ON batches(commodity_id);
CREATE INDEX IF NOT EXISTS idx_batches_org ON batches(created_by_org_id);
CREATE INDEX IF NOT EXISTS idx_batch_sources_batch ON batch_plot_sources(batch_id);
CREATE INDEX IF NOT EXISTS idx_batch_sources_plot ON batch_plot_sources(plot_id);
CREATE INDEX IF NOT EXISTS idx_lineage_parent ON batch_lineage(parent_batch_id);
CREATE INDEX IF NOT EXISTS idx_lineage_child ON batch_lineage(child_batch_id);
CREATE INDEX IF NOT EXISTS idx_txns_batch ON transactions(batch_id);
CREATE INDEX IF NOT EXISTS idx_txns_from ON transactions(from_org_id);
CREATE INDEX IF NOT EXISTS idx_txns_to ON transactions(to_org_id);
CREATE INDEX IF NOT EXISTS idx_shipments_txn ON shipments(txn_id);
CREATE INDEX IF NOT EXISTS idx_risk_batch ON risk_assessments(batch_id);
CREATE INDEX IF NOT EXISTS idx_mitigation_assessment ON mitigation_actions(assessment_id);
CREATE INDEX IF NOT EXISTS idx_dds_ref ON due_diligence_statements(dds_reference_number);
CREATE INDEX IF NOT EXISTS idx_dds_operator ON due_diligence_statements(operator_org_id);
CREATE INDEX IF NOT EXISTS idx_dds_batches_dds ON dds_batches(dds_id);
CREATE INDEX IF NOT EXISTS idx_dds_batches_batch ON dds_batches(batch_id);
CREATE INDEX IF NOT EXISTS idx_audit_table ON audit_log(table_name, record_id);

-- ====================================================================
-- VIEWS
-- ====================================================================

-- 1. Batch Origin Trace View (Resolves root farm plots for raw or direct batches)
CREATE VIEW IF NOT EXISTS v_batch_origin_trace AS
SELECT 
    b.batch_id,
    b.batch_code,
    b.commodity_id,
    c.name AS commodity_name,
    b.quantity_kg AS batch_quantity_kg,
    b.compliance_status,
    p.plot_id,
    p.region_name,
    p.area_hectares,
    p.geo_type,
    p.latitude,
    p.longitude,
    o.name AS plot_owner_name,
    cntry.name AS country_name,
    cntry.risk_level AS country_risk_level,
    bps.quantity_kg AS plot_contribution_kg,
    ppr.deforestation_free,
    ppr.production_start,
    ppr.production_end
FROM batches b
JOIN commodities c ON b.commodity_id = c.commodity_id
LEFT JOIN batch_plot_sources bps ON b.batch_id = bps.batch_id
LEFT JOIN plots p ON bps.plot_id = p.plot_id
LEFT JOIN organizations o ON p.owner_org_id = o.org_id
LEFT JOIN countries cntry ON p.country_id = cntry.country_id
LEFT JOIN plot_production_records ppr ON p.plot_id = ppr.plot_id;

-- 2. Compliance Summary View
CREATE VIEW IF NOT EXISTS v_compliance_summary AS
SELECT 
    c.name AS commodity_name,
    COUNT(b.batch_id) AS total_batches,
    SUM(CASE WHEN b.compliance_status = 'Compliant' THEN 1 ELSE 0 END) AS compliant_batches,
    SUM(CASE WHEN b.compliance_status = 'Non-Compliant' THEN 1 ELSE 0 END) AS non_compliant_batches,
    SUM(CASE WHEN b.compliance_status = 'Pending' THEN 1 ELSE 0 END) AS pending_batches,
    ROUND(SUM(CASE WHEN b.compliance_status = 'Compliant' THEN b.quantity_kg ELSE 0 END), 2) AS compliant_volume_kg,
    ROUND(SUM(b.quantity_kg), 2) AS total_volume_kg
FROM commodities c
LEFT JOIN batches b ON c.commodity_id = b.commodity_id
GROUP BY c.commodity_id, c.name;

-- 3. High Risk Suppliers View
CREATE VIEW IF NOT EXISTS v_high_risk_suppliers AS
SELECT 
    o.org_id,
    o.name AS organization_name,
    o.org_type,
    cntry.name AS country_name,
    cntry.risk_level AS country_risk_level,
    COUNT(DISTINCT p.plot_id) AS total_plots,
    SUM(CASE WHEN ppr.deforestation_free = 0 THEN 1 ELSE 0 END) AS deforested_plots_count,
    COUNT(DISTINCT ld.doc_id) AS verified_documents_count
FROM organizations o
JOIN countries cntry ON o.country_id = cntry.country_id
LEFT JOIN plots p ON o.org_id = p.owner_org_id
LEFT JOIN plot_production_records ppr ON p.plot_id = ppr.plot_id
LEFT JOIN legality_documents ld ON o.org_id = ld.org_id AND ld.verified = 1
WHERE cntry.risk_level = 'High' OR ppr.deforestation_free = 0
GROUP BY o.org_id, o.name, o.org_type, cntry.name, cntry.risk_level;

-- 4. DDS Ready Batches View
CREATE VIEW IF NOT EXISTS v_dds_ready_batches AS
SELECT 
    b.batch_id,
    b.batch_code,
    c.name AS commodity_name,
    b.quantity_kg,
    o.name AS operator_name,
    b.compliance_status,
    ra.risk_result,
    ra.total_score AS risk_score
FROM batches b
JOIN commodities c ON b.commodity_id = c.commodity_id
JOIN organizations o ON b.created_by_org_id = o.org_id
JOIN risk_assessments ra ON b.batch_id = ra.batch_id
WHERE b.compliance_status = 'Compliant'
  AND (ra.risk_result = 'Negligible' OR NOT EXISTS (
      SELECT 1 FROM mitigation_actions ma 
      WHERE ma.assessment_id = ra.assessment_id AND ma.status != 'Completed'
  ))
  AND b.batch_id NOT IN (
      SELECT db.batch_id FROM dds_batches db
      JOIN due_diligence_statements dds ON db.dds_id = dds.dds_id
      WHERE dds.status IN ('Submitted', 'Accepted')
  );

-- ====================================================================
-- TRIGGERS
-- ====================================================================

-- A. AUDIT TRIGGERS FOR BATCHES
CREATE TRIGGER IF NOT EXISTS trg_audit_batches_insert
AFTER INSERT ON batches
BEGIN
    INSERT INTO audit_log (table_name, record_id, action, old_value, new_value)
    VALUES (
        'batches', 
        NEW.batch_id, 
        'INSERT', 
        NULL, 
        json_object('batch_code', NEW.batch_code, 'commodity_id', NEW.commodity_id, 'quantity_kg', NEW.quantity_kg, 'type', NEW.batch_type, 'status', NEW.compliance_status)
    );
END;

CREATE TRIGGER IF NOT EXISTS trg_audit_batches_update
AFTER UPDATE ON batches
BEGIN
    INSERT INTO audit_log (table_name, record_id, action, old_value, new_value)
    VALUES (
        'batches', 
        NEW.batch_id, 
        'UPDATE', 
        json_object('batch_code', OLD.batch_code, 'quantity_kg', OLD.quantity_kg, 'type', OLD.batch_type, 'status', OLD.compliance_status),
        json_object('batch_code', NEW.batch_code, 'quantity_kg', NEW.quantity_kg, 'type', NEW.batch_type, 'status', NEW.compliance_status)
    );
END;

CREATE TRIGGER IF NOT EXISTS trg_audit_batches_delete
AFTER DELETE ON batches
BEGIN
    INSERT INTO audit_log (table_name, record_id, action, old_value, new_value)
    VALUES (
        'batches', 
        OLD.batch_id, 
        'DELETE', 
        json_object('batch_code', OLD.batch_code, 'quantity_kg', OLD.quantity_kg, 'type', OLD.batch_type, 'status', OLD.compliance_status), 
        NULL
    );
END;

-- B. AUDIT TRIGGERS FOR PLOTS
CREATE TRIGGER IF NOT EXISTS trg_audit_plots_insert
AFTER INSERT ON plots
BEGIN
    INSERT INTO audit_log (table_name, record_id, action, old_value, new_value)
    VALUES (
        'plots', 
        NEW.plot_id, 
        'INSERT', 
        NULL, 
        json_object('region_name', NEW.region_name, 'area_hectares', NEW.area_hectares, 'geo_type', NEW.geo_type, 'lat', NEW.latitude, 'lon', NEW.longitude)
    );
END;

CREATE TRIGGER IF NOT EXISTS trg_audit_plots_update
AFTER UPDATE ON plots
BEGIN
    INSERT INTO audit_log (table_name, record_id, action, old_value, new_value)
    VALUES (
        'plots', 
        NEW.plot_id, 
        'UPDATE', 
        json_object('region_name', OLD.region_name, 'area_hectares', OLD.area_hectares, 'geo_type', OLD.geo_type, 'lat', OLD.latitude, 'lon', OLD.longitude),
        json_object('region_name', NEW.region_name, 'area_hectares', NEW.area_hectares, 'geo_type', NEW.geo_type, 'lat', NEW.latitude, 'lon', NEW.longitude)
    );
END;

CREATE TRIGGER IF NOT EXISTS trg_audit_plots_delete
AFTER DELETE ON plots
BEGIN
    INSERT INTO audit_log (table_name, record_id, action, old_value, new_value)
    VALUES (
        'plots', 
        OLD.plot_id, 
        'DELETE', 
        json_object('region_name', OLD.region_name, 'area_hectares', OLD.area_hectares, 'geo_type', OLD.geo_type), 
        NULL
    );
END;

-- C. AUDIT TRIGGERS FOR DDS
CREATE TRIGGER IF NOT EXISTS trg_audit_dds_insert
AFTER INSERT ON due_diligence_statements
BEGIN
    INSERT INTO audit_log (table_name, record_id, action, old_value, new_value)
    VALUES (
        'due_diligence_statements', 
        NEW.dds_id, 
        'INSERT', 
        NULL, 
        json_object('dds_reference_number', NEW.dds_reference_number, 'operator_org_id', NEW.operator_org_id, 'status', NEW.status)
    );
END;

CREATE TRIGGER IF NOT EXISTS trg_audit_dds_update
AFTER UPDATE ON due_diligence_statements
BEGIN
    INSERT INTO audit_log (table_name, record_id, action, old_value, new_value)
    VALUES (
        'due_diligence_statements', 
        NEW.dds_id, 
        'UPDATE', 
        json_object('dds_reference_number', OLD.dds_reference_number, 'status', OLD.status),
        json_object('dds_reference_number', NEW.dds_reference_number, 'status', NEW.status)
    );
END;

-- D. EUDR COMPLIANCE VALIDATION TRIGGER
-- Blocks promoting batch to 'Compliant' if:
-- 1. Any linked plot is flagged deforestation_free = 0
-- 2. Any linked plot has production on deforested land or missing verification
-- 3. Any linked plot has NO verified legality document
CREATE TRIGGER IF NOT EXISTS trg_validate_batch_compliance_promotion
BEFORE UPDATE OF compliance_status ON batches
WHEN NEW.compliance_status = 'Compliant'
BEGIN
    -- Check 1: Deforestation status on source plots
    SELECT CASE
        WHEN EXISTS (
            SELECT 1 FROM batch_plot_sources bps
            JOIN plot_production_records ppr ON bps.plot_id = ppr.plot_id
            WHERE bps.batch_id = NEW.batch_id AND ppr.deforestation_free = 0
        )
        THEN RAISE(ABORT, 'EUDR Violation: Cannot set Compliant. Source plot is flagged for deforestation after 31 Dec 2020 cut-off date.')
    END;

    -- Check 2: Plot legality document verification
    SELECT CASE
        WHEN EXISTS (
            SELECT 1 FROM batch_plot_sources bps
            WHERE bps.batch_id = NEW.batch_id
              AND NOT EXISTS (
                  SELECT 1 FROM legality_documents ld
                  WHERE (ld.plot_id = bps.plot_id OR ld.org_id = (SELECT owner_org_id FROM plots WHERE plot_id = bps.plot_id))
                    AND ld.verified = 1
              )
        )
        THEN RAISE(ABORT, 'EUDR Violation: Cannot set Compliant. One or more source plots lack verified legality documentation.')
    END;
END;

-- E. PREVENT MIXING NON-COMPLIANT PARENTS INTO CLEAN BATCHES
CREATE TRIGGER IF NOT EXISTS trg_prevent_mixed_non_compliant_parent
BEFORE INSERT ON batch_lineage
BEGIN
    SELECT CASE
        WHEN (SELECT compliance_status FROM batches WHERE batch_id = NEW.parent_batch_id) = 'Non-Compliant'
        THEN RAISE(ABORT, 'EUDR Traceability Violation: Cannot link or blend Non-Compliant parent batch into child batch. Mixing non-compliant inputs is prohibited.')
    END;
END;

-- F. VALIDATE POLYGON REQUIREMENT FOR PLOTS > 4 HECTARES
CREATE TRIGGER IF NOT EXISTS trg_validate_plot_polygon_req_insert
BEFORE INSERT ON plots
WHEN NEW.area_hectares > 4.0 AND NEW.geo_type != 'POLYGON'
BEGIN
    SELECT RAISE(ABORT, 'EUDR Regulation Art. 9: Plots exceeding 4.0 hectares MUST be registered with POLYGON geolocation, not POINT.');
END;

CREATE TRIGGER IF NOT EXISTS trg_validate_plot_polygon_req_update
BEFORE UPDATE OF area_hectares, geo_type ON plots
WHEN NEW.area_hectares > 4.0 AND NEW.geo_type != 'POLYGON'
BEGIN
    SELECT RAISE(ABORT, 'EUDR Regulation Art. 9: Plots exceeding 4.0 hectares MUST be registered with POLYGON geolocation, not POINT.');
END;
