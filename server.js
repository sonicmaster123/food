const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const pool = mysql.createPool({
    host: '180.76.116.234',
    port: 3306,
    user: 'root',
    password: 'zhangxiang123',
    database: 'food_expiry',
    waitForConnections: true,
    connectionLimit: 5,
    dateStrings: true
});

function toMySQLDatetime(isoString) {
    return new Date(isoString).toISOString().slice(0, 19).replace('T', ' ');
}

const ENCRYPTION_KEY = process.env.PWD_SECRET || 'k8Xp2sQm9Wz4Yv7Jn1Rf6Tg3Uh0Lb5Az';
const IV_LENGTH = 16;

function encrypt(text) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'utf8'), iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
}

function decrypt(text) {
    const parts = text.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'utf8'), iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

// Session store
const sessions = new Map();

function authMiddleware(req, res, next) {
    const token = req.headers['authorization'];
    if (!token || !sessions.has(token)) {
        return res.status(401).json({ error: '未登录' });
    }
    req.user = sessions.get(token);
    next();
}

function adminMiddleware(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: '无权限' });
    }
    next();
}

// Auth API
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: '请输入用户名和密码' });
        }
        const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
        if (rows.length === 0) {
            return res.status(401).json({ error: '用户名或密码错误' });
        }
        const user = rows[0];
        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) {
            return res.status(401).json({ error: '用户名或密码错误' });
        }
        if (!user.approved) {
            return res.status(403).json({ error: '账号待审批，请联系管理员' });
        }
        const token = crypto.randomUUID();
        sessions.set(token, { id: user.id, username: user.username, role: user.role });
        res.json({ token, username: user.username, role: user.role });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: '请输入用户名和密码' });
        }
        if (username.length < 2 || username.length > 50) {
            return res.status(400).json({ error: '用户名长度需在2-50个字符之间' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: '密码长度不能少于6位' });
        }
        const [existing] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
        if (existing.length > 0) {
            return res.status(409).json({ error: '用户名已存在' });
        }
        const hash = await bcrypt.hash(password, 10);
        await pool.query(
            'INSERT INTO users (username, password_hash, role, approved) VALUES (?, ?, ?, 0)',
            [username, hash, 'user']
        );
        res.status(201).json({ message: '注册成功，请等待管理员审批' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
    res.json({ username: req.user.username, role: req.user.role });
});

