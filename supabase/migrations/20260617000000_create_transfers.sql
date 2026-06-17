CREATE TABLE transfers (
  id TEXT PRIMARY KEY,
  hotel TEXT,
  dir TEXT,
  name TEXT,
  adults INTEGER DEFAULT 0,
  children INTEGER DEFAULT 0,
  luggage INTEGER DEFAULT 0,
  child_seat BOOLEAN DEFAULT false,
  payment TEXT,
  date DATE,
  time TEXT,
  flight TEXT,
  arrival TEXT,
  notes TEXT,
  status TEXT DEFAULT 'novo',
  driver TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_all" ON transfers FOR ALL TO anon USING (true) WITH CHECK (true);
