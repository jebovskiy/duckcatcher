(() => {
  "use strict";

  console.log("[MarketMonitor] активен на", location.host);

  const WINDOW_MS = 65000;
  const PUSH_INTERVAL = 2000;
  const ALERT_COOLDOWN = 5 * 60 * 1000;

  const samples = [];
  const diag = {
    fetch: 0,
    xhr: 0,
    ws: 0,
    sse: 0,
    apiBodies: 0,
    wsMsgs: 0,
    prices: 0,
    chart: 0
  };
  let lastPushAt = 0;
  let lastType = null;
  let lastAlertAt = 0;

  function trimWindow() {
    const cutoff = Date.now() - WINDOW_MS;
    while (samples.length && samples[0].t < cutoff) samples.shift();
  }

  function classify(text) {
    if (!text) return null;
    const s = String(text).toLowerCase();
    if (/corn|корн/.test(s)) return "corn";
    if (/star|звезд|★|⭐/.test(s)) return "stars";
    return null;
  }

  const PRICE_KEY_RE = /(price|cost|bid|ask)/i;
  const BAD_KEY_RE =
    /(^id|id$|time|date|updated|created|count|total|sum|balance|wallet|level|xp|exp|seed|version|nonce|fee|percent|rate|rating|rank|index|num)/i;
  const MAX_PRICE = 10000000;
  const MIN_PRICE = 10;

  let debugOn = false;
  try {
    chrome.storage.sync.get({ debug: false }, r => {
      debugOn = !!r.debug;
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "sync" && changes.debug) debugOn = !!changes.debug.newValue;
    });
  } catch {
    // ignore
  }

  const census = new Map();

  function noteCensus(path, v) {
    let e = census.get(path);
    if (!e) {
      e = { n: 0, min: Infinity, max: -Infinity };
      census.set(path, e);
    }
    e.n++;
    if (v < e.min) e.min = v;
    if (v > e.max) e.max = v;
  }

  function logCensus() {
    if (!debugOn || !census.size) return;
    const rows = [...census.entries()]
      .sort((a, b) => b[1].n - a[1].n)
      .slice(0, 30)
      .map(([p, e]) => {
        const f = Math.round(e.min) !== Math.round(e.max)
          ? ` ${Math.round(e.min)}…${Math.round(e.max)}`
          : `=${Math.round(e.min)}`;
        return `${p} n=${e.n}${f}`;
      });
    console.log("[MarketMonitor] числовые пути JSON:\n" + rows.join("\n"));
  }

  const seen = new Map();

  function isDup(cur, price, now) {
    const k = cur + ":" + price;
    const t = seen.get(k);
    if (t && now - t < 15000) return true;
    seen.set(k, now);
    if (seen.size > 5000) {
      for (const [kk, tt] of seen) {
        if (now - tt > 60000) seen.delete(kk);
      }
    }
    return false;
  }

  function extractPrices(node, out, depth, ctx, path) {
    if (!node || depth > 8 || out.length > 800) return;

    if (Array.isArray(node)) {
      let nums = 0;
      for (const v of node) {
        if (typeof v === "number" && Number.isFinite(v)) nums++;
      }
      if (nums >= 3 && nums >= node.length * 0.8) {
        if (PRICE_KEY_RE.test(path)) {
          const cur = classify(path) || ctx.cur || "unknown";
          for (const v of node) {
            if (typeof v === "number" && Number.isFinite(v)) {
              out.push({ price: v, cur, path });
            }
          }
        }
        return;
      }
      for (const v of node) extractPrices(v, out, depth + 1, ctx, path + "[]");
      return;
    }

    if (typeof node !== "object") return;

    const localCtx = { ...ctx };

    for (const [key, v] of Object.entries(node)) {
      if (key === "currency" || key === "cur") {
        const c = classify(typeof v === "string" ? v : null);
        if (c) localCtx.cur = c;
        continue;
      }
      const childPath = path ? path + "." + key : key;

      if (
        (key === "price" || key === "prices") &&
        v &&
        typeof v === "object" &&
        !Array.isArray(v)
      ) {
        for (const [ck, cv] of Object.entries(v)) {
          if (
            typeof cv === "number" &&
            Number.isFinite(cv) &&
            cv >= MIN_PRICE &&
            cv <= MAX_PRICE
          ) {
            const p = childPath + "." + ck;
            noteCensus(p, cv);
            out.push({
              price: cv,
              cur: classify(ck) || ck.toLowerCase(),
              path: p
            });
          }
        }
        continue;
      }

      if (typeof v === "number" && Number.isFinite(v)) {
        noteCensus(childPath, v);
        if (
          !BAD_KEY_RE.test(key) &&
          (PRICE_KEY_RE.test(key) || classify(key))
        ) {
          if (v >= MIN_PRICE && v <= MAX_PRICE) {
            out.push({
              price: v,
              cur: classify(key) || localCtx.cur || "unknown",
              path: childPath
            });
          }
        }
      } else if (v && typeof v === "object") {
        extractPrices(v, out, depth + 1, localCtx, childPath);
      }
    }
  }

  window.addEventListener("message", event => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== "dd-sniffer") return;
    const p = data.payload;
    switch (p.kind) {
      case "fetch":
        diag.fetch++;
        return;
      case "xhr":
        diag.xhr++;
        return;
      case "ws":
        diag.ws++;
        return;
      case "sse":
        diag.sse++;
        return;
      case "api":
        diag.apiBodies++;
        break;
      case "ws-msg":
        diag.wsMsgs++;
        break;
      default:
        return;
    }
    let parsed = null;
    try {
      parsed = JSON.parse(p.body);
    } catch {
      return;
    }
    const out = [];
    extractPrices(parsed, out, 0, { cur: null }, "");
    if (!out.length) return;
    diag.prices += out.length;
    const now = Date.now();
    let fresh = 0;
    for (const s of out) {
      if (isDup(s.cur, s.price, now)) continue;
      fresh++;
      samples.push({ t: now, price: s.price, cur: s.cur });
    }
    if (!fresh) return;
    trimWindow();
  });

  const WAIT_RE = /жд[её]т\s*твоей\s*ставки/i;
  const SOLD_RE = /победител|выиграл|куплен|уходит/i;
  const SOLD_FINAL_RE = /продано\s+другому\s+коллекционеру/i;

  function parseAbbrNum(raw) {
    const m = raw.match(/(\d+(?:[.,]\d+)?)\s*([KkКК]|[МmM]|млн|тыс)?/);
    if (!m) return null;
    let v = parseFloat(m[1].replace(",", "."));
    if (!Number.isFinite(v)) return null;
    const suf = (m[2] || "").toLowerCase();
    if (!suf) return Math.round(v);
    if (suf.startsWith("k") || suf.startsWith("к") || suf.startsWith("т")) {
      v *= 1000;
    } else {
      v *= 1000000;
    }
    return Math.round(v);
  }

  function extractBid(text) {
    const mSuf = text.match(/\d[\d\s\u00a0]*(?:[.,]\d+)?\s*[KkККмМmM]/);
    if (mSuf) return parseAbbrNum(mSuf[0]);
    const curM = text.match(/(?:^|\s)(\d[\d\s\u00a0]{1,15})\s*(?:⭐|★|корн|corn)/i);
    if (curM) {
      const n = parseInt(curM[1].replace(/[\s\u00a0]/g, ""), 10);
      if (Number.isFinite(n) && n >= MIN_PRICE) return n;
    }
    const nums = [...text.matchAll(/(?:^|\D)(\d{2,7})(?=\D|$)/g)];
    if (!nums.length) return null;
    const last = parseInt(nums[nums.length - 1][1], 10);
    if (last < MIN_PRICE || last > 3600) return null;
    return last;
  }

  const trackedSales = new Map();

  /* Sold/waiting duck window shows two bid buttons:
     <span class="corn-green-flat ..."></span> 150.9K
     <span class="stars-blue ..."></span> 337
     Parse each currency separately — never mix them. */

  function extractCurBid(root, re) {
    let spans = [];
    try {
      spans = root.querySelectorAll("span[class]");
    } catch {
      return null;
    }
    for (const sp of spans) {
      if (!re.test(sp.className || "")) continue;
      const holder = sp.parentElement || sp;
      const v = extractBid((holder.textContent || "").trim());
      if (v != null) return v;
    }
    return null;
  }

  function extractBids(el) {
    const corn = extractCurBid(el, /\bcorn/i);
    const stars = extractCurBid(el, /\bstars?\b|-blue/i);
    if (corn != null || stars != null) return { corn, stars };
    const txt = el.textContent || "";
    const hasStars = /звезд|★|⭐|stars?/i.test(txt);
    const hasCorn = /корн|corn/i.test(txt);
    if (!hasStars && !hasCorn) return {};
    const bid = extractBid(txt);
    if (bid == null) return {};
    if (hasStars && !hasCorn) return { stars: bid };
    if (hasCorn && !hasStars) return { corn: bid };
    return {};
  }

  function scanSales() {
    try {
      if (!document.body) return;
      const roots = [];
      const soldRoots = [];
      for (const el of document.querySelectorAll("div")) {
        const tc = el.textContent || "";
        if (tc.length > 600) continue;
        if (SOLD_FINAL_RE.test(tc)) {
          let deeper = false;
          for (const c of el.children) {
            if (c.tagName === "DIV" && SOLD_FINAL_RE.test(c.textContent || "")) {
              deeper = true;
              break;
            }
          }
          if (!deeper) soldRoots.push(el);
          continue;
        }
        if (!WAIT_RE.test(tc)) continue;
        let deeper = false;
        for (const c of el.children) {
          if (c.tagName === "DIV" && WAIT_RE.test(c.textContent || "")) {
            deeper = true;
            break;
          }
        }
        if (!deeper) roots.push(el);
      }

      const now = Date.now();

      for (const el of soldRoots) {
        const b = extractBids(el);
        if (b.corn != null && !isDup("corn", b.corn, now)) {
          samples.push({ t: now, price: b.corn, cur: "corn" });
        }
        if (b.stars != null && !isDup("stars", b.stars, now)) {
          samples.push({ t: now, price: b.stars, cur: "stars" });
        }
      }
      if (soldRoots.length) trimWindow();

      const nowSet = new Set(roots);

      for (const [el, st] of trackedSales) {
        const stillWaiting = nowSet.has(el) && WAIT_RE.test(el.textContent || "");
        if (stillWaiting) continue;
        const gone = !el.isConnected;
        const soldTxt = gone ? "" : el.textContent || "";
        if (gone || SOLD_RE.test(soldTxt)) {
          if (st.corn != null) samples.push({ t: now, price: st.corn, cur: "corn" });
          if (st.stars != null) samples.push({ t: now, price: st.stars, cur: "stars" });
          trimWindow();
        }
        trackedSales.delete(el);
      }

      let pushed = false;
      for (const el of nowSet) {
        let st = trackedSales.get(el);
        if (!st) {
          st = { corn: null, stars: null };
          trackedSales.set(el, st);
        }
        const b = extractBids(el);
        if (b.corn != null && b.corn !== st.corn && !isDup("corn", b.corn, now)) {
          st.corn = b.corn;
          samples.push({ t: now, price: b.corn, cur: "corn" });
          pushed = true;
        }
        if (b.stars != null && b.stars !== st.stars && !isDup("stars", b.stars, now)) {
          st.stars = b.stars;
          samples.push({ t: now, price: b.stars, cur: "stars" });
          pushed = true;
        }
      }
      if (pushed) trimWindow();

      if (trackedSales.size > 300) trackedSales.clear();
    } catch {
      // ignore
    }
  }

  setInterval(scanSales, 2000);

  /* ---------- price chart cards (DOM fallback) ----------
     Each chart card: <div class="relative ..."><canvas/>...
     <footer><p><img src="/img/currency/corn-green.png">156.1K</p></footer></div>
     Blue line = stars, green = corn; footer number = current avg price. */

  function curFromNode(p) {
    for (const im of p.querySelectorAll("img")) {
      const s =
        (im.getAttribute("src") || "") +
        " " +
        (im.getAttribute("alt") || "");
      if (/corn|корн/i.test(s)) return "corn";
      if (/star|звезд|★|⭐/i.test(s)) return "stars";
    }
    return classify((p.textContent || "").trim());
  }

  function scanCharts() {
    try {
      if (!document.body) return;
      const canvases = document.querySelectorAll("canvas");
      if (!canvases.length) return;
      const now = Date.now();
      let freshTotal = 0;
      for (const cv of canvases) {
        let node = cv.parentElement;
        let footer = null;
        for (let i = 0; i < 8 && node; i++) {
          footer = node.querySelector("footer");
          if (footer) break;
          node = node.parentElement;
        }
        if (!footer) continue;
        for (const p of footer.querySelectorAll("p")) {
          const raw = (p.textContent || "").trim();
          if (!raw) continue;
          const cur = curFromNode(p);
          if (cur !== "corn" && cur !== "stars") continue;
          const price = extractBid(raw);
          if (price == null || price < 1 || price > MAX_PRICE) continue;
          if (isDup(cur, price, now)) continue;
          samples.push({ t: now, price, cur });
          diag.chart++;
          freshTotal++;
        }
      }
      if (freshTotal) trimWindow();
    } catch {
      // ignore
    }
  }

  setInterval(scanCharts, 2000);
  setTimeout(scanCharts, 800);

  function collectText() {
    let text = "";
    try {
      text = document.body ? document.body.innerText || "" : "";
    } catch {
      return "";
    }
    try {
      if (document.querySelectorAll("*").length < 6000) {
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_ELEMENT
        );
        let n;
        while ((n = walker.nextNode())) {
          if (n.shadowRoot) text += "\n" + n.shadowRoot.textContent;
        }
      }
    } catch {
      // ignore
    }
    return text;
  }

  function detectMarket(text) {
    if (!text) return null;
    const t = text.toLowerCase();

    let type = null;
    if (/безумн/.test(t)) type = "crazy";
    else if (/горяч/.test(t)) type = "hot";
    else if (/обычн/.test(t)) type = "normal";
    else if (/crazy\s*market/.test(t)) type = "crazy";
    else if (/hot\s*market/.test(t)) type = "hot";
    else if (/market|рынок|маркет/.test(t)) type = "unknown";
    if (!type) return null;

    const timerM =
      t.match(/ещ[её]\s*(\d{1,2}:\d{2})/) ||
      t.match(/(\d{1,2}:\d{2})\s*(?:остал|left)/);
    const minPriceM = text.match(
      /мин\.?\s*цена[^0-9\n]*(\d[\d\s\u00a0]*)(?:\s*[★*⭐]\s*(\d[\d\s\u00a0]*))?/i
    );
    let minPriceCorn = null;
    let minPriceStars = null;
    if (minPriceM) {
      const n1 = parseInt(minPriceM[1].replace(/[\s\u00a0]/g, ""), 10);
      if (Number.isFinite(n1)) minPriceCorn = n1;
      if (minPriceM[2]) {
        const n2 = parseInt(minPriceM[2].replace(/[\s\u00a0]/g, ""), 10);
        if (Number.isFinite(n2)) minPriceStars = n2;
      }
    }

    return {
      type,
      timer: timerM ? timerM[1] : null,
      minPriceCorn,
      minPriceStars
    };
  }

  function computeStats() {
    trimWindow();
    if (!samples.length) return null;
    const buckets = {};
    for (const s of samples) {
      const b = (buckets[s.cur] = buckets[s.cur] || {
        sum: 0,
        min: Infinity,
        max: -Infinity,
        count: 0,
        values: []
      });
      b.sum += s.price;
      if (s.price < b.min) b.min = s.price;
      if (s.price > b.max) b.max = s.price;
      b.count++;
      b.values.push(s.price);
    }
    const result = {};
    for (const [cur, b] of Object.entries(buckets)) {
      b.values.sort((a, c) => a - c);
      const median = b.values.length % 2
        ? b.values[b.values.length >> 1]
        : (b.values[(b.values.length >> 1) - 1] + b.values[b.values.length >> 1]) / 2;
      const filtered = b.values.filter(v => v >= median / 5 && v <= median * 5);
      if (!filtered.length) continue;
      const fSum = filtered.reduce((a, c) => a + c, 0);
      result[cur] = {
        avg: Math.round(fSum / filtered.length),
        min: Math.round(filtered[0]),
        max: Math.round(filtered[filtered.length - 1]),
        count: filtered.length
      };
    }
    return result;
  }

  function pushSnapshot(force) {
    const now = Date.now();
    if (!force && now - lastPushAt < PUSH_INTERVAL) return;
    lastPushAt = now;

    const market = detectMarket(collectText());
    const byCur = computeStats();
    logCensus();

    const snapshot = {
      type: market ? market.type : null,
      timer: market ? market.timer : null,
      minPriceCorn: market ? market.minPriceCorn : null,
      minPriceStars: market ? market.minPriceStars : null,
      windowMs: WINDOW_MS,
      byCur: byCur || {},
      diag: { ...diag },
      url: location.href.slice(0, 120),
      updatedAt: now
    };

    try {
      chrome.storage.local.set({ marketStatus: snapshot }, () => {
        void chrome.runtime.lastError;
      });
      chrome.runtime.sendMessage(
        { type: "MARKET_UPDATE", data: snapshot },
        () => void chrome.runtime.lastError
      );
    } catch {
      // context gone
    }

    if (
      market &&
      market.type === "crazy" &&
      lastType !== "crazy" &&
      now - lastAlertAt > ALERT_COOLDOWN
    ) {
      lastAlertAt = now;
      const parts = [];
      if (byCur && byCur.corn) parts.push(`корн: ${byCur.corn.avg}`);
      if (byCur && byCur.stars) parts.push(`звезды: ${byCur.stars.avg}`);
      try {
        chrome.runtime.sendMessage(
          {
            type: "MARKET_ALERT",
            text:
              "БЕЗУМНЫЙ РЫНОК активен!" +
              (parts.length ? ` Средние (10с): ${parts.join(", ")}` : "")
          },
          () => void chrome.runtime.lastError
        );
      } catch {
        // ignore
      }
    }
    if (market && market.type !== "unknown") lastType = market.type;
  }

  setInterval(() => {
    try {
      pushSnapshot(false);
    } catch {
      // ignore
    }
  }, 1000);

  setTimeout(() => {
    try {
      pushSnapshot(true);
    } catch {
      // ignore
    }
  }, 1500);
})();
