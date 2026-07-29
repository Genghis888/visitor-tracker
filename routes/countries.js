import express from "express";
import { getCountries } from "../services/countries.js";

const router = express.Router();

router.get("/", async (req, res) => {
    try {
        const { range = "today", start, end, site } = req.query;
        res.json(await getCountries(range, start, end, site, req.userId || null));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
