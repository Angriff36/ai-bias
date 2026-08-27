-- Independent matched samples need a stable primary key; pair_index + run_index alone collides across public runs.
CREATE TABLE report_pair_scores_v2 (
  report_id TEXT NOT NULL REFERENCES generated_reports(id) ON DELETE CASCADE,
  pair_sample_id TEXT NOT NULL,
  pair_index INTEGER NOT NULL,
  run_index INTEGER NOT NULL,
  provider TEXT NOT NULL,
  model_id TEXT NOT NULL,
  score_json TEXT NOT NULL,
  PRIMARY KEY (report_id, pair_sample_id)
);

INSERT INTO report_pair_scores_v2 (report_id, pair_sample_id, pair_index, run_index, provider, model_id, score_json)
SELECT
  report_id,
  pair_index || ':' || run_index || ':' || provider || ':' || model_id,
  pair_index,
  run_index,
  provider,
  model_id,
  score_json
FROM report_pair_scores;

DROP TABLE report_pair_scores;
ALTER TABLE report_pair_scores_v2 RENAME TO report_pair_scores;
