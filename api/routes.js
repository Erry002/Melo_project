// 🎵 API Routes per Melo Chat
// Sistema di autenticazione e gestione utenti

import express from 'express';
import jwt from 'jsonwebtoken';
// import rateLimit from 'express-rate-limit'; // Commentato per compatibilità Node.js
import dbManager, { DatabaseUtils } from '../database/database.js';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';

const router = express.Router();

// Configurazione JWT
const JWT_SECRET = process.env.JWT_SECRET || 'MeloChat_Super_Secret_Key_2024';
const JWT_EXPIRES_IN = '7d';

// Rate limiting - Commentato per compatibilità Node.js
/*
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minuti
    max: 5, // 5 tentativi per IP
    message: { error: 'Troppi tentativi di accesso. Riprova tra 15 minuti.' }
});

const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100, // 100 richieste per IP
    message: { error: 'Troppe richieste. Riprova più tardi.' }
});
*/

// Middleware dummy per compatibilità
const authLimiter = (req, res, next) => next();
const generalLimiter = (req, res, next) => next();

// Configurazione upload file
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = file.fieldname === 'avatar' ? './uploads/avatars' : './uploads/attachments';
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB max
    },
    fileFilter: (req, file, cb) => {
        if (file.fieldname === 'avatar') {
            // Solo immagini per avatar
            if (file.mimetype.startsWith('image/')) {
                cb(null, true);
            } else {
                cb(new Error('Solo file immagine sono permessi per avatar'), false);
            }
        } else {
            // File attachments più permissivi
            const allowedTypes = ['image/', 'video/', 'audio/', 'application/pdf', 'text/'];
            if (allowedTypes.some(type => file.mimetype.startsWith(type))) {
                cb(null, true);
            } else {
                cb(new Error('Tipo file non supportato'), false);
            }
        }
    }
});

// Middleware di autenticazione
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'Token di accesso richiesto' });
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Verifica se sessione esiste nel database
        const session = await dbManager.db.get(`
            SELECT s.*, u.username, u.display_name, u.is_admin, u.status,
                   u.global_role, u.server_quota
            FROM user_sessions s
            JOIN users u ON s.user_id = u.id
            WHERE s.token = ? AND s.expires_at > CURRENT_TIMESTAMP
        `, [token]);
        
        if (!session) {
            return res.status(401).json({ error: 'Token non valido o scaduto' });
        }
        
        // Aggiorna ultima attività
        await dbManager.db.run(`
            UPDATE user_sessions 
            SET last_activity = CURRENT_TIMESTAMP 
            WHERE token = ?
        `, [token]);
        
        req.user = {
            id: session.user_id,
            username: session.username,
            display_name: session.display_name,
            is_admin: session.is_admin,
            status: session.status,
            global_role: session.global_role,
            server_quota: session.server_quota
        };
        
        next();
    } catch (error) {
        res.status(403).json({ error: 'Token non valido' });
    }
};

// Helper per logging attività
const logActivity = async (userId, action, details = null, ipAddress = null) => {
    try {
        await dbManager.db.run(`
            INSERT INTO activity_logs (user_id, action, details, ip_address)
            VALUES (?, ?, ?, ?)
        `, [userId, action, details ? JSON.stringify(details) : null, ipAddress]);
    } catch (error) {
        console.error('Errore logging attività:', error);
    }
};

// 🔐 AUTENTICAZIONE

// Registrazione
router.post('/auth/register', authLimiter, async (req, res) => {
    try {
        const { username, email, password, display_name } = req.body;
        
        // Validazione input
        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Username, email e password richiesti' });
        }
        
        if (!DatabaseUtils.isValidUsername(username)) {
            return res.status(400).json({ error: 'Username non valido (3-50 caratteri, solo lettere, numeri, underscore)' });
        }
        
        if (!DatabaseUtils.isValidEmail(email)) {
            return res.status(400).json({ error: 'Email non valida' });
        }
        
        if (password.length < 8) {
            return res.status(400).json({ error: 'Password deve essere di almeno 8 caratteri' });
        }
        
        // Verifica se utente esiste già
        const existingUser = await dbManager.db.get(`
            SELECT id FROM users WHERE username = ? OR email = ?
        `, [username, email]);
        
        if (existingUser) {
            return res.status(409).json({ error: 'Username o email già in uso' });
        }
        
        // Crea utente
        const hashedPassword = await DatabaseUtils.hashPassword(password);
        const result = await dbManager.db.run(`
            INSERT INTO users (username, email, password_hash, display_name, global_role, server_quota)
            VALUES (?, ?, ?, ?, 'creator', 5)
        `, [username, email, hashedPassword, display_name || username]);
        
        const userId = result.lastID;
        
        // Log attività
        await logActivity(userId, 'user_registered', { username }, req.ip);
        
        res.status(201).json({ 
            message: 'Utente registrato con successo',
            user: {
                id: userId,
                username,
                display_name: display_name || username,
                global_role: 'creator',
                server_quota: 5
            }
        });
        
    } catch (error) {
        console.error('Errore registrazione:', error);
        res.status(500).json({ error: 'Errore interno del server' });
    }
});

