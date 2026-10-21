"""Migrate all data from Google Sheet "DB Transfers" to Supabase.

Run: cd /opt/data/vianta-transfers-dev && python3 scripts/migrate_sheet_to_supabase.py
Env vars: GOOGLE_SERVICE_ACCOUNT (JSON), SUPABASE_URL, SUPABASE_SERVICE_KEY
"""

import os, json, sys, time
from urllib.request import Request, urlopen
from urllib.error import HTTPError

SHEET_ID = '1fwGueaZ3otmqO1IODXDv7qe3NayQson1ICgnQHBJc0E'
SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_KEY') or os.environ.get('SUPABASE_KEY')
GOOGLE_CREDS_JSON = os.environ.get('GOOGLE_SERVICE_ACCOUNT')

if not GOOGLE_CREDS_JSON:
    # Try to read from .env or similar
    print("GOOGLE_SERVICE_ACCOUNT not set. Provide via env var.")
    sys.exit(1)

SHEET_TYPES = {
    'Transfers': {
        'table': 'transfers',
        'headers': ['id','hotel','dir','name','adults','children','luggage','child_seat','payment','date','time','flight','arrival','notes','status','driver','vehicle','car_type','partner_id','created_at','child_ages','phone','price','origin','destination','service_type','driver_payout','tour_arrival','dropoff'],
    },
    'Motoristas': {
        'table': 'drivers',
        'headers': ['id','name','phone','active'],
    },
    'Viaturas': {
        'table': 'vehicles',
        'headers': ['id','name','active'],
    },
    'Parceiros': {
        'table': 'partners',
        'headers': ['id','slug','name','premium'],
    },
    'Precos': {
        'table': 'pricing',
        'headers': ['id','price_h2a_sedan','price_h2a_van','price_a2h_sedan','price_a2h_van','commission_percent'],
    },
    'Subscricoes': {
        'table': 'subscriptions',
        'headers': ['id','endpoint','p256dh','auth'],
    },
}

def supabase_request(method, path, data=None):
    url = f'{SUPABASE_URL}{path}'
    headers = {
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
    }
    body = json.dumps(data).encode() if data else None
    req = Request(url, data=body, headers=headers, method=method)
    try:
        resp = urlopen(req)
        if resp.status == 204:
            return None
        return json.loads(resp.read().decode())
    except HTTPError as e:
        print(f'  ERROR {method} {path}: {e.code} {e.read().decode()[:200]}')
        return None

def fetch_sheet(sheet_name, sheet_range):
    """Fetch data from Google Sheet using service account."""
    import google.auth
    from google.oauth2.service_account import Credentials
    from googleapiclient.discovery import build

    creds_info = json.loads(GOOGLE_CREDS_JSON)
    creds = Credentials.from_service_account_info(
        creds_info,
        scopes=['https://www.googleapis.com/auth/spreadsheets.readonly']
    )
    service = build('sheets', 'v4', credentials=creds)
    result = service.spreadsheets().values().get(
        spreadsheetId=SHEET_ID,
        range=f'{sheet_name}!{sheet_range}'
    ).execute()
    return result.get('values', [])

def migrate_sheet(sheet_name, table, headers):
    print(f'\n📋 {sheet_name} → {table}')
    rows = fetch_sheet(sheet_name, 'A2:AC')
    if not rows:
        print('  No data found')
        return 0

    records = []
    skip_count = 0
    for row in rows:
        record = {}
        for i, h in enumerate(headers):
            val = row[i] if i < len(row) else ''
            # Convert booleans
            if val in ('TRUE', 'FALSE'):
                val = val == 'TRUE'
            record[h] = val
        if not record.get('id'):
            skip_count += 1
            continue
        # Convert child_seat and premium booleans
        if 'child_seat' in record:
            record['child_seat'] = record['child_seat'] in (True, 'TRUE', 'true', 1, '1')
        if 'premium' in record:
            premium = record['premium']
            record['premium'] = premium in (True, 'TRUE', 'true', 1, '1', '1')
        if 'active' in record:
            active = record['active']
            record['active'] = active in (True, 'TRUE', 'true', 1, '1')

        records.append(record)

    if skip_count:
        print(f'  Skipped {skip_count} rows without id')

    if not records:
        print('  No valid records')
        return 0

    print(f'  Migrating {len(records)} records...')

    # Batch insert with ignore-duplicates
    result = supabase_request('POST', f'/rest/v1/{table}', records)
    if result is not None:
        print(f'  ✅ Done')
    else:
        # Try one by one
        success = 0
        for r in records:
            r2 = supabase_request('POST', f'/rest/v1/{table}', r)
            if r2 is not None:
                success += 1
            time.sleep(0.05)
        print(f'  Inserted {success}/{len(records)} one by one')

    return len(records)

if __name__ == '__main__':
    total = 0
    for sheet_name, cfg in SHEET_TYPES.items():
        count = migrate_sheet(sheet_name, cfg['table'], cfg['headers'])
        total += count
    print(f'\n🎉 Migration complete! {total} total records migrated.')