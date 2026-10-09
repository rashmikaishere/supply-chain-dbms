-- ====================================================================
-- EUDR TraceChain: 15 Core SQL Queries for Demonstrations & Reports
-- Demonstrating 3NF queries, Recursive CTEs, Aggregations, & Subqueries
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. RECURSIVE CTE: Full Backward Lineage Trace (EU Product -> Farm Plots)
-- --------------------------------------------------------------------
WITH RECURSIVE batch_tree(parent_batch_id, child_batch_id, depth, path) AS (
    -- Anchor member: Start at the targeted finished/imported batch
    SELECT 
        bl.parent_batch_id,
        bl.child_batch_id,
        1 AS depth,
        b_child.batch_code || ' <- ' || b_parent.batch_code AS path
    FROM batch_lineage bl
    JOIN batches b_child ON bl.child_batch_id = b_child.batch_id
    JOIN batches b_parent ON bl.parent_batch_id = b_parent.batch_id
    WHERE b_child.batch_code = 'NL-CHOC-2026-0044'

    UNION ALL

    -- Recursive member: Traverse upwards to parent batches
    SELECT 
        bl.parent_batch_id,
        bl.child_batch_id,
        bt.depth + 1,
        bt.path || ' <- ' || b_parent.batch_code
    FROM batch_lineage bl
    JOIN batch_tree bt ON bl.child_batch_id = bt.parent_batch_id
    JOIN batches b_parent ON bl.parent_batch_id = b_parent.batch_id
)
SELECT 
    bt.depth,
    bt.path,
    b.batch_code AS root_or_intermediate_batch,
    b.batch_type,
    c.name AS commodity,
    o.name AS created_by_organization,
    p.region_name AS origin_plot_region,
    p.geo_type,
    p.latitude,
    p.longitude,
    ppr.deforestation_free
FROM batch_tree bt
JOIN batches b ON bt.parent_batch_id = b.batch_id
JOIN commodities c ON b.commodity_id = c.commodity_id
JOIN organizations o ON b.created_by_org_id = o.org_id
LEFT JOIN batch_plot_sources bps ON b.batch_id = bps.batch_id
LEFT JOIN plots p ON bps.plot_id = p.plot_id
LEFT JOIN plot_production_records ppr ON p.plot_id = ppr.plot_id
ORDER BY bt.depth DESC;

-- --------------------------------------------------------------------
-- 2. RECURSIVE CTE: Forward Lineage Trace (Farm Harvest -> Downstream Products)
-- --------------------------------------------------------------------
WITH RECURSIVE forward_chain(parent_batch_id, child_batch_id, depth, chain_path) AS (
    SELECT 
        bl.parent_batch_id,
        bl.child_batch_id,
        1 AS depth,
        b_parent.batch_code || ' -> ' || b_child.batch_code
    FROM batch_lineage bl
    JOIN batches b_parent ON bl.parent_batch_id = b_parent.batch_id
    JOIN batches b_child ON bl.child_batch_id = b_child.batch_id
    WHERE b_parent.batch_code = 'GH-COC-RAW-2025-01'

    UNION ALL

    SELECT 
        bl.parent_batch_id,
        bl.child_batch_id,
        fc.depth + 1,
        fc.chain_path || ' -> ' || b_child.batch_code
    FROM batch_lineage bl
    JOIN forward_chain fc ON bl.parent_batch_id = fc.child_batch_id
    JOIN batches b_child ON bl.child_batch_id = b_child.batch_id
)
SELECT 
    fc.depth,
    fc.chain_path,
    b.batch_code AS downstream_batch,
    b.quantity_kg,
    b.compliance_status,
    o.name AS handler_organization,
    cntry.name AS location_country
FROM forward_chain fc
JOIN batches b ON fc.child_batch_id = b.batch_id
JOIN organizations o ON b.created_by_org_id = o.org_id
JOIN countries cntry ON o.country_id = cntry.country_id;

-- --------------------------------------------------------------------
-- 3. Compliance Aggregation by Commodity & Country
-- --------------------------------------------------------------------
SELECT 
    c.name AS commodity_name,
    cntry.name AS country_name,
    cntry.risk_level,
    COUNT(b.batch_id) AS batch_count,
    ROUND(SUM(b.quantity_kg), 2) AS total_quantity_kg,
    SUM(CASE WHEN b.compliance_status = 'Compliant' THEN 1 ELSE 0 END) AS compliant_count,
    SUM(CASE WHEN b.compliance_status = 'Non-Compliant' THEN 1 ELSE 0 END) AS non_compliant_count,
    SUM(CASE WHEN b.compliance_status = 'Pending' THEN 1 ELSE 0 END) AS pending_count
