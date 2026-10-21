-- Migration: Create drivers, vehicles, partners, pricing, subscriptions tables
CREATE TABLE IF NOT EXISTS drivers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vehicles (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS partners (
  id TEXT PRIMARY KEY,
  slug TEXT,
  name TEXT,
  premium BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pricing (
  id TEXT PRIMARY KEY,
  price_h2a_sedan TEXT,
  price_h2a_van TEXT,
  price_a2h_sedan TEXT,
  price_a2h_van TEXT,
  commission_percent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  endpoint TEXT,
  p256dh TEXT,
  auth TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_all" ON drivers FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_all" ON vehicles FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE partners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_all" ON partners FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_all" ON pricing FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_all" ON subscriptions FOR ALL TO anon USING (true) WITH CHECK (true);