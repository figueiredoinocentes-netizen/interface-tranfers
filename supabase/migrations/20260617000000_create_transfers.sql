-- Migration: Create transfers table (full schema matching Google Sheet "DB Transfers")
CREATE TABLE IF NOT EXISTS transfers (
  id TEXT PRIMARY KEY,
  hotel TEXT,
  dir TEXT,
  name TEXT,
  adults TEXT DEFAULT '0',
  children TEXT DEFAULT '0',
  luggage TEXT DEFAULT '0',
  child_seat BOOLEAN DEFAULT false,
  payment TEXT,
  date TEXT,
  time TEXT,
  flight TEXT,
  arrival TEXT,
  notes TEXT,
  status TEXT DEFAULT 'pendente',
  driver TEXT,
  vehicle TEXT,
  car_type TEXT,
  partner_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  child_ages TEXT,
  phone TEXT,
  price TEXT,
  origin TEXT,
  destination TEXT,
  service_type TEXT DEFAULT 'transfer',
  driver_payout TEXT,
  tour_arrival TEXT,
  dropoff TEXT
);

ALTER TABLE transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_all" ON transfers FOR ALL TO anon USING (true) WITH CHECK (true);