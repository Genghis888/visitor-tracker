// Valida token (alfanumérico + hífen/underscore) para evitar SQL injection
const TOKEN_PATTERN = /^[a-zA-Z0-9_-]+$/;

export function getSiteFilter(site = null) {

    if (!site || site === "all") {
        return "TRUE";
    }

    // Se parece um token (não tem ponto), filtra por site_id via subquery
    if (TOKEN_PATTERN.test(site) && !site.includes(".")) {
        const safeToken = site.replace(/'/g, "''");
        return `site_id = (SELECT id FROM sites WHERE token = '${safeToken}' LIMIT 1)`;
    }

    // Fallback legado: filtra por host (domain)
    const HOST_PATTERN = /^[a-zA-Z0-9.-]+$/;
    if (!HOST_PATTERN.test(site)) return "TRUE";
    return `LOWER(host) = LOWER('${site}')`;

}
