(() => {
  "use strict";

  console.log("[dd-sniffer] хуки установлены на", location.host);

  const SRC = "dd-sniffer";
  const MAX_BODY = 150000;

  function emit(payload) {
    try {
      payload.ts = Date.now();
      window.postMessage({ source: SRC, payload }, "*");
    } catch {
      // ignore
    }
  }

  function looksLikeJson(text) {
    const s = String(text).slice(0, 64).trimStart();
    return s.startsWith("{") || s.startsWith("[");
  }

  function handleBodyText(txt, url, kind) {
    if (txt && txt.length <= MAX_BODY && looksLikeJson(txt)) {
      emit({ kind, url, method: "", body: txt });
    }
  }

  const origFetch = window.fetch;
  if (typeof origFetch === "function") {
    window.fetch = function (input, init) {
      let url = "";
      let method = (init && init.method) || "GET";
      try {
        if (typeof input === "string" || input instanceof URL) {
          url = String(input);
        } else if (input && typeof input.url === "string") {
          url = input.url;
          if (!init || !init.method) method = input.method || method;
        }
      } catch {
        // ignore
      }
      emit({ kind: "fetch", url, method });

      const p = origFetch.apply(this, arguments);
      try {
        p.then(res => {
          try {
            if (!res || !res.clone) return;
            const ct = res.headers && res.headers.get
              ? res.headers.get("content-type") || ""
              : "";
            if (ct && !/json|text/i.test(ct)) return;
            res.clone().text().then(t => handleBodyText(t, url, "api")).catch(() => {});
          } catch {
            // ignore
          }
        }).catch(() => {});
      } catch {
        // ignore
      }
      return p;
    };
  }

  const XHR = XMLHttpRequest.prototype;
  const origOpen = XHR.open;
  XHR.open = function (method, url) {
    try {
      this.__ddMethod = String(method || "GET");
      this.__ddUrl = String(url || "");
    } catch {
      // ignore
    }
    return origOpen.apply(this, arguments);
  };
  const origSend = XHR.send;
  XHR.send = function (body) {
    try {
      emit({
        kind: "xhr",
        url: this.__ddUrl,
        method: this.__ddMethod,
        hasBody: body != null
      });
      this.addEventListener("load", () => {
        try {
          const t = this.responseType === "" || this.responseType === "text"
            ? this.responseText
            : "";
          handleBodyText(t, this.__ddUrl, "api");
        } catch {
          // ignore
        }
      });
    } catch {
      // ignore
    }
    return origSend.apply(this, arguments);
  };

  const OrigWS = window.WebSocket;
  if (typeof OrigWS === "function") {
    const statics = ["CONNECTING", "OPEN", "CLOSING", "CLOSED"];
    function HookedWebSocket(url, protocols) {
      const ws = protocols === undefined
        ? new OrigWS(url)
        : new OrigWS(url, protocols);
      try {
        emit({ kind: "ws", url: String(url), protocol: protocols || null });
        ws.addEventListener("message", ev => {
          try {
            const d = ev.data;
            if (typeof d === "string") {
              handleBodyText(d, String(url), "ws-msg");
            } else if (typeof Blob === "function" && d instanceof Blob) {
              if (d.size <= MAX_BODY) {
                d.text().then(t => handleBodyText(t, String(url), "ws-msg")).catch(() => {});
              }
            } else if (d && typeof ArrayBuffer !== "undefined" && d.byteLength != null) {
              if (d.byteLength <= MAX_BODY) {
                try {
                  const s = new TextDecoder("utf-8", { fatal: false }).decode(d);
                  handleBodyText(s, String(url), "ws-msg");
                } catch {
                  // ignore
                }
              }
            }
          } catch {
            // ignore
          }
        });
      } catch {
        // ignore
      }
      return ws;
    }
    HookedWebSocket.prototype = OrigWS.prototype;
    for (const s of statics) {
      try {
        Object.defineProperty(HookedWebSocket, s, {
          value: OrigWS[s],
          enumerable: true
        });
      } catch {
        // ignore
      }
    }
    window.WebSocket = HookedWebSocket;
  }

  const OrigES = window.EventSource;
  if (typeof OrigES === "function") {
    function HookedEventSource(url, cfg) {
      const es = cfg === undefined ? new OrigES(url) : new OrigES(url, cfg);
      try {
        emit({ kind: "sse", url: String(url) });
        es.addEventListener("message", ev => {
          try {
            handleBodyText(ev.data, String(url), "api");
          } catch {
            // ignore
          }
        });
      } catch {
        // ignore
      }
      return es;
    }
    HookedEventSource.prototype = OrigES.prototype;
    HookedEventSource.CONNECTING = OrigES.CONNECTING;
    HookedEventSource.OPEN = OrigES.OPEN;
    HookedEventSource.CLOSED = OrigES.CLOSED;
    window.EventSource = HookedEventSource;
  }
})();
