"""
EUDR TraceChain: Flask Backend Server
Regulation (EU) 2023/1115 as amended by (EU) 2025/2650
Database Architecture Demonstration Platform
"""

import os
import sqlite3
import time
import json
import random
import string
from datetime import datetime
from flask import Flask, render_template, request, jsonify, g, send_file, Response
import io
import csv

app = Flask(__name__)
DB_FILE = os.path.join(os.path.dirname(__file__), 'eudr.db')
SCHEMA_FILE = os.path.join(os.path.dirname(__file__), 'schema.sql')
SEED_FILE = os.path.join(os.path.dirname(__file__), 'seed.sql')
QUERIES_FILE = os.path.join(os.path.dirname(__file__), 'queries.sql')

# --------------------------------------------------------------------
# DATABASE CONNECTION & RAW SQL EXECUTION WRAPPER
# --------------------------------------------------------------------
def get_db():
    if 'db' not in g:
        g.db = sqlite3.connect(DB_FILE)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON;")
        g.last_queries = []
    return g.db

@app.teardown_appcontext
def close_db(error):
    db = g.pop('db', None)
    if db is not None:
        db.close()

def execute_raw_sql(sql, params=(), fetch_mode='all', log=True):
    """
    Executes raw SQL, measures runtime, and captures execution telemetry for 'Under the Hood' demo.
    """
    db = get_db()
    start_time = time.perf_counter()
    cursor = db.cursor()
    
    try:
        cursor.execute(sql, params)
        elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)
        
        result = None
        if fetch_mode == 'all':
            rows = cursor.fetchall()
            result = [dict(row) for row in rows]
        elif fetch_mode == 'one':
            row = cursor.fetchone()
            result = dict(row) if row else None
        elif fetch_mode == 'none':
            result = {"rows_affected": cursor.rowcount, "last_row_id": cursor.lastrowid}
            db.commit()

        if log and hasattr(g, 'last_queries'):
            g.last_queries.append({
                "sql": sql.strip(),
                "params": list(params) if isinstance(params, (list, tuple)) else params,
                "elapsed_ms": elapsed_ms,
                "timestamp": datetime.utcnow().isoformat()
            })
            
        return result, elapsed_ms, None
    except Exception as e:
        db.rollback()
        elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)
        if log and hasattr(g, 'last_queries'):
            g.last_queries.append({
                "sql": sql.strip(),
                "params": list(params) if isinstance(params, (list, tuple)) else params,
                "elapsed_ms": elapsed_ms,
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat()
            })
        return None, elapsed_ms, str(e)

def init_db(force=False):
    """Initializes schema and seed data if not present or on reset."""
    if force and os.path.exists(DB_FILE):
        try:
            os.remove(DB_FILE)
        except Exception:
            pass

    conn = sqlite3.connect(DB_FILE)
    conn.execute("PRAGMA foreign_keys = ON;")
    
    with open(SCHEMA_FILE, 'r', encoding='utf-8') as f:
        conn.executescript(f.read())
        
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM countries")
    if cursor.fetchone()[0] == 0:
        with open(SEED_FILE, 'r', encoding='utf-8') as f:
            conn.executescript(f.read())
            
    conn.commit()
    conn.close()

# --------------------------------------------------------------------
# CONTEXT PROCESSOR & RESPONSE HOOKS
# --------------------------------------------------------------------
@app.after_request
def add_db_telemetry(response):
    """Attaches under-the-hood SQL telemetry to JSON responses."""
    if response.is_json and hasattr(g, 'last_queries') and g.last_queries:
        try:
            data = response.get_json()
            if isinstance(data, dict) and '_telemetry' not in data:
                data['_telemetry'] = {
                    "queries": g.last_queries,
                    "server_time": datetime.utcnow().isoformat()
                }
                response.set_data(json.dumps(data))
        except Exception:
            pass
    return response

# --------------------------------------------------------------------
# PAGE ROUTES
# --------------------------------------------------------------------
@app.route('/')
def landing_page():
    return render_template('index.html')

@app.route('/app')
def main_app():
    return render_template('app.html')

# --------------------------------------------------------------------
# API: SYSTEM & DASHBOARD
# --------------------------------------------------------------------
@app.route('/api/system/reset-db', methods=['POST'])
def api_reset_db():
    init_db(force=True)
    return jsonify({"success": True, "message": "Database successfully reset to initial seed state."})

@app.route('/api/dashboard/stats', methods=['GET'])
def api_dashboard_stats():
    db = get_db()
    
    # KPIs
    total_batches = db.execute("SELECT COUNT(*) FROM batches").fetchone()[0]
    compliant_batches = db.execute("SELECT COUNT(*) FROM batches WHERE compliance_status = 'Compliant'").fetchone()[0]
    non_compliant_batches = db.execute("SELECT COUNT(*) FROM batches WHERE compliance_status = 'Non-Compliant'").fetchone()[0]
    pending_batches = db.execute("SELECT COUNT(*) FROM batches WHERE compliance_status = 'Pending'").fetchone()[0]
    
    total_plots = db.execute("SELECT COUNT(*) FROM plots").fetchone()[0]
    high_risk_plots = db.execute("""
        SELECT COUNT(DISTINCT p.plot_id) 
        FROM plots p
        JOIN plot_production_records ppr ON p.plot_id = ppr.plot_id
        JOIN countries c ON p.country_id = c.country_id
        WHERE ppr.deforestation_free = 0 OR c.risk_level = 'High'
    """).fetchone()[0]
    
    total_dds = db.execute("SELECT COUNT(*) FROM due_diligence_statements").fetchone()[0]
    total_orgs = db.execute("SELECT COUNT(*) FROM organizations").fetchone()[0]
    
    compliance_rate = round((compliant_batches / total_batches * 100), 1) if total_batches > 0 else 0
    
    # Chart: Compliance by Commodity
    commodity_stats, _, _ = execute_raw_sql("""
        SELECT 
            c.name AS commodity,
            COUNT(b.batch_id) AS total,
            SUM(CASE WHEN b.compliance_status = 'Compliant' THEN 1 ELSE 0 END) AS compliant,
            SUM(CASE WHEN b.compliance_status = 'Non-Compliant' THEN 1 ELSE 0 END) AS non_compliant,
            SUM(CASE WHEN b.compliance_status = 'Pending' THEN 1 ELSE 0 END) AS pending
        FROM commodities c
        LEFT JOIN batches b ON c.commodity_id = b.commodity_id
        GROUP BY c.commodity_id, c.name
        ORDER BY total DESC
    """)
    
    # Chart: Country Risk Distribution
    country_risk_stats, _, _ = execute_raw_sql("""
        SELECT 
            cntry.name AS country,
            cntry.risk_level,
            COUNT(DISTINCT p.plot_id) AS plots_count,
            COUNT(DISTINCT b.batch_id) AS batches_count
        FROM countries cntry
        LEFT JOIN plots p ON cntry.country_id = p.country_id
        LEFT JOIN organizations o ON cntry.country_id = o.country_id
        LEFT JOIN batches b ON o.org_id = b.created_by_org_id
        GROUP BY cntry.country_id, cntry.name, cntry.risk_level
    """)

    # Recent Audit Log
    recent_audit, _, _ = execute_raw_sql("""
        SELECT log_id, table_name, record_id, action, old_value, new_value, changed_at 
        FROM audit_log 
        ORDER BY log_id DESC 
        LIMIT 8
    """)
    
    return jsonify({
        "kpis": {
            "total_batches": total_batches,
            "compliant_batches": compliant_batches,
            "non_compliant_batches": non_compliant_batches,
            "pending_batches": pending_batches,
            "compliance_rate": compliance_rate,
            "total_plots": total_plots,
            "high_risk_plots": high_risk_plots,
            "total_dds": total_dds,
            "total_orgs": total_orgs
        },
        "commodity_stats": commodity_stats,
        "country_risk_stats": country_risk_stats,
        "recent_audit": recent_audit
    })

