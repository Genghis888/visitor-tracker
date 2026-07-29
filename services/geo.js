import maxmind from "maxmind";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, "..", "geo", "GeoLite2-City.mmdb");

// Abre o banco apenas uma vez quando o servidor inicia
const lookup = await maxmind.open(dbPath);

export function getLocation(ip) {
    try {
        console.log("NODE_ENV:", process.env.NODE_ENV);
        console.log("IP recebido:", ip);

        // Trata IPs IPv6 mapeados para IPv4 (::ffff:127.0.0.1)
        if (ip?.startsWith("::ffff:")) {
            ip = ip.replace("::ffff:", "");
        }

        //Durante o desenvolvimento, usa um IP público para testes
        if (
            process.env.NODE_ENV === "development" &&
            (
                ip === "127.0.0.1" ||
                ip === "::1"
            )
        ) {
            ip = "187.75.30.53";
            //ip = "189.40.93.28";
            //ip= "179.157.15.18";
            //ip = "200.188.218.24";
            //ip = "45.190.179.149";
            //ip = "138.204.79.153";
            //ip = "190.101.124.35";
            //ip = "149.90.166.131";
            //ip = "131.0.214.142";
            //ip = "45.176.143.40";
            //ip = "172.59.16.150";
            //ip = "160.238.163.218";
            //ip = "84.76.21.26";
            //ip = "167.249.108.147";
            //ip = "44.64.97.113";
            //ip = "169.155.237.59";

            console.log("IP usado:", ip);

        }

        const result = lookup.get(ip);
        console.log("Resultado GeoLite:", result);

        if (!result) {
            return null;
        }

        return {
            country: result.country?.names?.en ?? null,
            countryCode: result.country?.iso_code ?? null,
            region: result.subdivisions?.[0]?.names?.en ?? null,
            city: result.city?.names?.en ?? null,
            latitude: result.location?.latitude ?? null,
            longitude: result.location?.longitude ?? null,
            timezone: result.location?.time_zone ?? null
        };

    } catch (err) {

        console.error("Erro GeoLite:", err);

        return null;
    }
}