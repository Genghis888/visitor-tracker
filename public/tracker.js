(() => {

    const script = document.currentScript;
    const SERVER = new URL(script.src).origin;

    const token =
        script.getAttribute("data-token") ||
        new URL(script.src).searchParams.get("token") ||
        null;

    if (!token) {
        console.warn("[Visitor Tracker] Token não encontrado.");
        return;
    }

    const params = new URLSearchParams({
        token,
        host:  location.hostname,
        page:  location.pathname,
        url:   location.href,
        title: document.title,
        ref:   document.referrer,
        qs:    location.search
    });

    const iframe = document.createElement("iframe");
    iframe.src            = SERVER + "/t.html?" + params.toString();
    iframe.style.cssText  = "display:none;width:0;height:0;border:0;position:absolute;";
    iframe.referrerPolicy = "no-referrer-when-downgrade";
    iframe.setAttribute("aria-hidden", "true");

   function appendIframe() {
        setTimeout(() => document.body.appendChild(iframe), 1500);
    }

    document.body
        ? appendIframe()
        : document.addEventListener("DOMContentLoaded", appendIframe);
})();