# --------------------------------------------------------------------
# API: PLOTS & GEOSPATIAL
# --------------------------------------------------------------------
@app.route('/api/plots', methods=['GET', 'POST'])
def api_plots():
    if request.method == 'GET':
        plots, _, error = execute_raw_sql("""
            SELECT 
                p.plot_id,
                p.region_name,
                p.area_hectares,
                p.geo_type,
                p.latitude,
                p.longitude,
                p.owner_org_id,
                o.name AS owner_name,
                o.org_type,
                p.country_id,
                cntry.name AS country_name,
                cntry.risk_level AS country_risk,
                p.commodity_id,
                c.name AS commodity_name,
                ppr.record_id AS production_record_id,
                ppr.production_start,
                ppr.production_end,
                ppr.harvest_year,
                COALESCE(ppr.deforestation_free, 1) AS deforestation_free,
                ppr.satellite_check_date,
                ppr.remarks AS satellite_remarks,
                (SELECT COUNT(*) FROM legality_documents ld WHERE ld.plot_id = p.plot_id AND ld.verified = 1) AS verified_docs_count,
                (SELECT COUNT(*) FROM legality_documents ld WHERE ld.plot_id = p.plot_id) AS total_docs_count
            FROM plots p
            JOIN organizations o ON p.owner_org_id = o.org_id
            JOIN countries cntry ON p.country_id = cntry.country_id
            JOIN commodities c ON p.commodity_id = c.commodity_id
            LEFT JOIN plot_production_records ppr ON p.plot_id = ppr.plot_id
            ORDER BY p.plot_id DESC
        """)
        
        # Load polygon points for all plots
        poly_points, _, _ = execute_raw_sql("SELECT plot_id, seq_no, latitude, longitude FROM plot_polygon_points ORDER BY plot_id, seq_no")
        poly_map = {}
        for pt in poly_points:
            poly_map.setdefault(pt['plot_id'], []).append([pt['latitude'], pt['longitude']])
            
        for p in plots:
            p['polygon_coords'] = poly_map.get(p['plot_id'], [])
            if p.get('deforestation_free', 1) == 0:
                p['calculated_status'] = 'Blocked'
                p['status_reason'] = 'Deforested after 31 Dec 2020'
            elif p.get('total_docs_count', 0) > 0 and p.get('verified_docs_count', 0) == 0:
                p['calculated_status'] = 'Waiting'
                p['status_reason'] = 'Legal documents not verified'
            elif p.get('area_hectares', 0) > 4.0 and (p.get('geo_type') != 'POLYGON' or len(p.get('polygon_coords', [])) < 3):
                p['calculated_status'] = 'Waiting'
                p['status_reason'] = 'Requires polygon boundary'
            else:
                p['calculated_status'] = 'Approved'
                p['status_reason'] = 'Verified compliant & legal'
            
        return jsonify({"plots": plots, "error": error})

    elif request.method == 'POST':
        data = request.get_json() or {}
        owner_org_id = data.get('owner_org_id')
        country_id = data.get('country_id')
        commodity_id = data.get('commodity_id')
        area_hectares = float(data.get('area_hectares', 0))
        geo_type = data.get('geo_type', 'POINT')
        latitude = float(data.get('latitude', 0))
        longitude = float(data.get('longitude', 0))
        region_name = data.get('region_name', '').strip()
        polygon_coords = data.get('polygon_coords', []) # [[lat, lng], ...]

        # Raw SQL insert to trigger constraints and triggers
        sql = """
            INSERT INTO plots (owner_org_id, country_id, commodity_id, area_hectares, geo_type, latitude, longitude, region_name)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """
        res, _, error = execute_raw_sql(sql, (owner_org_id, country_id, commodity_id, area_hectares, geo_type, latitude, longitude, region_name), fetch_mode='none')
        
        if error:
            return jsonify({"success": False, "error": error}), 400
            
        plot_id = res['last_row_id']
        
        # Insert polygon vertices if provided
        if geo_type == 'POLYGON' and polygon_coords:
            for idx, pt in enumerate(polygon_coords, 1):
                execute_raw_sql(
                    "INSERT INTO plot_polygon_points (plot_id, seq_no, latitude, longitude) VALUES (?, ?, ?, ?)",
                    (plot_id, idx, float(pt[0]), float(pt[1])),
                    fetch_mode='none'
                )
                
        # Insert default production record
        prod_start = data.get('production_start', '2025-01-01')
        prod_end = data.get('production_end', '2025-12-31')
        harvest_year = int(data.get('harvest_year', 2025))
        deforestation_free = int(data.get('deforestation_free', 1))
        remarks = data.get('remarks', 'Self-declared baseline compliant')
        
        execute_raw_sql("""
            INSERT INTO plot_production_records (plot_id, production_start, production_end, harvest_year, deforestation_free, satellite_check_date, remarks)
            VALUES (?, ?, ?, ?, ?, date('now'), ?)
        """, (plot_id, prod_start, prod_end, harvest_year, deforestation_free, remarks), fetch_mode='none')

        return jsonify({"success": True, "plot_id": plot_id, "message": f"Plot #{plot_id} successfully created."})

