"""
Supply Chain Traceability DBMS Project
Flask Backend Application
"""

import os
import sqlite3
import json
import re
from datetime import datetime
from flask import Flask, render_template, request, jsonify, g

app = Flask(__name__)
BASE_DIR = os.path.dirname(__file__)
DB_FILE = os.path.join(BASE_DIR, 'eudr.db')
SCHEMA_FILE = os.path.join(BASE_DIR, 'schema.sql')
SEED_FILE = os.path.join(BASE_DIR, 'seed.sql')


def get_db():
    if 'db' not in g:
        g.db = sqlite3.connect(DB_FILE)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON;")
    return g.db


@app.teardown_appcontext
def close_db(error):
    db = g.pop('db', None)
    if db is not None:
        db.close()


def log_change(cursor, table_name, action, summary, row_data=None):
    """Writes one plain-English row to change_log for each insert, update, delete."""
    data_str = json.dumps(row_data) if isinstance(row_data, dict) else (row_data or '')
    cursor.execute(
        "INSERT INTO change_log (table_name, action, summary, row_data) VALUES (?, ?, ?, ?)",
        (table_name, action, summary, data_str)
    )


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
    cursor.execute("SELECT COUNT(*) FROM suppliers")
    if cursor.fetchone()[0] == 0:
        with open(SEED_FILE, 'r', encoding='utf-8') as f:
            conn.executescript(f.read())

    conn.commit()
    conn.close()


# --------------------------------------------------------------------
# HTML ROUTES
# --------------------------------------------------------------------
@app.route('/')
def home():
    return render_template('index.html')


@app.route('/app')
def main_app():
    return render_template('app.html')


# --------------------------------------------------------------------
# REST API: SUPPLIERS
# --------------------------------------------------------------------
@app.route('/api/suppliers', methods=['GET'])
def get_suppliers():
    db = get_db()
    cursor = db.cursor()
    query = """
        SELECT 
            s.supplier_id,
            s.name,
            s.country,
            s.phone,
            COUNT(f.farmer_id) AS farmer_count
        FROM suppliers s
        LEFT JOIN farmers f ON s.supplier_id = f.supplier_id
        GROUP BY s.supplier_id, s.name, s.country, s.phone
        ORDER BY s.supplier_id DESC
    """
    cursor.execute(query)
    rows = [dict(r) for r in cursor.fetchall()]
    return jsonify({"status": "success", "data": rows})


@app.route('/api/suppliers', methods=['POST'])
def add_supplier():
    db = get_db()
    cursor = db.cursor()
    data = request.get_json() or {}

    name = (data.get('name') or '').strip()
    country = (data.get('country') or '').strip()
    phone = (data.get('phone') or '').strip()

    if not name:
        return jsonify({"status": "error", "message": "Supplier name is required."}), 400

    try:
        sql = "INSERT INTO suppliers (name, country, phone) VALUES (?, ?, ?)"
        cursor.execute(sql, (name, country, phone))
        supplier_id = cursor.lastrowid
        summary = f"Added supplier {name} ({country or 'No country'})."
        new_row = {"supplier_id": supplier_id, "name": name, "country": country, "phone": phone}
        log_change(cursor, "suppliers", "INSERT", summary, new_row)
        db.commit()

        return jsonify({
            "status": "success",
            "message": summary,
            "data": new_row,
            "tables_changed": [{
                "table": "suppliers",
                "action": "INSERT",
                "rows": [new_row]
            }],
            "sql": [f"INSERT INTO suppliers (name, country, phone) VALUES ('{name}', '{country}', '{phone}');"],
            "keys_used": [f"suppliers.supplier_id = {supplier_id} (PK)"]
        }), 201
    except sqlite3.IntegrityError as e:
        db.rollback()
        return jsonify({"status": "error", "message": f"Supplier with name '{name}' already exists."}), 400
    except Exception as e:
        db.rollback()
        return jsonify({"status": "error", "message": str(e)}), 400


@app.route('/api/suppliers/<int:supplier_id>', methods=['DELETE'])
def delete_supplier(supplier_id):
    db = get_db()
    cursor = db.cursor()

    cursor.execute("SELECT name FROM suppliers WHERE supplier_id = ?", (supplier_id,))
    sup = cursor.fetchone()
    if not sup:
        return jsonify({"status": "error", "message": "Supplier not found."}), 404

    sup_name = sup['name']

    # Check for connected farmers
    cursor.execute("SELECT COUNT(*) FROM farmers WHERE supplier_id = ?", (supplier_id,))
    farmer_count = cursor.fetchone()[0]
    if farmer_count > 0:
        return jsonify({
            "status": "error",
            "message": f"Cannot delete supplier '{sup_name}' because {farmer_count} farmer(s) are linked to it. Foreign key RESTRICT protects your data."
        }), 400

    try:
        cursor.execute("DELETE FROM suppliers WHERE supplier_id = ?", (supplier_id,))
        summary = f"Deleted supplier '{sup_name}' (ID: {supplier_id})."
        log_change(cursor, "suppliers", "DELETE", summary, {"supplier_id": supplier_id, "name": sup_name})
        db.commit()

        return jsonify({
            "status": "success",
            "message": summary,
            "tables_changed": [{
                "table": "suppliers",
                "action": "DELETE",
                "rows": [{"supplier_id": supplier_id, "name": sup_name}]
            }],
            "sql": [f"DELETE FROM suppliers WHERE supplier_id = {supplier_id};"],
            "keys_used": [f"suppliers.supplier_id = {supplier_id} (PK)"]
        })
    except sqlite3.IntegrityError as e:
        db.rollback()
        return jsonify({"status": "error", "message": "Cannot delete supplier: linked records exist."}), 400
    except Exception as e:
        db.rollback()
        return jsonify({"status": "error", "message": str(e)}), 400


