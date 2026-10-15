import pytest
import json
import sqlite3
import os
from app import app, init_db, DB_FILE

@pytest.fixture
def client():
    app.config['TESTING'] = True
    init_db(force=True)
    with app.test_client() as client:
        yield client

def test_1_add_supplier(client):
    """1. Add supplier -> row in suppliers + change_log row."""
    res = client.post('/api/suppliers', json={
        "name": "Coorg Specialty Traders",
        "country": "India",
        "phone": "+91 98888 11111"
    })
    assert res.status_code == 201
    data = res.get_json()
    assert data['status'] == 'success'
    assert "Coorg Specialty Traders" in data['message']
    assert len(data['tables_changed']) > 0
    assert len(data['sql']) > 0
    assert len(data['keys_used']) > 0

    # Verify directly in SQLite DB
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("SELECT supplier_id, name, country FROM suppliers WHERE name = 'Coorg Specialty Traders'")
    row = c.fetchone()
    assert row is not None
    assert row[1] == "Coorg Specialty Traders"

    c.execute("SELECT summary FROM change_log WHERE table_name = 'suppliers' ORDER BY log_id DESC LIMIT 1")
    log_row = c.fetchone()
    assert log_row is not None
    assert "Coorg Specialty Traders" in log_row[0]
    conn.close()

def test_2_add_farmer_under_chosen_supplier(client):
    """2. Add farmer under a chosen supplier -> farmers.supplier_id matches."""
    res = client.post('/api/farmers', json={
        "supplier_id": 1,
        "name": "Suresh Gowda",
        "village": "Somwarpet",
        "deforestation_free": 1
    })
    assert res.status_code == 201
    data = res.get_json()
    assert data['status'] == 'success'
    assert "Suresh Gowda" in data['message']
    assert data['data']['supplier_id'] == 1

    # Verify in DB
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("SELECT farmer_id, supplier_id, name FROM farmers WHERE name = 'Suresh Gowda'")
    row = c.fetchone()
    assert row is not None
    assert row[1] == 1
    conn.close()

def test_3_add_50kg_batch(client):
    """3. Add 50 kg batch -> batch_code auto-made, remaining = 50."""
    res = client.post('/api/batches', json={
        "farmer_id": 1,
        "product_id": 1,  # Coffee
        "quantity_kg": 50.0,
        "harvest_date": "2026-10-01"
    })
    assert res.status_code == 201
    data = res.get_json()
    assert data['status'] == 'success'
    batch_code = data['data']['batch_code']
    assert batch_code.startswith("COF-")
    assert data['data']['remaining_kg'] == 50.0

    # Check view v_batch_balance
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("SELECT batch_code, total_kg, sent_kg, remaining_kg FROM v_batch_balance WHERE batch_code = ?", (batch_code,))
    vrow = c.fetchone()
    assert vrow is not None
    assert vrow[1] == 50.0
    assert vrow[2] == 0.0
    assert vrow[3] == 50.0
    conn.close()

def test_4_send_30kg_to_warehouse(client):
    """4. Send 30 kg to a warehouse -> remaining = 20 and the warehouse shows 30."""
    # First create a fresh 50 kg batch
    b_res = client.post('/api/batches', json={
        "farmer_id": 1,
        "product_id": 1,
        "quantity_kg": 50.0
    })
    batch_id = b_res.get_json()['data']['batch_id']
    batch_code = b_res.get_json()['data']['batch_code']

    # Send 30 kg to Warehouse 1 (Cochin Port Terminal Logistics)
    send_res = client.post('/api/movements', json={
        "batch_id": batch_id,
        "destination_type": "warehouse",
        "destination_id": 1,
        "quantity_kg": 30.0
    })
    assert send_res.status_code == 201
    send_data = send_res.get_json()
    assert send_data['data']['remaining_kg'] == 20.0

    # Verify warehouse shows 30 kg added
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("SELECT remaining_kg FROM v_batch_balance WHERE batch_id = ?", (batch_id,))
    assert c.fetchone()[0] == 20.0

    c.execute("SELECT quantity_kg FROM movements WHERE batch_id = ? AND warehouse_id = 1", (batch_id,))
    assert c.fetchone()[0] == 30.0
    conn.close()

def test_5_send_20kg_to_shipment(client):
    """5. Send 20 kg to a shipment -> remaining = 0."""
    # Create fresh 50 kg batch
    b_res = client.post('/api/batches', json={
        "farmer_id": 1,
        "product_id": 1,
        "quantity_kg": 50.0
    })
    batch_id = b_res.get_json()['data']['batch_id']

    # Send 30 kg to warehouse
    client.post('/api/movements', json={
        "batch_id": batch_id,
        "destination_type": "warehouse",
        "destination_id": 1,
        "quantity_kg": 30.0
    })

    # Send remaining 20 kg to shipment 1
    send_res = client.post('/api/movements', json={
        "batch_id": batch_id,
        "destination_type": "shipment",
        "destination_id": 1,
        "quantity_kg": 20.0
    })
    assert send_res.status_code == 201
    assert send_res.get_json()['data']['remaining_kg'] == 0.0

    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("SELECT remaining_kg FROM v_batch_balance WHERE batch_id = ?", (batch_id,))
    assert c.fetchone()[0] == 0.0
    conn.close()