@app.route('/api/plots/<int:plot_id>', methods=['DELETE'])
def api_delete_plot(plot_id):
    res, _, error = execute_raw_sql("DELETE FROM plots WHERE plot_id = ?", (plot_id,), fetch_mode='none')
    if error:
        return jsonify({"success": False, "error": error}), 400
    return jsonify({"success": True, "message": f"Plot #{plot_id} deleted."})

# --------------------------------------------------------------------
# API: BATCHES & TRACEABILITY
# --------------------------------------------------------------------
@app.route('/api/batches', methods=['GET', 'POST'])
def api_batches():
    if request.method == 'GET':
        batches, _, error = execute_raw_sql("""
            SELECT 
                b.batch_id,
                b.batch_code,
                b.commodity_id,
                c.name AS commodity_name,
                c.cn_hs_code,
                b.quantity_kg,
                b.created_by_org_id,
                o.name AS created_by_org_name,
                o.org_type,
                b.created_date,
                b.batch_type,
                b.compliance_status,
                (SELECT COUNT(*) FROM batch_plot_sources bps WHERE bps.batch_id = b.batch_id) AS direct_plot_sources_count,
                (SELECT COUNT(*) FROM batch_lineage bl WHERE bl.child_batch_id = b.batch_id) AS parent_batches_count,
                ra.risk_result,
                ra.total_score AS risk_score,
                dds.dds_reference_number
            FROM batches b
            JOIN commodities c ON b.commodity_id = c.commodity_id
            JOIN organizations o ON b.created_by_org_id = o.org_id
            LEFT JOIN risk_assessments ra ON b.batch_id = ra.batch_id
            LEFT JOIN dds_batches db ON b.batch_id = db.batch_id
            LEFT JOIN due_diligence_statements dds ON db.dds_id = dds.dds_id
            ORDER BY b.batch_id DESC
        """)
        return jsonify({"batches": batches, "error": error})

    elif request.method == 'POST':
        data = request.get_json() or {}
        batch_code = data.get('batch_code', '').strip().upper()
        if not batch_code:
            batch_code = f"BATCH-{int(time.time())}-{random.randint(100, 999)}"
        commodity_id = data.get('commodity_id')
        quantity_kg = float(data.get('quantity_kg', 0))
        created_by_org_id = data.get('created_by_org_id')
        created_date = data.get('created_date', datetime.utcnow().strftime('%Y-%m-%d'))
        batch_type = data.get('batch_type', 'RAW')
        compliance_status = data.get('compliance_status', 'Pending')
        
        source_plot_ids = data.get('source_plot_ids', []) # list of plot_ids
        parent_batch_ids = data.get('parent_batch_ids', []) # list of batch_ids

        sql = """
            INSERT INTO batches (batch_code, commodity_id, quantity_kg, created_by_org_id, created_date, batch_type, compliance_status)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """
        res, _, error = execute_raw_sql(sql, (batch_code, commodity_id, quantity_kg, created_by_org_id, created_date, batch_type, compliance_status), fetch_mode='none')
        
        if error:
            return jsonify({"success": False, "error": error}), 400
            
        batch_id = res['last_row_id']
        
        # Link source plots if RAW
        if source_plot_ids:
            split_qty = quantity_kg / len(source_plot_ids)
            for pid in source_plot_ids:
                execute_raw_sql("INSERT INTO batch_plot_sources (batch_id, plot_id, quantity_kg) VALUES (?, ?, ?)", (batch_id, pid, split_qty), fetch_mode='none')
                
        # Link parent batches if PROCESSED or MIXED
        if parent_batch_ids:
            split_qty = quantity_kg / len(parent_batch_ids)
            for p_bid in parent_batch_ids:
                l_res, _, l_err = execute_raw_sql("INSERT INTO batch_lineage (parent_batch_id, child_batch_id, quantity_kg) VALUES (?, ?, ?)", (p_bid, batch_id, split_qty), fetch_mode='none')
                if l_err:
                    return jsonify({"success": False, "error": f"Lineage error: {l_err}"}), 400

        return jsonify({"success": True, "batch_id": batch_id, "batch_code": batch_code, "message": f"Batch {batch_code} created."})

@app.route('/api/batches/<int:batch_id>/status', methods=['PATCH'])
def api_update_batch_status(batch_id):
    data = request.get_json() or {}
    new_status = data.get('compliance_status')
    
    if new_status not in ['Pending', 'Compliant', 'Non-Compliant']:
        return jsonify({"success": False, "error": "Invalid status value"}), 400
        
    res, _, error = execute_raw_sql("UPDATE batches SET compliance_status = ? WHERE batch_id = ?", (new_status, batch_id), fetch_mode='none')
    if error:
        return jsonify({"success": False, "error": error}), 400
        
    return jsonify({"success": True, "message": f"Batch #{batch_id} status updated to {new_status}."})

