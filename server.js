const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const pool = mysql.createPool({
    host: 'localhost',
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

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
