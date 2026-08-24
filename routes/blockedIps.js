import express from "express";
import pool from "../db.js";

const router = express.Router();

// Listar IPs bloqueados do usuário
router.get("/", async (req, res) => {
    try {
        const userId = req.userId;
        const { rows } = await pool.query(
            "SELECT * FROM blocked_ips WHERE user_id = $1 ORDER BY created_at DESC",
            [userId]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Bloquear IP
router.post("/", async (req, res) => {
    try {
        const userId = req.userId;
        const { ip, reason } = req.body;
        if (!ip) return res.status(400).json({ error: "IP obrigatório" });

        await pool.query(
            `INSERT INTO blocked_ips (ip, user_id, reason)
             VALUES ($1, $2, $3)
             ON CONFLICT (ip, user_id) DO NOTHING`,
            [ip, userId, reason || null]
        );
        res.json({ success: true, ip });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Desbloquear IP
router.delete("/:ip", async (req, res) => {
    try {
        const userId = req.userId;
        const ip = decodeURIComponent(req.params.ip);
        await pool.query(
            "DELETE FROM blocked_ips WHERE ip = $1 AND user_id = $2",
            [ip, userId]
        );
        res.json({ success: true, ip });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Verificar se IP está bloqueado (usado internamente)
export async function isIpBlocked(ip, userId) {
    try {
        const { rows } = await pool.query(
            "SELECT 1 FROM blocked_ips WHERE ip = $1 AND user_id = $2 LIMIT 1",
            [ip, userId]
        );
        return rows.length > 0;
    } catch {
        return false;
    }
}

export default router;