# --------------------------------------------------------------------
# REST API: FARMERS
# --------------------------------------------------------------------
@app.route('/api/farmers', methods=['GET'])
def get_farmers():
    db = get_db()
    cursor = db.cursor()
    supplier_id = request.args.get('supplier_id')

    if supplier_id:
        query = """
            SELECT 
                f.farmer_id,
                f.supplier_id,
                f.name,
                f.village,
                f.deforestation_free,
                s.name AS supplier_name,
                COUNT(b.batch_id) AS batch_count
            FROM farmers f
            JOIN suppliers s ON f.supplier_id = s.supplier_id
            LEFT JOIN batches b ON f.farmer_id = b.farmer_id
            WHERE f.supplier_id = ?
            GROUP BY f.farmer_id, f.supplier_id, f.name, f.village, f.deforestation_free, s.name
            ORDER BY f.farmer_id DESC
        """
        cursor.execute(query, (supplier_id,))
    else:
        query = """
            SELECT 
                f.farmer_id,
                f.supplier_id,
                f.name,
                f.village,
                f.deforestation_free,
                s.name AS supplier_name,
                COUNT(b.batch_id) AS batch_count
            FROM farmers f
            JOIN suppliers s ON f.supplier_id = s.supplier_id
            LEFT JOIN batches b ON f.farmer_id = b.farmer_id
            GROUP BY f.farmer_id, f.supplier_id, f.name, f.village, f.deforestation_free, s.name
            ORDER BY f.farmer_id DESC
        """
        cursor.execute(query)

    rows = [dict(r) for r in cursor.fetchall()]
    return jsonify({"status": "success", "data": rows})


@app.route('/api/farmers', methods=['POST'])
def add_farmer():
    db = get_db()
    cursor = db.cursor()
    data = request.get_json() or {}

    supplier_id = data.get('supplier_id')
    name = (data.get('name') or '').strip()
    village = (data.get('village') or '').strip()
    deforestation_free = int(data.get('deforestation_free', 1))

    if not name:
        return jsonify({"status": "error", "message": "Farmer name is required."}), 400
    if not supplier_id:
        return jsonify({"status": "error", "message": "Please choose which supplier this farmer belongs to."}), 400

    # Verify supplier exists
    cursor.execute("SELECT name FROM suppliers WHERE supplier_id = ?", (supplier_id,))
    sup = cursor.fetchone()
    if not sup:
        return jsonify({"status": "error", "message": f"Supplier with ID {supplier_id} does not exist."}), 400

    supplier_name = sup['name']

    try:
        sql = "INSERT INTO farmers (supplier_id, name, village, deforestation_free) VALUES (?, ?, ?, ?)"
        cursor.execute(sql, (supplier_id, name, village, deforestation_free))
        farmer_id = cursor.lastrowid
        summary = f"You added farmer {name} under {supplier_name}."
        new_row = {
            "farmer_id": farmer_id,
            "supplier_id": supplier_id,
            "supplier_name": supplier_name,
            "name": name,
            "village": village,
            "deforestation_free": deforestation_free
        }
        log_change(cursor, "farmers", "INSERT", summary, new_row)
        db.commit()

        return jsonify({
            "status": "success",
            "message": summary,
            "data": new_row,
            "tables_changed": [{
                "table": "farmers",
                "action": "INSERT",
                "rows": [new_row]
            }],
            "sql": [f"INSERT INTO farmers (supplier_id, name, village, deforestation_free) VALUES ({supplier_id}, '{name}', '{village}', {deforestation_free});"],
            "keys_used": [
                f"farmers.supplier_id -> suppliers.supplier_id ({supplier_id})",
                f"farmers.farmer_id = {farmer_id} (PK)"
            ]
        }), 201
    except Exception as e:
        db.rollback()
        return jsonify({"status": "error", "message": str(e)}), 400


