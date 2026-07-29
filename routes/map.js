import express from "express";
import { getMapMarkers } from "../services/map.js";

const router = express.Router();

router.get("/", async (req, res) => {
    try {
        const { range = "today", start, end, site } = req.query;
        res.json(await getMapMarkers(range, start, end, site, req.userId || null));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