FROM batches b
JOIN commodities c ON b.commodity_id = c.commodity_id
JOIN organizations o ON b.created_by_org_id = o.org_id
JOIN countries cntry ON o.country_id = cntry.country_id
GROUP BY c.name, cntry.name, cntry.risk_level
ORDER BY batch_count DESC;

-- --------------------------------------------------------------------
-- 4. High-Risk Supplier & Plot Compliance Inspection
-- --------------------------------------------------------------------
SELECT 
    o.org_id,
    o.name AS organization_name,
    o.org_type,
    cntry.name AS country,
    cntry.risk_level AS country_risk,
    p.plot_id,
    p.region_name,
    p.area_hectares,
    ppr.deforestation_free,
    ppr.remarks AS satellite_notes,
    COUNT(ld.doc_id) AS total_docs,
    SUM(CASE WHEN ld.verified = 1 THEN 1 ELSE 0 END) AS verified_docs
FROM organizations o
JOIN countries cntry ON o.country_id = cntry.country_id
JOIN plots p ON o.org_id = p.owner_org_id
LEFT JOIN plot_production_records ppr ON p.plot_id = ppr.plot_id
LEFT JOIN legality_documents ld ON p.plot_id = ld.plot_id
GROUP BY o.org_id, p.plot_id
HAVING ppr.deforestation_free = 0 OR verified_docs = 0 OR cntry.risk_level = 'High';

-- --------------------------------------------------------------------
-- 5. Complete Due Diligence Statement (DDS) Export Package
-- --------------------------------------------------------------------
SELECT 
    dds.dds_reference_number,
    dds.submission_date,
    dds.status AS dds_status,
    o_op.name AS operator_company,
    o_op.eori_number AS operator_eori,
    b.batch_code,
    c.name AS commodity,
    c.cn_hs_code,
    b.quantity_kg,
    ra.total_score AS risk_score,
    ra.risk_result
FROM due_diligence_statements dds
JOIN organizations o_op ON dds.operator_org_id = o_op.org_id
JOIN dds_batches db ON dds.dds_id = db.dds_id
JOIN batches b ON db.batch_id = b.batch_id
JOIN commodities c ON b.commodity_id = c.commodity_id
LEFT JOIN risk_assessments ra ON b.batch_id = ra.batch_id;

-- --------------------------------------------------------------------
-- 6. Deforestation Cut-off Date (31 Dec 2020) Violation Audit
-- --------------------------------------------------------------------
SELECT 
    p.plot_id,
    p.region_name,
    o.name AS owner_name,
    ppr.production_start,
    ppr.production_end,
    ppr.harvest_year,
    ppr.deforestation_free,
    ppr.satellite_check_date,
    ppr.remarks
FROM plots p
JOIN organizations o ON p.owner_org_id = o.org_id
JOIN plot_production_records ppr ON p.plot_id = ppr.plot_id
WHERE ppr.deforestation_free = 0 
   OR (ppr.production_start > '2020-12-31' AND ppr.remarks LIKE '%clearance%');

-- --------------------------------------------------------------------
-- 7. Plot Geolocation Polygon vs Point Audit (> 4 Hectares Rule)
-- --------------------------------------------------------------------
SELECT 
    p.plot_id,
    p.region_name,
    p.area_hectares,
    p.geo_type,
    p.latitude,
    p.longitude,
    COUNT(ppp.point_id) AS polygon_vertices_count,
    CASE 
        WHEN p.area_hectares > 4.0 AND p.geo_type = 'POLYGON' AND COUNT(ppp.point_id) >= 3 THEN 'COMPLIANT_POLYGON'
        WHEN p.area_hectares <= 4.0 AND p.geo_type = 'POINT' THEN 'COMPLIANT_POINT'
        ELSE 'NON_COMPLIANT_GEOMETRY'
    END AS geometry_compliance
FROM plots p
LEFT JOIN plot_polygon_points ppp ON p.plot_id = ppp.plot_id
GROUP BY p.plot_id;