@app.route('/api/farmers/<int:farmer_id>', methods=['DELETE'])
def delete_farmer(farmer_id):
    db = get_db()
    cursor = db.cursor()

    cursor.execute("SELECT name FROM farmers WHERE farmer_id = ?", (farmer_id,))
    f_row = cursor.fetchone()
    if not f_row:
        return jsonify({"status": "error", "message": "Farmer not found."}), 404

    farmer_name = f_row['name']

    # Check for batches
    cursor.execute("SELECT COUNT(*) FROM batches WHERE farmer_id = ?", (farmer_id,))
    batch_count = cursor.fetchone()[0]
    if batch_count > 0:
        return jsonify({
            "status": "error",
            "message": f"Cannot delete farmer '{farmer_name}' because {batch_count} product batch(es) are linked to them. Foreign key RESTRICT protects your data."
        }), 400

    try:
        cursor.execute("DELETE FROM farmers WHERE farmer_id = ?", (farmer_id,))
        summary = f"Deleted farmer '{farmer_name}' (ID: {farmer_id})."
        log_change(cursor, "farmers", "DELETE", summary, {"farmer_id": farmer_id, "name": farmer_name})
        db.commit()

        return jsonify({
            "status": "success",
            "message": summary,
            "tables_changed": [{
                "table": "farmers",
                "action": "DELETE",
                "rows": [{"farmer_id": farmer_id, "name": farmer_name}]
            }],
            "sql": [f"DELETE FROM farmers WHERE farmer_id = {farmer_id};"],
            "keys_used": [f"farmers.farmer_id = {farmer_id} (PK)"]
        })
    except sqlite3.IntegrityError:
        db.rollback()
        return jsonify({"status": "error", "message": "Cannot delete farmer: linked batches exist."}), 400
    except Exception as e:
        db.rollback()
        return jsonify({"status": "error", "message": str(e)}), 400


# --------------------------------------------------------------------
# REST API: PRODUCTS
# --------------------------------------------------------------------
@app.route('/api/products', methods=['GET'])
def get_products():
    db = get_db()
    cursor = db.cursor()
    cursor.execute("SELECT product_id, name FROM products ORDER BY product_id")
    rows = [dict(r) for r in cursor.fetchall()]
    return jsonify({"status": "success", "data": rows})


# --------------------------------------------------------------------
# REST API: BATCHES
# --------------------------------------------------------------------
def generate_batch_code(cursor, product_name):
    """Auto-generate batch codes like COF-0001, COC-0002 based on product prefix."""
    prefix_map = {
        'Coffee': 'COF',
        'Cocoa': 'COC',
        'Palm Oil': 'PAL',
        'Soya': 'SOY',
        'Rubber': 'RUB',
        'Wood': 'WOD',
        'Cattle': 'CTL'
    }
    prefix = prefix_map.get(product_name, 'BAT')
    cursor.execute("SELECT batch_code FROM batches WHERE batch_code LIKE ? ORDER BY batch_id DESC LIMIT 1", (f"{prefix}-%",))
    last = cursor.fetchone()
    next_num = 1
    if last:
        match = re.search(r'-(\d+)$', last['batch_code'])
        if match:
            next_num = int(match.group(1)) + 1
    return f"{prefix}-{next_num:04d}"


@app.route('/api/batches', methods=['GET'])
def get_batches():
    db = get_db()
    cursor = db.cursor()
    query = """
        SELECT 
            b.batch_id,
            b.batch_code,
            b.quantity_kg AS total_kg,
            vb.remaining_kg,
            vb.sent_kg,
            b.harvest_date,
            f.farmer_id,
            f.name AS farmer_name,
            f.village,
            f.deforestation_free,
            s.supplier_id,
            s.name AS supplier_name,
            p.product_id,
            p.name AS product_name
        FROM batches b
        JOIN v_batch_balance vb ON b.batch_id = vb.batch_id
        JOIN farmers f ON b.farmer_id = f.farmer_id
        JOIN suppliers s ON f.supplier_id = s.supplier_id
        JOIN products p ON b.product_id = p.product_id
        ORDER BY b.batch_id DESC
    """
    cursor.execute(query)
    rows = [dict(r) for r in cursor.fetchall()]
    return jsonify({"status": "success", "data": rows})


@app.route('/api/batches', methods=['POST'])
def add_batch():
    db = get_db()
    cursor = db.cursor()
    data = request.get_json() or {}

    farmer_id = data.get('farmer_id')
    product_id = data.get('product_id')
    harvest_date = data.get('harvest_date') or datetime.now().strftime('%Y-%m-%d')
    try:
        quantity_kg = float(data.get('quantity_kg', 0))
    except (ValueError, TypeError):
        return jsonify({"status": "error", "message": "Quantity must be a valid positive number."}), 400

    if quantity_kg <= 0:
        return jsonify({"status": "error", "message": "Quantity must be greater than 0 kg."}), 400
    if not farmer_id:
        return jsonify({"status": "error", "message": "Please select a farmer."}), 400
    if not product_id:
        return jsonify({"status": "error", "message": "Please select a product."}), 400

    # Look up farmer and product
    cursor.execute("""
        SELECT f.name AS farmer_name, s.name AS supplier_name, f.supplier_id
        FROM farmers f
        JOIN suppliers s ON f.supplier_id = s.supplier_id
        WHERE f.farmer_id = ?
    """, (farmer_id,))
    f_info = cursor.fetchone()
    if not f_info:
        return jsonify({"status": "error", "message": "Selected farmer does not exist."}), 400

    cursor.execute("SELECT name FROM products WHERE product_id = ?", (product_id,))
    p_info = cursor.fetchone()
    if not p_info:
        return jsonify({"status": "error", "message": "Selected product does not exist."}), 400

    product_name = p_info['name']
    batch_code = generate_batch_code(cursor, product_name)

    try:
        sql = "INSERT INTO batches (batch_code, farmer_id, product_id, quantity_kg, harvest_date) VALUES (?, ?, ?, ?, ?)"
        cursor.execute(sql, (batch_code, farmer_id, product_id, quantity_kg, harvest_date))
        batch_id = cursor.lastrowid
        summary = f"Created batch {batch_code} ({quantity_kg} kg {product_name}) from farmer {f_info['farmer_name']}."
        new_row = {
            "batch_id": batch_id,
            "batch_code": batch_code,
            "farmer_id": farmer_id,
            "farmer_name": f_info['farmer_name'],
            "supplier_name": f_info['supplier_name'],
            "product_id": product_id,
            "product_name": product_name,
            "total_kg": quantity_kg,
            "remaining_kg": quantity_kg,
            "harvest_date": harvest_date
        }
        log_change(cursor, "batches", "INSERT", summary, new_row)
        db.commit()

        return jsonify({
            "status": "success",
            "message": summary,
            "data": new_row,
            "tables_changed": [{
                "table": "batches",
                "action": "INSERT",
                "rows": [new_row]
            }],
            "sql": [f"INSERT INTO batches (batch_code, farmer_id, product_id, quantity_kg, harvest_date) VALUES ('{batch_code}', {farmer_id}, {product_id}, {quantity_kg}, '{harvest_date}');"],
            "keys_used": [
                f"batches.farmer_id -> farmers.farmer_id ({farmer_id})",
                f"batches.product_id -> products.product_id ({product_id})",
                f"batches.batch_id = {batch_id} (PK)"
            ]
        }), 201
    except Exception as e:
        db.rollback()
        return jsonify({"status": "error", "message": str(e)}), 400


