export function normalizeIP(ip) {

    if (!ip)
        return "";

    // Se vier vários IPs (proxy)
    ip = ip.split(",")[0].trim();

    // IPv4 encapsulado em IPv6
    if (ip.startsWith("::ffff:"))
        ip = ip.substring(7);

    // localhost IPv6
    if (ip === "::1")
        ip = "127.0.0.1";

    return ip;

}