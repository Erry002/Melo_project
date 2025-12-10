import fs from 'node:fs';
import path from 'node:path';
import crypto, { randomUUID } from 'node:crypto';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import bcrypt from 'bcryptjs';

const DB_DIRECTORY = path.resolve('database');
const DB_FILE = path.join(DB_DIRECTORY, 'melo_chat.db');
const SALT_ROUNDS = 10;

export const DEFAULT_ROLE_PERMISSIONS = Object.freeze({
  owner: [
    'server.manage',
    'roles.manage',
    'channel.create',
    'channel.edit',
    'channel.delete',
    'member.invite',
    'member.remove',
    'member.assignRole',
    'chat.clear',
    'chat.history.manage',
    'chat.send',
    'chat.read',
    'voice.connect',
    'audio.manage'
  ],
  member: [
    'chat.send',
    'chat.read',
    'voice.connect'
  ]
});

const DEFAULT_ROLE_METADATA = Object.freeze({
  owner: {
    name: 'Proprietario',
    description: 'Accesso completo alla stanza, gestione ruoli e membri.',
    priority: 0
  },
  member: {
    name: 'Membro',
    description: 'Permessi base per partecipare a chat e audio.',
    priority: 100
  }
});

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

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

  async addColumnIfMissing(table, columnDefinition) {
    const [columnName] = columnDefinition.trim().split(/\s+/);
    const columns = await this.db.all(`PRAGMA table_info(${table});`);
    if (!columns.some((column) => column.name === columnName)) {
      await this.db.run(`ALTER TABLE ${table} ADD COLUMN ${columnDefinition}`);
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

      CREATE TABLE IF NOT EXISTS server_roles (
        id TEXT PRIMARY KEY,
        server_id TEXT NOT NULL,
        name TEXT NOT NULL,
        key TEXT,
        description TEXT DEFAULT '',
        is_owner INTEGER DEFAULT 0,
        is_default INTEGER DEFAULT 0,
        priority INTEGER DEFAULT 100,
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS server_role_permissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role_id TEXT NOT NULL,
        permission TEXT NOT NULL,
        value INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (role_id) REFERENCES server_roles(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS server_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        role_id TEXT NOT NULL,
        nickname TEXT,
        status TEXT DEFAULT 'active',
        invited_by INTEGER,
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (role_id) REFERENCES server_roles(id) ON DELETE RESTRICT,
        FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token_hash TEXT NOT NULL,
        expires_at DATETIME NOT NULL,
        consumed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    await this.db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_server_roles_server_name
        ON server_roles(server_id, name);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_server_roles_server_key
        ON server_roles(server_id, key)
        WHERE key IS NOT NULL;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_server_members_server_user
        ON server_members(server_id, user_id);

      CREATE INDEX IF NOT EXISTS idx_server_members_role
        ON server_members(role_id);

      CREATE INDEX IF NOT EXISTS idx_role_permissions_role
        ON server_role_permissions(role_id);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_password_reset_tokens_hash
        ON password_reset_tokens(token_hash);

      CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user
        ON password_reset_tokens(user_id);
    `);

    await this.addColumnIfMissing('users', "global_role TEXT DEFAULT 'creator'");
    await this.addColumnIfMissing('users', 'server_quota INTEGER DEFAULT 5');
    await this.addColumnIfMissing('servers', 'created_by INTEGER REFERENCES users(id) ON DELETE SET NULL');
    await this.addColumnIfMissing('channels', "parent_id TEXT REFERENCES channels(id) ON DELETE CASCADE");
    await this.addColumnIfMissing('channels', "type TEXT DEFAULT 'text'");

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

    await this.ensureDefaultRoles('default-server');
    await this.assignDefaultOwnerIfMissing('default-server');

    await this.db.run(`UPDATE users SET global_role = COALESCE(global_role, 'creator')`);
    await this.db.run(`UPDATE users SET server_quota = COALESCE(server_quota, 5)`);
  }

  async ensureRolePermissions(roleId, permissions) {
    if (!roleId || !permissions?.length) {
      return;
    }

    for (const permission of permissions) {
      await this.db.run(
        `INSERT OR IGNORE INTO server_role_permissions (role_id, permission, value)
         VALUES (?, ?, 1)`,
        [roleId, permission]
      );
    }
  }

  async createServerRole(serverId, options = {}) {
    if (!serverId) {
      throw new Error('Server non valido');
    }

    const rawName = typeof options.name === 'string' ? options.name.trim() : '';
    if (!rawName) {
      throw new Error('Nome ruolo obbligatorio');
    }

    await this.ensureDefaultRoles(serverId);

    const roleId = `role:${serverId}:${randomUUID()}`;
    const rawDescription = typeof options.description === 'string' ? options.description.trim() : '';
    const numericPriorityRaw = Number.parseInt(options.priority, 10);
    const numericPriority = Number.isFinite(numericPriorityRaw) ? numericPriorityRaw : 80;
    const priority = Math.min(Math.max(Math.floor(numericPriority), 1), 999);
    const createdBy = Number.isInteger(options.createdBy) ? options.createdBy : null;

    await this.db.run(
      `INSERT INTO server_roles (id, server_id, name, description, is_owner, is_default, priority, created_by)
       VALUES (?, ?, ?, ?, 0, 0, ?, ?)`,
      [roleId, serverId, rawName, rawDescription, priority, createdBy]
    );

    const requestedPermissions = Array.isArray(options.permissions) ? options.permissions.filter(Boolean) : [];
    const uniquePermissions = Array.from(new Set(requestedPermissions));
    if (uniquePermissions.length > 0) {
      await this.ensureRolePermissions(roleId, uniquePermissions);
    }

    const roleRow = await this.db.get(
      `SELECT id, server_id, name, key, description, is_owner, is_default, priority
       FROM server_roles
       WHERE id = ?
       LIMIT 1`,
      [roleId]
    );

    return {
      ...roleRow,
      permissions: new Set(uniquePermissions)
    };
  }

  async createPasswordResetToken(userId, options = {}) {
    if (!userId) {
      throw new Error('Utente non valido');
    }

    const ttlMinutesRaw = Number.parseInt(options.ttlMinutes, 10);
    const ttlMinutes = Number.isFinite(ttlMinutesRaw) ? Math.max(5, ttlMinutesRaw) : 60;
    const rawToken = crypto.randomBytes(48).toString('hex');
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();

    await this.db.run(
      `DELETE FROM password_reset_tokens
       WHERE user_id = ?
         AND (consumed_at IS NOT NULL OR expires_at <= CURRENT_TIMESTAMP)`,
      [userId]
    );

    const result = await this.db.run(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES (?, ?, ?)`,
      [userId, tokenHash, expiresAt]
    );

    return {
      token: rawToken,
      tokenId: result.lastID,
      expiresAt
    };
  }

  async getValidPasswordResetToken(rawToken) {
    if (!rawToken) {
      return null;
    }

    const tokenHash = hashToken(rawToken);
    return this.db.get(
      `SELECT id, user_id, expires_at
       FROM password_reset_tokens
       WHERE token_hash = ?
         AND consumed_at IS NULL
         AND expires_at > CURRENT_TIMESTAMP
       LIMIT 1`,
      [tokenHash]
    );
  }

  async markPasswordResetTokenUsed(tokenId) {
    if (!tokenId) {
      return;
    }

    await this.db.run(
      `UPDATE password_reset_tokens
       SET consumed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [tokenId]
    );
  }

  async invalidatePasswordResetTokens(userId) {
    if (!userId) {
      return;
    }

    await this.db.run(
      `UPDATE password_reset_tokens
       SET consumed_at = CURRENT_TIMESTAMP
       WHERE user_id = ?
         AND consumed_at IS NULL`,
      [userId]
    );
  }

  async getRoleByKey(serverId, key) {
    if (!serverId || !key) {
      return null;
    }

    return this.db.get(
      `SELECT id, server_id, name, key, description, is_owner, is_default, priority
       FROM server_roles
       WHERE server_id = ? AND key = ?
       LIMIT 1`,
      [serverId, key]
    );
  }

  async getDefaultRole(serverId) {
    if (!serverId) {
      return null;
    }

    const primary = await this.db.get(
      `SELECT id, server_id, name, key, description, is_owner, is_default, priority
       FROM server_roles
       WHERE server_id = ? AND is_default = 1
       ORDER BY priority ASC
       LIMIT 1`,
      [serverId]
    );

    if (primary) {
      return primary;
    }

    return this.db.get(
      `SELECT id, server_id, name, key, description, is_owner, is_default, priority
       FROM server_roles
       WHERE server_id = ?
       ORDER BY priority ASC
       LIMIT 1`,
      [serverId]
    );
  }

  async ensureDefaultRoles(serverId) {
    if (!serverId) {
      return;
    }

    const ownerRoleId = `role:${serverId}:owner`;
    const memberRoleId = `role:${serverId}:member`;

    const ownerMeta = DEFAULT_ROLE_METADATA.owner;
    const memberMeta = DEFAULT_ROLE_METADATA.member;

    await this.db.run(
      `INSERT OR IGNORE INTO server_roles (id, server_id, name, key, description, is_owner, is_default, priority)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ownerRoleId,
        serverId,
        ownerMeta.name,
        'owner',
        ownerMeta.description,
        1,
        0,
        ownerMeta.priority
      ]
    );

    await this.db.run(
      `INSERT OR IGNORE INTO server_roles (id, server_id, name, key, description, is_owner, is_default, priority)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        memberRoleId,
        serverId,
        memberMeta.name,
        'member',
        memberMeta.description,
        0,
        1,
        memberMeta.priority
      ]
    );

    await this.db.run(
      `UPDATE server_roles
       SET description = ?, priority = ?
       WHERE id = ?`,
      [ownerMeta.description, ownerMeta.priority, ownerRoleId]
    );

    await this.db.run(
      `UPDATE server_roles
       SET description = ?, priority = ?, is_default = 1
       WHERE id = ?`,
      [memberMeta.description, memberMeta.priority, memberRoleId]
    );

    await this.ensureRolePermissions(ownerRoleId, DEFAULT_ROLE_PERMISSIONS.owner);
    await this.ensureRolePermissions(memberRoleId, DEFAULT_ROLE_PERMISSIONS.member);
  }

  async assignDefaultOwnerIfMissing(serverId) {
    if (!serverId) {
      return;
    }

    await this.ensureDefaultRoles(serverId);

    const ownerRole = await this.getRoleByKey(serverId, 'owner');
    if (!ownerRole) {
      return;
    }

    const existing = await this.db.get(
      `SELECT 1 FROM server_members WHERE server_id = ? AND role_id = ? LIMIT 1`,
      [serverId, ownerRole.id]
    );

    if (existing) {
      return;
    }

    const adminUser = await this.db.get(
      `SELECT id FROM users WHERE is_admin = 1 ORDER BY id ASC LIMIT 1`
    );

    if (!adminUser) {
      return;
    }

    await this.ensureServerMember(serverId, adminUser.id, { roleId: ownerRole.id });

    await this.db.run(
      `UPDATE servers SET created_by = COALESCE(created_by, ?) WHERE id = ?`,
      [adminUser.id, serverId]
    );
  }

  async getRolePermissions(roleId) {
    if (!roleId) {
      return new Set();
    }

    const rows = await this.db.all(
      `SELECT permission, value FROM server_role_permissions WHERE role_id = ?`,
      [roleId]
    );

    const permissions = new Set();
    rows.forEach((row) => {
      if (row.value !== 0) {
        permissions.add(row.permission);
      }
    });
    return permissions;
  }

  async getServerRolesWithPermissions(serverId) {
    if (!serverId) {
      return [];
    }

    await this.ensureDefaultRoles(serverId);

    const roles = await this.db.all(
      `SELECT id, server_id, name, key, description, is_owner, is_default, priority, created_by, created_at
       FROM server_roles
       WHERE server_id = ?
       ORDER BY priority ASC, created_at ASC`,
      [serverId]
    );

    if (!roles.length) {
      return [];
    }

    const roleIds = roles.map((role) => role.id);

    const placeholders = roleIds.map(() => '?').join(', ');
    const permissionRows = roleIds.length
      ? await this.db.all(
        `SELECT role_id, permission, value
         FROM server_role_permissions
         WHERE role_id IN (${placeholders})`,
        roleIds
      )
      : [];

    const permissionMap = new Map();
    for (const row of permissionRows) {
      if (!permissionMap.has(row.role_id)) {
        permissionMap.set(row.role_id, new Set());
      }
      if (row.value !== 0) {
        permissionMap.get(row.role_id).add(row.permission);
      }
    }

    return roles.map((role) => ({
      ...role,
      permissions: permissionMap.get(role.id) || new Set()
    }));
  }

  async ensureServerMember(serverId, userId, options = {}) {
    if (!serverId || !userId) {
      return null;
    }

    const {
      roleId = null,
      roleKey = null,
      promoteToOwner = false
    } = options;

    await this.ensureDefaultRoles(serverId);

    let targetRole = null;

    if (roleId) {
      targetRole = await this.db.get(
        `SELECT id, server_id, name, key, description, is_owner, is_default, priority
         FROM server_roles
         WHERE server_id = ? AND id = ?`,
        [serverId, roleId]
      );
    }

    if (!targetRole && (promoteToOwner || roleKey === 'owner')) {
      targetRole = await this.getRoleByKey(serverId, 'owner');
    }

    if (!targetRole && roleKey && roleKey !== 'owner') {
      targetRole = await this.getRoleByKey(serverId, roleKey);
    }

    if (!targetRole) {
      targetRole = await this.getDefaultRole(serverId);
    }

    if (!targetRole) {
      throw new Error(`Nessun ruolo disponibile per il server ${serverId}`);
    }

    const membership = await this.db.get(
      `SELECT id, server_id, user_id, role_id, status
       FROM server_members
       WHERE server_id = ? AND user_id = ?`,
      [serverId, userId]
    );

    const desiredRoleId = targetRole.id;

    if (membership) {
      if (membership.role_id !== desiredRoleId) {
        await this.db.run(
          `UPDATE server_members
           SET role_id = ?, status = 'active'
           WHERE id = ?`,
          [desiredRoleId, membership.id]
        );
      } else if (membership.status !== 'active') {
        await this.db.run(
          `UPDATE server_members SET status = 'active' WHERE id = ?`,
          [membership.id]
        );
      }
    } else {
      await this.db.run(
        `INSERT INTO server_members (server_id, user_id, role_id, status)
         VALUES (?, ?, ?, 'active')
         ON CONFLICT(server_id, user_id)
         DO UPDATE SET role_id = excluded.role_id, status = 'active'`,
        [serverId, userId, desiredRoleId]
      );
    }

    if (promoteToOwner) {
      await this.db.run(
        `UPDATE servers SET created_by = COALESCE(created_by, ?) WHERE id = ?`,
        [userId, serverId]
      );
    }

    const enriched = await this.db.get(
      `SELECT sm.id, sm.server_id, sm.user_id, sm.role_id, sm.status,
              sr.name AS role_name, sr.key AS role_key, sr.is_owner, sr.is_default, sr.priority
       FROM server_members sm
       JOIN server_roles sr ON sr.id = sm.role_id
       WHERE sm.server_id = ? AND sm.user_id = ?
       LIMIT 1`,
      [serverId, userId]
    );

    if (!enriched) {
      return null;
    }

    const permissions = await this.getRolePermissions(enriched.role_id);

    return {
      ...enriched,
      permissions
    };
  }

  async ensureSuperAdminByUsername(username) {
    if (!username) {
      return null;
    }

    const user = await this.db.get(
      `SELECT id FROM users WHERE username = ? LIMIT 1`,
      [username]
    );

    if (!user) {
      return null;
    }

    await this.db.run(
      `UPDATE users
       SET is_admin = 1,
           global_role = 'AmministraMelucci',
           server_quota = NULL
       WHERE id = ?`,
      [user.id]
    );

    return user.id;
  }

  async getUserServerStats(userId) {
    if (!userId) {
      return { createdCount: 0 };
    }

    const row = await this.db.get(
      `SELECT COUNT(*) AS total
       FROM servers
       WHERE created_by = ?`,
      [userId]
    );

    return {
      createdCount: row?.total || 0
    };
  }

  async createServerForUser(userId, serverName) {
    if (!userId) {
      throw new Error('Utente non valido');
    }

    const trimmedName = typeof serverName === 'string' ? serverName.trim() : '';
    if (!trimmedName) {
      throw new Error('Nome della stanza obbligatorio');
    }

    const user = await this.db.get(
      `SELECT id, username, is_admin, global_role, server_quota
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [userId]
    );

    if (!user) {
      throw new Error('Utente non trovato');
    }

    const isSuperAdmin = user.is_admin === 1 || user.global_role === 'AmministraMelucci';

    if (!isSuperAdmin) {
      if (user.global_role !== 'creator') {
        throw new Error('Non hai i permessi per creare nuove stanze.');
      }

      const quota = Number.isInteger(user.server_quota) ? user.server_quota : 5;
      const stats = await this.getUserServerStats(userId);

      if (stats.createdCount >= quota) {
        throw new Error(`Hai raggiunto il limite di ${quota} stanze create.`);
      }
    }

    const serverId = `server:${randomUUID()}`;

    await this.db.run(
      `INSERT INTO servers (id, name, created_by)
       VALUES (?, ?, ?)`,
      [serverId, trimmedName, userId]
    );

    const defaultChannels = [
      { id: `channel:${serverId}:general`, name: 'Generale', type: 'text' },
      { id: `channel:${serverId}:voice`, name: 'Canale vocale', type: 'voice' }
    ];

    for (const channel of defaultChannels) {
      await this.db.run(
        `INSERT INTO channels (id, server_id, name, type)
         VALUES (?, ?, ?, ?)`,
        [channel.id, serverId, channel.name, channel.type]
      );
    }

    await this.ensureDefaultRoles(serverId);
    await this.ensureServerMember(serverId, userId, { promoteToOwner: true });

    return {
      server: {
        id: serverId,
        name: trimmedName,
        created_by: userId
      },
      channels: defaultChannels
    };
  }

  async getServerMember(serverId, userId) {
    if (!serverId || !userId) {
      return null;
    }

    return this.db.get(
      `SELECT sm.id, sm.server_id, sm.user_id, sm.role_id, sm.status, sm.nickname, sm.joined_at,
              sr.name AS role_name, sr.key AS role_key, sr.is_owner, sr.is_default, sr.priority
       FROM server_members sm
       JOIN server_roles sr ON sr.id = sm.role_id
       WHERE sm.server_id = ? AND sm.user_id = ?
       LIMIT 1`,
      [serverId, userId]
    );
  }

  async updateServerMemberStatus(serverId, userId, status) {
    if (!serverId || !userId || !status) {
      return;
    }

    await this.db.run(
      `UPDATE server_members SET status = ? WHERE server_id = ? AND user_id = ?`,
      [status, serverId, userId]
    );
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
