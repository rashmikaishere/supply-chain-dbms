-- ====================================================================
-- Supply Chain DBMS: Seed Data
-- Small, clean dataset covering 3 suppliers, 6 farmers, 3 warehouses,
-- 2 shipments, 6 batches, and movements for testing and demo.
-- ====================================================================

-- 1. PRODUCTS (The 7 Regulated Commodities)
INSERT INTO products (product_id, name) VALUES
(1, 'Coffee'),
(2, 'Cocoa'),
(3, 'Palm Oil'),
(4, 'Soya'),
(5, 'Rubber'),
(6, 'Wood'),
(7, 'Cattle');

-- 2. SUPPLIERS (3 suppliers)
INSERT INTO suppliers (supplier_id, name, country, phone) VALUES
(1, 'Kerala Highlands Trading Co.', 'India', '+91 94471 23456'),
(2, 'Sumatra Agro Exporters', 'Indonesia', '+62 812 3456 7890'),
(3, 'Ivory Coast Origin Traders', 'Cote d''Ivoire', '+225 07 12 34 56');

-- 3. FARMERS (6 farmers: 2 per supplier, 1 with deforestation_free = 0)
-- Farmer 4 has deforestation_free = 0 (land cleared after 31 Dec 2020)
INSERT INTO farmers (farmer_id, supplier_id, name, village, deforestation_free) VALUES
(1, 1, 'Ravi Varma', 'Wayanad', 1),
(2, 1, 'Ananya Nair', 'Idukki', 1),
(3, 2, 'Budi Santoso', 'Medan', 1),
(4, 2, 'Dewi Lestari', 'Aceh Barat', 0),
(5, 3, 'Kouassi Yao', 'Soubre', 1),
(6, 3, 'Aya Konan', 'Daloa', 1);

-- 4. WAREHOUSES (3 warehouses)
INSERT INTO warehouses (warehouse_id, name, city) VALUES
(1, 'Cochin Port Terminal Logistics', 'Kochi'),
(2, 'Belawan Dry Port Hub', 'Medan'),
(3, 'San Pedro Coastal Store', 'San Pedro');

-- 5. SHIPMENTS (2 shipments)
INSERT INTO shipments (shipment_id, shipment_code, destination, status) VALUES
(1, 'SHP-0001', 'Rotterdam, Netherlands', 'In Transit'),
(2, 'SHP-0002', 'Hamburg, Germany', 'Preparing');

-- 6. BATCHES (6 batches of Coffee & Cocoa)
-- COF-0001: 50 kg Coffee by Ravi Varma (Kerala Highlands)
-- COF-0002: 80 kg Coffee by Ananya Nair
-- COF-0003: 60 kg Coffee by Budi Santoso
-- COF-0004: 40 kg Coffee by Dewi Lestari (Deforestation-free = 0)
-- COC-0001: 100 kg Cocoa by Kouassi Yao
-- COC-0002: 75 kg Cocoa by Aya Konan
INSERT INTO batches (batch_id, batch_code, farmer_id, product_id, quantity_kg, harvest_date) VALUES
(1, 'COF-0001', 1, 1, 50.0, '2026-09-10'),
(2, 'COF-0002', 2, 1, 80.0, '2026-09-12'),
(3, 'COF-0003', 3, 1, 60.0, '2026-09-15'),
(4, 'COF-0004', 4, 1, 40.0, '2026-09-18'),
(5, 'COC-0001', 5, 2, 100.0, '2026-09-20'),
(6, 'COC-0002', 6, 2, 75.0, '2026-09-22');

-- 7. MOVEMENTS
-- Batch 1 (50 kg): 30 kg to Warehouse 1, 20 kg to Shipment 1 (Remaining = 0 kg)
-- Batch 2 (80 kg): 50 kg to Warehouse 1 (Remaining = 30 kg)
-- Batch 4 (40 kg, non-compliant): 25 kg to Warehouse 2 (Warehouse is allowed! Remaining = 15 kg)
-- Batch 5 (100 kg): 60 kg to Shipment 1 (Remaining = 40 kg)
INSERT INTO movements (movement_id, batch_id, quantity_kg, warehouse_id, shipment_id, moved_date) VALUES
(1, 1, 30.0, 1, NULL, '2026-09-25'),
(2, 1, 20.0, NULL, 1, '2026-09-28'),
(3, 2, 50.0, 1, NULL, '2026-09-26'),
(4, 4, 25.0, 2, NULL, '2026-09-27'),
(5, 5, 60.0, NULL, 1, '2026-09-29');

-- 8. INITIAL CHANGE LOG ENTRIES
INSERT INTO change_log (table_name, action, summary, row_data) VALUES
('suppliers', 'INSERT', 'Registered supplier Kerala Highlands Trading Co. (India)', '{"supplier_id":1,"name":"Kerala Highlands Trading Co.","country":"India"}'),
('farmers', 'INSERT', 'Added farmer Ravi Varma under Kerala Highlands Trading Co.', '{"farmer_id":1,"supplier_id":1,"name":"Ravi Varma","village":"Wayanad","deforestation_free":1}'),
('batches', 'INSERT', 'Created batch COF-0001 (50.0 kg Coffee) from farmer Ravi Varma', '{"batch_id":1,"batch_code":"COF-0001","farmer_id":1,"product_id":1,"quantity_kg":50.0}'),
('movements', 'INSERT', 'Sent 30.0 kg of batch COF-0001 to warehouse Cochin Port Terminal Logistics', '{"batch_id":1,"quantity_kg":30.0,"warehouse_id":1}'),
('movements', 'INSERT', 'Sent 20.0 kg of batch COF-0001 to shipment SHP-0001', '{"batch_id":1,"quantity_kg":20.0,"shipment_id":1}');
