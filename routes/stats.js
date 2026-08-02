import express from "express";
import { getStats } from "../services/stats.js";
import { getLastVisits } from "../services/visits.js";
import { getChartData } from "../services/chart.js";
import { canExport } from "../services/planService.js";
import { getDateFilter } from "../services/dateFilter.js";
import { getSiteFilter } from "../services/siteFilter.js";
import pool from "../db.js";

const router = express.Router();

router.get("/", async (req, res) => {
    try {
        const { range = "today", start, end, site } = req.query;
        const userId = req.userId || null;
        res.json(await getStats(range, start, end, site, userId));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get("/visits", async (req, res) => {
    try {
        const { range = "today", start, end, page = 1, limit = 25, site } = req.query;
        const userId = req.userId || null;
        res.json(await getLastVisits(range, start, end, Number(page), Number(limit), site, userId));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get("/hourly", async (req, res) => {
    try {
        const { range = "today", start, end, site } = req.query;
        const userId = req.userId || null;
        res.json(await getChartData(range, start, end, site, userId));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Exportação CSV — apenas plano Pro
router.get("/export/csv", async (req, res) => {
    try {
        const allowed = await canExport(req.userId);

        if (!allowed) {
            return res.status(403).json({
                error: "Exportação CSV disponível apenas no plano Pro.",
                upgrade: true
            });
        }

        const { range = "30", start, end, site } = req.query;
        const where     = getDateFilter(range, start, end);
        const siteWhere = getSiteFilter(site);
        const userWhere = `user_id = '${req.userId}'`;

        const result = await pool.query(`
            SELECT
                created_at, ip, host, country, region, city,
                browser, os, device_type, page, full_url,
                page_title, referrer, language, resolution
            FROM visits
            WHERE ${where} AND ${siteWhere} AND ${userWhere}
            ORDER BY created_at DESC
            LIMIT 50000
        `);

        const headers = [
            "Data/Hora","IP","Site","País","Estado","Cidade",
            "Navegador","Sistema","Dispositivo","Página",
            "URL Completa","Título","Referrer","Idioma","Resolução"
        ];

        const escape = (val) => {
            if (val == null) return "";
            const str = String(val);
            return (str.includes(",") || str.includes('"') || str.includes("\n"))
                ? `"${str.replace(/"/g,'""')}"` : str;
        };

        const rows = result.rows.map(r => [
            new Date(r.created_at).toLocaleString("pt-BR"),
            r.ip, r.host, r.country, r.region, r.city,
            r.browser, r.os, r.device_type, r.page,
            r.full_url, r.page_title, r.referrer, r.language, r.resolution
        ].map(escape).join(","));

        const csv      = [headers.join(","), ...rows].join("\n");
        const filename = `visitas_${new Date().toISOString().slice(0,10)}.csv`;

        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.send("\uFEFF" + csv);

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
