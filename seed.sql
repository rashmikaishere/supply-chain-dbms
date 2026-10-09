-- ====================================================================
-- EUDR TraceChain: Realistic Seed Data
-- Comprehensive multi-tier supply chain scenario
-- ====================================================================

-- 1. COUNTRIES
INSERT INTO countries (country_id, name, iso_code, risk_level) VALUES
(1, 'Ghana', 'GH', 'Low'),
(2, 'Brazil', 'BR', 'Standard'),
(3, 'Indonesia', 'ID', 'High'),
(4, 'Ivory Coast', 'CI', 'Standard'),
(5, 'India', 'IN', 'Low'),
(6, 'Netherlands', 'NL', 'Low'),
(7, 'Germany', 'DE', 'Low');

-- 2. COMMODITIES & DERIVED PRODUCTS
INSERT INTO commodities (commodity_id, name, cn_hs_code, is_derived, parent_commodity_id) VALUES
(1, 'Cocoa Beans', '1801.00', 0, NULL),
(2, 'Cocoa Butter & Paste', '1803.10', 1, 1),
(3, 'Chocolate Confectionery', '1806.32', 1, 1),
(4, 'Soya Beans', '1201.90', 0, NULL),
(5, 'Soya Oil Cake & Meal', '2304.00', 1, 4),
(6, 'Oil Palm Fresh Fruit Bunches', '1207.10', 0, NULL),
(7, 'Crude Palm Oil (CPO)', '1511.10', 1, 6),
(8, 'Refined Palm Oil', '1511.90', 1, 6),
(9, 'Natural Rubber', '4001.22', 0, NULL),
(10, 'Rubber Tyres', '4011.10', 1, 9),
(11, 'Coffee Arabica Green', '0901.11', 0, NULL),
(12, 'Roasted Coffee Specialty', '0901.21', 1, 11),
(13, 'Cattle (Live)', '0102.29', 0, NULL),
(14, 'Bovine Leather', '4107.92', 1, 13),
(15, 'Industrial Roundwood', '4403.21', 0, NULL),
(16, 'Wooden Furniture', '9403.30', 1, 15);

-- 3. ORGANIZATIONS (Covering Farm, Co-op, Processor, Exporter, EU Importer)
INSERT INTO organizations (org_id, name, country_id, org_type, eori_number, address, is_sme) VALUES
-- Ghana Cocoa Cluster
(1, 'Kuapa Kokoo Farmers Union', 1, 'Cooperative', NULL, 'Kumasi Central Road, Ashanti Region, Ghana', 1),
(2, 'Olam Agri Cocoa Processing Ltd', 1, 'Processor', NULL, 'Industrial Area, Tema Harbour, Ghana', 0),
(3, 'Dutch Cocoa Trading BV', 6, 'Importer-Operator', 'NL823940192B01', 'Keizersgracht 421, Amsterdam, Netherlands', 0),
(4, 'Chocolaterie Delhaize Europe', 7, 'Importer-Operator', 'DE940182746', 'Lindtallee 12, Cologne, Germany', 0),
-- Brazil Soya Cluster
(5, 'Fazenda Rio Grande Agropecuaria', 2, 'Farmer', NULL, 'Rodovia MT-130, Sorriso, Mato Grosso, Brazil', 0),
(6, 'Amazonia Green Soya Co-op', 2, 'Cooperative', NULL, 'Sinop Rural District, Mato Grosso, Brazil', 1),
(7, 'Cargill Agrícola S.A.', 2, 'Exporter', NULL, 'Port of Santos Logistics Park, SP, Brazil', 0),
(8, 'Rotterdam Agri Feeds BV', 6, 'Importer-Operator', 'NL991048291B02', 'Maasvlakte 2, Port of Rotterdam, Netherlands', 0),
-- Indonesia Palm Oil Cluster
(9, 'PT Sumatra Sawit Mandiri', 3, 'Farmer', NULL, 'Desa Minas, Siak Regency, Riau, Indonesia', 1),
(10, 'Musim Mas Palm Refining', 3, 'Processor', NULL, 'Kawasan Industri Medan II, North Sumatra, Indonesia', 0),
(11, 'Hamburg Oleochemicals GmbH', 7, 'Importer-Operator', 'DE301928471', 'Wendenstrasse 88, Hamburg, Germany', 0),
-- Ivory Coast Rubber Cluster
(12, 'Société Coopérative des Planteurs de Caoutchouc', 4, 'Cooperative', NULL, 'Zone Portuaire, San-Pédro, Ivory Coast', 1),
-- India Coffee Cluster
(13, 'Wayanad Organic Coffee Smallholders', 5, 'Cooperative', NULL, 'Kalpetta Estate Road, Wayanad, Kerala, India', 1),
(14, 'Tata Coffee Export Hub', 5, 'Exporter', NULL, 'MG Road, Bengaluru, Karnataka, India', 0);