# --------------------------------------------------------------------
# API: LINEAGE TRACE ENGINE (FORWARD & BACKWARD RECURSIVE)
# --------------------------------------------------------------------
@app.route('/api/batches/trace/<batch_code>', methods=['GET'])
@app.route('/api/batches/<batch_code>/trace', methods=['GET'])
def api_trace_batch(batch_code):
    db = get_db()
    
    # 1. Target Batch
    target = db.execute("""
        SELECT b.*, c.name AS commodity_name, c.cn_hs_code, o.name AS org_name, o.org_type, cntry.name AS country_name
        FROM batches b
        JOIN commodities c ON b.commodity_id = c.commodity_id
        JOIN organizations o ON b.created_by_org_id = o.org_id
        JOIN countries cntry ON o.country_id = cntry.country_id
        WHERE b.batch_code = ?
    """, (batch_code,)).fetchone()
    
    if not target:
        return jsonify({"success": False, "error": f"Batch '{batch_code}' not found."}), 404

    target_dict = dict(target)

    # 2. Backward Trace: Recursive CTE to get all ancestors
    backward_query = """
        WITH RECURSIVE ancestors(parent_id, child_id, depth) AS (
            SELECT parent_batch_id, child_batch_id, 1
            FROM batch_lineage
            WHERE child_batch_id = ?
            
            UNION ALL
            
            SELECT bl.parent_batch_id, bl.child_batch_id, a.depth + 1
            FROM batch_lineage bl
            JOIN ancestors a ON bl.child_batch_id = a.parent_id
        )
        SELECT DISTINCT
            b.batch_id,
            b.batch_code,
            b.batch_type,
            b.quantity_kg,
            b.compliance_status,
            c.name AS commodity_name,
            o.name AS org_name,
            o.org_type,
            cntry.name AS country_name,
            a.depth,
            a.child_id
        FROM ancestors a
        JOIN batches b ON a.parent_id = b.batch_id
        JOIN commodities c ON b.commodity_id = c.commodity_id
        JOIN organizations o ON b.created_by_org_id = o.org_id
        JOIN countries cntry ON o.country_id = cntry.country_id
        ORDER BY a.depth DESC;
    """
    ancestors, _, _ = execute_raw_sql(backward_query, (target_dict['batch_id'],))

    # 3. Forward Trace: Recursive CTE to get all downstream descendants
    forward_query = """
        WITH RECURSIVE descendants(parent_id, child_id, depth) AS (
            SELECT parent_batch_id, child_batch_id, 1
            FROM batch_lineage
            WHERE parent_batch_id = ?
            
            UNION ALL
            
            SELECT bl.parent_batch_id, bl.child_batch_id, d.depth + 1
            FROM batch_lineage bl
            JOIN descendants d ON bl.parent_batch_id = d.child_id
        )
        SELECT DISTINCT
            b.batch_id,
            b.batch_code,
            b.batch_type,
            b.quantity_kg,
            b.compliance_status,
            c.name AS commodity_name,
            o.name AS org_name,
            o.org_type,
            cntry.name AS country_name,
            d.depth,
            d.parent_id
        FROM descendants d
        JOIN batches b ON d.child_id = b.batch_id
        JOIN commodities c ON b.commodity_id = c.commodity_id
        JOIN organizations o ON b.created_by_org_id = o.org_id
        JOIN countries cntry ON o.country_id = cntry.country_id
        ORDER BY d.depth ASC;
    """
    descendants, _, _ = execute_raw_sql(forward_query, (target_dict['batch_id'],))

    # 4. Resolve Origin Plots for target and all ancestors
    all_batch_ids = [target_dict['batch_id']] + [a['batch_id'] for a in ancestors]
    placeholders = ','.join(['?'] * len(all_batch_ids))
    
    plots_query = f"""
        SELECT 
            bps.batch_id,
            b.batch_code,
            p.plot_id,
            p.region_name,
            p.area_hectares,
            p.geo_type,
            p.latitude,
            p.longitude,
            o.name AS farm_owner,
            cntry.name AS country_name,
            cntry.risk_level,
            ppr.deforestation_free,
            ppr.production_start,
            ppr.production_end,
            ppr.satellite_check_date,
            ppr.remarks
        FROM batch_plot_sources bps
        JOIN batches b ON bps.batch_id = b.batch_id
        JOIN plots p ON bps.plot_id = p.plot_id
        JOIN organizations o ON p.owner_org_id = o.org_id
        JOIN countries cntry ON p.country_id = cntry.country_id
        LEFT JOIN plot_production_records ppr ON p.plot_id = ppr.plot_id
        WHERE bps.batch_id IN ({placeholders})
    """
    origin_plots, _, _ = execute_raw_sql(plots_query, all_batch_ids)

    # 5. Associated Legality Docs
    plot_ids = [p['plot_id'] for p in origin_plots] if origin_plots else []
    docs = []
    if plot_ids:
        p_placeholders = ','.join(['?'] * len(plot_ids))
        docs, _, _ = execute_raw_sql(f"""
            SELECT ld.*, p.region_name AS plot_region, o.name AS issuer_org_name
            FROM legality_documents ld
            LEFT JOIN plots p ON ld.plot_id = p.plot_id
            LEFT JOIN organizations o ON ld.org_id = o.org_id
            WHERE ld.plot_id IN ({p_placeholders})
        """, plot_ids)

    # 6. Transactions & Shipments
    transactions, _, _ = execute_raw_sql(f"""
        SELECT t.*, org_from.name AS from_org_name, org_to.name AS to_org_name,
               s.shipment_id, s.transport_mode, s.origin_port, s.destination_port, s.departure_date, s.arrival_date
        FROM transactions t
        JOIN organizations org_from ON t.from_org_id = org_from.org_id
        JOIN organizations org_to ON t.to_org_id = org_to.org_id
        LEFT JOIN shipments s ON t.txn_id = s.txn_id
        WHERE t.batch_id IN ({placeholders})
    """, all_batch_ids)

    direction = request.args.get('direction', 'backward')
    chosen_lineage = ancestors if direction == 'backward' else descendants
    return jsonify({
        "target_batch": target_dict,
        "root_batch": target_dict,
        "ancestors": ancestors,
        "descendants": descendants,
        "lineage": chosen_lineage,
        "origin_plots": origin_plots,
        "plots": origin_plots,
        "legality_documents": docs,
        "transactions": transactions
    })

