import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';

const DB_PATH = process.env.DATABASE_PATH || './food-journal.db';

let db: DatabaseSync;

export function getDb(): DatabaseSync {
  if (!db) {
    db = new DatabaseSync(DB_PATH);
    initSchema(db);
  }
  return db;
}

function initSchema(db: DatabaseSync) {
  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      food TEXT NOT NULL,
      meal TEXT NOT NULL,
      time_of_day TEXT NOT NULL,
      notes TEXT,
      created_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_entries_name ON entries(name);
    CREATE INDEX IF NOT EXISTS idx_entries_created_at ON entries(created_at);
  `);
}

export interface FoodEntry {
  id?: number;
  name: string;
  food: string;
  meal: string;
  time_of_day: string;
  notes?: string;
  created_at?: string;
}

export function saveEntry(entry: Omit<FoodEntry, 'id' | 'created_at'>): FoodEntry {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO entries (name, food, meal, time_of_day, notes)
    VALUES (?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    entry.name,
    entry.food,
    entry.meal,
    entry.time_of_day,
    entry.notes ?? null
  );
  return { ...entry, id: Number(result.lastInsertRowid) };
}

export function getEntries(filters?: { name?: string; limit?: number }): FoodEntry[] {
  const db = getDb();

  if (filters?.name && filters?.limit) {
    return db.prepare(
      'SELECT * FROM entries WHERE LOWER(name) = LOWER(?) ORDER BY created_at DESC LIMIT ?'
    ).all(filters.name, filters.limit) as unknown as FoodEntry[];
  } else if (filters?.name) {
    return db.prepare(
      'SELECT * FROM entries WHERE LOWER(name) = LOWER(?) ORDER BY created_at DESC'
    ).all(filters.name) as unknown as FoodEntry[];
  } else if (filters?.limit) {
    return db.prepare(
      'SELECT * FROM entries ORDER BY created_at DESC LIMIT ?'
    ).all(filters.limit) as unknown as FoodEntry[];
  }

  return db.prepare('SELECT * FROM entries ORDER BY created_at DESC').all() as unknown as FoodEntry[];
}

export function getNames(): string[] {
  const db = getDb();
  const rows = db.prepare('SELECT DISTINCT name FROM entries ORDER BY name').all() as unknown as { name: string }[];
  return rows.map(r => r.name);
}

export async function exportCSV(): Promise<string> {
  const entries = getEntries();
  const header = 'id,name,food,meal,time_of_day,notes,created_at\n';
  const rows = entries.map(e =>
    [
      e.id,
      `"${(e.name || '').replace(/"/g, '""')}"`,
      `"${(e.food || '').replace(/"/g, '""')}"`,
      `"${(e.meal || '').replace(/"/g, '""')}"`,
      `"${(e.time_of_day || '').replace(/"/g, '""')}"`,
      `"${(e.notes || '').replace(/"/g, '""')}"`,
      `"${e.created_at || ''}"`,
    ].join(',')
  ).join('\n');

  const csv = header + rows;
  const outputPath = path.resolve('./food-journal-export.csv');
  fs.writeFileSync(outputPath, csv, 'utf8');
  return outputPath;
}