# --------------------------------------------------------------------
# REST API: WAREHOUSES
# --------------------------------------------------------------------
@app.route('/api/warehouses', methods=['GET'])
def get_warehouses():
    db = get_db()
    cursor = db.cursor()
    cursor.execute("""
        SELECT 
            w.warehouse_id,
            w.name,
            w.city,
            COALESCE(SUM(m.quantity_kg), 0.0) AS total_kg_stored,
            COUNT(m.movement_id) AS batch_count
        FROM warehouses w
        LEFT JOIN movements m ON w.warehouse_id = m.warehouse_id
        GROUP BY w.warehouse_id, w.name, w.city
        ORDER BY w.warehouse_id ASC
    """)
    rows = [dict(r) for r in cursor.fetchall()]

    # If details requested or for individual item checks, attach batches stored
    for w in rows:
        cursor.execute("""
            SELECT 
                b.batch_code,
                p.name AS product,
                m.quantity_kg,
                f.name AS farmer_name,
                m.moved_date
            FROM movements m
            JOIN batches b ON m.batch_id = b.batch_id
            JOIN products p ON b.product_id = p.product_id
            JOIN farmers f ON b.farmer_id = f.farmer_id
            WHERE m.warehouse_id = ?
            ORDER BY m.moved_date DESC
        """, (w['warehouse_id'],))
        w['batches_inside'] = [dict(b) for b in cursor.fetchall()]

    return jsonify({"status": "success", "data": rows})


@app.route('/api/warehouses', methods=['POST'])
def add_warehouse():
    db = get_db()
    cursor = db.cursor()
    data = request.get_json() or {}

    name = (data.get('name') or '').strip()
    city = (data.get('city') or '').strip()

    if not name:
        return jsonify({"status": "error", "message": "Warehouse name is required."}), 400

    try:
        sql = "INSERT INTO warehouses (name, city) VALUES (?, ?)"
        cursor.execute(sql, (name, city))
        warehouse_id = cursor.lastrowid
        summary = f"Added warehouse {name} in {city or 'Unknown city'}."
        new_row = {"warehouse_id": warehouse_id, "name": name, "city": city, "total_kg_stored": 0.0}
        log_change(cursor, "warehouses", "INSERT", summary, new_row)
        db.commit()

        return jsonify({
            "status": "success",
            "message": summary,
            "data": new_row,
            "tables_changed": [{
                "table": "warehouses",
                "action": "INSERT",
                "rows": [new_row]
            }],
            "sql": [f"INSERT INTO warehouses (name, city) VALUES ('{name}', '{city}');"],
            "keys_used": [f"warehouses.warehouse_id = {warehouse_id} (PK)"]
        }), 201
    except Exception as e:
        db.rollback()
        return jsonify({"status": "error", "message": str(e)}), 400


# --------------------------------------------------------------------
# REST API: SHIPMENTS
# --------------------------------------------------------------------
def generate_shipment_code(cursor):
    cursor.execute("SELECT shipment_code FROM shipments ORDER BY shipment_id DESC LIMIT 1")
    last = cursor.fetchone()
    next_num = 1
    if last:
        match = re.search(r'-(\d+)$', last['shipment_code'])
        if match:
            next_num = int(match.group(1)) + 1
    return f"SHP-{next_num:04d}"


