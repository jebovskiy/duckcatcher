(() => {
  "use strict";

  document.addEventListener("dc-close-miniapp", () => {
    try {
      if (window.Telegram && window.Telegram.WebApp) {
        window.Telegram.WebApp.close();
      }
    } catch {
      // ignore
    }
  });
})();