-- 4. USERS
INSERT INTO users (user_id, org_id, name, role, email) VALUES
(1, 3, 'Elena Van Der Meer', 'Operator', 'elena.vandermeer@dutchcocoa.nl'),
(2, 4, 'Klaus Schmidt', 'Operator', 'k.schmidt@delhaize-europe.de'),
(3, 8, 'Jan De Vries', 'Operator', 'jan.devries@rotterdamfeeds.nl'),
(4, 11, 'Greta Weber', 'Operator', 'greta.weber@hamburg-oleo.de'),
(5, 3, 'Dr. Aris Thorne', 'Auditor', 'aris.thorne@eudr-audit.eu'),
(6, 1, 'Kwame Mensah', 'Admin', 'kwame.mensah@kuapakokoo.com'),
(7, 5, 'Carlos Mendonça', 'Admin', 'carlos@fazendariogrande.com.br');

-- 5. PRODUCTION PLOTS
INSERT INTO plots (plot_id, owner_org_id, country_id, commodity_id, area_hectares, geo_type, latitude, longitude, region_name) VALUES
-- Ghana Cocoa Plots (Ashanti & Western North)
(1, 1, 1, 1, 3.20, 'POINT', 6.223401, -1.892345, 'Ashanti Bekwai Parcel A'),
(2, 1, 1, 1, 2.75, 'POINT', 6.241289, -1.879102, 'Ashanti Bekwai Parcel B'),
(3, 1, 1, 1, 7.50, 'POLYGON', 6.310567, -2.145890, 'Western North Sefwi Wiawso Estate'),
(4, 1, 1, 1, 1.80, 'POINT', 6.198421, -1.904561, 'Ashanti Juaben Smallholding'),
(5, 1, 1, 1, 5.40, 'POLYGON', 6.345120, -2.189430, 'Western North Bibiani Sector 4'),

-- Brazil Soya Plots (Mato Grosso)
(6, 5, 2, 4, 18.50, 'POLYGON', -12.543210, -55.723140, 'Sorriso Fazenda Norte Sector 1'),
(7, 5, 2, 4, 24.00, 'POLYGON', -12.551980, -55.741020, 'Sorriso Fazenda Norte Sector 2'),
(8, 6, 2, 4, 3.80, 'POINT', -11.864201, -55.512390, 'Sinop Family Farm A'),
(9, 6, 2, 4, 14.20, 'POLYGON', -11.902340, -55.489120, 'Sinop Parcel C (Deforested 2022 - High Risk)'),
(10, 5, 2, 4, 2.90, 'POINT', -12.571200, -55.710890, 'Sorriso Seed Trial Plot'),

-- Indonesia Palm Oil Plots (Riau & Sumatra)
(11, 9, 3, 6, 3.50, 'POINT', 0.812340, 101.442310, 'Siak Agro Block 1'),
(12, 9, 3, 6, 9.80, 'POLYGON', 0.834190, 101.468200, 'Siak Central Concession Block 2'),
(13, 9, 3, 6, 2.10, 'POINT', 0.795430, 101.421900, 'Minas Smallholder Unit 7'),
(14, 9, 3, 6, 6.20, 'POLYGON', 0.851230, 101.490120, 'Pelalawan Buffer Zone Plot (Unverified Docs)'),

