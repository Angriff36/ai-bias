import type { Database } from 'sql.js'

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

        CREATE TABLE reports (
          id INTEGER PRIMARY KEY,
          experiment_id INTEGER NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          body TEXT NOT NULL,
          content_hash TEXT NOT NULL,
          hash_verified INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `)
    },
  },
]
