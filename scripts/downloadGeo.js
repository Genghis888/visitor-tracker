import { existsSync, mkdirSync, createWriteStream, unlinkSync } from "fs";
import { pipeline } from "stream/promises";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import { fileURLToPath } from "url";

const execAsync = promisify(exec);
const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const GEO_DIR    = path.join(__dirname, "..", "geo");
const MMDB_PATH  = path.join(GEO_DIR, "GeoLite2-City.mmdb");
const TAR_PATH   = path.join(GEO_DIR, "geo.tar.gz");

export async function ensureGeoDb() {

    if (existsSync(MMDB_PATH)) {
        console.log("✅ GeoLite2-City.mmdb já existe.");
        return;
    }

    const licenseKey = process.env.MAXMIND_LICENSE_KEY;
    const accountId  = process.env.MAXMIND_ACCOUNT_ID;

    if (!licenseKey || !accountId) {
        console.warn("⚠️  MAXMIND_LICENSE_KEY ou MAXMIND_ACCOUNT_ID não definidos.");
        console.warn("⚠️  Geolocalização desabilitada.");
        return;
    }

    console.log("📥 Baixando GeoLite2-City.mmdb da MaxMind...");

    if (!existsSync(GEO_DIR)) mkdirSync(GEO_DIR, { recursive: true });

    const url = `https://download.maxmind.com/geoip/databases/GeoLite2-City/download?suffix=tar.gz`;
    const credentials = Buffer.from(`${accountId}:${licenseKey}`).toString("base64");

    try {

        const res = await fetch(url, {
            headers: { Authorization: `Basic ${credentials}` }
        });

        if (!res.ok) {
            throw new Error(`MaxMind retornou HTTP ${res.status}: ${await res.text()}`);
        }

        const writer = createWriteStream(TAR_PATH);
        await pipeline(res.body, writer);

        await execAsync(
            `tar -xzf "${TAR_PATH}" -C "${GEO_DIR}" --wildcards "*.mmdb" --strip-components=1`
        );

        if (existsSync(TAR_PATH)) unlinkSync(TAR_PATH);

        if (!existsSync(MMDB_PATH)) {
            throw new Error("Arquivo .mmdb não encontrado após extração.");
        }

        console.log("✅ GeoLite2-City.mmdb baixado e extraído com sucesso.");

    } catch (err) {

        console.error("❌ Falha ao baixar GeoLite2-City.mmdb:", err.message);
        console.warn("⚠️  Geolocalização desabilitada.");

        if (existsSync(TAR_PATH)) unlinkSync(TAR_PATH);

    }

}