# --------------------------------------------------------------------
# API: RISK ASSESSMENT & DUE DILIGENCE
# --------------------------------------------------------------------
@app.route('/api/risk-assessments', methods=['GET', 'POST'])
@app.route('/api/risk/assessments', methods=['GET', 'POST'])
def api_risk_assessments():
    if request.method == 'GET':
        assessments, _, error = execute_raw_sql("""
            SELECT 
                ra.*,
                b.batch_code,
                b.quantity_kg,
                c.name AS commodity_name,
                o.name AS operator_name,
                u.name AS assessed_by_name,
                (SELECT COUNT(*) FROM mitigation_actions ma WHERE ma.assessment_id = ra.assessment_id) AS total_mitigations,
                (SELECT COUNT(*) FROM mitigation_actions ma WHERE ma.assessment_id = ra.assessment_id AND ma.status = 'Completed') AS completed_mitigations
            FROM risk_assessments ra
            JOIN batches b ON ra.batch_id = b.batch_id
            JOIN commodities c ON b.commodity_id = c.commodity_id
            JOIN organizations o ON b.created_by_org_id = o.org_id
            LEFT JOIN users u ON ra.assessed_by_user_id = u.user_id
            ORDER BY ra.assessment_id DESC
        """)
        return jsonify({"assessments": assessments, "error": error})

    elif request.method == 'POST':
        data = request.get_json() or {}
        batch_id = data.get('batch_id')
        user_id = data.get('assessed_by_user_id', 1)
        
        # Calculate dynamic risk score based on DB records
        db = get_db()
        batch_info = db.execute("""
            SELECT b.*, c.name AS commodity, cntry.risk_level
            FROM batches b
            JOIN commodities c ON b.commodity_id = c.commodity_id
            JOIN organizations o ON b.created_by_org_id = o.org_id
            JOIN countries cntry ON o.country_id = cntry.country_id
            WHERE b.batch_id = ?
        """, (batch_id,)).fetchone()
        
        if not batch_info:
            return jsonify({"success": False, "error": "Batch not found"}), 404
            
        # Country risk score
        country_risk = 10.0 if batch_info['risk_level'] == 'Low' else (40.0 if batch_info['risk_level'] == 'Standard' else 85.0)
        
        # Plot risk check: check if any source plot has deforestation or missing docs
        bad_plots = db.execute("""
            SELECT COUNT(*) FROM batch_plot_sources bps
            JOIN plot_production_records ppr ON bps.plot_id = ppr.plot_id
            WHERE bps.batch_id = ? AND ppr.deforestation_free = 0
        """, (batch_id,)).fetchone()[0]
        
        deforestation_risk = 100.0 if bad_plots > 0 else 0.0
        plot_risk = 75.0 if bad_plots > 0 else 15.0
        supplier_risk = 30.0 if batch_info['risk_level'] == 'High' else 10.0
        
        total_score = round((country_risk * 0.25) + (plot_risk * 0.25) + (supplier_risk * 0.20) + (deforestation_risk * 0.30), 2)
        risk_result = 'Non-negligible' if total_score >= 25.0 or deforestation_risk > 0 else 'Negligible'

        sql = """
            INSERT INTO risk_assessments (batch_id, assessed_by_user_id, country_risk, plot_risk, supplier_risk, deforestation_risk, total_score, risk_result, assessment_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, date('now'))
        """
        res, _, error = execute_raw_sql(sql, (batch_id, user_id, country_risk, plot_risk, supplier_risk, deforestation_risk, total_score, risk_result), fetch_mode='none')
        
        if error:
            return jsonify({"success": False, "error": error}), 400
            
        assessment_id = res['last_row_id']
        
        # Auto-create mitigation if risk is non-negligible
        if risk_result == 'Non-negligible':
            execute_raw_sql("""
                INSERT INTO mitigation_actions (assessment_id, action_type, status, due_date)
                VALUES (?, 'Satellite Re-verification', 'Planned', date('now', '+14 days'))
            """, (assessment_id,), fetch_mode='none')
            
        return jsonify({
            "success": True, 
            "assessment_id": assessment_id, 
            "total_score": total_score, 
            "risk_result": risk_result,
            "message": f"Assessment completed: Risk is {risk_result} (Score: {total_score}/100)"
        })

@app.route('/api/risk-assessments/<int:assessment_id>/mitigations', methods=['POST'])
def api_add_mitigation(assessment_id):
    data = request.get_json() or {}
    action_type = data.get('action_type', 'On-Site Audit')
    due_date = data.get('due_date', datetime.utcnow().strftime('%Y-%m-%d'))
    status = data.get('status', 'Planned')
    
    sql = "INSERT INTO mitigation_actions (assessment_id, action_type, status, due_date) VALUES (?, ?, ?, ?)"
    res, _, error = execute_raw_sql(sql, (assessment_id, action_type, status, due_date), fetch_mode='none')
    if error:
        return jsonify({"success": False, "error": error}), 400
    return jsonify({"success": True, "action_id": res['last_row_id'], "message": "Mitigation action logged."})

# --------------------------------------------------------------------
# API: DUE DILIGENCE STATEMENTS (DDS)
# --------------------------------------------------------------------
@app.route('/api/dds', methods=['GET', 'POST'])
def api_dds():
    if request.method == 'GET':
        statements, _, error = execute_raw_sql("""
            SELECT 
                dds.*,
                o.name AS operator_name,
                o.eori_number,
                cntry.name AS operator_country,
                COUNT(db.batch_id) AS linked_batches_count,
                ROUND(SUM(b.quantity_kg), 2) AS total_quantity_kg
            FROM due_diligence_statements dds
            JOIN organizations o ON dds.operator_org_id = o.org_id
            JOIN countries cntry ON o.country_id = cntry.country_id
            LEFT JOIN dds_batches db ON dds.dds_id = db.dds_id
            LEFT JOIN batches b ON db.batch_id = b.batch_id
            GROUP BY dds.dds_id
            ORDER BY dds.dds_id DESC
        """)
        return jsonify({"statements": statements, "error": error})

    elif request.method == 'POST':
        data = request.get_json() or {}
        operator_org_id = data.get('operator_org_id')
        batch_ids = data.get('batch_ids', [])
        
        if not batch_ids:
            return jsonify({"success": False, "error": "Must select at least one compliant batch for the statement."}), 400
            
        # Generate official EU Reference format: 26EU-XXXXXXXX
        rand_str = ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))
        dds_reference = f"26EU{rand_str}"
        
        sql = "INSERT INTO due_diligence_statements (dds_reference_number, operator_org_id, submission_date, status) VALUES (?, ?, date('now'), 'Submitted')"
        res, _, error = execute_raw_sql(sql, (dds_reference, operator_org_id), fetch_mode='none')
        if error:
            return jsonify({"success": False, "error": error}), 400
            
        dds_id = res['last_row_id']
        for bid in batch_ids:
            execute_raw_sql("INSERT INTO dds_batches (dds_id, batch_id) VALUES (?, ?)", (dds_id, bid), fetch_mode='none')
            
        return jsonify({"success": True, "dds_id": dds_id, "dds_reference": dds_reference, "message": f"DDS {dds_reference} registered successfully."})

# --------------------------------------------------------------------
# API: SIMPLE LOOKUP ENDPOINTS (used by JS dropdowns)
# --------------------------------------------------------------------
@app.route('/api/countries', methods=['GET'])
def api_countries():
    rows, _, error = execute_raw_sql("SELECT country_id, name, iso_code, risk_level FROM countries ORDER BY name")
    if error:
        return jsonify({"error": error}), 500
    return jsonify({"countries": rows})

@app.route('/api/commodities', methods=['GET'])
def api_commodities():
    rows, _, error = execute_raw_sql("SELECT commodity_id, name, cn_hs_code FROM commodities ORDER BY name")
    if error:
        return jsonify({"error": error}), 500
    return jsonify({"commodities": rows})

@app.route('/api/organizations', methods=['GET'])
def api_organizations():
    rows, _, error = execute_raw_sql("SELECT org_id, name, org_type, country_id FROM organizations ORDER BY name")
    if error:
        return jsonify({"error": error}), 500
    return jsonify({"organizations": rows})

