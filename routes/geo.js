import express from "express";
import { getLocation } from "../services/geo.js";

const router = express.Router();

router.get("/", (req, res) => {

    const ip = req.query.ip;

    if (!ip) {
        return res.status(400).json({
            success: false,
            error: "Informe um IP. Ex.: /geo?ip=8.8.8.8"
        });
    }

    const location = getLocation(ip);

    res.json({
        success: true,
        ip,
        location
    });

});

export default router;