-- Ivory Coast Rubber Plots (San-Pedro)
(15, 12, 4, 9, 3.90, 'POINT', 4.754320, -6.643210, 'San-Pédro Hevea Sector 1'),
(16, 12, 4, 9, 8.40, 'POLYGON', 4.789120, -6.682190, 'San-Pédro Plantation East'),
(17, 12, 4, 9, 2.40, 'POINT', 4.732100, -6.619040, 'Grand-Béréby Smallholder Block'),

-- India Coffee Plots (Wayanad & Coorg)
(18, 13, 5, 11, 1.90, 'POINT', 11.685410, 76.132040, 'Wayanad Hill Shade Arabica 1'),
(19, 13, 5, 11, 2.80, 'POINT', 11.710290, 76.154320, 'Wayanad Mountain Canopy 2'),
(20, 13, 5, 11, 5.10, 'POLYGON', 11.642180, 76.098410, 'Kalpetta Valley Organic Reserve');

-- 6. POLYGON VERTICES (For Plots with area > 4 ha)
-- Plot 3 (Ghana Cocoa, 7.5 ha)
INSERT INTO plot_polygon_points (plot_id, seq_no, latitude, longitude) VALUES
(3, 1, 6.310567, -2.145890),
(3, 2, 6.314200, -2.141200),
(3, 3, 6.308900, -2.138400),
(3, 4, 6.305100, -2.143900),
(3, 5, 6.310567, -2.145890);

-- Plot 5 (Ghana Cocoa, 5.4 ha)
INSERT INTO plot_polygon_points (plot_id, seq_no, latitude, longitude) VALUES
(5, 1, 6.345120, -2.189430),
(5, 2, 6.349800, -2.184100),
(5, 3, 6.342100, -2.180200),
(5, 4, 6.339500, -2.186500),
(5, 5, 6.345120, -2.189430);

-- Plot 6 (Brazil Soya, 18.5 ha)
INSERT INTO plot_polygon_points (plot_id, seq_no, latitude, longitude) VALUES
(6, 1, -12.543210, -55.723140),
(6, 2, -12.538900, -55.714200),
(6, 3, -12.549200, -55.709800),
(6, 4, -12.553400, -55.719800),
(6, 5, -12.543210, -55.723140);

-- Plot 7 (Brazil Soya, 24.0 ha)
INSERT INTO plot_polygon_points (plot_id, seq_no, latitude, longitude) VALUES
(7, 1, -12.551980, -55.741020),
(7, 2, -12.546100, -55.731500),
(7, 3, -12.558200, -55.728900),
(7, 4, -12.563900, -55.738900),
(7, 5, -12.551980, -55.741020);

-- Plot 9 (Brazil Soya Non-Compliant, 14.2 ha)
INSERT INTO plot_polygon_points (plot_id, seq_no, latitude, longitude) VALUES
(9, 1, -11.902340, -55.489120),
(9, 2, -11.895100, -55.481200),
(9, 3, -11.907800, -55.476400),
(9, 4, -11.914200, -55.485100),
(9, 5, -11.902340, -55.489120);

-- Plot 12 (Indonesia Palm, 9.8 ha)
INSERT INTO plot_polygon_points (plot_id, seq_no, latitude, longitude) VALUES
(12, 1, 0.834190, 101.468200),
(12, 2, 0.839800, 101.474500),
(12, 3, 0.831200, 101.479800),
(12, 4, 0.826400, 101.471900),
(12, 5, 0.834190, 101.468200);

