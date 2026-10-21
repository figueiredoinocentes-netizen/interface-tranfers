"""Migrate data from current live API (sheets.js) to Supabase.

Runs by fetching from production Netlify API and inserting into Supabase.
"""
import json, os, sys, time
from urllib.request import Request, urlopen
from urllib.error import HTTPError

SUPABASE_URL = os.environ.get('SUPABASE_URL') or 'https://tuwcllpwvxzmrgrqviqu.supabase.co'
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_KEY') or os.environ.get('SUPABASE_KEY')
PROD_API = 'https://vianta-transfers.netlify.app/.netlify/functions/sheets'

TYPES_MAP = {
    'transfers': 'transfers',
    'drivers': 'drivers',
    'vehicles': 'vehicles',
    'partners': 'partners',
    'pricing': 'pricing',
    'subscriptions': 'subscriptions',
}

def api_request(method, url, data=None):
    headers = {'Content-Type': 'application/json'}
    body = json.dumps(data).encode() if data else None
    req = Request(url, data=body, headers=headers, method=method)
    resp = urlopen(req)
    return json.loads(resp.read().decode()) if resp.status != 204 else None

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

def migrate_type(key, table):
    print(f'\n📋 {key} → {table}')
    try:
        rows = api_request('GET', f'{PROD_API}?type={key}')
    except Exception as e:
        print(f'  Failed to fetch from production API: {e}')
        return 0

    if not rows:
        print('  No data')
        return 0

    print(f'  Fetched {len(rows)} records from production')

    # Clean boolean fields
    for row in rows:
        for k in list(row.keys()):
            # Remove None keys
            if k is None:
                del row[k]
        if 'child_seat' in row:
            v = row['child_seat']
            row['child_seat'] = v in (True, 'TRUE', 'true', 1, '1', 'True')
        if 'premium' in row:
            v = row['premium']
            row['premium'] = v in (True, 'TRUE', 'true', 1, '1', 'True')
        if 'active' in row:
            v = row['active']
            row['active'] = v in (True, 'TRUE', 'true', 1, '1', 'True')

    # Insert all
    result = supabase_request('POST', f'/rest/v1/{table}', rows)
    if result is not None:
        print(f'  ✅ Inserted {len(rows)} records')
        return len(rows)

    # Fallback: one by one, skip duplicates
    success = 0
    errors = 0
    for row in rows:
        r = supabase_request('POST', f'/rest/v1/{table}', row)
        if r is not None:
            success += 1
        else:
            errors += 1
        time.sleep(0.05)
    print(f'  Inserted {success}/{len(rows)} (skipped {errors})')
    return success

if __name__ == '__main__':
    print('=== Migrating Google Sheet → Supabase (via production API) ===')
    total = 0
    for key, table in TYPES_MAP.items():
        count = migrate_type(key, table)
        total += count
    print(f'\n🎉 Done! {total} total records migrated.')
    print('\n⚠️  Verify: go to https://supabase.com/dashboard/project/tuwcllpwvxzmrgrqviqu')
    print('   Table Editor → check transfers, drivers, vehicles, partners, pricing, subscriptions')