const botPatterns = [

    /bot/i,
    /crawler/i,
    /spider/i,
    /googlebot/i,
    /bingbot/i,
    /duckduckbot/i,
    /yandex/i,
    /baiduspider/i,
    /semrush/i,
    /ahrefs/i,
    /facebookexternalhit/i,
    /slurp/i,
    /curl/i,
    /wget/i

];

export function detectVisitorType(userAgent = "") {

    for (const pattern of botPatterns) {

        if (pattern.test(userAgent)) {

            return "bot";

        }

    }

    return "human";

}