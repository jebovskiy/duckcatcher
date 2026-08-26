(() => {
  "use strict";

  const DC = (window.DC = window.DC || {});

  const RARITY_LIST = [
    "Common",
    "Uncommon",
    "Rare",
    "Epic",
    "Legendary",
    "Mythic",
    "Unique",
    "Secret"
  ];

  const RARITY_ALIASES = {
    common: ["common", "обычная", "обычный"],
    uncommon: ["uncommon", "необычная", "необычный"],
    rare: ["rare", "редкая", "редкий"],
    epic: ["epic", "эпическая", "эпический"],
    legendary: ["legendary", "легендарная", "легендарный"],
    mythic: ["mythic", "мифическая", "мифический"],
    unique: ["unique", "уникальная", "уникальный"],
    secret: ["secret", "секретная", "секретный"]
  };

  const BREEDING_RE = /(по ссылке разведения|начинай разведение|скрестить уток)/i;
  const LEGENDARY_BREED_RE = /(готов к легендарному скрещиванию)/i;
  const PLAY_RE = /(играть|play)/i;
  const BREED_RE = /(развед|скрест|скрещив|breed)/i;
  const LEVEL_RE = /(?:уровень|lv\.?|lvl)\s*[:#]?\s*(\d+)/i;
  const DUCK_INFO_RE = /(?:моя|твоя)\s+утк[аи]\s*[:\-]?\s*(\w+)\s*(?:lv\.?|lvl|уровень)\s*[:#]?\s*(\d+)/i;
  const CHOOSER_RE_DESKTOP = /(desktop|десктоп|телеграм|telegram)/i;
  const CHOOSER_RE_WEB = /(браузер|web|веб|browser)/i;
  const CHOOSER_RE_WEB_BAD = /(desktop|десктоп|приложени)/i;

  const DEFAULTS = {
    enabled: true,
    autoOpen: true,
    autoScroll: true,
    autoPlay: true,
    autoBreed: true,
    closeAfterBreed: true,
    rarity: ["Common"],
    selectedRarities: ["Common"],
    soundEnabled: true,
    debug: false,
    scheduleEnabled: false,
    scheduleFrom: "09:00",
    scheduleTo: "23:00",
    hasSeenHint: false,
    dryRun: false,
    chatFilterMode: "all",
    chatFilterList: [],
    customRarities: [],
    cooldownUntil: 0,
    autoSellEnabled: false,
    autoSellMinCorn: 0,
    autoSellMinStars: 0,
    watchUsers: [],
    shareEnabled: false,
    shareEndpoint: "https://myduckstats.vercel.app/api/stats",
    onboarded: false,
    theme: "auto",
    lang: "auto",
    smartCatchEnabled: false,
    myDuckRarity: "Rare",
    myDuckLevel: 5,
    targetRarities: ["Rare", "Epic"],
    minPartnerLevel: 1,
    maxPartnerLevel: 5,
    onlyNewLinks: true,
    avoidRepeatPartner: true,
    partnerHistoryMax: 200
  };

  function getInstallId(cb) {
    try {
      chrome.storage.local.get({ installId: null }, r => {
        if (r && r.installId) return cb(r.installId);
        let id;
        try {
          id = crypto.randomUUID();
        } catch {
          id =
            "id-" +
            Date.now().toString(36) +
            "-" +
            Math.random().toString(36).slice(2, 10);
        }
        chrome.storage.local.set({ installId: id }, () => cb(id));
      });
    } catch {
      cb(null);
    }
  }

  function norm(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .toLowerCase()
      .trim();
  }

  function extractBreedNickname(text) {
    const normalized = norm(text);
    const match = normalized.match(/от\s*[«"]([^»"]+)[»"]/);
    return match ? match[1].toLowerCase() : null;
  }

  function extractLevel(text) {
    const normalized = norm(text);
    const match = normalized.match(LEVEL_RE);
    return match ? parseInt(match[1], 10) : null;
  }

  function extractDuckInfo(text) {
    const normalized = norm(text);
    const match = normalized.match(DUCK_INFO_RE);
    if (match) {
      return { rarity: match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase(), level: parseInt(match[2], 10) };
    }
    return null;
  }

  function parseDuckCard(text) {
    const normalized = norm(text);
    const selected = getSelectedRarities({ selectedRarities: RARITY_LIST });
    const rarity = matchesRarity(text, selected, []);
    const level = extractLevel(text);
    const nick = extractBreedNickname(text);
    return { rarity, level, nick };
  }

  function getSelectedRarities(settings) {
    if (Array.isArray(settings.selectedRarities) && settings.selectedRarities.length) {
      return settings.selectedRarities;
    }
    if (Array.isArray(settings.rarity) && settings.rarity.length) {
      return settings.rarity;
    }
    if (typeof settings.rarity === "string" && settings.rarity) {
      return [settings.rarity];
    }
    return ["Common"];
  }

  function rarityIndex(r) {
    return RARITY_LIST.indexOf(String(r));
  }

  function matchesRarity(text, selectedRarities, customRarities) {
    const t = norm(text);
    if (!t) return false;
    for (const r of selectedRarities) {
      const aliases = RARITY_ALIASES[norm(r)] || [norm(r)];
      for (const alias of aliases) {
        const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re = new RegExp(
          "(^|[^a-zа-яё])" + escaped + "(?=$|[^a-zа-яё])",
          "i"
        );
        if (re.test(t)) return r;
      }
    }
    if (Array.isArray(customRarities) && customRarities.length) {
      for (const cr of customRarities) {
        if (!cr || !cr.name || !cr.patterns || !cr.patterns.length) continue;
        const hasFilter = selectedRarities && selectedRarities.length > 0;
        if (hasFilter && !selectedRarities.includes(cr.name)) continue;
        for (const pat of cr.patterns) {
          if (!pat || typeof pat !== "string" || pat.length > 120) continue;
          try {
            const re = new RegExp(pat, "i");
            if (re.test(text)) return cr.name;
          } catch {
            const escaped = pat.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const re = new RegExp(
              "(^|[^a-zа-яё])" + escaped + "(?=$|[^a-zа-яё])",
              "i"
            );
            if (re.test(t)) return cr.name;
          }
        }
      }
    }
    return false;
  }

  function bestCandidate(candidates) {
    if (!candidates.length) return null;
    let best = candidates[0];
    let bestIdx = rarityIndex(best.rarityMatch);
    let bestTime = best.messageTimestamp || 0;
    for (let i = 1; i < candidates.length; i++) {
      const idx = rarityIndex(candidates[i].rarityMatch);
      const ts = candidates[i].messageTimestamp || 0;
      if (
        idx > bestIdx ||
        (idx === bestIdx && ts > bestTime)
      ) {
        best = candidates[i];
        bestIdx = idx;
        bestTime = ts;
      }
    }
    return best;
  }

  function loadSettings(keys) {
    return new Promise(resolve => {
      try {
        chrome.storage.sync.get(keys || DEFAULTS, result => {
          const s = { ...(keys || DEFAULTS), ...result };
          if (!Array.isArray(s.selectedRarities)) {
            s.selectedRarities = Array.isArray(s.rarity)
              ? s.rarity
              : typeof s.rarity === "string"
              ? [s.rarity]
              : ["Common"];
          }
          resolve(s);
        });
      } catch {
        resolve({ ...DEFAULTS });
      }
    });
  }

  function isPaused(settings) {
    if (!settings || !settings.pauseUntil) return false;
    return Date.now() < settings.pauseUntil;
  }

  function isWithinSchedule(settings) {
    if (!settings || !settings.scheduleEnabled) return true;
    const from = settings.scheduleFrom;
    const to = settings.scheduleTo;
    if (!from || !to) return true;

    const now = new Date();
    const [fh, fm] = from.split(":").map(Number);
    const [th, tm] = to.split(":").map(Number);
    const cur = now.getHours() * 60 + now.getMinutes();
    const start = fh * 60 + fm;
    const end = th * 60 + tm;

    if (start <= end) {
      return cur >= start && cur < end;
    }
    return cur >= start || cur < end;
  }

  function parseCooldown(text) {
    if (!text) return 0;
    const t = norm(text);
    const m = t.match(
      /(?:до|through|until|осталось|remaining|через|in)\s+(\d{1,2})\s*[:\s]\s*(\d{2})/
    );
    if (m) {
      const now = new Date();
      const h = parseInt(m[1], 10);
      const min = parseInt(m[2], 10);
      const target = new Date(now);
      target.setHours(h, min, 0, 0);
      if (target <= now) target.setDate(target.getDate() + 1);
      return target.getTime();
    }
    const m2 = t.match(/(\d+)\s*(?:мин|минут|minutes?|min)/);
    if (m2) {
      return Date.now() + parseInt(m2[1], 10) * 60000;
    }
    return 0;
  }

  function isChatAllowed(hash, settings) {
    if (!settings || settings.chatFilterMode === "all") return true;
    const list = Array.isArray(settings.chatFilterList) ? settings.chatFilterList : [];
    if (!list.length) return true;
    const chatId = (hash || "").replace(/^#\/?/, "").toLowerCase();
    const matched = list.some(entry => {
      const e = String(entry).toLowerCase().trim();
      if (!e) return false;
      return chatId === e || chatId.includes(e);
    });
    return settings.chatFilterMode === "whitelist" ? matched : !matched;
  }

  function humanScroll(container, direction) {
    if (!container) return Promise.resolve();
    return new Promise(resolve => {
      const total = direction === "up"
        ? container.scrollTop
        : container.scrollHeight - container.clientHeight - container.scrollTop;
      if (total <= 0) { resolve(); return; }
      const step = Math.min(total, randomJitter(40, 120));
      const target = direction === "up"
        ? Math.max(0, container.scrollTop - step)
        : Math.min(container.scrollHeight - container.clientHeight, container.scrollTop + step);
      const duration = randomJitter(150, 400);
      const start = container.scrollTop;
      const startTime = performance.now();
      const STEP_MS = 30;

      function easeInOut(p) {
        return p < 0.5
          ? 2 * p * p
          : 1 - Math.pow(-2 * p + 2, 2) / 2;
      }

      function frame(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        container.scrollTop = start + (target - start) * easeInOut(progress);
        if (progress < 1) {
          if (document.hidden) {
            setTimeout(() => frame(performance.now()), STEP_MS);
          } else {
            requestAnimationFrame(frame);
          }
        } else {
          resolve();
        }
      }

      if (document.hidden) {
        setTimeout(() => frame(performance.now()), STEP_MS);
      } else {
        requestAnimationFrame(frame);
      }
    });
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function randomJitter(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  const MAX_HISTORY = 10000;
  const MAX_DUMP = 15000;
  const DUMP_AUTO_INTERVAL = 30 * 60 * 1000;
  const HISTORY_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

  function stripPII(s) {
    return String(s || "")
      .replace(/@\w+/g, "")
      .replace(/\b\d{5,}\b/g, "")
      .slice(0, 200);
  }

  function expireHistory(arr) {
    const cutoff = Date.now() - HISTORY_EXPIRY_MS;
    return Array.isArray(arr) ? arr.filter(e => (e.timestamp || 0) > cutoff) : [];
  }

  async function getCatchHistory() {
    return new Promise(resolve => {
      try {
        chrome.storage.local.get({ catchHistory: [] }, r => {
          resolve(expireHistory(r.catchHistory));
        });
      } catch {
        resolve([]);
      }
    });
  }

  async function addCatchHistory(rarity, text, timestamp, opts) {
    try {
      const mode = (opts && opts.mode) || "catch";
      const history = await getCatchHistory();
      history.unshift({
        rarity: String(rarity),
        text: stripPII(text),
        timestamp: timestamp || Date.now(),
        mode
      });
      if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
      chrome.storage.local.set({ catchHistory: history }, () => {
        void chrome.runtime.lastError;
      });

      if (mode === "sight") return;

      const ts = timestamp || Date.now();
      chrome.storage.local.get({ dumpHistory: [], dumpMeta: {} }, r => {
        const dump = expireHistory(r.dumpHistory);
        dump.push({
          rarity: String(rarity),
          text: stripPII(text),
          timestamp: ts,
          caughtAt: new Date(ts).toISOString(),
          mode
        });
        if (dump.length > MAX_DUMP) dump.splice(0, dump.length - MAX_DUMP);
        const meta = r.dumpMeta || {};
        meta.lastCatchAt = ts;
        meta.totalCatches = (meta.totalCatches || 0) + 1;
        meta.startedAt = meta.startedAt || ts;
        chrome.storage.local.set({ dumpHistory: dump, dumpMeta: meta }, () => {
          void chrome.runtime.lastError;
        });
      });
    } catch {
      // ignore
    }
  }

  async function getDumpHistory() {
    return new Promise(resolve => {
      try {
        chrome.storage.local.get({ dumpHistory: [], dumpMeta: {} }, r => {
          resolve({
            history: Array.isArray(r.dumpHistory) ? r.dumpHistory : [],
            meta: r.dumpMeta || {}
          });
        });
      } catch {
        resolve({ history: [], meta: {} });
      }
    });
  }

  async function clearDumpHistory() {
    return new Promise(resolve => {
      try {
        chrome.storage.local.set({ dumpHistory: [], dumpMeta: {} }, resolve);
      } catch {
        resolve();
      }
    });
  }

  function buildDumpJSON(history, meta) {
    return JSON.stringify({
      version: 2,
      exportedAt: new Date().toISOString(),
      meta: {
        startedAt: meta.startedAt ? new Date(meta.startedAt).toISOString() : null,
        lastCatchAt: meta.lastCatchAt ? new Date(meta.lastCatchAt).toISOString() : null,
        totalCatches: meta.totalCatches || history.length
      },
      catches: history.map(h => ({
        rarity: h.rarity,
        text: h.text,
        timestamp: h.timestamp,
        caughtAt: h.caughtAt || new Date(h.timestamp).toISOString()
      }))
    }, null, 2);
  }

  function downloadDump(filename, content) {
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 200);
  }

  function autoDumpSchedule() {
    try {
      chrome.storage.local.get({ dumpAutoEnabled: false, dumpLastAutoAt: 0 }, r => {
        if (!r.dumpAutoEnabled) return;
        const now = Date.now();
        if (now - (r.dumpLastAutoAt || 0) < DUMP_AUTO_INTERVAL) return;
        chrome.storage.local.set({ dumpLastAutoAt: now }, () => {
          void chrome.runtime.lastError;
        });
        getDumpHistory().then(({ history, meta }) => {
          if (!history.length) return;
          const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
          const content = buildDumpJSON(history, meta);
          downloadDump(`duck-catcher-dump-${ts}.json`, content);
        });
      });
    } catch {
      // ignore
    }
  }

  async function clearCatchHistory() {
    return new Promise(resolve => {
      try {
        chrome.storage.local.set({ catchHistory: [] }, resolve);
      } catch {
        resolve();
      }
    });
  }

  function ensureOffscreen() {
    try {
      chrome.offscreen
        .hasDocument()
        .then(has => {
          if (!has) {
            chrome.offscreen.createDocument({
              url: "offscreen.html",
              reasons: ["AUDIO_PLAYBACK"],
              justification: "Play notification sound for duck catch"
            }).catch(() => {});
          }
        })
        .catch(() => {});
    } catch {
      // offscreen API not available
    }
  }

  function playSound() {
    try {
      ensureOffscreen();
      setTimeout(() => {
        try {
          chrome.runtime.sendMessage({ type: "PLAY_SOUND" }, () => {
            void chrome.runtime.lastError;
          });
        } catch {
          // ignore
        }
      }, 150);
    } catch {
      // ignore
    }
  }

  function isVisible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return false;
    const style = getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none") return false;
    if (style.opacity === "0") return false;
    return true;
  }

  function realClick(el) {
    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    let target = el;
    try {
      const hit = document.elementFromPoint(x, y);
      if (hit && (hit === el || el.contains(hit))) target = hit;
    } catch {
      // ignore
    }
    const opts = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: x,
      clientY: y,
      button: 0,
      buttons: 1
    };
    if (typeof PointerEvent === "function") {
      for (const type of [
        "pointerover",
        "pointerenter",
        "pointerdown",
        "pointerup"
      ]) {
        try {
          target.dispatchEvent(
            new PointerEvent(type, {
              ...opts,
              pointerId: 1,
              pointerType: "mouse",
              isPrimary: true,
              width: 1,
              height: 1,
              pressure: 0.5
            })
          );
        } catch {
          // ignore
        }
      }
    }
    for (const type of ["mousedown", "mouseup", "click"]) {
      try {
        target.dispatchEvent(new MouseEvent(type, opts));
      } catch {
        // ignore
      }
    }
  }

  function safeSend(msg, aliveGetter, aliveSetter) {
    if (aliveGetter && !aliveGetter()) return;
    try {
      chrome.runtime.sendMessage(msg, () => {
        void chrome.runtime.lastError;
      });
    } catch {
      if (aliveSetter) aliveSetter(false);
    }
  }

  let _debug = false;
  function setDebug(d) {
    _debug = Boolean(d);
  }
  function getDebug() {
    return _debug;
  }
  function log(prefix, ...args) {
    if (!_debug) return;
    try {
      console.log("[" + prefix + "]", ...args);
    } catch {
      // ignore
    }
  }

  function makeWorkerTicker(ms, cb) {
    if (/web\.telegram\.org$/i.test(location.hostname)) return null;
    let worker = null;
    try {
      const src = "setInterval(function(){postMessage(1)}," + Number(ms) + ");";
      const url = URL.createObjectURL(
        new Blob([src], { type: "text/javascript" })
      );
      worker = new Worker(url);
      worker.onmessage = () => {
        try {
          cb();
        } catch {
          // ignore
        }
      };
      return worker;
    } catch {
      return null;
    }
  }

  const TIER_FEATURES = {
    free: {
      maxRegexPatterns: 3,
      historyDays: 7,
      marketAlerts: false,
      autoSell: false,
      queuePriority: false,
      apiAccess: false,
      exportData: false
    },
    pro: {
      maxRegexPatterns: 20,
      historyDays: 90,
      marketAlerts: true,
      autoSell: true,
      queuePriority: true,
      apiAccess: false,
      exportData: false
    },
    premium: {
      maxRegexPatterns: Infinity,
      historyDays: 90,
      marketAlerts: true,
      autoSell: true,
      queuePriority: true,
      apiAccess: true,
      exportData: true
    }
  };

  let cachedTier = null;
  let tierFetchAt = 0;
  const TIER_CACHE_MS = 30 * 60 * 1000;

  function checkSubscription(cb) {
    const now = Date.now();
    if (cachedTier && now - tierFetchAt < TIER_CACHE_MS) {
      return cb(cachedTier);
    }
    try {
      getInstallId(id => {
        if (!id) {
          cachedTier = { tier: "free", features: TIER_FEATURES.free };
          tierFetchAt = now;
          return cb(cachedTier);
        }
        fetch(`https://myduckstats.vercel.app/api/subscription?installId=${encodeURIComponent(id)}`)
          .then(r => r.json())
          .then(data => {
            const tier = data.tier || "free";
            const features = TIER_FEATURES[tier] || TIER_FEATURES.free;
            cachedTier = { tier, features };
            tierFetchAt = Date.now();
            cb(cachedTier);
          })
          .catch(() => {
            cachedTier = { tier: "free", features: TIER_FEATURES.free };
            tierFetchAt = Date.now();
            cb(cachedTier);
          });
      });
    } catch {
      cb({ tier: "free", features: TIER_FEATURES.free });
    }
  }

  Object.assign(DC, {
    RARITY_LIST,
    RARITY_ALIASES,
    BREEDING_RE,
    LEGENDARY_BREED_RE,
    PLAY_RE,
    BREED_RE,
    LEVEL_RE,
    DUCK_INFO_RE,
    CHOOSER_RE_DESKTOP,
    CHOOSER_RE_WEB,
    CHOOSER_RE_WEB_BAD,
    DEFAULTS,
    MAX_HISTORY,
    norm,
    getSelectedRarities,
    rarityIndex,
    matchesRarity,
    bestCandidate,
    loadSettings,
    isPaused,
    isWithinSchedule,
    randomJitter,
    parseCooldown,
    isChatAllowed,
    humanScroll,
    delay,
    extractBreedNickname,
    extractLevel,
    extractDuckInfo,
    parseDuckCard,
    getCatchHistory,
    addCatchHistory,
    clearCatchHistory,
    getDumpHistory,
    clearDumpHistory,
    buildDumpJSON,
    downloadDump,
    autoDumpSchedule,
    ensureOffscreen,
    playSound,
    isVisible,
    realClick,
    safeSend,
    makeWorkerTicker,
    getInstallId,
    setDebug,
    getDebug,
    log,
    TIER_FEATURES,
    checkSubscription
  });
})();
