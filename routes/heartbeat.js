import express from "express";
import { updateHeartbeat } from "../services/heartbeat.js";

const router = express.Router();

router.post("/", async (req, res) => {

    try {

        const { visitor_id } = req.body;

        if (!visitor_id) {

            return res
                .status(400)
                .json({ error: "visitor_id obrigatório" });

        }

        await updateHeartbeat(visitor_id);

        res.json({ ok: true });

    } catch (err) {

        console.error(err);

        res.status(500).json({
            error: err.message
        });

    }

});

export default router;