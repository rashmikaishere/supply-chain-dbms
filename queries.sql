-- ====================================================================
-- Supply Chain DBMS: Core SQL Queries for Demonstrations & Reports
-- Demonstrating 3NF joins, aggregations, balance checks, and traceability
-- ====================================================================

-- 1. Farmers under each supplier
SELECT 
    s.name AS supplier_name,
    s.country,
    f.farmer_id,
    f.name AS farmer_name,
    f.village,
    CASE WHEN f.deforestation_free = 1 THEN 'Yes' ELSE 'No' END AS deforestation_free
FROM suppliers s
JOIN farmers f ON s.supplier_id = f.supplier_id
ORDER BY s.name, f.name;

-- 2. Kg per farmer
SELECT 
    f.farmer_id,
    f.name AS farmer_name,
    f.village,
    s.name AS supplier_name,
    COUNT(b.batch_id) AS total_batches,
    COALESCE(SUM(b.quantity_kg), 0.0) AS total_kg_harvested
FROM farmers f
JOIN suppliers s ON f.supplier_id = s.supplier_id
LEFT JOIN batches b ON f.farmer_id = b.farmer_id
GROUP BY f.farmer_id, f.name, f.village, s.name
ORDER BY total_kg_harvested DESC;

-- 3. What is inside each warehouse?
SELECT 
    w.name AS warehouse_name,
    w.city,
    b.batch_code,
    p.name AS product,
    m.quantity_kg,
    f.name AS farmer_name,
    m.moved_date
FROM warehouses w
JOIN movements m ON w.warehouse_id = m.warehouse_id
JOIN batches b ON m.batch_id = b.batch_id
JOIN products p ON b.product_id = p.product_id
JOIN farmers f ON b.farmer_id = f.farmer_id
ORDER BY w.name, m.moved_date DESC;

-- 4. What is inside each shipment?
SELECT 
    s.shipment_code,
    s.destination,
    s.status,
    b.batch_code,
    p.name AS product,
    m.quantity_kg,
    f.name AS farmer_name,
    sup.name AS supplier_name,
    m.moved_date
FROM shipments s
JOIN movements m ON s.shipment_id = m.shipment_id
JOIN batches b ON m.batch_id = b.batch_id
JOIN products p ON b.product_id = p.product_id
JOIN farmers f ON b.farmer_id = f.farmer_id
JOIN suppliers sup ON f.supplier_id = sup.supplier_id
ORDER BY s.shipment_code, m.moved_date DESC;

-- 5. Full trace of a shipment (JOIN across 5 tables)
SELECT 
    s.shipment_code,
    s.destination,
    s.status,
    m.quantity_kg AS shipment_kg,
    b.batch_code,
    b.quantity_kg AS batch_total_kg,
    p.name AS product,
    f.name AS farmer_name,
    f.village,
    f.deforestation_free,
    sup.name AS supplier_name,
    sup.country AS supplier_country
FROM shipments s
JOIN movements m ON s.shipment_id = m.shipment_id
JOIN batches b ON m.batch_id = b.batch_id
JOIN products p ON b.product_id = p.product_id
JOIN farmers f ON b.farmer_id = f.farmer_id
JOIN suppliers sup ON f.supplier_id = sup.supplier_id
WHERE s.shipment_code = 'SHP-0001'
ORDER BY m.moved_date;

-- 6. Total kg per product
SELECT 
    p.product_id,
    p.name AS product_name,
    COUNT(b.batch_id) AS batch_count,
    COALESCE(SUM(b.quantity_kg), 0.0) AS total_kg
FROM products p
LEFT JOIN batches b ON p.product_id = b.product_id
GROUP BY p.product_id, p.name
ORDER BY total_kg DESC;