# --------------------------------------------------------------------
# API: MASTER DATA & LOOKUPS
# --------------------------------------------------------------------
@app.route('/api/master/<table_name>', methods=['GET', 'POST'])
def api_master_data(table_name):
    allowed_tables = ['countries', 'commodities', 'organizations', 'users', 'legality_documents', 'transactions', 'shipments']
    if table_name not in allowed_tables:
        return jsonify({"error": "Table not accessible via master API"}), 403

    if request.method == 'GET':
        rows, _, error = execute_raw_sql(f"SELECT * FROM {table_name} ORDER BY 1 DESC")
        return jsonify({"table": table_name, "rows": rows, "error": error})
        
    elif request.method == 'POST':
        data = request.get_json() or {}
        cols = list(data.keys())
        placeholders = ', '.join(['?'] * len(cols))
        col_names = ', '.join(cols)
        values = [data[c] for c in cols]
        
        sql = f"INSERT INTO {table_name} ({col_names}) VALUES ({placeholders})"
        res, _, error = execute_raw_sql(sql, values, fetch_mode='none')
        if error:
            return jsonify({"success": False, "error": error}), 400
        return jsonify({"success": True, "id": res['last_row_id'], "message": f"Record added to {table_name}."})

# --------------------------------------------------------------------
# API: DATABASE EXPLORER (FOR TEACHER DEMO)
# --------------------------------------------------------------------
@app.route('/api/db/schema', methods=['GET'])
def api_db_schema():
    db = get_db()
    cursor = db.cursor()
    
    # Fetch all table names
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    tables = [r[0] for r in cursor.fetchall()]
    
    schema_data = {}
    relationships = []
    
    for t in tables:
        # Columns
        cursor.execute(f"PRAGMA table_info({t})")
        cols = [dict(c) for c in cursor.fetchall()]
        
        # Row count
        cursor.execute(f"SELECT COUNT(*) FROM {t}")
        row_count = cursor.fetchone()[0]
        
        # Foreign keys
        cursor.execute(f"PRAGMA foreign_key_list({t})")
        fks = [dict(fk) for fk in cursor.fetchall()]
        
        for fk in fks:
            relationships.append({
                "from_table": t,
                "from_col": fk['from'],
                "to_table": fk['table'],
                "to_col": fk['to'],
                "on_delete": fk['on_delete']
            })

        # Indexes
        cursor.execute(f"PRAGMA index_list({t})")
        indexes = [dict(idx) for idx in cursor.fetchall()]

        schema_data[t] = {
            "columns": cols,
            "row_count": row_count,
            "foreign_keys": fks,
            "indexes": indexes
        }

    return jsonify({
        "tables": schema_data,
        "relationships": relationships
    })

@app.route('/api/db/tables/<table_name>', methods=['GET'])
def api_db_table_data(table_name):
    # Sanitize table name against sqlite_master
    db = get_db()
    cursor = db.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name = ?", (table_name,))
    if not cursor.fetchone():
        return jsonify({"error": f"Table '{table_name}' does not exist"}), 404

    page = int(request.args.get('page', 1))
    limit = int(request.args.get('limit', 15))
    search = request.args.get('search', '').strip()
    offset = (page - 1) * limit

    cursor.execute(f"PRAGMA table_info({table_name})")
    cols = [dict(c) for c in cursor.fetchall()]

    where_clause = ""
    params = []
    if search:
        text_cols = [c['name'] for c in cols if 'CHAR' in c['type'].upper() or 'TEXT' in c['type'].upper()]
        if text_cols:
            where_clause = " WHERE " + " OR ".join([f"{c} LIKE ?" for c in text_cols])
            params = [f"%{search}%" for _ in text_cols]

    # Total rows with search filter
    count_sql = f"SELECT COUNT(*) FROM {table_name}{where_clause}"
    cursor.execute(count_sql, params)
    total_rows = cursor.fetchone()[0]

    # Row data
    data_sql = f"SELECT * FROM {table_name}{where_clause} ORDER BY 1 DESC LIMIT ? OFFSET ?"
    data_params = params + [limit, offset]
    rows, elapsed_ms, error = execute_raw_sql(data_sql, data_params)

    # FK metadata for auto-linking in table UI
    cursor.execute(f"PRAGMA foreign_key_list({table_name})")
    fks = [dict(fk) for fk in cursor.fetchall()]

    return jsonify({
        "table": table_name,
        "columns": cols,
        "rows": rows,
        "total_rows": total_rows,
        "page": page,
        "limit": limit,
        "foreign_keys": fks,
        "elapsed_ms": elapsed_ms
    })

@app.route('/api/db/query', methods=['POST'])
def api_db_query_console():
    data = request.get_json() or {}
    query = data.get('query', '').strip()
    
    if not query:
        return jsonify({"error": "Empty query"}), 400

    # READ-ONLY SAFETY CHECK
    upper_q = query.upper()
    forbidden_tokens = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE', 'REPLACE', 'ATTACH', 'DETACH', 'VACUUM']
    for token in forbidden_tokens:
        # Check if word token exists outside string literals
        if token in upper_q.split():
            return jsonify({"error": f"Security Notice: Only read-only SELECT queries are allowed in this console. Found '{token}'."}), 403

    rows, elapsed_ms, error = execute_raw_sql(query, fetch_mode='all')
    if error:
        return jsonify({"error": error, "elapsed_ms": elapsed_ms}), 400

    # Also fetch EXPLAIN QUERY PLAN
    explain_plan, _, _ = execute_raw_sql(f"EXPLAIN QUERY PLAN {query}", fetch_mode='all', log=False)

    columns = list(rows[0].keys()) if rows else []

    return jsonify({
        "columns": columns,
        "rows": rows,
        "row_count": len(rows),
        "elapsed_ms": elapsed_ms,
        "explain_plan": explain_plan
    })

@app.route('/api/db/objects', methods=['GET'])
def api_db_objects():
    db = get_db()
    cursor = db.cursor()
    
    # Views
    cursor.execute("SELECT name, sql FROM sqlite_master WHERE type='view' ORDER BY name")
    views = [dict(r) for r in cursor.fetchall()]
    
    # Triggers
    cursor.execute("SELECT name, tbl_name, sql FROM sqlite_master WHERE type='trigger' ORDER BY tbl_name, name")
    triggers = [dict(r) for r in cursor.fetchall()]
    
    # Indexes
    cursor.execute("SELECT name, tbl_name, sql FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY tbl_name, name")
    indexes = [dict(r) for r in cursor.fetchall()]

    return jsonify({
        "views": views,
        "triggers": triggers,
        "indexes": indexes
    })