-- Plot 16 (Ivory Coast Rubber, 8.4 ha)
INSERT INTO plot_polygon_points (plot_id, seq_no, latitude, longitude) VALUES
(16, 1, 4.789120, -6.682190),
(16, 2, 4.794200, -6.675400),
(16, 3, 4.785100, -6.670200),
(16, 4, 4.780300, -6.678900),
(16, 5, 4.789120, -6.682190);

-- Plot 20 (India Coffee, 5.1 ha)
INSERT INTO plot_polygon_points (plot_id, seq_no, latitude, longitude) VALUES
(20, 1, 11.642180, 76.098410),
(20, 2, 11.648900, 76.104200),
(20, 3, 11.639500, 76.109800),
(20, 4, 11.635100, 76.102100),
(20, 5, 11.642180, 76.098410);

-- 7. PLOT PRODUCTION RECORDS (Cut-off date reference: 31 Dec 2020)
INSERT INTO plot_production_records (record_id, plot_id, production_start, production_end, harvest_year, deforestation_free, satellite_check_date, remarks) VALUES
(1, 1, '2025-10-01', '2025-12-15', 2025, 1, '2026-01-10', 'Sentinel-2 imagery confirms forest canopy intact since 2019 baseline.'),
(2, 2, '2025-10-05', '2025-12-20', 2025, 1, '2026-01-10', 'Copernicus validation clear; no land clearance observed.'),
(3, 3, '2025-09-20', '2025-12-10', 2025, 1, '2026-01-12', 'Continuous agroforestry canopy verified through Planet NICFI analysis.'),
(4, 4, '2025-10-15', '2025-12-28', 2025, 1, '2026-01-14', 'Smallholder plot compliant; baseline tree cover matches 2020.'),
(5, 5, '2025-09-15', '2025-12-05', 2025, 1, '2026-01-15', 'Verified zero tree loss in Bibiani concession boundary.'),
-- Brazil
(6, 6, '2025-11-01', '2026-02-28', 2026, 1, '2026-03-05', 'PRODES deforestation database cross-match verified compliant.'),
(7, 7, '2025-11-01', '2026-02-28', 2026, 1, '2026-03-05', 'Cerrado biome legal reserve area maintained at 35%.'),
(8, 8, '2025-10-15', '2026-02-10', 2026, 1, '2026-03-08', 'Family agriculture plot verified deforestation-free.'),
(9, 9, '2025-11-10', '2026-03-01', 2026, 0, '2026-03-12', 'ALERT: Satellite shows 8.5 ha primary forest clearance in July 2022 (Violates EUDR cut-off).'),
(10, 10, '2025-11-01', '2026-02-15', 2026, 1, '2026-03-02', 'Experimental plot compliant.'),
-- Indonesia
(11, 11, '2025-08-01', '2026-01-30', 2026, 1, '2026-02-05', 'Peatland depth < 3m, zero fire alerts detected in 2021-2026.'),
(12, 12, '2025-08-15', '2026-02-10', 2026, 1, '2026-02-18', 'RSPO certified concession; High Conservation Value (HCV) areas preserved.'),
(13, 13, '2025-09-01', '2026-02-20', 2026, 1, '2026-02-20', 'Smallholder estate compliant.'),
(14, 14, '2025-07-01', '2026-01-15', 2026, 1, '2026-02-25', 'Warning: Legality documentation pending district land office verification.'),
-- Ivory Coast & India
(15, 15, '2025-06-01', '2025-11-30', 2025, 1, '2025-12-15', 'National forest reserve buffer respected.'),
(16, 16, '2025-06-15', '2025-12-10', 2025, 1, '2025-12-20', 'SODEFOR boundary check confirmed compliant.'),
(17, 18, '2025-10-01', '2026-01-15', 2026, 1, '2026-02-01', 'Traditional shade-grown coffee under native tree canopy.'),
(18, 19, '2025-10-10', '2026-01-20', 2026, 1, '2026-02-01', 'Compliant biodiversity corridor maintained.'),
(19, 20, '2025-09-15', '2026-01-05', 2026, 1, '2026-02-03', 'Western Ghats eco-sensitive zone verification approved.');