@app.route('/api/shipments', methods=['GET'])
def get_shipments():
    db = get_db()
    cursor = db.cursor()
    cursor.execute("""
        SELECT 
            s.shipment_id,
            s.shipment_code,
            s.destination,
            s.status,
            COALESCE(SUM(m.quantity_kg), 0.0) AS total_kg,
            COUNT(m.movement_id) AS batch_count
        FROM shipments s
        LEFT JOIN movements m ON s.shipment_id = m.shipment_id
        GROUP BY s.shipment_id, s.shipment_code, s.destination, s.status
        ORDER BY s.shipment_id DESC
    """)
    rows = [dict(r) for r in cursor.fetchall()]

    for s in rows:
        cursor.execute("""
            SELECT 
                b.batch_code,
                p.name AS product,
                m.quantity_kg,
                f.name AS farmer_name,
                sup.name AS supplier_name,
                m.moved_date
            FROM movements m
            JOIN batches b ON m.batch_id = b.batch_id
            JOIN products p ON b.product_id = p.product_id
            JOIN farmers f ON b.farmer_id = f.farmer_id
            JOIN suppliers sup ON f.supplier_id = sup.supplier_id
            WHERE m.shipment_id = ?
            ORDER BY m.moved_date DESC
        """, (s['shipment_id'],))
        s['batches_inside'] = [dict(b) for b in cursor.fetchall()]

    return jsonify({"status": "success", "data": rows})


@app.route('/api/shipments', methods=['POST'])
def add_shipment():
    db = get_db()
    cursor = db.cursor()
    data = request.get_json() or {}

    destination = (data.get('destination') or '').strip()
    status = data.get('status') or 'Preparing'

    if not destination:
        return jsonify({"status": "error", "message": "Shipment destination is required."}), 400
    if status not in ('Preparing', 'In Transit', 'Delivered'):
        return jsonify({"status": "error", "message": "Status must be Preparing, In Transit, or Delivered."}), 400

    shipment_code = generate_shipment_code(cursor)

    try:
        sql = "INSERT INTO shipments (shipment_code, destination, status) VALUES (?, ?, ?)"
        cursor.execute(sql, (shipment_code, destination, status))
        shipment_id = cursor.lastrowid
        summary = f"Created shipment {shipment_code} bound for {destination} (Status: {status})."
        new_row = {"shipment_id": shipment_id, "shipment_code": shipment_code, "destination": destination, "status": status, "total_kg": 0.0}
        log_change(cursor, "shipments", "INSERT", summary, new_row)
        db.commit()

        return jsonify({
            "status": "success",
            "message": summary,
            "data": new_row,
            "tables_changed": [{
                "table": "shipments",
                "action": "INSERT",
                "rows": [new_row]
            }],
            "sql": [f"INSERT INTO shipments (shipment_code, destination, status) VALUES ('{shipment_code}', '{destination}', '{status}');"],
            "keys_used": [f"shipments.shipment_id = {shipment_id} (PK)"]
        }), 201
    except Exception as e:
        db.rollback()
        return jsonify({"status": "error", "message": str(e)}), 400


@app.route('/api/shipments/<int:shipment_id>/status', methods=['PATCH'])
def update_shipment_status(shipment_id):
    db = get_db()
    cursor = db.cursor()
    data = request.get_json() or {}
    new_status = data.get('status')

    if new_status not in ('Preparing', 'In Transit', 'Delivered'):
        return jsonify({"status": "error", "message": "Invalid status. Must be Preparing, In Transit, or Delivered."}), 400

    cursor.execute("SELECT shipment_code, status FROM shipments WHERE shipment_id = ?", (shipment_id,))
    ship = cursor.fetchone()
    if not ship:
        return jsonify({"status": "error", "message": "Shipment not found."}), 404

    old_status = ship['status']
    shipment_code = ship['shipment_code']

    try:
        cursor.execute("UPDATE shipments SET status = ? WHERE shipment_id = ?", (new_status, shipment_id))
        summary = f"Updated shipment {shipment_code} status from '{old_status}' to '{new_status}'."
        row_data = {
            "shipment_id": shipment_id,
            "shipment_code": shipment_code,
            "old_status": old_status,
            "new_status": new_status
        }
        log_change(cursor, "shipments", "UPDATE", summary, row_data)
        db.commit()

        return jsonify({
            "status": "success",
            "message": summary,
            "tables_changed": [{
                "table": "shipments",
                "action": "UPDATE",
                "rows": [{"shipment_id": shipment_id, "status": new_status, "old_status": old_status}]
            }],
            "sql": [f"UPDATE shipments SET status = '{new_status}' WHERE shipment_id = {shipment_id};"],
            "keys_used": [f"shipments.shipment_id = {shipment_id} (PK)"]
        })
    except Exception as e:
        db.rollback()
        return jsonify({"status": "error", "message": str(e)}), 400


