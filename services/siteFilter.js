// Valida um hostname (ex.: "meusite.com", "app.meusite.com.br")
// antes de interpolar na query, pra evitar SQL injection via query string.
const HOST_PATTERN = /^[a-zA-Z0-9.-]+$/;

export function getSiteFilter(site = null) {

    if (!site || site === "all") {

        return "TRUE";

    }

    if (!HOST_PATTERN.test(site)) {

        return "TRUE";

    }

    return `LOWER(host) = LOWER('${site}')`;

}
