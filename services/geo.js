import maxmind from "maxmind";
import path from "path";
import { existsSync } from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const dbPath     = path.join(__dirname, "..", "geo", "GeoLite2-City.mmdb");

let lookup = null;

export async function initGeo() {
    if (!existsSync(dbPath)) {
        console.warn("⚠️  GeoLite2-City.mmdb não encontrado. Geolocalização desabilitada.");
        return;
    }
    lookup = await maxmind.open(dbPath);
    console.log("✅ GeoLite2 carregado.");
}

export function getLocation(ip) {
    if (!lookup || !ip) return null;
    try {
        if (ip.startsWith("::ffff:")) ip = ip.replace("::ffff:", "");
        if (process.env.NODE_ENV === "development" && (ip === "127.0.0.1" || ip === "::1")) {
            ip = "189.40.93.28";
        }
        const result = lookup.get(ip);
        if (!result) return null;
        return {
            country:     result.country?.names?.en           ?? null,
            countryCode: result.country?.iso_code            ?? null,
            region:      result.subdivisions?.[0]?.names?.en ?? null,
            city:        result.city?.names?.en              ?? null,
            latitude:    result.location?.latitude           ?? null,
            longitude:   result.location?.longitude          ?? null,
            timezone:    result.location?.time_zone          ?? null
        };
    } catch (err) {
        console.error("Erro GeoLite:", err);
        return null;
    }
}