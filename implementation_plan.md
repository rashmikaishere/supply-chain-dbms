# EUDR TraceChain: Implementation Plan & Architecture Specification

## 1. Project Overview
"EUDR TraceChain" is a compliance and supply chain traceability system modeling the European Union Deforestation Regulation (EUDR - Regulation (EU) 2023/1115, as amended by (EU) 2025/2650). It is engineered to demonstrate rigorous database design (3NF, strict constraints, foreign keys, views, triggers, recursive CTE lineage) through a paid-grade enterprise SaaS interface.

---

## 2. Database Schema Design (3NF & Relational Integrity)

### 18 Core Tables
1. `countries` (country_id, name, iso_code, risk_level [Low/Standard/High])
2. `commodities` (commodity_id, name, cn_hs_code, is_derived, parent_commodity_id)
3. `organizations` (org_id, name, country_id, org_type [Farmer/Cooperative/Collector/Processor/Trader/Exporter/Importer-Operator], eori_number, address, is_sme)
4. `users` (user_id, org_id, name, role [Admin/Operator/Auditor], email)
5. `plots` (plot_id, owner_org_id, country_id, commodity_id, area_hectares, geo_type [POINT/POLYGON], latitude, longitude, region_name)
6. `plot_polygon_points` (point_id, plot_id, seq_no, latitude, longitude)
7. `plot_production_records` (record_id, plot_id, production_start, production_end, harvest_year, deforestation_free, satellite_check_date, remarks)
8. `legality_documents` (doc_id, org_id, plot_id, doc_type, issued_by, valid_from, valid_to, file_reference, verified)
9. `batches` (batch_id, batch_code, commodity_id, quantity_kg, created_by_org_id, created_date, batch_type [RAW/PROCESSED/MIXED], compliance_status [Pending/Compliant/Non-Compliant])
10. `batch_plot_sources` (batch_id, plot_id, quantity_kg)
11. `batch_lineage` (parent_batch_id, child_batch_id, quantity_kg)
12. `transactions` (txn_id, batch_id, from_org_id, to_org_id, txn_date, quantity_kg, document_ref)
13. `shipments` (shipment_id, txn_id, transport_mode, origin_port, destination_port, departure_date, arrival_date)
14. `risk_assessments` (assessment_id, batch_id, assessed_by_user_id, country_risk, plot_risk, supplier_risk, deforestation_risk, total_score, risk_result [Negligible/Non-negligible], assessment_date)
15. `mitigation_actions` (action_id, assessment_id, action_type, status, due_date, completed_date)
16. `due_diligence_statements` (dds_id, dds_reference_number, operator_org_id, submission_date, status [Draft/Submitted/Accepted/Rejected])
17. `dds_batches` (dds_id, batch_id)
18. `audit_log` (log_id, table_name, record_id, action [INSERT/UPDATE/DELETE], old_value, new_value, changed_at, user_id)

### Views & Triggers
- **Views**: `v_batch_origin_trace`, `v_compliance_summary`, `v_high_risk_suppliers`, `v_dds_ready_batches`
- **Triggers**:
  - `trg_audit_batches_insert`, `trg_audit_batches_update`, `trg_audit_batches_delete`
  - `trg_audit_plots_insert`, `trg_audit_plots_update`, `trg_audit_plots_delete`
  - `trg_audit_dds_insert`, `trg_audit_dds_update`
  - `trg_block_non_compliant_batch_promotion`: Enforces EUDR cut-off date (2020-12-31), verified legality documents, and deforestation-free verification before marking batches `Compliant`.
  - `trg_prevent_mixed_non_compliant_parent`: Prohibits mixing clean batches with Non-Compliant parent batches.
  - `trg_validate_polygon_area`: Ensures plots > 4 ha declare POLYGON geo_type.

---

## 3. UI/UX & Application Architecture
- **Tech Stack**: Python Flask backend with raw SQLite queries (`PRAGMA foreign_keys = ON`), Tailwind CSS, Inter & JetBrains Mono fonts, Lucide icons, Leaflet.js maps, Chart.js analytics, CodeMirror SQL editor, Mermaid.js ER diagram generator.
- **Frontend Pages**:
  1. `/` - Landing Page with interactive SVG supply chain pipeline, EUDR timeline, feature breakdown.
  2. `/app` - Enterprise compliance console with sidebar navigation:
     - **Dashboard**: KPI metrics, risk radar/heatmaps, timeline warnings.
     - **Plots & Geospatial**: Interactive map with point/polygon drawing, compliance overlays, satellite checks.
     - **Supply Chain & Batches**: Batch creator, multi-tier lineage tracker, forward/backward recursive trace graph, printable certificate.
     - **Risk & Due Diligence**: 3-step diligence workflow, scoring engine, mitigation action tracker, EU portal-compatible DDS generator.
     - **Master Data**: Organization, commodity, legality doc management with schema constraints feedback.
     - **Database Explorer**: Live ER diagram, table viewer with PK/FK links, live SQL console with EXPLAIN QUERY PLAN, views/triggers browser, audit log timeline, 3NF documentation.
     - **Live Activity Drawer ("Under the Hood")**: Real-time SQL inspector showing executed queries, parameters, trigger activations, and runtime latency.

---

## 4. Execution Steps
1. Create `requirements.txt` (Flask, etc.).
2. Build `schema.sql` with all 18 tables, foreign keys, check constraints, views, indexes, and triggers.
3. Build `seed.sql` with rich, realistic EUDR supply chain data (Ghana cocoa, Brazil soya, Indonesia palm oil, India coffee, Ivory Coast rubber).
4. Create `queries.sql` containing 15 analytical, recursive, and reporting SQL queries.
5. Implement `app.py` with Flask REST API routes, raw SQL execution logger, database inspector, and single-command startup.
6. Implement `templates/index.html` (Landing page) and `templates/app.html` (Full enterprise SPA).
7. Implement static assets, stylesheets, and modular frontend scripts (`static/js/app.js`, `static/css/custom.css`).
8. Create `README.md` with complete architecture documentation, 5-minute viva demo script, and 10 viva Q&As.
9. Launch server and execute end-to-end browser tests, validating triggers, queries, maps, charts, and guided demo mode.
