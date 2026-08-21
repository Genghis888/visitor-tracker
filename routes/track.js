import express from "express";
import { UAParser } from "ua-parser-js";
import { getLocation, getLocationFallback, getISP } from "../services/geo.js";
import { insert } from "../services/database.js";
import { normalizeIP } from "../services/ip.js";
import { canRegister } from "../services/flood.js";
import { detectVisitorType } from "../services/botDetector.js";
import { findSiteByToken } from "../services/siteService.js";

const router = express.Router();

router.post("/", async (req, res) => {
    try {
        const ip = normalizeIP(
            req.headers["x-forwarded-for"] ||
            req.socket.remoteAddress
        );

        const [locationResult, isp] = await Promise.all([
            Promise.resolve(getLocation(ip)).then(l => l || getLocationFallback(ip)),
            getISP(ip)
        ]);
        const location = locationResult;
        const ua = new UAParser(req.headers["user-agent"]).getResult();
        const visitor_type = detectVisitorType(req.headers["user-agent"]);

        const {
            token,
            visitor_id,
            language,
            resolution,
            timezone,
            host,
            page: rawPage,
            query_string,
            full_url,
            page_title,
            referrer
        } = req.body;

        // Normaliza o campo page — deve ser sempre um caminho (/path),
        // não uma URL completa. Isso evita problemas com o iframe embed.
        let page = rawPage || "/";
        if (page.startsWith("http")) {
            try {
                page = new URL(page).pathname;
            } catch {
                page = "/";
            }
        }

        // Proteção contra flood por visitor_id
        if (!canRegister(visitor_id)) {
            return res.json({ success: true, ignored: true });
        }

        // Resolve o site pelo token
        let user_id = null;
        let site_id = null;

        if (token) {
            const site = await findSiteByToken(token);
            if (site && site.active) {
                user_id = site.user_id;
                site_id = site.id;
            }
            // Se o token não existe ou o site está inativo, ainda registra
            // a visita mas sem user_id (dados anônimos — útil para debug)
        }

        const visit = {
            ip,
            visitor_id,
            visitor_type,
            user_id,
            site_id,

            country:      location?.country,
            region:       location?.region,
            city:         location?.city,

            browser:         ua.browser.name,
            browser_version: ua.browser.version,

            os:         ua.os.name,
            os_version: ua.os.version,

            device_type:   ua.device.type || "desktop",
            device_vendor: ua.device.vendor || null,
            device_model:  ua.device.model || null,

            language,
            resolution,
            timezone,

            host,
            page,
            query_string,
            referrer,

            user_agent: req.headers["user-agent"],

            country_code: location?.countryCode,
            latitude:     location?.latitude,
            longitude:    location?.longitude,
            geo_timezone: location?.timezone,

            full_url,
            page_title,
            isp
        };

        await insert("visits", visit);

        res.json({ success: true });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

export default router;