@app.route('/api/db/audit-log', methods=['GET'])
def api_audit_log():
    limit = int(request.args.get('limit', 50))
    table = request.args.get('table', '').strip()
    
    where_sql = "WHERE table_name = ?" if table else ""
    params = (table, limit) if table else (limit,)
    
    sql = f"""
        SELECT a.*, u.name AS user_name, u.role AS user_role
        FROM audit_log a
        LEFT JOIN users u ON a.user_id = u.user_id
        {where_sql}
        ORDER BY a.log_id DESC
        LIMIT ?
    """
    logs, _, error = execute_raw_sql(sql, params)
    return jsonify({"audit_logs": logs, "error": error})

# --------------------------------------------------------------------
# API: SAVED DEMO QUERIES & EXPORT
# --------------------------------------------------------------------
@app.route('/api/sample-queries', methods=['GET'])
def api_sample_queries():
    samples = [
        {
            "id": 1,
            "title": "Which farms supplied chocolate batch NL-CHOC-2026-0044?",
            "description": "Traces backward from retail chocolate all the way to 3 cocoa farm plots in Ghana using a recursive query.",
            "sql": """WITH RECURSIVE batch_tree(parent_batch_id, child_batch_id, depth, path) AS (
    SELECT bl.parent_batch_id, bl.child_batch_id, 1, b_child.batch_code || ' <- ' || b_parent.batch_code
    FROM batch_lineage bl
    JOIN batches b_child ON bl.child_batch_id = b_child.batch_id
    JOIN batches b_parent ON bl.parent_batch_id = b_parent.batch_id
    WHERE b_child.batch_code = 'NL-CHOC-2026-0044'
    UNION ALL
    SELECT bl.parent_batch_id, bl.child_batch_id, bt.depth + 1, bt.path || ' <- ' || b_parent.batch_code
    FROM batch_lineage bl
    JOIN batch_tree bt ON bl.child_batch_id = bt.parent_batch_id
    JOIN batches b_parent ON bl.parent_batch_id = b_parent.batch_id
)
SELECT bt.depth AS step_number, b.batch_code, b.batch_type, c.name AS product, o.name AS company, p.region_name AS farm_plot, p.latitude, p.longitude, 
       CASE WHEN ppr.deforestation_free = 1 THEN 'Safe' ELSE 'Deforested' END AS forest_status
FROM batch_tree bt
JOIN batches b ON bt.parent_batch_id = b.batch_id
JOIN commodities c ON b.commodity_id = c.commodity_id
JOIN organizations o ON b.created_by_org_id = o.org_id
LEFT JOIN batch_plot_sources bps ON b.batch_id = bps.batch_id
LEFT JOIN plots p ON bps.plot_id = p.plot_id
LEFT JOIN plot_production_records ppr ON p.plot_id = ppr.plot_id
ORDER BY bt.depth DESC;"""
        },
        {
            "id": 2,
            "title": "Which batches are blocked and why?",
            "description": "Finds all blocked or high-risk batches and shows the deforestation status or country risk.",
            "sql": """SELECT b.batch_code, c.name AS product, b.quantity_kg, o.name AS company, b.compliance_status AS status,
       p.region_name AS source_plot, ppr.remarks AS failure_reason
FROM batches b
JOIN commodities c ON b.commodity_id = c.commodity_id
JOIN organizations o ON b.created_by_org_id = o.org_id
LEFT JOIN batch_plot_sources bps ON b.batch_id = bps.batch_id
LEFT JOIN plots p ON bps.plot_id = p.plot_id
LEFT JOIN plot_production_records ppr ON p.plot_id = ppr.plot_id
WHERE b.compliance_status = 'Non-Compliant' OR ppr.deforestation_free = 0;"""
        },
        {
            "id": 3,
            "title": "How many kg of product came from each country?",
            "description": "Groups total kilograms and number of batches by country and risk level.",
            "sql": """SELECT cntry.name AS country, cntry.risk_level AS country_risk,
       COUNT(b.batch_id) AS total_batches,
       ROUND(SUM(b.quantity_kg), 0) AS total_kg
FROM batches b
JOIN organizations o ON b.created_by_org_id = o.org_id
JOIN countries cntry ON o.country_id = cntry.country_id
GROUP BY cntry.name, cntry.risk_level
ORDER BY total_kg DESC;"""
        },
        {
            "id": 4,
            "title": "Which farm plots were cleared after 31 Dec 2020?",
            "description": "Shows farm plots where satellite scans detected tree clearance after the legal cut-off date.",
            "sql": """SELECT p.plot_id, p.region_name AS plot_name, o.name AS owner_company, cntry.name AS country,
       ppr.satellite_check_date, ppr.remarks AS satellite_scan_findings
FROM plots p
JOIN organizations o ON p.owner_org_id = o.org_id
JOIN countries cntry ON p.country_id = cntry.country_id
JOIN plot_production_records ppr ON p.plot_id = ppr.plot_id
WHERE ppr.deforestation_free = 0;"""
        },
        {
            "id": 5,
            "title": "Which plots are over 4 hectares but missing polygon borders?",
            "description": "Checks the EU rule that any farm plot bigger than 4 hectares must have polygon boundaries.",
            "sql": """SELECT p.plot_id, p.region_name AS plot_name, p.area_hectares, p.geo_type AS registered_shape,
       COUNT(ppp.point_id) AS boundary_points_saved,
       CASE 
           WHEN p.area_hectares > 4.0 AND p.geo_type = 'POLYGON' AND COUNT(ppp.point_id) >= 3 THEN 'Valid Boundary'
           WHEN p.area_hectares <= 4.0 AND p.geo_type = 'POINT' THEN 'Valid Single Point'
           ELSE 'Needs Action: Missing Boundary'
       END AS check_result
FROM plots p
LEFT JOIN plot_polygon_points ppp ON p.plot_id = ppp.plot_id
GROUP BY p.plot_id
ORDER BY p.area_hectares DESC;"""
        },
        {
            "id": 6,
            "title": "Which batches are ready for an EU Report?",
            "description": "Shows all Approved batches that have not yet been placed on an EU Compliance Report.",
            "sql": """SELECT b.batch_code, c.name AS product, b.quantity_kg, o.name AS company, b.created_date
FROM batches b
JOIN commodities c ON b.commodity_id = c.commodity_id
JOIN organizations o ON b.created_by_org_id = o.org_id
WHERE b.compliance_status = 'Compliant'
  AND b.batch_id NOT IN (
      SELECT db.batch_id FROM dds_batches db
      JOIN due_diligence_statements dds ON db.dds_id = dds.dds_id
      WHERE dds.status IN ('Submitted', 'Accepted')
  );"""
        },
        {
            "id": 7,
            "title": "Who handled coffee batch IN-COF-RAW-2026-501 downstream?",
            "description": "Traces forward from the harvest farm in India to the roasting factory.",
            "sql": """WITH RECURSIVE forward_chain(parent_batch_id, child_batch_id, depth, chain_path) AS (
    SELECT bl.parent_batch_id, bl.child_batch_id, 1, b_parent.batch_code || ' -> ' || b_child.batch_code
    FROM batch_lineage bl
    JOIN batches b_parent ON bl.parent_batch_id = b_parent.batch_id
    JOIN batches b_child ON bl.child_batch_id = b_child.batch_id
    WHERE b_parent.batch_code = 'IN-COF-RAW-2026-501'
    UNION ALL
    SELECT bl.parent_batch_id, bl.child_batch_id, fc.depth + 1, fc.chain_path || ' -> ' || b_child.batch_code
    FROM batch_lineage bl
    JOIN forward_chain fc ON bl.parent_batch_id = fc.child_batch_id
    JOIN batches b_child ON bl.child_batch_id = b_child.batch_id
)
SELECT fc.depth AS step_number, b.batch_code AS downstream_batch, b.quantity_kg, b.compliance_status AS status,
       o.name AS company, cntry.name AS location_country
FROM forward_chain fc
JOIN batches b ON fc.child_batch_id = b.batch_id
JOIN organizations o ON b.created_by_org_id = o.org_id
JOIN countries cntry ON o.country_id = cntry.country_id;"""
        },
        {
            "id": 8,
            "title": "Which farm plots are missing verified legal documents?",
            "description": "Identifies farm plots where legal land documents are unverified or still pending.",
            "sql": """SELECT p.plot_id, p.region_name AS plot_name, o.name AS owner_company, cntry.name AS country,
       COALESCE(ld.doc_type, 'No Document Uploaded') AS document_type,
       COALESCE(ld.file_reference, '-') AS document_code,
       CASE WHEN ld.verified = 1 THEN 'Verified' ELSE 'Unverified / Pending' END AS verification_status
FROM plots p
JOIN organizations o ON p.owner_org_id = o.org_id
JOIN countries cntry ON p.country_id = cntry.country_id
LEFT JOIN legality_documents ld ON p.plot_id = ld.plot_id
WHERE ld.verified IS NULL OR ld.verified = 0;"""
        },
        {
            "id": 9,
            "title": "What changes were saved automatically by database triggers?",
            "description": "Shows the latest 10 database changes logged by SQLite insert and update triggers.",
            "sql": """SELECT a.log_id, a.table_name, a.action AS operation, a.record_id, a.changed_at AS time_saved,
       COALESCE(u.name, 'System Rule') AS who_changed_it
FROM audit_log a
LEFT JOIN users u ON a.user_id = u.user_id
ORDER BY a.log_id DESC
LIMIT 10;"""
        },
        {
            "id": 10,
            "title": "How much volume is handled by each company?",
            "description": "Totals the kilograms of products created or traded by each business.",
            "sql": """SELECT o.name AS company_name, o.org_type AS company_type, cntry.name AS country,
       COUNT(b.batch_id) AS batches_handled,
       ROUND(SUM(b.quantity_kg), 0) AS total_kg
FROM organizations o
JOIN countries cntry ON o.country_id = cntry.country_id
LEFT JOIN batches b ON o.org_id = b.created_by_org_id
GROUP BY o.org_id, o.name, o.org_type, cntry.name
ORDER BY total_kg DESC;"""
        }
    ]
    return jsonify({"queries": samples})