// Login
router.post('/auth/login', authLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Username e password richiesti' });
        }
        
        // Trova utente
        const user = await dbManager.db.get(`
            SELECT id, username, email, password_hash, display_name, 
                   avatar, is_admin, is_verified, status, created_at,
                   global_role, server_quota
            FROM users 
            WHERE username = ? OR email = ?
        `, [username, username]);
        
        if (!user) {
            return res.status(401).json({ error: 'Credenziali non valide' });
        }
        
        // Verifica password
        const validPassword = await DatabaseUtils.verifyPassword(password, user.password_hash);
        if (!validPassword) {
            await logActivity(user.id, 'login_failed', { reason: 'invalid_password' }, req.ip);
            return res.status(401).json({ error: 'Credenziali non valide' });
        }
        
        // Genera token e sessione
        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
        const sessionToken = DatabaseUtils.generateSessionToken();
        
        // Salva sessione nel database
        await dbManager.db.run(`
            INSERT INTO user_sessions (user_id, token, device_info, ip_address, expires_at)
            VALUES (?, ?, ?, ?, datetime('now', '+7 days'))
        `, [user.id, token, req.headers['user-agent'] || 'Unknown', req.ip]);
        
        // Aggiorna status utente
        await dbManager.db.run(`
            UPDATE users SET status = 'online', last_login = CURRENT_TIMESTAMP WHERE id = ?
        `, [user.id]);
        
        // Log attività
        await logActivity(user.id, 'login_success', null, req.ip);
        
        res.json({
            message: 'Login effettuato con successo',
            token,
            user: {
                id: user.id,
                username: user.username,
                display_name: user.display_name,
                avatar: user.avatar,
                is_admin: user.is_admin,
                is_verified: user.is_verified,
                status: user.status,
                global_role: user.global_role,
                server_quota: user.server_quota
            }
        });
        
    } catch (error) {
        console.error('Errore login:', error);
        res.status(500).json({ error: 'Errore interno del server' });
    }
});

// Logout
router.post('/auth/logout', authenticateToken, async (req, res) => {
    try {
        const token = req.headers['authorization'].split(' ')[1];
        
        // Rimuovi sessione dal database
        await dbManager.db.run('DELETE FROM user_sessions WHERE token = ?', [token]);
        
        // Aggiorna status se non ci sono altre sessioni attive
        const activeSessions = await dbManager.db.get(`
            SELECT COUNT(*) as count FROM user_sessions WHERE user_id = ?
        `, [req.user.id]);
        
        if (activeSessions.count === 0) {
            await dbManager.db.run(`
                UPDATE users SET status = 'offline' WHERE id = ?
            `, [req.user.id]);
        }
        
        await logActivity(req.user.id, 'logout', null, req.ip);
        
        res.json({ message: 'Logout effettuato con successo' });
        
    } catch (error) {
        console.error('Errore logout:', error);
        res.status(500).json({ error: 'Errore interno del server' });
    }
});

// 👤 GESTIONE PROFILO UTENTE

// Ottieni profilo
router.get('/user/profile', authenticateToken, async (req, res) => {
    try {
        const user = await dbManager.db.get(`
            SELECT id, username, email, display_name, avatar, bio, 
                   is_admin, is_verified, status, created_at, last_login,
                   global_role, server_quota
            FROM users WHERE id = ?
        `, [req.user.id]);
        
        res.json({ user });
        
    } catch (error) {
        console.error('Errore recupero profilo:', error);
        res.status(500).json({ error: 'Errore interno del server' });
    }
});

