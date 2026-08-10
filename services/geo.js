import maxmind from "maxmind";
import path from "path";
import { existsSync } from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const dbPath     = path.join(__dirname, "..", "geo", "GeoLite2-City.mmdb");

// Abre o banco apenas uma vez quando o servidor inicia.
// Se o arquivo não existir, desabilita silenciosamente.
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

        // Em desenvolvimento substitui localhost por IP público para teste
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