# --------------------------------------------------------------------
# REST API: MOVEMENTS (THE SEND FLOW)
# --------------------------------------------------------------------
@app.route('/api/movements', methods=['POST'])
def add_movement():
    db = get_db()
    cursor = db.cursor()
    data = request.get_json() or {}

    batch_id = data.get('batch_id')
    destination_type = data.get('destination_type')  # 'warehouse' or 'shipment'
    destination_id = data.get('destination_id')
    moved_date = data.get('moved_date') or datetime.now().strftime('%Y-%m-%d')

    try:
        quantity_kg = float(data.get('quantity_kg', 0))
    except (ValueError, TypeError):
        return jsonify({"status": "error", "message": "Quantity must be a valid positive number."}), 400

    if quantity_kg <= 0:
        return jsonify({"status": "error", "message": "Quantity to send must be greater than 0 kg."}), 400
    if not batch_id:
        return jsonify({"status": "error", "message": "Please specify a batch to send."}), 400
    if destination_type not in ('warehouse', 'shipment'):
        return jsonify({"status": "error", "message": "Destination type must be either 'warehouse' or 'shipment'."}), 400
    if not destination_id:
        return jsonify({"status": "error", "message": f"Please select a target {destination_type}."}), 400

    # 1. Fetch batch balance and farmer deforestation status
    cursor.execute("""
        SELECT 
            b.batch_id,
            b.batch_code,
            b.quantity_kg AS total_kg,
            vb.remaining_kg,
            f.farmer_id,
            f.name AS farmer_name,
            f.deforestation_free,
            p.name AS product_name
        FROM batches b
        JOIN v_batch_balance vb ON b.batch_id = vb.batch_id
        JOIN farmers f ON b.farmer_id = f.farmer_id
        JOIN products p ON b.product_id = p.product_id
        WHERE b.batch_id = ?
    """, (batch_id,))
    batch_info = cursor.fetchone()

    if not batch_info:
        return jsonify({"status": "error", "message": "Batch not found."}), 404

    batch_code = batch_info['batch_code']
    remaining_kg = round(float(batch_info['remaining_kg']), 2)

    # Business Rule 1: Remaining kg check
    if quantity_kg > remaining_kg:
        rem_display = int(remaining_kg) if remaining_kg.is_integer() else remaining_kg
        qty_display = int(quantity_kg) if quantity_kg.is_integer() else quantity_kg
        return jsonify({
            "status": "error",
            "message": f"Only {rem_display} kg left, cannot send {qty_display} kg."
        }), 400

    warehouse_id = int(destination_id) if destination_type == 'warehouse' else None
    shipment_id = int(destination_id) if destination_type == 'shipment' else None

    # Business Rule 2: Deforestation-free check for shipments
    if destination_type == 'shipment':
        if batch_info['deforestation_free'] == 0:
            return jsonify({
                "status": "error",
                "message": "This farm's land was cleared after 31 Dec 2020. Not allowed to ship to the EU."
            }), 400

        # Verify shipment exists
        cursor.execute("SELECT shipment_code, destination FROM shipments WHERE shipment_id = ?", (shipment_id,))
        ship_dest = cursor.fetchone()
        if not ship_dest:
            return jsonify({"status": "error", "message": "Selected shipment does not exist."}), 400
        target_name = f"shipment {ship_dest['shipment_code']} ({ship_dest['destination']})"
        key_used = f"movements.shipment_id -> shipments.shipment_id ({shipment_id})"
    else:
        # Verify warehouse exists
        cursor.execute("SELECT name, city FROM warehouses WHERE warehouse_id = ?", (warehouse_id,))
        wh_dest = cursor.fetchone()
        if not wh_dest:
            return jsonify({"status": "error", "message": "Selected warehouse does not exist."}), 400
        target_name = f"warehouse {wh_dest['name']} in {wh_dest['city']}"
        key_used = f"movements.warehouse_id -> warehouses.warehouse_id ({warehouse_id})"

    try:
        sql = """
            INSERT INTO movements (batch_id, quantity_kg, warehouse_id, shipment_id, moved_date)
            VALUES (?, ?, ?, ?, ?)
        """
        cursor.execute(sql, (batch_id, quantity_kg, warehouse_id, shipment_id, moved_date))
        movement_id = cursor.lastrowid
        new_remaining = round(remaining_kg - quantity_kg, 2)

        summary = f"Sent {quantity_kg} kg of batch {batch_code} to {target_name}. ({new_remaining} kg now remaining)."
        new_row = {
            "movement_id": movement_id,
            "batch_id": batch_id,
            "batch_code": batch_code,
            "quantity_kg": quantity_kg,
            "warehouse_id": warehouse_id,
            "shipment_id": shipment_id,
            "moved_date": moved_date,
            "remaining_kg": new_remaining
        }
        log_change(cursor, "movements", "INSERT", summary, new_row)
        db.commit()

        return jsonify({
            "status": "success",
            "message": summary,
            "data": new_row,
            "tables_changed": [
                {
                    "table": "movements",
                    "action": "INSERT",
                    "rows": [new_row]
                },
                {
                    "table": "batches",
                    "action": "UPDATE",
                    "rows": [{
                        "batch_id": batch_id,
                        "batch_code": batch_code,
                        "previous_remaining_kg": remaining_kg,
                        "new_remaining_kg": new_remaining
                    }]
                }
            ],
            "sql": [
                f"INSERT INTO movements (batch_id, quantity_kg, warehouse_id, shipment_id, moved_date) VALUES ({batch_id}, {quantity_kg}, {warehouse_id or 'NULL'}, {shipment_id or 'NULL'}, '{moved_date}');"
            ],
            "keys_used": [
                f"movements.batch_id -> batches.batch_id ({batch_id})",
                key_used,
                f"movements.movement_id = {movement_id} (PK)"
            ]
        }), 201
    except Exception as e:
        db.rollback()
        return jsonify({"status": "error", "message": str(e)}), 400


