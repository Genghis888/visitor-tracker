import express from "express";
import pool from "../db.js";

const router = express.Router();

function requirePro(req, res, next) {
    const plan = req.user?.user_metadata?.plan;
    if (plan !== "pro") return res.status(403).json({ error: "Recurso disponível apenas no plano Pro." });
    next();
}

// Listar IPs favoritos do usuário
router.get("/", requirePro, async (req, res) => {
    try {
        const userId = req.userId;
        const { rows } = await pool.query(
            "SELECT * FROM favorite_ips WHERE user_id = $1 ORDER BY created_at DESC",
            [userId]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Favoritar IP
router.post("/", requirePro, async (req, res) => {
    try {
        const userId = req.userId;
        const { ip, label } = req.body;
        if (!ip) return res.status(400).json({ error: "IP obrigatório" });

        const { rows } = await pool.query(
            `INSERT INTO favorite_ips (ip, user_id, label)
             VALUES ($1, $2, $3)
             ON CONFLICT (ip, user_id) DO UPDATE SET label = EXCLUDED.label
             RETURNING *`,
            [ip, userId, label || null]
        );
        res.json({ success: true, ip, row: rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Desfavoritar IP
router.delete("/:ip", requirePro, async (req, res) => {
    try {
        const userId = req.userId;
        const ip = decodeURIComponent(req.params.ip);
        await pool.query(
            "DELETE FROM favorite_ips WHERE ip = $1 AND user_id = $2",
            [ip, userId]
        );
        res.json({ success: true, ip });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
