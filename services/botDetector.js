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
    /wget/i,
    /screenjesus/i,
    /preview/i,
    /thumbnail/i,
    /screenshot/i,
    /headless/i,
    /phantom/i,
    /puppeteer/i,
    /playwright/i,
    /python-requests/i,
    /go-http-client/i,
    /java\//i,
    /okhttp/i

];

export function detectVisitorType(userAgent = "") {

    if (!userAgent) return "bot";

    for (const pattern of botPatterns) {

        if (pattern.test(userAgent)) {

            return "bot";

        }

    }

    return "human";

}