// Aggiorna profilo
router.put('/user/profile', authenticateToken, async (req, res) => {
    try {
        const { display_name, bio } = req.body;
        
        if (display_name && (display_name.length < 1 || display_name.length > 100)) {
            return res.status(400).json({ error: 'Nome display deve essere tra 1 e 100 caratteri' });
        }
        
        if (bio && bio.length > 500) {
            return res.status(400).json({ error: 'Bio non può superare 500 caratteri' });
        }
        
        await dbManager.db.run(`
            UPDATE users SET display_name = COALESCE(?, display_name), 
                           bio = COALESCE(?, bio),
                           updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [display_name, bio, req.user.id]);
        
        await logActivity(req.user.id, 'profile_updated', { display_name, bio }, req.ip);
        
        res.json({ message: 'Profilo aggiornato con successo' });
        
    } catch (error) {
        console.error('Errore aggiornamento profilo:', error);
        res.status(500).json({ error: 'Errore interno del server' });
    }
});

// Upload avatar
router.post('/user/avatar', authenticateToken, upload.single('avatar'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'File avatar richiesto' });
        }
        
        const avatarPath = `/uploads/avatars/${req.file.filename}`;
        
        // Aggiorna database
        await dbManager.db.run(`
            UPDATE users SET avatar = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `, [avatarPath, req.user.id]);
        
        await logActivity(req.user.id, 'avatar_updated', { filename: req.file.filename }, req.ip);
        
        res.json({ 
            message: 'Avatar aggiornato con successo',
            avatar: avatarPath
        });
        
    } catch (error) {
        console.error('Errore upload avatar:', error);
        res.status(500).json({ error: 'Errore interno del server' });
    }
});

// Cambia password
router.put('/user/password', authenticateToken, async (req, res) => {
    try {
        const { current_password, new_password } = req.body;
        
        if (!current_password || !new_password) {
            return res.status(400).json({ error: 'Password attuale e nuova richieste' });
        }
        
        if (new_password.length < 8) {
            return res.status(400).json({ error: 'Nuova password deve essere di almeno 8 caratteri' });
        }
        
        // Verifica password attuale
        const user = await dbManager.db.get(`
            SELECT password_hash FROM users WHERE id = ?
        `, [req.user.id]);
        
        const validPassword = await DatabaseUtils.verifyPassword(current_password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Password attuale non corretta' });
        }
        
        // Aggiorna password
        const hashedNewPassword = await DatabaseUtils.hashPassword(new_password);
        await dbManager.db.run(`
            UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `, [hashedNewPassword, req.user.id]);
        
        // Invalida tutte le sessioni tranne quella corrente
        const currentToken = req.headers['authorization'].split(' ')[1];
        await dbManager.db.run(`
            DELETE FROM user_sessions WHERE user_id = ? AND token != ?
        `, [req.user.id, currentToken]);
        
        await logActivity(req.user.id, 'password_changed', null, req.ip);
        
        res.json({ message: 'Password cambiata con successo' });
        
    } catch (error) {
        console.error('Errore cambio password:', error);
        res.status(500).json({ error: 'Errore interno del server' });
    }
});

// 📊 STATISTICHE E ADMIN

// Statistiche (solo admin)
router.get('/admin/stats', authenticateToken, async (req, res) => {
    try {
        if (!req.user.is_admin) {
            return res.status(403).json({ error: 'Accesso negato: permessi admin richiesti' });
        }
        
        const stats = await dbManager.getStats();
        
        // Statistiche aggiuntive
        const additionalStats = await Promise.all([
            dbManager.db.get('SELECT COUNT(*) as count FROM messages WHERE created_at > datetime("now", "-1 day")'),
            dbManager.db.get('SELECT COUNT(*) as count FROM voice_sessions WHERE created_at > datetime("now", "-1 day")'),
            dbManager.db.get('SELECT COUNT(*) as count FROM users WHERE status = "online"'),
        ]);
        
        stats.messages_today = additionalStats[0].count;
        stats.voice_sessions_today = additionalStats[1].count;
        stats.users_online = additionalStats[2].count;
        
        res.json({ stats });
        
    } catch (error) {
        console.error('Errore recupero statistiche:', error);
        res.status(500).json({ error: 'Errore interno del server' });
    }
});

// Lista utenti (solo admin)
router.get('/admin/users', authenticateToken, async (req, res) => {
    try {
        if (!req.user.is_admin) {
            return res.status(403).json({ error: 'Accesso negato: permessi admin richiesti' });
        }
        
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const offset = (page - 1) * limit;
        
        const users = await dbManager.db.all(`
            SELECT id, username, display_name, email, status, is_admin, 
                   is_verified, created_at, last_login
            FROM users
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        `, [limit, offset]);
        
        const total = await dbManager.db.get('SELECT COUNT(*) as count FROM users');
        
        res.json({ 
            users, 
            pagination: {
                page,
                limit,
                total: total.count,
                pages: Math.ceil(total.count / limit)
            }
        });
        
    } catch (error) {
        console.error('Errore recupero utenti:', error);
        res.status(500).json({ error: 'Errore interno del server' });
    }
});

// Applica rate limiting generale
router.use(generalLimiter);

export default router;