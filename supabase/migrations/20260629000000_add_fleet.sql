CREATE TABLE drivers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE vehicles (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  plate TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_all" ON drivers FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_all" ON vehicles FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE transfers ADD COLUMN IF NOT EXISTS vehicle TEXT;
