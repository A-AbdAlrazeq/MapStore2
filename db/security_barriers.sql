-- PostGIS schema for security.barriers with seed data
-- Run inside the target database used by GeoServer

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto; -- for gen_random_uuid()

CREATE SCHEMA IF NOT EXISTS security;

CREATE TABLE IF NOT EXISTS security.barriers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  governorate text NOT NULL,
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('حاجز ثابت', 'حاجز متحرك')),
  geom geometry(Point,4326) NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS barriers_gix ON security.barriers USING GIST (geom);

-- Seed sample rows (harmless if re-run)
INSERT INTO security.barriers (governorate, name, category, geom)
VALUES
('رام الله', 'حاجز المدخل الشمالي', 'حاجز ثابت', ST_SetSRID(ST_MakePoint(35.2041, 31.9038),4326)),
('الخليل', 'نقطة تفتيش متحركة', 'حاجز متحرك', ST_SetSRID(ST_MakePoint(35.0950, 31.5320),4326))
ON CONFLICT DO NOTHING;