// User Management API (admin only)
app.get('/api/users', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT id, username, role, approved, created_at FROM users ORDER BY created_at DESC');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/users', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { username, password, role } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: '请输入用户名和密码' });
        }
        const [existing] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
        if (existing.length > 0) {
            return res.status(409).json({ error: '用户名已存在' });
        }
        const hash = await bcrypt.hash(password, 10);
        const userRole = role === 'admin' ? 'admin' : 'user';
        const [result] = await pool.query(
            'INSERT INTO users (username, password_hash, role, approved) VALUES (?, ?, ?, 1)',
            [username, hash, userRole]
        );
        res.status(201).json({ id: result.insertId, username, role: userRole, approved: 1 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/users/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { username, password, role } = req.body;
        const userId = parseInt(req.params.id);
        const fields = [];
        const values = [];
        if (username) {
            const [existing] = await pool.query('SELECT id FROM users WHERE username = ? AND id != ?', [username, userId]);
            if (existing.length > 0) {
                return res.status(409).json({ error: '用户名已存在' });
            }
            fields.push('username = ?');
            values.push(username);
        }
        if (password) {
            const hash = await bcrypt.hash(password, 10);
            fields.push('password_hash = ?');
            values.push(hash);
        }
        if (role) {
            fields.push('role = ?');
            values.push(role === 'admin' ? 'admin' : 'user');
        }
        if (fields.length === 0) {
            return res.status(400).json({ error: '没有需要更新的字段' });
        }
        values.push(userId);
        await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/users/:id/approve', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        await pool.query('UPDATE users SET approved = 1 WHERE id = ?', [userId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/users/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        if (userId === req.user.id) {
            return res.status(400).json({ error: '不能删除自己的账号' });
        }
        await pool.query('DELETE FROM users WHERE id = ?', [userId]);
        // Remove any sessions for deleted user
        for (const [token, session] of sessions) {
            if (session.id === userId) sessions.delete(token);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Protected routes
app.get('/api/foods', authMiddleware, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM food_items ORDER BY expiry ASC');
        const foods = rows.map(row => ({
            id: row.id,
            name: row.name,
            category: row.category,
            expiry: row.expiry.slice(0, 10),
            addedAt: row.added_at.replace(' ', 'T') + 'Z',
            consumed: Boolean(row.consumed),
            consumedAt: row.consumed_at ? row.consumed_at.replace(' ', 'T') + 'Z' : undefined
        }));
        res.json(foods);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/foods', authMiddleware, async (req, res) => {
    try {
        const { id, name, category, expiry, addedAt } = req.body;
        const addedAtDb = toMySQLDatetime(addedAt);
        await pool.query(
            'INSERT INTO food_items (id, name, category, expiry, added_at, consumed) VALUES (?, ?, ?, ?, ?, 0)',
            [id, name, category, expiry, addedAtDb]
        );
        res.status(201).json({ id, name, category, expiry, addedAt, consumed: false });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/foods/:id/consume', authMiddleware, async (req, res) => {
    try {
        const consumedAt = new Date().toISOString();
        const consumedAtDb = toMySQLDatetime(consumedAt);
        await pool.query(
            'UPDATE food_items SET consumed = 1, consumed_at = ? WHERE id = ?',
            [consumedAtDb, req.params.id]
        );
        res.json({ success: true, consumedAt });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/foods/:id', authMiddleware, async (req, res) => {
    try {
        await pool.query('DELETE FROM food_items WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/foods/sync', authMiddleware, async (req, res) => {
    try {
        const items = req.body;
        if (!Array.isArray(items) || items.length === 0) {
            return res.json({ imported: 0 });
        }
        const values = items.map(f => [
            f.id, f.name, f.category, f.expiry, toMySQLDatetime(f.addedAt), f.consumed ? 1 : 0, f.consumedAt ? toMySQLDatetime(f.consumedAt) : null
        ]);
        await pool.query(
            'INSERT IGNORE INTO food_items (id, name, category, expiry, added_at, consumed, consumed_at) VALUES ?',
            [values]
        );
        res.json({ imported: items.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Password Manager API
app.get('/api/passwords', authMiddleware, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM passwords ORDER BY site_name ASC');
        const passwords = rows.map(row => ({
            id: row.id,
            siteName: row.site_name,
            domain: row.domain,
            username: row.username,
            notes: row.notes,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        }));
        res.json(passwords);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/passwords/:id/reveal', authMiddleware, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT password_encrypted FROM passwords WHERE id = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
        const plaintext = decrypt(rows[0].password_encrypted);
        res.json({ password: plaintext });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/passwords', authMiddleware, async (req, res) => {
    try {
        const { siteName, domain, username, password, notes } = req.body;
        const encrypted = encrypt(password);
        const [result] = await pool.query(
            'INSERT INTO passwords (site_name, domain, username, password_encrypted, notes) VALUES (?, ?, ?, ?, ?)',
            [siteName, domain || null, username, encrypted, notes || null]
        );
        res.status(201).json({ id: result.insertId, siteName, domain, username, notes });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/passwords/:id', authMiddleware, async (req, res) => {
    try {
        const { siteName, domain, username, password, notes } = req.body;
        const fields = ['site_name = ?', 'domain = ?', 'username = ?', 'notes = ?'];
        const values = [siteName, domain || null, username, notes || null];
        if (password) {
            fields.push('password_encrypted = ?');
            values.push(encrypt(password));
        }
        values.push(req.params.id);
        await pool.query(`UPDATE passwords SET ${fields.join(', ')} WHERE id = ?`, values);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/passwords/:id', authMiddleware, async (req, res) => {
    try {
        await pool.query('DELETE FROM passwords WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Initialize admin user and users table
async function initDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(50) NOT NULL UNIQUE,
                password_hash VARCHAR(255) NOT NULL,
                role ENUM('admin', 'user') NOT NULL DEFAULT 'user',
                approved TINYINT(1) NOT NULL DEFAULT 0,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        const [rows] = await pool.query('SELECT id FROM users WHERE username = ?', ['admin']);
        if (rows.length === 0) {
            const hash = await bcrypt.hash('zhangxiang123', 10);
            await pool.query(
                'INSERT INTO users (username, password_hash, role, approved) VALUES (?, ?, ?, 1)',
                ['admin', hash, 'admin']
            );
            console.log('Admin user created: admin / zhangxiang123');
        }
    } catch (err) {
        console.error('Failed to initialize database:', err.message);
    }
}

const PORT = 3000;
app.listen(PORT, async () => {
    await initDB();
    console.log(`Server running on http://localhost:${PORT}`);
});