-- --------------------------------------------------------------------
-- 8. Maritime Logistics & Custody Transfer Audit
-- --------------------------------------------------------------------
SELECT 
    s.shipment_id,
    s.transport_mode,
    s.origin_port,
    s.destination_port,
    s.departure_date,
    s.arrival_date,
    t.document_ref,
    b.batch_code,
    c.name AS commodity,
    t.quantity_kg,
    org_from.name AS exporter,
    org_to.name AS importer
FROM shipments s
JOIN transactions t ON s.txn_id = t.txn_id
JOIN batches b ON t.batch_id = b.batch_id
JOIN commodities c ON b.commodity_id = c.commodity_id
JOIN organizations org_from ON t.from_org_id = org_from.org_id
JOIN organizations org_to ON t.to_org_id = org_to.org_id;

-- --------------------------------------------------------------------
-- 9. Trigger-Driven Audit Log Activity Breakdown
-- --------------------------------------------------------------------
SELECT 
    table_name,
    action,
    COUNT(log_id) AS total_events,
    MIN(changed_at) AS first_logged,
    MAX(changed_at) AS last_logged
FROM audit_log
GROUP BY table_name, action
ORDER BY total_events DESC;

-- --------------------------------------------------------------------
-- 10. Risk Assessment Summary with Mitigation Actions
-- --------------------------------------------------------------------
SELECT 
    ra.assessment_id,
    b.batch_code,
    c.name AS commodity,
    ra.country_risk,
    ra.plot_risk,
    ra.supplier_risk,
    ra.deforestation_risk,
    ra.total_score,
    ra.risk_result,
    COUNT(ma.action_id) AS total_mitigations,
    SUM(CASE WHEN ma.status = 'Completed' THEN 1 ELSE 0 END) AS completed_mitigations
FROM risk_assessments ra
JOIN batches b ON ra.batch_id = b.batch_id
JOIN commodities c ON b.commodity_id = c.commodity_id
LEFT JOIN mitigation_actions ma ON ra.assessment_id = ma.assessment_id
GROUP BY ra.assessment_id;

-- --------------------------------------------------------------------
-- 11. Commodity Hierarchy (Primary Raw vs Derived HS Code Mapping)
-- --------------------------------------------------------------------
SELECT 
    parent.name AS raw_primary_commodity,
    parent.cn_hs_code AS parent_hs_code,
    child.name AS derived_product,
    child.cn_hs_code AS derived_hs_code
FROM commodities child
JOIN commodities parent ON child.parent_commodity_id = parent.commodity_id
ORDER BY parent.name, child.name;

-- --------------------------------------------------------------------
-- 12. Operator Transaction Volume & EORI Registration Check
-- --------------------------------------------------------------------
SELECT 
    o.org_id,
    o.name AS organization,
    o.org_type,
    o.eori_number,
    cntry.name AS country,
    COUNT(t.txn_id) AS total_transactions,
    ROUND(SUM(t.quantity_kg), 2) AS total_transacted_kg
FROM organizations o
JOIN countries cntry ON o.country_id = cntry.country_id
LEFT JOIN transactions t ON o.org_id = t.from_org_id OR o.org_id = t.to_org_id
GROUP BY o.org_id
ORDER BY total_transacted_kg DESC;

-- --------------------------------------------------------------------
-- 13. Batches with Missing Legality Documents (Subquery Filter)
-- --------------------------------------------------------------------
SELECT 
    b.batch_id,
    b.batch_code,
    b.quantity_kg,
    b.compliance_status,
    p.plot_id,
    p.region_name
FROM batches b
JOIN batch_plot_sources bps ON b.batch_id = bps.batch_id
JOIN plots p ON bps.plot_id = p.plot_id
WHERE NOT EXISTS (
    SELECT 1 FROM legality_documents ld
    WHERE (ld.plot_id = p.plot_id OR ld.org_id = p.owner_org_id)
      AND ld.verified = 1
);

-- --------------------------------------------------------------------
-- 14. DDS Readiness Pipeline (Compliant, Assessed, Unclaimed)
-- --------------------------------------------------------------------
SELECT * FROM v_dds_ready_batches;

-- --------------------------------------------------------------------
-- 15. Real-Time View of Compliance Summary
-- --------------------------------------------------------------------
SELECT * FROM v_compliance_summary;
