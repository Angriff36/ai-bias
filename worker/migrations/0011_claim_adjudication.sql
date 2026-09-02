-- A Conclusions claim is adjudicated against the directional judged evidence
-- selected by its author. The structured answer remains replaceable whenever
-- its evidence fingerprint changes; the original claim and question keys stay intact.
ALTER TABLE claims ADD COLUMN adjudication_json TEXT;
ALTER TABLE claims ADD COLUMN evidence_fingerprint TEXT;
ALTER TABLE claims ADD COLUMN evaluated_at TEXT;
ALTER TABLE claims ADD COLUMN evaluation_status TEXT NOT NULL DEFAULT 'pending'
  CHECK (evaluation_status IN ('pending', 'complete', 'failed'));
ALTER TABLE claims ADD COLUMN evaluation_error TEXT;