@app.route('/api/reports/export/<format_type>', methods=['GET'])
def api_export_report(format_type):
    db = get_db()
    cursor = db.cursor()
    cursor.execute("""
        SELECT 
            b.batch_code,
            c.name AS commodity,
            b.quantity_kg,
            b.batch_type,
            b.compliance_status,
            o.name AS created_by,
            cntry.name AS origin_country,
            dds.dds_reference_number
        FROM batches b
        JOIN commodities c ON b.commodity_id = c.commodity_id
        JOIN organizations o ON b.created_by_org_id = o.org_id
        JOIN countries cntry ON o.country_id = cntry.country_id
        LEFT JOIN dds_batches db_map ON b.batch_id = db_map.batch_id
        LEFT JOIN due_diligence_statements dds ON db_map.dds_id = dds.dds_id
        ORDER BY b.batch_id DESC
    """)
    rows = [dict(r) for r in cursor.fetchall()]

    if format_type == 'json':
        return Response(json.dumps(rows, indent=2), mimetype='application/json', headers={"Content-Disposition": "attachment;filename=eudr_traceability_export.json"})
    elif format_type == 'csv':
        output = io.StringIO()
        if rows:
            writer = csv.DictWriter(output, fieldnames=list(rows[0].keys()))
            writer.writeheader()
            writer.writerows(rows)
        return Response(output.getvalue(), mimetype='text/csv', headers={"Content-Disposition": "attachment;filename=eudr_traceability_export.csv"})
    else:
        return jsonify({"error": "Unsupported export format"}), 400

# --------------------------------------------------------------------
# MAIN STARTUP
# --------------------------------------------------------------------
@app.route('/api/db/test-trigger', methods=['POST'])
def api_test_trigger():
    data = request.get_json() or {}
    sql = data.get('sql', '').strip()
    if not sql:
        return jsonify({"success": False, "error": "No SQL provided"}), 400

    db = get_db()
    cursor = db.cursor()
    try:
        cursor.execute("SAVEPOINT trigger_test_sp")
        cursor.execute(sql)
        cursor.execute("ROLLBACK TO SAVEPOINT trigger_test_sp")
        return jsonify({"success": True, "message": "Operation executed without triggering restriction."})
    except Exception as e:
        try:
            cursor.execute("ROLLBACK TO SAVEPOINT trigger_test_sp")
        except Exception:
            pass
        return jsonify({"success": False, "error": str(e), "aborted_by_trigger": True})

if __name__ == '__main__':
    # Initialize database if needed
    if not os.path.exists(DB_FILE):
        print("[EUDR TraceChain] Database not found. Initializing schema and seed data...")
        init_db()
        print("[EUDR TraceChain] Database initialized successfully.")
    else:
        print("[EUDR TraceChain] Existing database detected.")
        
    print("[EUDR TraceChain] Server running at http://localhost:5000")
    app.run(host='0.0.0.0', port=5000, debug=True)