-- 8. LEGALITY DOCUMENTS
INSERT INTO legality_documents (doc_id, org_id, plot_id, doc_type, issued_by, valid_from, valid_to, file_reference, verified) VALUES
-- Ghana Docs
(1, 1, 1, 'Land Title', 'Ghana Lands Commission (Ashanti)', '2020-01-15', '2030-01-15', 'DOC-GH-LT-2020-0012', 1),
(2, 1, 2, 'Land Title', 'Ghana Lands Commission (Ashanti)', '2020-01-15', '2030-01-15', 'DOC-GH-LT-2020-0013', 1),
(3, 1, 3, 'Environmental Permit', 'Ghana EPA Sefwi District', '2021-03-10', '2027-03-10', 'DOC-GH-EPA-2021-094', 1),
(4, 1, 4, 'Customs Clearance', 'Ghana Cocoa Board (COCOBOD)', '2025-09-01', '2026-09-01', 'DOC-GH-COCOBOD-25', 1),
(5, 1, 5, 'Land Title', 'Ghana Lands Commission (Western)', '2019-06-01', '2029-06-01', 'DOC-GH-LT-2019-882', 1),
(6, 2, NULL, 'Labour Compliance', 'Ministry of Employment Ghana', '2025-01-01', '2026-12-31', 'DOC-GH-LAB-2025-44', 1),
-- Brazil Docs
(7, 5, 6, 'Environmental Permit', 'SEMA Mato Grosso (CAR/LAR)', '2022-01-10', '2027-01-10', 'DOC-BR-SEMA-2022-991', 1),
(8, 5, 7, 'Land Title', 'Cartório de Registro de Imóveis Sorriso', '2018-05-12', '2038-05-12', 'DOC-BR-CRI-2018-4102', 1),
(9, 6, 8, 'Tax Certificate', 'Receita Federal do Brasil', '2025-01-01', '2026-01-01', 'DOC-BR-REC-2025-001', 1),
(10, 6, 9, 'Environmental Permit', 'SEMA Mato Grosso (Suspended)', '2021-01-01', '2023-01-01', 'DOC-BR-SEMA-EXPIRED', 0),
-- Indonesia Docs
(11, 9, 11, 'Harvest License', 'Dinas Perkebunan Riau', '2023-01-01', '2028-01-01', 'DOC-ID-DISBUN-23-11', 1),
(12, 9, 12, 'Land Title', 'Kementerian ATR/BPN Indonesia (HGU)', '2017-08-10', '2037-08-10', 'DOC-ID-HGU-2017-488', 1),
(13, 9, 14, 'Land Title', 'Desa Pelalawan Adat (Pending Audit)', '2024-01-01', '2025-01-01', 'DOC-ID-PENDING-2024', 0),
-- Ivory Coast & India Docs
(14, 12, 15, 'Land Title', 'Ministère de l''Agriculture CI', '2021-04-01', '2031-04-01', 'DOC-CI-MINAGRI-21', 1),
(15, 12, 16, 'Environmental Permit', 'ANDE Côte d''Ivoire', '2022-06-01', '2027-06-01', 'DOC-CI-ANDE-22-08', 1),
(16, 13, 18, 'Land Title', 'Kerala Revenue Department', '2015-11-20', '2035-11-20', 'DOC-IN-KL-REV-2015', 1),
(17, 13, 20, 'Environmental Permit', 'Kerala State Pollution Control Board', '2023-02-15', '2028-02-15', 'DOC-IN-KSPCB-23-41', 1);

