import type { Database } from 'sql.js'

/** A typed schema migration. `id` is a stable monospace-friendly identifier. */
export interface Migration {
  id: string
  name: string
  up: (db: Database) => void
}

export const migrations: Migration[] = [
  {
    id: '0001',
    name: 'initial_schema',
    up(db) {
      db.run(`
        CREATE TABLE users (
          id INTEGER PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          display_name TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'member',
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE targets (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          model_id TEXT NOT NULL,
          endpoint_url TEXT,
          created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE experiments (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          hypothesis TEXT,
          status TEXT NOT NULL DEFAULT 'draft',
          target_id INTEGER NOT NULL REFERENCES targets(id) ON DELETE RESTRICT,
          created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE templates (
          id INTEGER PRIMARY KEY,
          experiment_id INTEGER NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          body TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE variables (
          id INTEGER PRIMARY KEY,
          template_id INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          kind TEXT NOT NULL DEFAULT 'categorical',
          UNIQUE (template_id, name)
        );

        CREATE TABLE variants (
          id INTEGER PRIMARY KEY,
          variable_id INTEGER NOT NULL REFERENCES variables(id) ON DELETE CASCADE,
          value TEXT NOT NULL,
          label TEXT
        );

        CREATE TABLE run_batches (
          id INTEGER PRIMARY KEY,
          experiment_id INTEGER NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
          status TEXT NOT NULL DEFAULT 'pending',
          started_at TEXT,
          finished_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE runs (
          id INTEGER PRIMARY KEY,
          batch_id INTEGER NOT NULL REFERENCES run_batches(id) ON DELETE CASCADE,
          template_id INTEGER NOT NULL REFERENCES templates(id) ON DELETE RESTRICT,
          status TEXT NOT NULL DEFAULT 'pending',
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE raw_responses (
          id INTEGER PRIMARY KEY,
          run_id INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
          body TEXT NOT NULL,
          content_hash TEXT NOT NULL,
          received_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE classifications (
          id INTEGER PRIMARY KEY,
          response_id INTEGER NOT NULL REFERENCES raw_responses(id) ON DELETE CASCADE,
          label TEXT NOT NULL,
          confidence REAL,
          classifier TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE observations (
          id INTEGER PRIMARY KEY,
          experiment_id INTEGER NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
          summary TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE evidence (
          id INTEGER PRIMARY KEY,
          observation_id INTEGER NOT NULL REFERENCES observations(id) ON DELETE CASCADE,
          response_id INTEGER REFERENCES raw_responses(id) ON DELETE SET NULL,
          content_hash TEXT NOT NULL,
          hash_verified INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE annotations (
          id INTEGER PRIMARY KEY,
          evidence_id INTEGER NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
          author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          note TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE judge_results (
          id INTEGER PRIMARY KEY,
          run_id INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
          judge_model TEXT NOT NULL,
          verdict TEXT NOT NULL,
          rationale TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE reports (
          id INTEGER PRIMARY KEY,
          experiment_id INTEGER NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          body TEXT NOT NULL,
          content_hash TEXT NOT NULL,
          hash_verified INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX idx_runs_batch ON runs(batch_id);
        CREATE INDEX idx_raw_responses_run ON raw_responses(run_id);
        CREATE INDEX idx_classifications_response ON classifications(response_id);
        CREATE INDEX idx_evidence_observation ON evidence(observation_id);
      `)
    },
  },
]
