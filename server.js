import cors from "cors";
import express from "express";
import dotenv from "dotenv";
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

import { requireApiAuth } from "./middlewares/auth.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

const isProd = process.env.NODE_ENV === "production";

// Necessário no Render (proxy reverso)
if (isProd) app.set("trust proxy", 1);

app.use(cors({
    origin: isProd ? process.env.APP_URL : "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());

// ===== Rotas públicas (sem autenticação) =====
app.get("/", (req, res) => res.send("🚀 Visitor Tracker funcionando!"));
app.use("/health", healthRoutes);
app.use("/track", trackRoutes);
app.use("/heartbeat", heartbeatRoutes);
app.use("/auth", authRoutes);

// ===== Páginas protegidas =====
// Com Supabase Auth o JS do frontend verifica o token e redireciona.
// Servimos os arquivos normalmente — a proteção é client-side.
app.get("/admin.html", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "admin.html"));
});
app.get("/dashboard.html", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

// ===== Arquivos estáticos =====
app.use(express.static("public"));

// ===== APIs protegidas (exigem JWT válido) =====
app.use("/geo", requireApiAuth, geoRoutes);
app.use("/api/stats", requireApiAuth, statsRoutes);
app.use("/api/rankings", requireApiAuth, rankingsRoutes);
app.use("/api/countries", requireApiAuth, countriesRoutes);
app.use("/api/map", requireApiAuth, mapRoutes);
app.use("/api/sites", requireApiAuth, sitesRoutes);

app.listen(PORT, () => {
    console.log(`Servidor iniciado em http://localhost:${PORT}`);
});