-- 9. BATCHES (Multi-Level Supply Chain Lineage)
INSERT INTO batches (batch_id, batch_code, commodity_id, quantity_kg, created_by_org_id, created_date, batch_type, compliance_status) VALUES
-- Level 1: Farm Level Raw Harvest Batches (Ghana Cocoa)
(1, 'GH-COC-RAW-2025-01', 1, 3500.00, 1, '2025-12-16', 'RAW', 'Compliant'),
(2, 'GH-COC-RAW-2025-02', 1, 2800.00, 1, '2025-12-21', 'RAW', 'Compliant'),
(3, 'GH-COC-RAW-2025-03', 1, 7200.00, 1, '2025-12-12', 'RAW', 'Compliant'),
-- Level 2: Cooperative Aggregated Batch (Ghana)
(4, 'GH-COC-AGGR-2026-101', 1, 13500.00, 1, '2026-01-05', 'MIXED', 'Compliant'),
-- Level 3: Processor Semi-Finished Cocoa Liquor (Ghana)
(5, 'GH-LIQ-PROC-2026-042', 2, 10800.00, 2, '2026-01-20', 'PROCESSED', 'Compliant'),
-- Level 4: EU Final Chocolate Product (Netherlands & Germany Importers)
(6, 'NL-CHOC-2026-0044', 3, 15000.00, 3, '2026-02-15', 'PROCESSED', 'Compliant'),
(7, 'DE-CHOC-BAR-2026-88', 3, 8000.00, 4, '2026-02-28', 'PROCESSED', 'Compliant'),

-- Brazil Soya Chain
(8, 'BR-SOY-RAW-2026-001', 4, 18000.00, 5, '2026-03-01', 'RAW', 'Compliant'),
(9, 'BR-SOY-RAW-2026-002', 4, 22000.00, 5, '2026-03-02', 'RAW', 'Compliant'),
(10, 'BR-SOY-FAIL-2026-09', 4, 12000.00, 6, '2026-03-04', 'RAW', 'Non-Compliant'), -- Sourced from deforested plot 9!
(11, 'BR-SOY-MEAL-2026-77', 5, 36000.00, 7, '2026-03-15', 'PROCESSED', 'Compliant'),
(12, 'NL-FEED-SOY-2026-90', 5, 35000.00, 8, '2026-04-02', 'PROCESSED', 'Compliant'),

-- Indonesia Palm Oil Chain
(13, 'ID-CPO-RAW-2026-110', 6, 8500.00, 9, '2026-02-12', 'RAW', 'Compliant'),
(14, 'ID-CPO-PROC-2026-215', 7, 7200.00, 10, '2026-02-25', 'PROCESSED', 'Compliant'),
(15, 'DE-OLEO-PALM-2026-03', 8, 7000.00, 11, '2026-03-20', 'PROCESSED', 'Pending'),

-- India Coffee Chain
(16, 'IN-COF-RAW-2026-501', 11, 4500.00, 13, '2026-01-25', 'RAW', 'Compliant'),
(17, 'IN-COF-ROAST-2026-12', 12, 3800.00, 14, '2026-02-10', 'PROCESSED', 'Compliant');

-- 10. BATCH PLOT SOURCES (Connecting Raw Batches to Plots)
INSERT INTO batch_plot_sources (batch_id, plot_id, quantity_kg) VALUES
(1, 1, 3500.00),
(2, 2, 2800.00),
(3, 3, 7200.00),
(8, 6, 18000.00),
(9, 7, 22000.00),
(10, 9, 12000.00), -- Plot 9 flagged deforested!
(13, 11, 8500.00),
(16, 18, 2500.00),
(16, 19, 2000.00);

-- 11. BATCH LINEAGE (Multi-Level Chain Traceability)
INSERT INTO batch_lineage (parent_batch_id, child_batch_id, quantity_kg) VALUES
-- Aggregation at Ghana Co-op (Batches 1, 2, 3 -> Batch 4)
(1, 4, 3500.00),
(2, 4, 2800.00),
(3, 4, 7200.00),
-- Processing at Olam (Batch 4 -> Batch 5)
(4, 5, 10800.00),
-- Import & Processing at Dutch Cocoa (Batch 5 -> Batch 6)
(5, 6, 7500.00),
-- Import & Processing at Delhaize (Batch 5 -> Batch 7)
(5, 7, 3300.00),

