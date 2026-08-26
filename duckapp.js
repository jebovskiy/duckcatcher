(() => {
  "use strict";

  const S = window.DC;
  if (!S) return;

  let settings = { ...S.DEFAULTS };
  let contextAlive = true;
  let lastBreedText = "";
  let lastBreedAt = 0;
  let lastPlayText = "";
  let lastPlayAt = 0;
  const clickedEls = new WeakSet();
  let breedingWatch = null;
  let closingMiniApp = false;

  const stats = {
    active: true,
    breedClicks: 0,
    lastBreedText: "",
    lastBreedAt: 0,
    lastError: ""
  };

  let lastButtonFound = false;
  let lastButtonText = "";
  let lastScanNote = "";
  let lastBodySample = "";

  function sendMsg(msg) {
    S.safeSend(msg, () => contextAlive, v => { contextAlive = v; });
  }

  let lastStatusPush = 0;
  function pushStatus() {
    const now = Date.now();
    if (now - lastStatusPush < 800) return;
    lastStatusPush = now;
    try {
      chrome.storage.local.set(
        {
          miniappStatus: {
            injected: true,
            url: location.href.slice(0, 160),
            ready: document.readyState,
            enabled: settings.enabled,
            autoBreed: settings.autoBreed,
            breedClicks: stats.breedClicks,
            lastBreedText: stats.lastBreedText,
            buttonFound: lastButtonFound,
            buttonText: lastButtonText,
            scanNote: lastScanNote,
            bodySample: lastBodySample,
            lastError: stats.lastError
          }
        },
        () => {
          void chrome.runtime.lastError;
        }
      );
    } catch {
      // ignore
    }
  }

  function deepQueryAll(selector, root) {
    const results = [];
    const collect = r => {
      if (!r) return;
      r.querySelectorAll(selector).forEach(n => results.push(n));
      r.querySelectorAll("*").forEach(n => {
        if (n.shadowRoot) collect(n.shadowRoot);
      });
      if (r.shadowRoot) collect(r.shadowRoot);
    };
    collect(root || document);
    return results;
  }

  function* deepElements(root) {
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_ELEMENT
    );
    let node;
    while ((node = walker.nextNode())) {
      yield node;
      if (node.shadowRoot) yield* deepElements(node.shadowRoot);
    }
    if (root.shadowRoot) yield* deepElements(root.shadowRoot);
  }

  function actionText(el) {
    const text = S.norm(el.innerText || el.textContent || "");
    const aria = S.norm(
      el.getAttribute("aria-label") ||
        el.getAttribute("title") ||
        el.getAttribute("alt") ||
        ""
    );
    const combined = (text + " " + aria).trim();
    return { text, combined };
  }

  function findActionButton(re) {
    const preferred = deepQueryAll(
      'button, [role="button"], a, ' +
        'div[class*="button" i], span[class*="button" i], ' +
        'div[class*="btn" i], a[class*="btn" i], [data-testid], [aria-label]'
    );
    for (const el of preferred) {
      const { text, combined } = actionText(el);
      if (!combined || text.length > 60) continue;
      if (!re.test(combined)) continue;
      if (!S.isVisible(el)) continue;
      return el;
    }
    for (const el of deepElements(document)) {
      if (preferred.includes(el)) continue;
      const { text, combined } = actionText(el);
      if (!combined || text.length > 60 || text.length < 2) continue;
      if (!re.test(combined)) continue;
      if (S.norm(el.innerText || "") !== text) continue;
      if (!S.isVisible(el)) continue;
      return el;
    }
    return null;
  }

  function findBreedButton() {
    return findActionButton(S.BREED_RE);
  }

  function findPlayButton() {
    return findActionButton(S.PLAY_RE);
  }

  function clickBreed(btn) {
    const now = Date.now();
    const text = (btn.textContent || "").trim();
    if (clickedEls.has(btn)) return;
    if (text && text === lastBreedText && now - lastBreedAt < 8000) return;

    if (settings.dryRun) {
      S.log("DuckApp", "[DRY-RUN] would click breed button:", text);
      stats.breedClicks++;
      stats.lastBreedText = text;
      stats.lastBreedAt = now;
      sendMsg({ type: "DUCK_BREED_CLICK", text: "[DRY-RUN] " + text });
      return;
    }

    S.realClick(btn);
    clickedEls.add(btn);
    lastBreedText = text;
    lastBreedAt = now;
    stats.breedClicks++;
    stats.lastBreedText = text;
    stats.lastBreedAt = now;

    chrome.storage.local.set({ breedClicks: stats.breedClicks }, () => {
      void chrome.runtime.lastError;
    });
    sendMsg({ type: "DUCK_BREED_CLICK", text });

    if (settings.closeAfterBreed) watchBreeding();
  }

  function clickPlay(btn) {
    const now = Date.now();
    const text = (btn.textContent || "").trim();
    if (clickedEls.has(btn)) return;
    if (text && text === lastPlayText && now - lastPlayAt < 8000) return;

    if (settings.dryRun) {
      S.log("DuckApp", "[DRY-RUN] would click play button:", text);
      lastPlayText = text;
      lastPlayAt = now;
      return;
    }

    S.realClick(btn);
    clickedEls.add(btn);
    lastPlayText = text;
    lastPlayAt = now;
    S.log("DuckApp", "clicked play/start button:", text);
  }

  function watchBreeding() {
    if (breedingWatch) return;
    const startAt = Date.now();
    breedingWatch = setInterval(() => {
      if (!contextAlive) {
        clearInterval(breedingWatch);
        breedingWatch = null;
        return;
      }
      let confirmed = Date.now() - startAt > 4500;
      if (!confirmed) {
        try {
          const bodyText = S.norm(document.body?.innerText || "");
          confirmed =
            /(разведение начал|разведение запущ|успешно|успех|процесс развед|breed(ing)? (started|in progress)|started)/i.test(
              bodyText
            );
        } catch {
          // context tearing down
        }
        if (!confirmed) confirmed = !findBreedButton();
      }
      if (confirmed) {
        clearInterval(breedingWatch);
        breedingWatch = null;
        closeMiniApp();
      }
    }, 400);
  }

  function closeMiniApp() {
    if (closingMiniApp) return;
    closingMiniApp = true;
    let attempts = 0;
    const closeTimer = setInterval(() => {
      if (attempts++ >= 4) {
        clearInterval(closeTimer);
        try {
          window.parent.postMessage(
            { duckCatcherBreedStarted: true },
            "*"
          );
        } catch {
          // ignore
        }
        return;
      }
      try {
        // CSP-safe: miniapp-closer.js (MAIN world) listens for this event
        // and calls Telegram.WebApp.close() — no inline script injection.
        document.dispatchEvent(new CustomEvent("dc-close-miniapp"));
      } catch {
        // ignore
      }
    }, 350);
  }

  function parsePricesFromText(text) {
    const res = { corn: null, stars: null };
    if (!text) return res;
    const t = String(text).replace(/\u00a0/g, " ");
    for (const m of t.matchAll(/(\d[\d\s]{0,12})\s*(корн|★|⭐|звезд)/gi)) {
      const n = parseInt(m[1].replace(/\s/g, ""), 10);
      if (!Number.isFinite(n)) continue;
      if (/корн/i.test(m[2])) {
        if (res.corn == null || n > res.corn) res.corn = n;
      } else {
        if (res.stars == null || n > res.stars) res.stars = n;
      }
    }
    return res;
  }

  function cardOf(el) {
    let node = el;
    for (let i = 0; i < 6 && node && node !== document.body; i++) {
      const txt = node.innerText || "";
      if (txt.length > 30 && /\d/.test(txt)) return node;
      node = node.parentElement;
    }
    return el.parentElement || el;
  }

  const soldKeys = new Set();

  function tryAutoSell() {
    if (!settings.autoSellEnabled) return;
    const minCorn = Number(settings.autoSellMinCorn) || 0;
    const minStars = Number(settings.autoSellMinStars) || 0;
    if (minCorn <= 0 && minStars <= 0) return;

    const btns = deepQueryAll(
      'button, [role="button"], a, div[class*="button" i], span[class*="button" i]'
    );
    for (const b of btns) {
      const { combined } = actionText(b);
      if (!combined) continue;
      if (!/(продать сразу|продажа сразу|sell now|instant sell)/i.test(combined)) continue;
      if (!S.isVisible(b)) continue;
      if (clickedEls.has(b)) continue;

      const card = cardOf(b);
      const cardText = card ? card.innerText || "" : "";
      const prices = parsePricesFromText(cardText);
      const hitCorn = minCorn > 0 && prices.corn != null && prices.corn >= minCorn;
      const hitStars =
        minStars > 0 && prices.stars != null && prices.stars >= minStars;
      if (!hitCorn && !hitStars) continue;

      const key = prices.corn + "/" + prices.stars + "/" + combined.slice(0, 20);
      if (soldKeys.has(key)) continue;
      soldKeys.add(key);
      if (soldKeys.size > 300) soldKeys.clear();

      if (settings.dryRun) {
        S.log("DuckApp", "[DRY-RUN] would instant-sell:", prices);
        sendMsg({ type: "DUCK_SOLD", corn: prices.corn, stars: prices.stars, dryRun: true });
        continue;
      }

      S.realClick(b);
      clickedEls.add(b);
      stats.sells = (stats.sells || 0) + 1;
      S.log("DuckApp", "instant-sell clicked:", prices);
      sendMsg({ type: "DUCK_SOLD", corn: prices.corn, stars: prices.stars });
    }
  }

  const watchedHits = new Map();
  const outlined = new Set();
  const HEADER_REGION_RE =
    /header|topbar|top-bar|navbar|account|profile|user-?info|balance/i;
  const LOT_MARKERS_RE = /(корн|★|⭐|звезд|продад|цен)/i;

  function isInsideChrome(el) {
    let node = el;
    while (node && node !== document.body) {
      const tag = node.tagName || "";
      if (tag === "HEADER" || tag === "NAV") return true;
      const cls = String(node.className || "");
      const id = String(node.id || "");
      if (HEADER_REGION_RE.test(cls) || HEADER_REGION_RE.test(id)) return true;
      node = node.parentElement;
    }
    return false;
  }

  function fastScanQueue(names) {
    const all = document.body ? document.body.querySelectorAll("*") : [];
    const matched = [];
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      const tag = el.tagName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "SVG" || tag === "PATH")
        continue;
      let raw;
      try {
        raw = el.textContent || "";
      } catch {
        continue;
      }
      if (!raw || raw.length > 4000) continue;
      const lowRaw = raw.toLowerCase();
      let hitName = false;
      for (let j = 0; j < names.length; j++) {
        if (lowRaw.includes(names[j])) {
          hitName = true;
          break;
        }
      }
      if (!hitName) continue;

      let txt;
      try {
        txt = el.innerText || "";
      } catch {
        continue;
      }
      if (!txt || txt.length > 2000) continue;
      const low = txt.toLowerCase();
      if (!/\d/.test(low) || !LOT_MARKERS_RE.test(low)) continue;
      if (!S.isVisible(el)) continue;
      if (isInsideChrome(el)) continue;
      matched.push(el);
    }
    const set = new Set(matched);
    return matched.filter(el => {
      let p = el.parentElement;
      while (p && p !== document.body) {
        if (set.has(p)) return false;
        p = p.parentElement;
      }
      return true;
    });
  }

  function refreshOutlines(cards) {
    const keep = new Set(cards);
    for (const el of Array.from(outlined)) {
      if (!keep.has(el) || !el.isConnected) {
        el.style.outline = "";
        el.style.outlineOffset = "";
        if (el.__ddqBadge) {
          try {
            el.__ddqBadge.remove();
          } catch {
            // ignore
          }
          el.__ddqBadge = null;
        }
        outlined.delete(el);
      }
    }
    for (const el of cards) {
      if (!outlined.has(el)) {
        el.style.outline = "3px solid #ef4444";
        el.style.outlineOffset = "2px";
        outlined.add(el);
      }
    }
  }

  function parseQueueMeta() {
    let text = "";
    try {
      text = document.body ? document.body.innerText || "" : "";
    } catch {
      return {};
    }
    const num = s => {
      if (!s) return null;
      const n = parseInt(String(s).replace(/[\s\u00a0]/g, ""), 10);
      return Number.isFinite(n) ? n : null;
    };
    const totalM = text.match(/всего\s*уток[:\s]*(\d[\d\s\u00a0]*)/i);
    const posM =
      text.match(
        /(?:ваша|твоя)\s*утк[аи][^.\n]{0,40}?очеред[^0-9\n]{0,10}(\d[\d\s\u00a0]*)/i
      ) ||
      text.match(
        /(?:ваша|твоя)\s*позиция[^0-9\n]{0,10}(\d[\d\s\u00a0]*)/i
      );
    return { total: num(totalM && totalM[1]), pos: num(posM && posM[1]) };
  }

  function ensureBadge(card, text) {
    let b = card.__ddqBadge;
    if (!b || !b.isConnected) {
      b = document.createElement("div");
      b.style.cssText =
        "position:absolute;top:-12px;right:8px;background:#ef4444;color:#fff;" +
        "font:700 12px/1.5 system-ui,-apple-system,sans-serif;padding:2px 9px;" +
        "border-radius:10px;z-index:2147483000;pointer-events:none;" +
        "box-shadow:0 2px 6px rgba(0,0,0,.35);white-space:nowrap";
      try {
        const pos = getComputedStyle(card).position;
        if (pos === "static") card.style.position = "relative";
        card.appendChild(b);
      } catch {
        return;
      }
      card.__ddqBadge = b;
    }
    if (b.textContent !== text) b.textContent = text;
  }

  let queueSession = null;

  function findQueueContainer() {
    const els = document.body
      ? document.body.querySelectorAll("div,section,main,ul,ol")
      : [];
    let best = null;
    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      if (el.scrollHeight <= el.clientHeight + 60) continue;
      let st;
      try {
        st = getComputedStyle(el);
      } catch {
        continue;
      }
      if (!/(auto|scroll)/.test(st.overflowY || "")) continue;
      if (!S.isVisible(el)) continue;
      const low = (el.innerText || "").toLowerCase();
      if (!LOT_MARKERS_RE.test(low)) continue;
      const area = el.clientHeight * el.clientWidth;
      if (!best || area > best.area) best = { el, area };
    }
    return best ? best.el : null;
  }

  function endQueueSession(returnToAnchor) {
    const s = queueSession;
    queueSession = null;
    if (s && returnToAnchor) {
      try {
        s.container.scrollTo({ top: s.anchor, behavior: "smooth" });
      } catch {
        // ignore
      }
    }
  }

  function queuePulse() {
    const rawUsers = Array.isArray(settings.watchUsers)
      ? settings.watchUsers.filter(Boolean)
      : [];
    const names = rawUsers
      .map(u => String(u).trim().toLowerCase().replace(/^@/, ""))
      .filter(Boolean);

    if (!names.length) {
      if (queueSession) endQueueSession(true);
      refreshOutlines([]);
      return;
    }

    const cards = fastScanQueue(names);
    refreshOutlines(cards);

    const meta = parseQueueMeta();
    const posText =
      meta.pos != null
        ? meta.total != null
          ? `#${meta.pos} из ${meta.total}`
          : `#${meta.pos}`
        : "в очереди";

    const now = Date.now();
    for (const card of cards) {
      ensureBadge(card, posText);
      const low = (card.innerText || "").toLowerCase();
      for (const u of rawUsers) {
        const display = String(u).trim();
        const name = display.toLowerCase().replace(/^@/, "");
        if (!name || !low.includes(name)) continue;
        const last = watchedHits.get(name) || 0;
        if (now - last < 120000) continue;
        watchedHits.set(name, now);
        sendMsg({
          type: "QUEUE_FIND",
          user: display,
          pos: meta.pos,
          total: meta.total
        });
      }
    }

    if (!queueSession) {
      const container = findQueueContainer();
      if (!container) return;
      queueSession = {
        container,
        startedAt: now,
        lastStep: 0,
        stuck: 0,
        anchor: container.scrollTop,
        dirMul: 1,
        dirDetected: false,
        burstActive: false
      };
      return;
    }

    const allFound = names.every(
      n => now - (watchedHits.get(n) || 0) < 60000
    );
    if (allFound) {
      endQueueSession(true);
      return;
    }

    if (!queueSession.burstActive && now - queueSession.lastStep >= 550) {
      queueSession.lastStep = now;
      runBurst(queueSession);
    }
    if (now - queueSession.startedAt > 240000) endQueueSession(true);
  }

  function runBurst(session) {
    const c = session.container;
    session.burstActive = true;
    const before = c.scrollTop;
    let i = 0;
    const ticks = 6;
    const stepH = Math.max(90, Math.round(c.clientHeight / ticks));

    const finish = () => {
      session.burstActive = false;
      const moved = c.scrollTop - before;

      if (!session.dirDetected && Math.abs(moved) > 2) {
        session.dirDetected = true;
        if (Math.sign(moved) !== Math.sign(-stepH)) session.dirMul = -1;
      }

      if (Math.abs(moved) <= 2) {
        session.stuck++;
        if (session.stuck < 8) {
          try {
            c.scrollBy(0, Math.round(c.clientHeight * 0.45) * session.dirMul);
          } catch {
            // ignore
          }
        } else {
          endQueueSession(true);
        }
      } else {
        session.stuck = 0;
      }
    };

    const tickFn = () => {
      if (queueSession !== session) {
        session.burstActive = false;
        return;
      }
      const delta = -stepH * session.dirMul;
      try {
        c.dispatchEvent(
          new WheelEvent("wheel", {
            deltaY: delta,
            deltaX: 0,
            bubbles: true,
            cancelable: true,
            view: window
          })
        );
      } catch {
        // ignore
      }
      try {
        c.scrollBy(0, delta);
      } catch {
        // ignore
      }
      i++;
      if (i < ticks) {
        session.burstTimer = setTimeout(tickFn, 70);
      } else {
        finish();
      }
    };
    tickFn();
  }

  let lastApiScanAt = 0;

  function apiScanUsername(body) {
    const rawUsers = Array.isArray(settings.watchUsers)
      ? settings.watchUsers.filter(Boolean)
      : [];
    if (!rawUsers.length || !body || body.length > 200000) return;
    const now = Date.now();
    if (now - lastApiScanAt < 150) return;
    lastApiScanAt = now;
    const low = body.toLowerCase();
    for (const u of rawUsers) {
      const display = String(u).trim();
      const name = display.toLowerCase().replace(/^@/, "");
      if (!name || !low.includes(name)) continue;
      const last = watchedHits.get(name) || 0;
      if (now - last < 120000) continue;
      watchedHits.set(name, now);
      sendMsg({
        type: "QUEUE_FIND",
        user: display,
        pos: null,
        total: null,
        src: "api"
      });
    }
  }

  window.addEventListener("message", event => {
    if (event.source !== window) return;
    const d = event.data;
    if (!d || d.source !== "dd-sniffer") return;
    const p = d.payload;
    if (
      (p.kind === "api" || p.kind === "ws-msg") &&
      typeof p.body === "string"
    ) {
      try {
        apiScanUsername(p.body);
      } catch {
        // ignore
      }
    }
  });

  setInterval(() => {
    try {
      queuePulse();
    } catch {
      // ignore
    }
  }, 400);

  function tick() {
    if (!contextAlive) return;
    try {
      if (S.isPaused(settings) || !S.isWithinSchedule(settings)) {
        stats.active = false;
        lastScanNote = "paused/scheduled off";
        pushStatus();
        return;
      }

      tryAutoSell();

      if (!settings.enabled || !settings.autoBreed) {
        stats.active = false;
        lastScanNote = "disabled";
        pushStatus();
        return;
      }
      stats.active = true;

      const btn = findBreedButton();
      if (btn) {
        lastButtonFound = true;
        lastButtonText = S.norm(btn.textContent || "").slice(0, 60);
        lastScanNote = `breed button found: ${lastButtonText}`;
        try {
          lastBodySample = S.norm(document.body?.innerText || "")
            .replace(/\s+/g, " ")
            .slice(0, 120);
        } catch {
          lastBodySample = "";
        }
        clickBreed(btn);
        pushStatus();
        return;
      }

      const playBtn = findPlayButton();
      if (playBtn) {
        lastButtonFound = true;
        lastButtonText = S.norm(playBtn.textContent || "").slice(0, 60);
        lastScanNote = `play button found, clicking to start: ${lastButtonText}`;
        try {
          lastBodySample = S.norm(document.body?.innerText || "")
            .replace(/\s+/g, " ")
            .slice(0, 120);
        } catch {
          lastBodySample = "";
        }
        clickPlay(playBtn);
        pushStatus();
        return;
      }

      lastButtonFound = false;
      lastButtonText = "";
      lastScanNote = "button not found";
      try {
        lastBodySample = S.norm(document.body?.innerText || "")
          .replace(/\s+/g, " ")
          .slice(0, 120);
      } catch {
        lastBodySample = "";
      }
      pushStatus();
    } catch (err) {
      stats.lastError = String(err?.message || err).slice(0, 120);
      pushStatus();
    }
  }

  let tickTimer = null;
  let nextTickAt = 0;

  function scheduleTick() {
    if (!contextAlive) return;
    const jitter = S.randomJitter(500, 1500);
    nextTickAt = Date.now() + jitter;
    clearTimeout(tickTimer);
    tickTimer = setTimeout(tick, jitter);
  }

  try {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message?.type === "GET_STATUS") {
        sendResponse({ ok: true, stats, settings });
      }
    });
  } catch {
    contextAlive = false;
    return;
  }

  try {
    chrome.storage.sync.get(S.DEFAULTS, result => {
      if (!contextAlive) return;
      settings = { ...S.DEFAULTS, ...result };
      S.setDebug(settings.debug);
      chrome.storage.local.get("breedClicks", r => {
        if (!contextAlive) return;
        if (Number.isFinite(r?.breedClicks)) stats.breedClicks = r.breedClicks;
        scheduleTick();
        pushStatus();
      });
    });
  } catch {
    contextAlive = false;
    return;
  }

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync") return;
      for (const [key, change] of Object.entries(changes)) {
        settings[key] = change.newValue;
      }
      if ("debug" in changes) S.setDebug(changes.debug.newValue);
      scheduleTick();
    });
  } catch {
    // ignore
  }

  const observer = new MutationObserver(() => {
    if (contextAlive && Date.now() >= nextTickAt) scheduleTick();
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true
  });

  setInterval(() => {
    if (!contextAlive) return;
    if (Date.now() >= nextTickAt) scheduleTick();
  }, 2500);

  try {
    chrome.runtime.onMessage.addListener(message => {
      if (message?.type !== "TICK") return;
      if (!contextAlive) return;
      try {
        queuePulse();
      } catch {
        // ignore
      }
      if (document.hidden) {
        try {
          tick();
        } catch {
          // ignore
        }
      }
    });
  } catch {
    // ignore
  }

  S.makeWorkerTicker(400, () => {
    if (!contextAlive) return;
    try {
      queuePulse();
    } catch {
      // ignore
    }
    if (document.hidden) {
      try {
        tick();
      } catch {
        // ignore
      }
    }
  });
})();
