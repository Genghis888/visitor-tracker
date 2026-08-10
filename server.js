import dotenv from "dotenv";
dotenv.config();

import { ensureGeoDb } from "./scripts/downloadGeo.js";

// Garante que o .mmdb existe ANTES de importar qualquer rota
// que dependa do geo.js (que abre o arquivo na importação)
await ensureGeoDb();

import cors from "cors";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

import healthRoutes from "./routes/health.js";
import pool from "./db.js";
import trackRoutes from "./routes/track.js";
import geoRoutes from "./routes/geo.js";
import statsRoutes from "./routes/stats.js";
import rankingsRoutes from "./routes/rankings.js";
import countriesRoutes from "./routes/countries.js";
import mapRoutes from "./routes/map.js";
import heartbeatRoutes from "./routes/heartbeat.js";
import authRoutes from "./routes/auth.js";
import sitesRoutes from "./routes/sites.js";
import adminRoutes from "./routes/admin.js";

import { requireApiAuth, requireSuperAdmin } from "./middlewares/auth.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app  = express();
const PORT = process.env.PORT || 3000;

const isProd = process.env.NODE_ENV === "production";

if (isProd) app.set("trust proxy", 1);

app.use(cors({
    origin: isProd ? process.env.APP_URL : "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());

// ===== Rotas públicas =====
app.get("/", (req, res) => res.send("🚀 Visitor Tracker funcionando!"));
app.use("/health",    healthRoutes);
app.use("/track",     trackRoutes);
app.use("/heartbeat", heartbeatRoutes);
app.use("/auth",      authRoutes);

// tracker.js precisa ser carregável por qualquer site
app.get("/tracker.js", (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.sendFile(path.join(__dirname, "public", "tracker.js"));
});

// t.html precisa ser acessível por iframe de qualquer domínio
app.get("/t.html", (req, res) => {
    res.setHeader("X-Frame-Options", "ALLOWALL");
    res.setHeader("Content-Security-Policy", "");
    res.sendFile(path.join(__dirname, "public", "t.html"));
});

// ===== Arquivos estáticos =====
app.use(express.static("public"));

// ===== APIs protegidas =====
app.use("/geo",           requireApiAuth, geoRoutes);
app.use("/api/stats",     requireApiAuth, statsRoutes);
app.use("/api/rankings",  requireApiAuth, rankingsRoutes);
app.use("/api/countries", requireApiAuth, countriesRoutes);
app.use("/api/map",       requireApiAuth, mapRoutes);
app.use("/api/sites",     requireApiAuth,    sitesRoutes);
app.use("/api/admin",     requireSuperAdmin, adminRoutes);

// Rota utilitária — preenche geo de registros que ficaram nulos
app.get("/fix-geo", async (req, res) => {
    const secret = process.env.FIX_SECRET;
    if (!secret || req.query.secret !== secret) {
        return res.status(401).json({ error: "Não autorizado" });
    }
    try {
        const { getLocation } = await import("./services/geo.js");
        const { rows } = await pool.query(`
            SELECT id, ip FROM visits
            WHERE country IS NULL AND ip IS NOT NULL
            LIMIT 500
        `);

        let atualizados = 0;
        const erros = [];

        for (const row of rows) {
            try {
                const loc = getLocation(row.ip);
                if (!loc) continue;
                await pool.query(`
                    UPDATE visits SET
                        country      = $1,
                        country_code = $2,
                        region       = $3,
                        city         = $4,
                        latitude     = $5,
                        longitude    = $6,
                        geo_timezone = $7
                    WHERE id = $8
                `, [loc.country, loc.countryCode, loc.region, loc.city,
                    loc.latitude, loc.longitude, loc.timezone, row.id]);
                atualizados++;
            } catch(e) {
                erros.push({ id: row.id, erro: e.message });
            }
        }

        res.json({ encontrados: rows.length, atualizados, erros });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Rota utilitária protegida — preenche page_title via query_string
app.get("/fix-titles", async (req, res) => {
    const secret = process.env.FIX_SECRET;
    if (!secret || req.query.secret !== secret) {
        return res.status(401).json({ error: "Não autorizado" });
    }
    try {
        const { rows } = await pool.query(`
            SELECT id, query_string FROM visits
            WHERE query_string LIKE '%n=%'
              AND query_string LIKE '%p=%'
              AND (page_title IS NULL OR page_title = '')
        `);

        let atualizados = 0;
        const erros = [];

        for (const row of rows) {
            try {
                const p = new URLSearchParams(row.query_string);
                const n   = p.get("n");
                const i   = p.get("i");
                const loc = p.get("p");
                if (!n && !loc) continue;
                const partes = [n, i, loc].filter(Boolean).map(v => decodeURIComponent(v).trim());
                const title = partes.join(" - ");
                await pool.query("UPDATE visits SET page_title = $1 WHERE id = $2", [title, row.id]);
                atualizados++;
            } catch(e) {
                erros.push({ id: row.id, erro: e.message });
            }
        }

        res.json({ encontrados: rows.length, atualizados, erros });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor iniciado em http://localhost:${PORT}`);
});