-- Brazil Lineage (Batches 8, 9 -> Batch 11 Meal -> Batch 12 NL Feed)
(8, 11, 18000.00),
(9, 11, 18000.00),
(11, 12, 35000.00),

-- Indonesia Lineage (Batch 13 -> 14 -> 15)
(13, 14, 7200.00),
(14, 15, 7000.00),

-- India Lineage (Batch 16 -> Batch 17)
(16, 17, 3800.00);

-- 12. TRANSACTIONS (Custody Transfers along the Chain)
INSERT INTO transactions (txn_id, batch_id, from_org_id, to_org_id, txn_date, quantity_kg, document_ref) VALUES
(1, 4, 1, 2, '2026-01-08', 13500.00, 'TXN-GH-2026-091'),
(2, 5, 2, 3, '2026-01-25', 7500.00, 'TXN-EXP-NL-2026-441'),
(3, 5, 2, 4, '2026-01-28', 3300.00, 'TXN-EXP-DE-2026-102'),
(4, 11, 7, 8, '2026-03-18', 35000.00, 'TXN-EXP-BR-NL-882'),
(5, 14, 10, 11, '2026-03-01', 7000.00, 'TXN-EXP-ID-DE-303');

-- 13. SHIPMENTS
INSERT INTO shipments (shipment_id, txn_id, transport_mode, origin_port, destination_port, departure_date, arrival_date) VALUES
(1, 2, 'Maritime', 'Port of Tema (GH)', 'Port of Rotterdam (NL)', '2026-02-01', '2026-02-14'),
(2, 3, 'Maritime', 'Port of Tema (GH)', 'Port of Hamburg (DE)', '2026-02-03', '2026-02-18'),
(3, 4, 'Maritime', 'Port of Santos (BR)', 'Port of Rotterdam (NL)', '2026-03-22', '2026-04-05'),
(4, 5, 'Maritime', 'Port of Belawan (ID)', 'Port of Hamburg (DE)', '2026-03-05', '2026-03-24');

-- 14. RISK ASSESSMENTS
INSERT INTO risk_assessments (assessment_id, batch_id, assessed_by_user_id, country_risk, plot_risk, supplier_risk, deforestation_risk, total_score, risk_result, assessment_date) VALUES
(1, 6, 1, 10.0, 5.0, 8.0, 0.0, 5.75, 'Negligible', '2026-02-16'),
(2, 7, 2, 10.0, 5.0, 12.0, 0.0, 6.75, 'Negligible', '2026-03-01'),
(3, 12, 3, 25.0, 15.0, 20.0, 0.0, 15.00, 'Negligible', '2026-04-03'),
(4, 15, 4, 65.0, 40.0, 45.0, 30.0, 45.00, 'Non-negligible', '2026-03-22'),
(5, 10, 3, 50.0, 95.0, 80.0, 100.0, 81.25, 'Non-negligible', '2026-03-05');

-- 15. MITIGATION ACTIONS
INSERT INTO mitigation_actions (action_id, assessment_id, action_type, status, due_date, completed_date) VALUES
(1, 4, 'Satellite Re-verification', 'In-Progress', '2026-04-15', NULL),
(2, 4, 'Additional Documentation', 'Planned', '2026-04-30', NULL),
(3, 5, 'Supply Chain Segregation', 'Completed', '2026-03-06', '2026-03-06');

-- 16. DUE DILIGENCE STATEMENTS (DDS)
INSERT INTO due_diligence_statements (dds_id, dds_reference_number, operator_org_id, submission_date, status) VALUES
(1, '26EUDDS88491A', 3, '2026-02-18', 'Accepted'),
(2, '26EUDDS19302B', 4, '2026-03-02', 'Submitted'),
(3, '26EUDDS55018C', 8, '2026-04-06', 'Draft');

-- 17. DDS BATCHES
INSERT INTO dds_batches (dds_id, batch_id) VALUES
(1, 6),
(2, 7),
(3, 12);
