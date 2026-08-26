(() => {
  "use strict";

  window.addEventListener("message", event => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== "dd-sniffer" || !data.payload) return;
    try {
      chrome.runtime.sendMessage(
        { type: "NETWORK_SNIPPET", data: data.payload },
        () => void chrome.runtime.lastError
      );
    } catch {
      // extension context invalidated
    }
  });
})();
