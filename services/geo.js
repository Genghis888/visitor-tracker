import maxmind from "maxmind";
import path from "path";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import pool from "../db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const dbPath     = path.join(__dirname, "..", "geo", "GeoLite2-City.mmdb");

let lookup = null;

if (existsSync(dbPath)) {
    lookup = await maxmind.open(dbPath);
    console.log("✅ GeoLite2 carregado.");
} else {
    console.warn("⚠️  GeoLite2-City.mmdb não encontrado. Geolocalização desabilitada.");
}

export function getLocation(ip) {

    if (!lookup || !ip) return null;

    try {

        if (ip.startsWith("::ffff:")) {
            ip = ip.replace("::ffff:", "");
        }

        if (
            process.env.NODE_ENV === "development" &&
            (ip === "127.0.0.1" || ip === "::1")
        ) {
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

// Fallback via ip-api.com para IPs não encontrados no GeoLite
export async function getLocationFallback(ip) {
    try {
        const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,countryCode,regionName,city,lat,lon,timezone`);
        const data = await res.json();
        if (data.status !== "success") return null;
        return {
            country:     data.country     ?? null,
            countryCode: data.countryCode ?? null,
            region:      data.regionName  ?? null,
            city:        data.city        ?? null,
            latitude:    data.lat         ?? null,
            longitude:   data.lon         ?? null,
            timezone:    data.timezone    ?? null
        };
    } catch (err) {
        console.error("Erro ip-api fallback:", err);
        return null;
    }
}

// Cache de ISP em memória para evitar consultas repetidas na mesma sessão do servidor
const ispCache = new Map();

// Busca ISP via ipinfo.io — consulta banco primeiro, depois API, e salva para reutilizar
export async function getISP(ip) {
    if (!ip) return null;

    // 1. Cache em memória
    if (ispCache.has(ip)) return ispCache.get(ip);

    // 2. Cache no banco
    try {
        const row = await pool.query(
            "SELECT isp FROM visits WHERE ip = $1 AND isp IS NOT NULL LIMIT 1",
            [ip]
        );
        if (row.rows.length > 0) {
            const isp = row.rows[0].isp;
            ispCache.set(ip, isp);
            return isp;
        }
    } catch (err) {
        console.error("Erro ao buscar ISP no banco:", err);
    }

    // 3. Consulta ipinfo.io
    try {
        const token = process.env.IPINFO_TOKEN || "";
        const url   = token
            ? `https://ipinfo.io/${ip}/json?token=${token}`
            : `https://ipinfo.io/${ip}/json`;
        const res  = await fetch(url);
        const data = await res.json();
        const isp  = data.org || null; // ex: "AS26615 TIM SA"
        ispCache.set(ip, isp);
        return isp;
    } catch (err) {
        console.error("Erro ipinfo.io:", err);
        return null;
    }
}
