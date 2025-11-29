import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import bcrypt from 'bcryptjs';

const DB_DIRECTORY = path.resolve('database');
const DB_FILE = path.join(DB_DIRECTORY, 'melo_chat.db');
const SALT_ROUNDS = 10;

class DatabaseManager {
  constructor() {
    this.db = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized && this.db) {
      return this.db;
    }

    await this.ensureDirectory();

    this.db = await open({
      filename: DB_FILE,
      driver: sqlite3.Database,
    });

    await this.db.exec('PRAGMA foreign_keys = ON;');
    await this.createSchema();
    this.initialized = true;
    return this.db;
  }

  async ensureDirectory() {
    if (!fs.existsSync(DB_DIRECTORY)) {
      fs.mkdirSync(DB_DIRECTORY, { recursive: true });
    }
  }

  async createSchema() {
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        display_name TEXT,
        avatar TEXT,
        bio TEXT DEFAULT '',
        is_admin INTEGER DEFAULT 0,
        is_verified INTEGER DEFAULT 0,
        status TEXT DEFAULT 'offline',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME
      );

      CREATE TABLE IF NOT EXISTS user_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token TEXT UNIQUE NOT NULL,
        device_info TEXT,
        ip_address TEXT,
        last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        action TEXT NOT NULL,
        details TEXT,
        ip_address TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS servers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS channels (
        id TEXT PRIMARY KEY,
        server_id TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        user_id INTEGER,
        username TEXT NOT NULL,
        display_name TEXT,
        text TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
      );
    `);

    await this.db.run(
      `INSERT OR IGNORE INTO servers (id, name) VALUES (?, ?)`,
      ['default-server', 'Melo Server']
    );

    const defaultChannels = [
      { id: 'general-channel', name: 'Generale' },
      { id: 'voice-channel', name: 'Vocale' }
    ];

    await Promise.all(defaultChannels.map((channel) => (
      this.db.run(
        `INSERT OR IGNORE INTO channels (id, server_id, name) VALUES (?, ?, ?)`,
        [channel.id, 'default-server', channel.name]
      )
    )));
  }

  async close() {
    if (this.db) {
      await this.db.close();
      this.db = null;
      this.initialized = false;
    }
  }
}

const dbManager = new DatabaseManager();
await dbManager.initialize();

export const DatabaseUtils = {
  async hashPassword(password) {
    return bcrypt.hash(password, SALT_ROUNDS);
  },

  async verifyPassword(password, hash) {
    return bcrypt.compare(password, hash);
  },

  generateSessionToken() {
    return crypto.randomBytes(48).toString('hex');
  },

  isValidEmail(email) {
    return /^(?:[a-zA-Z0-9_'^&+={}`~!-]+(?:\.[a-zA-Z0-9_'^&+={}`~!-]+)*|"(?:[^"]|\\")+")@(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/.test(email);
  },

  isValidUsername(username) {
    return /^[a-zA-Z0-9_]{3,32}$/.test(username);
  }
};

export default dbManager;
