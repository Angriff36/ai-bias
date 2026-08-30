-- Conclusions are person-written claims about the AI; the answer to each claim is
-- computed from the pooled evidence of the questions attached to it.
CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  question_keys_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_claims_created ON claims(created_at DESC);

-- A report can be started by a person over a chosen set of questions.
ALTER TABLE generated_reports ADD COLUMN question_keys_json TEXT;
