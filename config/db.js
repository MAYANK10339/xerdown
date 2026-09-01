const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'xerdown.db');
const db = new Database(dbPath);

// Enable WAL mode for high concurrent throughput
db.pragma('journal_mode = WAL');

// Base Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    storage_used INTEGER DEFAULT 0,
    upi_id TEXT DEFAULT NULL,
    earnings REAL DEFAULT 0.0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    mime_type TEXT DEFAULT 'application/octet-stream',
    size INTEGER NOT NULL,
    share_id TEXT UNIQUE NOT NULL,
    download_count INTEGER DEFAULT 0,
    is_monetized INTEGER DEFAULT 0,
    ad_timer INTEGER DEFAULT 10,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS payouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    upi_id TEXT NOT NULL,
    amount REAL NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_files_user_id ON files(user_id);
  CREATE INDEX IF NOT EXISTS idx_files_share_id ON files(share_id);
`);

// Safe migrations for existing databases
try { db.exec("ALTER TABLE users ADD COLUMN upi_id TEXT DEFAULT NULL;"); } catch (e) {}
try { db.exec("ALTER TABLE users ADD COLUMN earnings REAL DEFAULT 0.0;"); } catch (e) {}
try { db.exec("ALTER TABLE files ADD COLUMN is_monetized INTEGER DEFAULT 0;"); } catch (e) {}
try { db.exec("ALTER TABLE files ADD COLUMN ad_timer INTEGER DEFAULT 10;"); } catch (e) {}

module.exports = db;
