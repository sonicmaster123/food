const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

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

app.get('/api/foods', async (req, res) => {
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

app.post('/api/foods', async (req, res) => {
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

app.put('/api/foods/:id/consume', async (req, res) => {
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

app.delete('/api/foods/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM food_items WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/foods/sync', async (req, res) => {
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
app.get('/api/passwords', async (req, res) => {
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

app.get('/api/passwords/:id/reveal', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT password_encrypted FROM passwords WHERE id = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
        const plaintext = decrypt(rows[0].password_encrypted);
        res.json({ password: plaintext });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/passwords', async (req, res) => {
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

app.put('/api/passwords/:id', async (req, res) => {
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

app.delete('/api/passwords/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM passwords WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
