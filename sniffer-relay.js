(() => {
  "use strict";

  const MSG_SECRET = "__dd_sniffer_v3__";

  window.addEventListener("message", event => {
    if (event.source !== window) return;
    if (event.origin !== location.origin) return;
    const data = event.data;
    if (!data || data.source !== "dd-sniffer" || data.secret !== MSG_SECRET || !data.payload) return;
    const payload = data.payload;
    if (payload.body && typeof payload.body === "string" && payload.body.length > 50000) {
      payload.body = payload.body.slice(0, 50000);
    }
    try {
      chrome.runtime.sendMessage(
        { type: "NETWORK_SNIPPET", data: payload },
        () => void chrome.runtime.lastError
      );
    } catch {
      // extension context invalidated
    }
  });
})();
