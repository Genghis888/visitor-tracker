import express from "express";
import { getRankings } from "../services/rankings.js";

const router = express.Router();

router.get("/", async (req, res) => {
    try {
        const { range = "today", start, end, site } = req.query;
        res.json(await getRankings(range, start, end, site, req.userId || null));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
