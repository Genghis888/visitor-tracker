import dotenv from "dotenv";
dotenv.config();

import { ensureGeoDb } from "./scripts/downloadGeo.js";
import { initGeo } from "./services/geo.js";

// Baixa o .mmdb se não existir, depois inicializa o geo
await ensureGeoDb();
await initGeo();

import cors from "cors";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

import healthRoutes from "./routes/health.js";
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
import { requireApiAuth } from "./middlewares/auth.js";


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

app.use("/geo",           requireApiAuth, geoRoutes);
app.use("/api/stats",     requireApiAuth, statsRoutes);
app.use("/api/rankings",  requireApiAuth, rankingsRoutes);
app.use("/api/countries", requireApiAuth, countriesRoutes);
app.use("/api/map",       requireApiAuth, mapRoutes);
app.use("/api/sites",     requireApiAuth, sitesRoutes);
app.use("/api/admin", requireSuperAdmin, adminRoutes);

app.listen(PORT, () => {
    console.log(`Servidor iniciado em http://localhost:${PORT}`);
});
