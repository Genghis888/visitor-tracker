import express from "express";
import pool from "../db.js";

const router = express.Router();

/**
 * GET /api/presentes?local=woodstock&horas=18
 *
 * Retorna visitantes únicos ordenados por ID ascendente
 * page_title formato: "Nome - ID - Local"
 */
router.get("/", async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

    const { local, horas = 1 } = req.query;

    if (!local || !local.trim()) {
        return res.status(400).json({ error: "Parâmetro 'local' é obrigatório." });
    }

    const horasNum = Math.min(Math.max(Number(horas) || 1, 1), 48);
    const localNorm = local.trim();

    try {
        const { rows } = await pool.query(
            `
            SELECT DISTINCT page_title
            FROM visits
            WHERE
                page_title IS NOT NULL
                AND page_title <> ''
                AND page_title ILIKE $1
                AND created_at >= NOW() - ($2 || ' hours')::interval
            `,
            [`%${localNorm}%`, horasNum]
        );

        // Extrai nome e ID, deduplica por nome (case-insensitive)
        const vistos = new Map();
        rows.forEach(r => {
            const partes = r.page_title.split(" - ");
            const nome = partes[0]?.trim();
            const id   = partes[1]?.trim() || "";
            if (!nome) return;
            const key = nome.toLowerCase();
            if (!vistos.has(key)) vistos.set(key, { nome, id });
        });

        // Ordena por ID ascendente
        const presentes = Array.from(vistos.values())
            .sort((a, b) => {
                const ia = parseInt(a.id) || 0;
                const ib = parseInt(b.id) || 0;
                return ia !== ib ? ia - ib : a.id.localeCompare(b.id);
            });

        res.json({
            local: localNorm,
            horas: horasNum,
            total: presentes.length,
            presentes
        });

    } catch (err) {
        console.error("[presentes]", err.message);
        res.status(500).json({ error: "Erro ao consultar presentes." });
    }
});

router.options("/", (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.sendStatus(204);
});

export default router;
