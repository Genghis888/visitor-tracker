(() => {

    const script = document.currentScript;
    const SERVER = new URL(script.src).origin;

    // Token único do site — vem no atributo data-token ou via query string
    const token =
        script.getAttribute("data-token") ||
        new URL(script.src).searchParams.get("token") ||
        null;

    if (!token) {
        console.warn("[Visitor Tracker] Token não encontrado. O rastreamento não será iniciado.");
        return;
    }

    function getVisitorId() {
        let id = localStorage.getItem("_vt_id");
        if (!id) {
            id = crypto.randomUUID();
            localStorage.setItem("_vt_id", id);
        }
        return id;
    }

    const payload = {
        token,
        visitor_id:   getVisitorId(),
        language:     navigator.language,
        resolution:   `${screen.width}x${screen.height}`,
        timezone:     Intl.DateTimeFormat().resolvedOptions().timeZone,
        host:         location.hostname,
        page:         location.pathname,
        query_string: location.search,
        full_url:     location.href,
        page_title:   document.title,
        referrer:     document.referrer
    };

    const trackUrl = SERVER + "/track";

    if (navigator.sendBeacon) {
        navigator.sendBeacon(
            trackUrl,
            new Blob([JSON.stringify(payload)], { type: "application/json" })
        );
    } else {
        fetch(trackUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            keepalive: true
        }).catch(() => {});
    }

    function sendHeartbeat() {
        fetch(SERVER + "/heartbeat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ visitor_id: getVisitorId(), token }),
            keepalive: true
        }).catch(() => {});
    }

    sendHeartbeat();
    setInterval(sendHeartbeat, 60000);

})();
