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
    // CORS aberto para o Neocities conseguir consumir
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

    const { local, horas = 1 } = req.query;

    if (!local || !local.trim()) {
        return res.status(400).json({ error: "Parâmetro 'local' é obrigatório." });
    }

    const horasNum = Math.min(Math.max(Number(horas) || 1, 1), 24); // entre 1 e 24h
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

        // Extrai a parte 1 (nome) do formato "Nome - ID - Local"
        const nomes = rows
            .map(r => {
                const partes = r.page_title.split(" - ");
                return partes[0]?.trim() || null;
            })
            .filter(Boolean)
            // Remove duplicatas case-insensitive (mesmo nome com grafias iguais)
            .filter((nome, idx, arr) =>
                arr.findIndex(n => n.toLowerCase() === nome.toLowerCase()) === idx
            )
            .sort();

        res.json({
            local: localNorm,
            horas: horasNum,
            total: nomes.length,
            nomes
        });

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
