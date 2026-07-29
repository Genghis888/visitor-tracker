import express from "express";
import { getStats } from "../services/stats.js";
import { getLastVisits } from "../services/visits.js";
import { getChartData } from "../services/chart.js";

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

export default router;