# --------------------------------------------------------------------
# REST API: TRACE
# --------------------------------------------------------------------
@app.route('/api/trace/<string:code>', methods=['GET'])
def get_trace(code):
    """
    Returns the full traceability chain for a batch code (e.g., COF-0001)
    or shipment code (e.g., SHP-0001).
    Follows: Supplier <- Farmer -> Batch -> Warehouse / Shipment
    """
    db = get_db()
    cursor = db.cursor()
    code = code.strip()

    # Is it a shipment code?
    if code.upper().startswith('SHP-'):
        cursor.execute("""
            SELECT 
                s.shipment_id,
                s.shipment_code,
                s.destination,
                s.status AS shipment_status,
                m.movement_id,
                m.quantity_kg AS moved_kg,
                m.moved_date,
                b.batch_id,
                b.batch_code,
                b.quantity_kg AS batch_total_kg,
                b.harvest_date,
                p.product_id,
                p.name AS product_name,
                f.farmer_id,
                f.name AS farmer_name,
                f.village,
                f.deforestation_free,
                sup.supplier_id,
                sup.name AS supplier_name,
                sup.country AS supplier_country,
                sup.phone AS supplier_phone
            FROM shipments s
            JOIN movements m ON s.shipment_id = m.shipment_id
            JOIN batches b ON m.batch_id = b.batch_id
            JOIN products p ON b.product_id = p.product_id
            JOIN farmers f ON b.farmer_id = f.farmer_id
            JOIN suppliers sup ON f.supplier_id = sup.supplier_id
            WHERE s.shipment_code = ?
            ORDER BY m.moved_date
        """, (code,))
        records = [dict(r) for r in cursor.fetchall()]
        if not records:
            # Check if empty shipment exists
            cursor.execute("SELECT * FROM shipments WHERE shipment_code = ?", (code,))
            s_row = cursor.fetchone()
            if s_row:
                return jsonify({
                    "status": "success",
                    "mode": "shipment_to_farmer",
                    "target_code": code,
                    "records": [],
                    "message": f"Shipment {code} has no batches assigned to it yet."
                })
            return jsonify({"status": "error", "message": f"Shipment '{code}' not found."}), 404

        return jsonify({
            "status": "success",
            "mode": "shipment_to_farmer",
            "target_code": code,
            "records": records,
            "keys_path": "shipments.shipment_id <- movements.shipment_id -> movements.batch_id -> batches.batch_id -> batches.farmer_id -> farmers.farmer_id -> farmers.supplier_id -> suppliers.supplier_id"
        })

    else:
        # Assume batch code
        cursor.execute("""
            SELECT 
                b.batch_id,
                b.batch_code,
                b.quantity_kg AS batch_total_kg,
                vb.remaining_kg,
                vb.sent_kg,
                b.harvest_date,
                p.product_id,
                p.name AS product_name,
                f.farmer_id,
                f.name AS farmer_name,
                f.village,
                f.deforestation_free,
                sup.supplier_id,
                sup.name AS supplier_name,
                sup.country AS supplier_country,
                sup.phone AS supplier_phone
            FROM batches b
            JOIN v_batch_balance vb ON b.batch_id = vb.batch_id
            JOIN products p ON b.product_id = p.product_id
            JOIN farmers f ON b.farmer_id = f.farmer_id
            JOIN suppliers sup ON f.supplier_id = sup.supplier_id
            WHERE b.batch_code = ?
        """, (code,))
        batch = cursor.fetchone()
        if not batch:
            return jsonify({"status": "error", "message": f"Batch '{code}' not found."}), 404

        batch_dict = dict(batch)

        # Retrieve downstream movements
        cursor.execute("""
            SELECT 
                m.movement_id,
                m.quantity_kg,
                m.moved_date,
                w.warehouse_id,
                w.name AS warehouse_name,
                w.city AS warehouse_city,
                s.shipment_id,
                s.shipment_code,
                s.destination AS shipment_destination,
                s.status AS shipment_status
            FROM movements m
            LEFT JOIN warehouses w ON m.warehouse_id = w.warehouse_id
            LEFT JOIN shipments s ON m.shipment_id = s.shipment_id
            WHERE m.batch_id = ?
            ORDER BY m.moved_date
        """, (batch_dict['batch_id'],))
        movements = [dict(m) for m in cursor.fetchall()]
        batch_dict['movements'] = movements

        return jsonify({
            "status": "success",
            "mode": "farmer_to_shipment",
            "target_code": code,
            "batch": batch_dict,
            "keys_path": "suppliers.supplier_id <- farmers.supplier_id -> farmers.farmer_id <- batches.farmer_id -> batches.batch_id <- movements.batch_id -> (warehouses.warehouse_id | shipments.shipment_id)"
        })


# --------------------------------------------------------------------
# REST API: CHANGE LOG
# --------------------------------------------------------------------
@app.route('/api/changes', methods=['GET'])
def get_changes():
    db = get_db()
    cursor = db.cursor()
    limit = int(request.args.get('limit', 50))
    cursor.execute("""
        SELECT log_id, table_name, action, summary, row_data, changed_at
        FROM change_log
        ORDER BY log_id DESC
        LIMIT ?
    """, (limit,))
    rows = [dict(r) for r in cursor.fetchall()]
    return jsonify({"status": "success", "data": rows})