def test_6_send_1_more_kg_blocked(client):
    """6. Send 1 more kg -> blocked ('Only 0 kg left')."""
    # Create batch of 50 kg and send all 50 kg
    b_res = client.post('/api/batches', json={
        "farmer_id": 1,
        "product_id": 1,
        "quantity_kg": 50.0
    })
    batch_id = b_res.get_json()['data']['batch_id']

    client.post('/api/movements', json={
        "batch_id": batch_id,
        "destination_type": "warehouse",
        "destination_id": 1,
        "quantity_kg": 50.0
    })

    # Try sending 1 more kg
    fail_res = client.post('/api/movements', json={
        "batch_id": batch_id,
        "destination_type": "warehouse",
        "destination_id": 1,
        "quantity_kg": 1.0
    })
    assert fail_res.status_code == 400
    msg = fail_res.get_json()['message']
    assert "Only 0 kg left, cannot send 1 kg" in msg

def test_7_deforestation_free_rule(client):
    """7. Send a batch from the non-deforestation-free farmer to a shipment -> blocked; to a warehouse -> allowed."""
    # Farmer 4 (Dewi Lestari) has deforestation_free = 0 in seed data
    # Create batch from farmer 4
    b_res = client.post('/api/batches', json={
        "farmer_id": 4,
        "product_id": 1,
        "quantity_kg": 40.0
    })
    batch_id = b_res.get_json()['data']['batch_id']

    # 1. Try to send to shipment -> MUST BE BLOCKED
    ship_res = client.post('/api/movements', json={
        "batch_id": batch_id,
        "destination_type": "shipment",
        "destination_id": 1,
        "quantity_kg": 10.0
    })
    assert ship_res.status_code == 400
    assert "This farm's land was cleared after 31 Dec 2020. Not allowed to ship to the EU." in ship_res.get_json()['message']

    # 2. Send to warehouse -> MUST BE ALLOWED
    wh_res = client.post('/api/movements', json={
        "batch_id": batch_id,
        "destination_type": "warehouse",
        "destination_id": 2,
        "quantity_kg": 10.0
    })
    assert wh_res.status_code == 201
    assert wh_res.get_json()['status'] == 'success'

def test_8_delete_supplier_with_farmers_blocked(client):
    """8. Delete a supplier with farmers -> friendly block."""
    # Supplier 1 has farmers Ravi Varma & Ananya Nair
    res = client.delete('/api/suppliers/1')
    assert res.status_code == 400
    assert "linked to it" in res.get_json()['message']
    assert "RESTRICT" in res.get_json()['message']

    # DB verify supplier 1 still exists
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("SELECT name FROM suppliers WHERE supplier_id = 1")
    assert c.fetchone() is not None
    conn.close()

def test_9_api_trace_chain(client):
    """9. /api/trace returns Shipment -> Batch -> Farmer -> Supplier correctly."""
    # Test shipment trace: SHP-0001
    res = client.get('/api/trace/SHP-0001')
    assert res.status_code == 200
    data = res.get_json()
    assert data['status'] == 'success'
    assert len(data['records']) > 0
    rec = data['records'][0]
    assert 'shipment_code' in rec
    assert 'batch_code' in rec
    assert 'farmer_name' in rec
    assert 'supplier_name' in rec

    # Test batch trace: COF-0001
    b_trace = client.get('/api/trace/COF-0001')
    assert b_trace.status_code == 200
    b_data = b_trace.get_json()
    assert b_data['status'] == 'success'
    assert b_data['batch']['batch_code'] == 'COF-0001'
    assert b_data['batch']['farmer_name'] == 'Ravi Varma'
    assert b_data['batch']['supplier_name'] == 'Kerala Highlands Trading Co.'

def test_10_write_response_format(client):
    """10. Every write response has message, tables_changed, sql and keys_used."""
    res = client.post('/api/warehouses', json={
        "name": "Antwerp Central Depot",
        "city": "Antwerp"
    })
    assert res.status_code == 201
    data = res.get_json()
    assert 'message' in data
    assert 'tables_changed' in data
    assert 'sql' in data
    assert 'keys_used' in data

def test_11_sql_rejects_non_select(client):
    """11. /api/sql rejects non-SELECT."""
    # Test DROP TABLE
    drop_res = client.post('/api/sql', json={"sql": "DROP TABLE suppliers;"})
    assert drop_res.status_code == 400
    assert "Only" in drop_res.get_json()['message']

    # Test INSERT
    insert_res = client.post('/api/sql', json={"sql": "INSERT INTO products (name) VALUES ('Tea');"})
    assert insert_res.status_code == 400

    # Test valid SELECT
    valid_res = client.post('/api/sql', json={"sql": "SELECT * FROM suppliers;"})
    assert valid_res.status_code == 200
    assert valid_res.get_json()['row_count'] >= 3

def test_12_reset_database(client):
    """12. /api/reset restores the seed data."""
    # Modify data: add a supplier
    client.post('/api/suppliers', json={"name": "Temporary Supplier"})

    # Reset
    reset_res = client.post('/api/reset')
    assert reset_res.status_code == 200

    # Check suppliers count is back to 3
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("SELECT COUNT(*) FROM suppliers")
    assert c.fetchone()[0] == 3
    conn.close()
