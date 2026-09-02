-- Let one question hold many proposals, one per compared group set, so
-- visitors can propose untested groups for an already-answered question.
ALTER TABLE question_proposals RENAME TO question_proposals_legacy;

CREATE TABLE question_proposals (
  id TEXT PRIMARY KEY,
  question_key TEXT NOT NULL,
  group_key TEXT NOT NULL DEFAULT '',
  question_text TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sampling_mode TEXT NOT NULL CHECK (sampling_mode IN ('shared-anchor', 'independent-pairs')),
  pairs_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  answered_at TEXT,
  first_run_id TEXT REFERENCES public_runs(id) ON DELETE SET NULL
);

INSERT INTO question_proposals
  (id, question_key, group_key, question_text, name, description, sampling_mode, pairs_json, created_at, answered_at, first_run_id)
SELECT id, question_key, '', question_text, name, description, sampling_mode, pairs_json, created_at, answered_at, first_run_id
FROM question_proposals_legacy;

DROP TABLE question_proposals_legacy;

CREATE UNIQUE INDEX idx_question_proposals_question_groups
  ON question_proposals(question_key, group_key);

CREATE INDEX idx_question_proposals_status_created
  ON question_proposals(answered_at, created_at DESC);