# --------------------------------------------------------------------
# REST API: SCHEMA
# --------------------------------------------------------------------
@app.route('/api/schema', methods=['GET'])
def get_schema():
    """Returns database tables, column definitions, and foreign key relations from SQLite PRAGMA."""
    db = get_db()
    cursor = db.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    tables = [r['name'] for r in cursor.fetchall()]

    schema_info = {}
    for tbl in tables:
        cursor.execute(f"PRAGMA table_info({tbl})")
        columns = [dict(c) for c in cursor.fetchall()]

        cursor.execute(f"PRAGMA foreign_key_list({tbl})")
        fks = [dict(f) for f in cursor.fetchall()]

        cursor.execute(f"SELECT COUNT(*) FROM {tbl}")
        row_count = cursor.fetchone()[0]

        schema_info[tbl] = {
            "columns": columns,
            "foreign_keys": fks,
            "row_count": row_count
        }

    return jsonify({"status": "success", "tables": schema_info})


# --------------------------------------------------------------------
# REST API: RAW TABLE DATA (Data Tables Browser)
# --------------------------------------------------------------------
@app.route('/api/table-data/<string:table_name>', methods=['GET'])
def get_table_data(table_name):
    allowed_tables = ['suppliers', 'farmers', 'products', 'batches', 'warehouses', 'shipments', 'movements', 'change_log']
    if table_name not in allowed_tables:
        return jsonify({"status": "error", "message": f"Table '{table_name}' does not exist or cannot be browsed."}), 400

    db = get_db()
    cursor = db.cursor()
    search = request.args.get('search', '').strip()

    try:
        if search:
            cursor.execute(f"PRAGMA table_info({table_name})")
            cols = [c['name'] for c in cursor.fetchall()]
            conditions = " OR ".join([f"CAST({c} AS TEXT) LIKE ?" for c in cols])
            sql = f"SELECT * FROM {table_name} WHERE {conditions} ORDER BY 1 DESC LIMIT 100"
            cursor.execute(sql, [f"%{search}%"] * len(cols))
        else:
            sql = f"SELECT * FROM {table_name} ORDER BY 1 DESC LIMIT 100"
            cursor.execute(sql)

        rows = [dict(r) for r in cursor.fetchall()]
        return jsonify({"status": "success", "table": table_name, "data": rows, "count": len(rows)})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 400


# --------------------------------------------------------------------
# REST API: ASK THE DATABASE (SELECT ONLY)
# --------------------------------------------------------------------
@app.route('/api/sql', methods=['POST'])
def run_sql():
    data = request.get_json() or {}
    raw_query = (data.get('sql') or '').strip()

    if not raw_query:
        return jsonify({"status": "error", "message": "SQL query cannot be empty."}), 400

    # Strict check: must start with SELECT or WITH and contain no modifying statements
    cleaned = re.sub(r'--.*?\n', '', raw_query, flags=re.MULTILINE).strip()
    cleaned = re.sub(r'/\*.*?\*/', '', cleaned, flags=re.DOTALL).strip()
    first_word = cleaned.split()[0].upper() if cleaned.split() else ''

    if first_word not in ('SELECT', 'WITH', 'EXPLAIN', 'PRAGMA'):
        return jsonify({
            "status": "error",
            "message": "Only read-only SELECT queries are permitted in this console."
        }), 400

    forbidden_keywords = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE', 'REPLACE', 'ATTACH', 'DETACH', 'VACUUM']
    for kw in forbidden_keywords:
        if re.search(r'\b' + kw + r'\b', cleaned, re.IGNORECASE):
            return jsonify({
                "status": "error",
                "message": f"Modifying command '{kw}' is rejected. Only SELECT statements are permitted."
            }), 400

    db = get_db()
    cursor = db.cursor()

    try:
        cursor.execute(raw_query)
        rows = [dict(r) for r in cursor.fetchall()]
        cols = [d[0] for d in cursor.description] if cursor.description else []
        return jsonify({
            "status": "success",
            "columns": cols,
            "data": rows,
            "row_count": len(rows)
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 400


# --------------------------------------------------------------------
# REST API: RESET DATABASE
# --------------------------------------------------------------------
@app.route('/api/reset', methods=['POST'])
def reset_database():
    try:
        init_db(force=True)
        return jsonify({
            "status": "success",
            "message": "Database successfully reset to initial clean seed data."
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# --------------------------------------------------------------------
# STATS API (For Home / Dashboard)
# --------------------------------------------------------------------
@app.route('/api/stats', methods=['GET'])
def get_stats():
    db = get_db()
    cursor = db.cursor()

    cursor.execute("SELECT COUNT(*) FROM suppliers")
    suppliers_count = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM farmers")
    farmers_count = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM batches")
    batches_count = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM warehouses")
    warehouses_count = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM shipments")
    shipments_count = cursor.fetchone()[0]

    cursor.execute("SELECT log_id, summary, changed_at FROM change_log ORDER BY log_id DESC LIMIT 8")
    recent_changes = [dict(r) for r in cursor.fetchall()]

    return jsonify({
        "status": "success",
        "counts": {
            "suppliers": suppliers_count,
            "farmers": farmers_count,
            "batches": batches_count,
            "warehouses": warehouses_count,
            "shipments": shipments_count
        },
        "recent_changes": recent_changes
    })


if __name__ == '__main__':
    init_db(force=False)
    app.run(host='0.0.0.0', port=5000, debug=True)
