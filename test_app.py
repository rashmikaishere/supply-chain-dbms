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

def test_13_get_table_rows_metadata_and_data(client):
    """5a. GET /api/tables/batches/rows returns all rows and column metadata (with PK and FK flags)."""
    res = client.get('/api/tables/batches/rows')
    assert res.status_code == 200
    data = res.get_json()
    assert data['status'] == 'success'
    assert data['table'] == 'batches'
    assert 'columns' in data
    assert 'rows' in data
    assert 'total' in data
    assert 'sql' in data
    assert 'ms' in data

    cols = {c['name']: c for c in data['columns']}
    # Primary Key check
    assert cols['batch_id']['pk'] == 1
    assert cols['batch_id']['fk'] is None

    # Foreign Key checks
    assert cols['farmer_id']['pk'] == 0
    assert cols['farmer_id']['fk'] == {'table': 'farmers', 'to': 'farmer_id'}
    assert cols['product_id']['pk'] == 0
    assert cols['product_id']['fk'] == {'table': 'products', 'to': 'product_id'}

    # Rows check
    assert len(data['rows']) == data['total']
    assert data['total'] >= 6

    # Test search query
    search_res = client.get('/api/tables/batches/rows?q=COF-0001')
    assert search_res.status_code == 200
    search_data = search_res.get_json()
    assert search_data['total'] >= 1
    assert any(r['batch_code'] == 'COF-0001' for r in search_data['rows'])

    # Test pagination
    page_res = client.get('/api/tables/batches/rows?limit=2&offset=0')
    assert page_res.status_code == 200
    page_data = page_res.get_json()
    assert len(page_data['rows']) == 2
    assert page_data['total'] == data['total']

def test_14_table_rows_invalid_name_and_injection(client):
    """5b. An unknown table name or a name like 'batches; DROP TABLE x' returns 400/404."""
    # Unknown table
    res1 = client.get('/api/tables/unknown_table/rows')
    assert res1.status_code == 404

    # SQL Injection attempt
    res2 = client.get('/api/tables/batches%3B%20DROP%20TABLE%20x/rows')
    assert res2.status_code in (400, 404)

    # Internal sqlite table
    res3 = client.get('/api/tables/sqlite_master/rows')
    assert res3.status_code in (400, 404)

def test_15_sse_stream_insert(client):
    """5c. Open /api/stream, add a farmer through POST /api/farmers, check event arrives within 2 seconds."""
    from app import sse_lock, sse_subscribers
    import queue

    q = queue.Queue()
    with sse_lock:
        sse_subscribers.append(q)

    try:
        post_res = client.post('/api/farmers', json={
            "supplier_id": 1,
            "name": "Live Event Farmer",
            "village": "Suntikoppa",
            "deforestation_free": 1
        })
        assert post_res.status_code == 201
        farmer_id = post_res.get_json()['data']['farmer_id']

        # Event must arrive within 2 seconds
        raw_event = q.get(timeout=2.0)
        event = json.loads(raw_event)
        assert event['table'] == 'farmers'
        assert event['action'] == 'INSERT'
        assert event['row_id'] == farmer_id
    finally:
        with sse_lock:
            if q in sse_subscribers:
                sse_subscribers.remove(q)

def test_16_sse_stream_update_and_delete(client):
    """5d. The same SSE check for UPDATE and DELETE."""
    from app import sse_lock, sse_subscribers
    import queue

    # 1. First create a farmer to update and delete
    create_res = client.post('/api/farmers', json={
        "supplier_id": 1,
        "name": "Farmer For Update Delete",
        "village": "Kushalnagar",
        "deforestation_free": 1
    })
    farmer_id = create_res.get_json()['data']['farmer_id']

    q = queue.Queue()
    with sse_lock:
        sse_subscribers.append(q)

    try:
        # Test UPDATE event
        update_res = client.patch(f'/api/farmers/{farmer_id}', json={
            "name": "Farmer Renamed",
            "village": "Updated Village"
        })
        assert update_res.status_code == 200

        raw_event = q.get(timeout=2.0)
        event = json.loads(raw_event)
        assert event['table'] == 'farmers'
        assert event['action'] == 'UPDATE'
        assert event['row_id'] == farmer_id

        # Test DELETE event
        delete_res = client.delete(f'/api/farmers/{farmer_id}')
        assert delete_res.status_code == 200

        raw_delete_event = q.get(timeout=2.0)
        del_event = json.loads(raw_delete_event)
        assert del_event['table'] == 'farmers'
        assert del_event['action'] == 'DELETE'
        assert del_event['row_id'] == farmer_id
    finally:
        with sse_lock:
            if q in sse_subscribers:
                sse_subscribers.remove(q)

def test_17_api_row_count_matches_sqlite(client):
    """5e. The row count from the API equals SELECT COUNT(*) from sqlite3 after every action."""
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()

    # Initial check on farmers
    api_res = client.get('/api/tables/farmers/rows')
    c.execute("SELECT COUNT(*) FROM farmers")
    db_count = c.fetchone()[0]
    assert api_res.get_json()['total'] == db_count

    # Action 1: Add a farmer
    post_res = client.post('/api/farmers', json={
        "supplier_id": 1,
        "name": "Count Check Farmer",
        "village": "Test Village",
        "deforestation_free": 1
    })
    assert post_res.status_code == 201
    f_id = post_res.get_json()['data']['farmer_id']

    api_res = client.get('/api/tables/farmers/rows')
    c.execute("SELECT COUNT(*) FROM farmers")
    db_count = c.fetchone()[0]
    assert api_res.get_json()['total'] == db_count

    # Action 2: Update farmer
    client.patch(f'/api/farmers/{f_id}', json={"name": "Count Check Renamed"})
    api_res = client.get('/api/tables/farmers/rows')
    c.execute("SELECT COUNT(*) FROM farmers")
    db_count = c.fetchone()[0]
    assert api_res.get_json()['total'] == db_count

    # Action 3: Delete farmer
    del_res = client.delete(f'/api/farmers/{f_id}')
    assert del_res.status_code == 200
    api_res = client.get('/api/tables/farmers/rows')
    c.execute("SELECT COUNT(*) FROM farmers")
    db_count = c.fetchone()[0]
    assert api_res.get_json()['total'] == db_count

    # Action 4: Add batch
    b_res = client.post('/api/batches', json={
        "farmer_id": 1,
        "product_id": 1,
        "quantity_kg": 45.0,
        "harvest_date": "2026-10-10"
    })
    assert b_res.status_code == 201
    api_b = client.get('/api/tables/batches/rows')
    c.execute("SELECT COUNT(*) FROM batches")
    db_b_count = c.fetchone()[0]
    assert api_b.get_json()['total'] == db_b_count

    conn.close()

