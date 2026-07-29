import express from "express";
import pool from "../db.js";
import { getSitesByUser, createSite, updateSite, deleteSite } from "../services/siteService.js";

const router = express.Router();

// Lista sites do usuário logado (usado pelo seletor de site)
router.get("/", async (req, res) => {
    try {
        const sites = await getSitesByUser(req.userId);
        res.json(sites);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Cria um novo site
router.post("/", async (req, res) => {
    try {
        const { name, domain } = req.body;
        if (!name || !domain) {
            return res.status(400).json({ error: "Nome e domínio são obrigatórios" });
        }
        const site = await createSite(req.userId, name, domain);
        res.status(201).json(site);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Atualiza um site
router.put("/:id", async (req, res) => {
    try {
        const site = await updateSite(Number(req.params.id), req.userId, req.body);
        if (!site) return res.status(404).json({ error: "Site não encontrado" });
        res.json(site);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Deleta um site
router.delete("/:id", async (req, res) => {
    try {
        await deleteSite(Number(req.params.id), req.userId);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
