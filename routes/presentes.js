import express from "express";
import pool from "../db.js";

const router = express.Router();

/**
 * GET /api/presentes?local=SertanejaUP&horas=1
 *
 * Retorna os nomes únicos de visitantes presentes no evento
 * a partir do campo page_title (formato: "Nome - ID - Local")
 *
 * Query params:
 *   local  {string}  — parte 3 do page_title (nome do local/evento) — obrigatório
 *   horas  {number}  — janela de tempo em horas (padrão: 1)
 */
router.get("/", async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

    const { local, horas = 1, callback } = req.query;

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
            ORDER BY page_title
            `,
            [`%${localNorm}%`, horasNum]
        );

        const nomes = rows
            .map(r => {
                const partes = r.page_title.split(" - ");
                return partes[0]?.trim() || null;
            })
            .filter(Boolean)
            .filter((nome, idx, arr) =>
                arr.findIndex(n => n.toLowerCase() === nome.toLowerCase()) === idx
            )
            .sort();

        const payload = { local: localNorm, horas: horasNum, total: nomes.length, nomes };

        // Suporte a JSONP — contorna CSP do Neocities
        if (callback && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(callback)) {
            res.setHeader("Content-Type", "application/javascript");
            return res.send(`${callback}(${JSON.stringify(payload)})`);
        }

        res.json(payload);

    } catch (err) {
        console.error("[presentes]", err.message);
        res.status(500).json({ error: "Erro ao consultar presentes." });
    }
});

// Responde OPTIONS para preflight do Neocities
router.options("/", (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.sendStatus(204);
});

export default router;
