(() => {
  "use strict";

  function handleOpenDuck(message, sender, sendResponse) {
    if (message?.type !== "OPEN_DUCK") return false;
    const url = message.url;
    const valid =
      /^https:\/\/web\.telegram\.org\/[akz]\/#\/?myduck\?start=/i.test(url) ||
      /^https:\/\/t\.me\/myduck\?start=/i.test(url);
    if (!valid) {
      sendResponse({ ok: false, error: "Invalid Duck URL" });
      return true;
    }
    chrome.tabs.create({ url, active: true }, tab => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      sendResponse({ ok: true, tabId: tab?.id });
    });
    return true;
  }

  function handleDuckFound(message) {
    if (message?.type !== "DUCK_FOUND") return false;
    const rarity = message.rarity || "";
    const text = message.text ? ` (${message.text.slice(0, 60)})` : "";
    chrome.notifications
      .create({
        type: "basic",
        iconUrl: "icon.svg",
        title: "Duck x My x Duck",
        message: `Найдена ${rarity} утка${text}`
      })
      .catch(() => {});
    return true;
  }

  function handleBreedClick(message) {
    if (message?.type !== "DUCK_BREED_CLICK") return false;
    chrome.notifications
      .create({
        type: "basic",
        iconUrl: "icon.svg",
        title: "Разведение запущено",
        message: `Нажато «${message.text || "разведение"}» в мини-аппе`
      })
      .catch(() => {});
    return true;
  }

  const HEARTBEAT_ALARM = "dcCatchHeartbeat";
  const HEARTBEAT_ALARM_2 = "dcCatchHeartbeat2";
  const heartbeatTabs = new Map();

  function persistHeartbeatTabs() {
    try {
      chrome.storage.session.set(
        {
          heartbeatTabs: Array.from(heartbeatTabs.entries()).map(([id, info]) => [
            id,
            Boolean(info.hidden)
          ])
        },
        () => void chrome.runtime.lastError
      );
    } catch {
      // storage.session unavailable
    }
  }

  function restoreHeartbeatTabs() {
    try {
      chrome.storage.session.get({ heartbeatTabs: [] }, r => {
        const list = r.heartbeatTabs || [];
        heartbeatTabs.clear();
        for (const [id, hidden] of list) {
          if (typeof id === "number") heartbeatTabs.set(id, { hidden: Boolean(hidden) });
        }
        syncHeartbeatAlarm();
      });
    } catch {
      // storage.session unavailable
    }
  }

  function syncHeartbeatAlarm() {
    const hasCollector = Boolean(autoCollectorTab && autoCollectorTab.id != null);
    const hasHidden = Array.from(heartbeatTabs.values()).some(i => i.hidden);
    try {
      if (hasCollector || hasHidden) {
        chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: 0.5 });
        chrome.alarms.create(HEARTBEAT_ALARM_2, {
          when: Date.now() + 15000,
          periodInMinutes: 0.5
        });
      } else {
        chrome.alarms.clear(HEARTBEAT_ALARM);
        chrome.alarms.clear(HEARTBEAT_ALARM_2);
      }
    } catch {
      // alarms unavailable
    }
  }

  function handleStatusUpdate(message, sender) {
    if (message?.type !== "STATUS_UPDATE") return false;
    const tabId = sender.tab?.id;
    if (tabId == null) return false;
    const { stats } = message;

    heartbeatTabs.set(tabId, { hidden: Boolean(stats && stats.hidden) });
    persistHeartbeatTabs();
    syncHeartbeatAlarm();

    if (stats.dryRun) {
      chrome.action.setBadgeText({ tabId, text: "DR" });
      chrome.action.setBadgeBackgroundColor({ tabId, color: "#f59e0b" });
      return true;
    }
    if (stats.paused) {
      chrome.action.setBadgeText({ tabId, text: "||" });
      chrome.action.setBadgeBackgroundColor({ tabId, color: "#f59e0b" });
      return true;
    }
    if (stats.scheduledOff) {
      chrome.action.setBadgeText({ tabId, text: "SC" });
      chrome.action.setBadgeBackgroundColor({ tabId, color: "#8b5cf6" });
      return true;
    }
    if (!stats.active) {
      chrome.action.setBadgeText({ tabId, text: "off" });
      chrome.action.setBadgeBackgroundColor({ tabId, color: "#6b7280" });
      return true;
    }
    if (stats.matched) {
      chrome.action.setBadgeText({ tabId, text: "!!" });
      chrome.action.setBadgeBackgroundColor({ tabId, color: "#22c55e" });
    } else {
      chrome.action.setBadgeText({
        tabId,
        text: stats.linksTotal > 0 ? String(stats.linksTotal) : "0"
      });
      chrome.action.setBadgeBackgroundColor({ tabId, color: "#374151" });
    }
    return true;
  }

  function handlePlaySound(message) {
    if (message?.type !== "PLAY_SOUND") return false;
    try {
      chrome.offscreen.hasDocument().then(has => {
        if (has) {
          chrome.runtime.sendMessage({ type: "PLAY_SOUND" }, () => {
            void chrome.runtime.lastError;
          });
        }
      });
    } catch {
      // ignore
    }
    return true;
  }

  const COLLECTOR_KEY = "autoCollectorTab";
  let autoCollectorTab = null;

  function persistCollectorTab() {
    try {
      chrome.storage.session.set(
        { [COLLECTOR_KEY]: autoCollectorTab },
        () => void chrome.runtime.lastError
      );
    } catch {
      // storage.session unavailable
    }
    syncHeartbeatAlarm();
  }

  function restoreCollectorTab() {
    try {
      chrome.storage.session.get({ [COLLECTOR_KEY]: null }, r => {
        autoCollectorTab = r[COLLECTOR_KEY] || null;
        ensureDryRunCollector();
      });
    } catch {
      ensureDryRunCollector();
    }
  }

  function getDryRunSetting() {
    return new Promise(resolve => {
      try {
        chrome.storage.sync.get({ dryRun: false }, r => resolve(Boolean(r.dryRun)));
      } catch {
        resolve(false);
      }
    });
  }

  function markCollectorTab(tabId) {
    try {
      chrome.tabs.sendMessage(tabId, { type: "SET_COLLECTOR" }, () => {
        void chrome.runtime.lastError;
      });
    } catch {
      // ignore
    }
  }

  async function ensureDryRunCollector() {
    const dry = await getDryRunSetting();
    if (!dry) {
      await closeOwnedCollector();
      return;
    }

    if (autoCollectorTab && autoCollectorTab.id != null) {
      try {
        const t = await chrome.tabs.get(autoCollectorTab.id);
        if (t && /^https:\/\/web\.telegram\.org\//i.test(t.url || "")) {
          markCollectorTab(autoCollectorTab.id);
          return;
        }
      } catch {
        // tab gone
      }
      autoCollectorTab = null;
    }

    try {
      const existing = await chrome.tabs.query({ url: "https://web.telegram.org/*" });
      if (existing && existing.length) {
        autoCollectorTab = { id: existing[0].id, owned: false };
        persistCollectorTab();
        try {
          await chrome.tabs.update(existing[0].id, { autoDiscardable: false });
        } catch {
          // ignore
        }
        markCollectorTab(existing[0].id);
        return;
      }
    } catch {
      // ignore
    }

    try {
      const tab = await chrome.tabs.create({
        url: "https://web.telegram.org/a/",
        active: false,
        pinned: true
      });
      autoCollectorTab = { id: tab.id, owned: true };
      persistCollectorTab();
      try {
        await chrome.tabs.update(tab.id, { autoDiscardable: false });
      } catch {
        // ignore
      }
      markCollectorTab(tab.id);
    } catch {
      // ignore
    }
  }

  async function closeOwnedCollector() {
    const c = autoCollectorTab;
    autoCollectorTab = null;
    persistCollectorTab();
    if (!c || !c.owned || c.id == null) return;
    try {
      const t = await chrome.tabs.get(c.id);
      if (t) await chrome.tabs.remove(c.id);
    } catch {
      // already closed
    }
  }

  function handleGetCollectorStatus(message, sendResponse) {
    if (message?.type !== "GET_COLLECTOR_STATUS") return false;
    getDryRunSetting().then(dry => {
      const id = autoCollectorTab ? autoCollectorTab.id : null;
      if (id == null) {
        sendResponse({ dryRun: dry, collectorTabId: null, collectorTabReady: false });
        return;
      }
      chrome.tabs.get(id, t => {
        const ready = Boolean(
          t && /^https:\/\/web\.telegram\.org\//i.test(t.url || "")
        );
        sendResponse({ dryRun: dry, collectorTabId: id, collectorTabReady: ready });
      });
    });
    return true;
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    if (!changes.dryRun) return;
    if (changes.dryRun.newValue) {
      ensureDryRunCollector();
    } else {
      closeOwnedCollector();
    }
  });

  chrome.tabs.onRemoved.addListener(tabId => {
    heartbeatTabs.delete(tabId);
    persistHeartbeatTabs();
    syncHeartbeatAlarm();
    if (autoCollectorTab && autoCollectorTab.id === tabId) {
      autoCollectorTab = null;
      persistCollectorTab();
      ensureDryRunCollector();
    }
  });

  chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm?.name !== HEARTBEAT_ALARM && alarm?.name !== HEARTBEAT_ALARM_2) return;
    const collectorId = autoCollectorTab ? autoCollectorTab.id : null;
    const pinged = new Set();
    if (collectorId != null) pinged.add(collectorId);
    for (const [tabId, info] of Array.from(heartbeatTabs.entries())) {
      if (info.hidden) pinged.add(tabId);
    }
    for (const tabId of pinged) {
      const isCollector = tabId === collectorId;
      try {
        chrome.tabs.sendMessage(
          tabId,
          { type: "TICK", collector: isCollector },
          () => {
            if (chrome.runtime.lastError) {
              heartbeatTabs.delete(tabId);
              persistHeartbeatTabs();
              if (isCollector) {
                autoCollectorTab = null;
                persistCollectorTab();
                ensureDryRunCollector();
              } else {
                syncHeartbeatAlarm();
              }
            }
          }
        );
      } catch {}
    }
  });

  restoreHeartbeatTabs();
  restoreCollectorTab();

// -----------------------------------------------------------------
// Network Interceptor Service Setup
// -----------------------------------------------------------------

/**
 * Listener for network reports from content scripts.
 * @param {object} message 
 * @param {object} sender 
 * @param {function} sendResponse 
 */
  function shortNum(n) {
    if (!Number.isFinite(n)) return "";
    if (n >= 1000000) return Math.round(n / 100000) / 10 + "M";
    if (n >= 1000) return Math.round(n / 100) / 10 + "k";
    return String(Math.round(n));
  }

  const MARKET_BADGE = {
    normal: ["О", "#374151"],
    hot: ["Г", "#f59e0b"],
    crazy: ["Б", "#ef4444"]
  };

  function updateMarketBadge(data) {
    if (!data || !data.type || !MARKET_BADGE[data.type]) return;
    const [letter, color] = MARKET_BADGE[data.type];
    const byCur = data.byCur || {};
    const price =
      Number.isFinite(byCur.corn?.avg)
        ? shortNum(byCur.corn.avg)
        : Number.isFinite(byCur.stars?.avg)
        ? shortNum(byCur.stars.avg) + "★"
        : "";
    chrome.action.setBadgeText({ text: letter + price });
    chrome.action.setBadgeBackgroundColor({ color });
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "NETWORK_SNIPPET") {
    return false;
  }
  if (message?.type === "MARKET_UPDATE") {
    updateMarketBadge(message.data);
    recordMarketSnapshot(message.data);
    maybeUploadStats();
    return false;
  }
  if (message?.type === "SEND_STATS_NOW") {
    uploadStatsOnce(true).then(sendResponse);
    return true;
  }
  if (message?.type === "MARKET_ALERT") {
    chrome.notifications
      .create({
        type: "basic",
        iconUrl: "icon.svg",
        title: "Duck x My x Duck — Рынок",
        message: String(message.text || "Событие рынка").slice(0, 200)
      })
      .catch(() => {});
    return false;
  }
  
  if (message?.type === "DUCK_SOLD") {
    chrome.notifications
      .create({
        type: "basic",
        iconUrl: "icon.svg",
        title: message.dryRun ? "[DRY] Утка продана" : "Утка продана",
        message: `корн: ${message.corn ?? "—"} · звезды: ${message.stars ?? "—"}`
      })
      .catch(() => {});
    if (!message.dryRun) {
      statsBuf.duckSold.count++;
      if (Number.isFinite(message.corn)) statsBuf.duckSold.cornSum += message.corn;
      if (Number.isFinite(message.stars)) {
        statsBuf.duckSold.starsSum += message.stars;
      }
      scheduleStatsPersist();
      maybeUploadStats();
    }
    return false;
  }
  if (message?.type === "DUCK_SEEN") {
    const rk = String(message.rarity || "");
    if (statsBuf.queueByRarity && rk in statsBuf.queueByRarity) {
      if (statsBuf.queueByRarity[rk] < 1e6) statsBuf.queueByRarity[rk]++;
      scheduleStatsPersist();
      maybeUploadStats();
    }
    return false;
  }
  if (message?.type === "QUEUE_FIND") {
    const posTxt =
      Number.isFinite(message.pos)
        ? Number.isFinite(message.total)
          ? ` — #${message.pos} из ${message.total}`
          : ` — #${message.pos}`
        : "";
    chrome.notifications
      .create({
        type: "basic",
        iconUrl: "icon.svg",
        title: "Утка в очереди",
        message: `${message.user}${posTxt}`
      })
      .catch(() => {});
    try {
      chrome.storage.local.get({ queueFinds: [] }, r => {
        const list = Array.isArray(r.queueFinds) ? r.queueFinds : [];
        list.unshift({
          user: String(message.user),
          pos: message.pos ?? null,
          total: message.total ?? null,
          ts: Date.now()
        });
        if (list.length > 50) list.length = 50;
        chrome.storage.local.set({ queueFinds: list }, () => {
          void chrome.runtime.lastError;
        });
      });
    } catch {
      // ignore
    }
    statsBuf.queueFinds++;
    scheduleStatsPersist();
    maybeUploadStats();
    return false;
  }
  if (message?.type === "SMART_CATCH_UPDATE") {
    if (message.data && typeof message.data === "object") {
      statsBuf.smartCatch.enabled = Boolean(message.data.enabled);
      if (message.data.myDuck) statsBuf.smartCatch.myDuck = message.data.myDuck;
      if (message.data.targets) statsBuf.smartCatch.targets = message.data.targets;
      if (message.data.session) statsBuf.smartCatch.session = message.data.session;
      scheduleStatsPersist();
    }
    return false;
  }

  // Existing message handlers start here
  if (handleOpenDuck(message, sender, sendResponse)) return true;
  if (handleDuckFound(message)) return false;
  if (handleBreedClick(message)) return false;
  if (handleStatusUpdate(message, sender)) return false;
  if (handlePlaySound(message)) return false;
  if (handleGetCollectorStatus(message, sendResponse)) return true;
  return false;
});

// -----------------------------------------------------------------
// Anonymous stats sharing (opt-in)
// -----------------------------------------------------------------

const STATS_ALARM = "dc-stats-upload";

const RARITY_KEYS = [
  "Common",
  "Uncommon",
  "Rare",
  "Epic",
  "Legendary",
  "Mythic",
  "Unique",
  "Secret"
];

function emptyRarityMap() {
  const m = {};
  for (const k of RARITY_KEYS) m[k] = 0;
  return m;
}

const statsBuf = {
  market: [],
  duckSold: { count: 0, cornSum: 0, starsSum: 0 },
  queueFinds: 0,
  queueByRarity: emptyRarityMap(),
  smartCatch: {
    enabled: false,
    myDuck: { rarity: "Rare", level: 5 },
    targets: { rarities: ["Rare", "Epic", "Legendary"], minLevel: 5, maxLevel: 10 },
    session: { scans: 0, found: 0, matched: 0, opened: 0, skipped: { duplicate: 0, wrongRarity: 0, wrongLevel: 0, repeatPartner: 0 }, partners: [] }
  },
  dirty: false
};

function loadStatsBuf() {
  try {
    chrome.storage.local.get({ dcStatsBuf: null }, r => {
      const b = r && r.dcStatsBuf;
      if (b && typeof b === "object") {
        statsBuf.market = Array.isArray(b.market) ? b.market : [];
        statsBuf.duckSold =
          b.duckSold && typeof b.duckSold === "object"
            ? b.duckSold
            : { count: 0, cornSum: 0, starsSum: 0 };
        statsBuf.queueFinds = Number(b.queueFinds) || 0;
        const savedRar =
          b.queueByRarity && typeof b.queueByRarity === "object"
            ? b.queueByRarity
            : {};
        statsBuf.queueByRarity = emptyRarityMap();
        for (const k of RARITY_KEYS) {
          statsBuf.queueByRarity[k] = Number(savedRar[k]) || 0;
        }
        // Load smartCatch
        if (b.smartCatch && typeof b.smartCatch === "object") {
          statsBuf.smartCatch.enabled = Boolean(b.smartCatch.enabled);
          statsBuf.smartCatch.myDuck = b.smartCatch.myDuck || { rarity: "Rare", level: 5 };
          statsBuf.smartCatch.targets = b.smartCatch.targets || { rarities: ["Rare", "Epic", "Legendary"], minLevel: 5, maxLevel: 10 };
          statsBuf.smartCatch.session = b.smartCatch.session || { scans: 0, found: 0, matched: 0, opened: 0, skipped: { duplicate: 0, wrongRarity: 0, wrongLevel: 0, repeatPartner: 0 }, partners: [] };
        }
      }
      statsBuf.dirty = false;
    });
  } catch {
    // ignore
  }
}

let statsPersistTimer = null;

function scheduleStatsPersist() {
  statsBuf.dirty = true;
  clearTimeout(statsPersistTimer);
  statsPersistTimer = setTimeout(persistStatsBuf, 5000);
}

function persistStatsBuf() {
  try {
    chrome.storage.local.set({ dcStatsBuf: { ...statsBuf } }, () => {
      void chrome.runtime.lastError;
    });
    statsBuf.dirty = false;
  } catch {
    // ignore
  }
}

function pickCurStats(b) {
  if (!b || typeof b !== "object") return null;
  return {
    avg: Number.isFinite(b.avg) ? b.avg : null,
    min: Number.isFinite(b.min) ? b.min : null,
    max: Number.isFinite(b.max) ? b.max : null,
    n: Number.isFinite(b.count) ? b.count : 0
  };
}

function recordMarketSnapshot(data) {
  try {
    const now = Date.now();
    const last = statsBuf.market[statsBuf.market.length - 1];
    if (last && last.type === data?.type && now - last.t < 60000) return;
    const byCur = data?.byCur || {};
    statsBuf.market.push({
      t: now,
      type: data?.type || null,
      corn: pickCurStats(byCur.corn),
      stars: pickCurStats(byCur.stars)
    });
    if (statsBuf.market.length > 400) {
      statsBuf.market = statsBuf.market.slice(-300);
    }
    scheduleStatsPersist();
  } catch {
    // ignore
  }
}

function getBgInstallId(cb) {
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

function ensureStatsAlarm() {
  try {
    // create() with an existing name REPLACES the alarm and resets its
    // timer. The SW wakes up constantly (game tab messages), so blindly
    // calling create() here would postpone STATS_ALARM forever.
    chrome.alarms.get(STATS_ALARM, existing => {
      if (existing) return;
      try {
        chrome.alarms.create(STATS_ALARM, {
          periodInMinutes: 15,
          delayInMinutes: 0.5
        });
      } catch {
        // ignore
      }
    });
  } catch {
    // ignore
  }
}

function buildStatsPayload(installId) {
  const sc = { ...statsBuf.smartCatch };
  if (sc.session && sc.session.partners) {
    sc.session = {
      ...sc.session,
      partners: sc.session.partners.map(p => ({
        rarity: p.rarity,
        level: p.level,
        ts: p.ts
      }))
    };
  }
  return {
    installId,
    extVersion: chrome.runtime.getManifest().version,
    sentAt: Date.now(),
    market: statsBuf.market.map(m => ({
      t: m.t,
      type: m.type,
      corn: m.corn,
      stars: m.stars
    })),
    duckSales: {
      count: statsBuf.duckSold.count || 0,
      cornSum: Math.round(statsBuf.duckSold.cornSum || 0),
      starsSum: Math.round(statsBuf.duckSold.starsSum || 0)
    },
    queueFinds: statsBuf.queueFinds || 0,
    queueByRarity: statsBuf.queueByRarity || emptyRarityMap(),
    smartCatch: sc
  };
}

let lastUploadAt = 0;
const UPLOAD_MIN_INTERVAL = 4 * 60 * 1000;

function uploadStatsOnce(force) {
  return new Promise(resolve => {
    let cfg;
    chrome.storage.sync
      .get({ shareEnabled: false, shareEndpoint: "" })
      .then(c => {
        cfg = c;
        if (!cfg.shareEnabled) return resolve({ sent: false, reason: "off" });
        const endpointRaw = String(cfg.shareEndpoint || "").trim();
        if (!/^https:\/\/.+/i.test(endpointRaw)) {
          return resolve({ sent: false, reason: "endpoint" });
        }
        // Common mistake: /api/public/stats is the read-only GET endpoint.
        // Ingest lives at /api/stats — fix it silently instead of 405-ing.
        const endpoint = endpointRaw.replace(
          /\/api\/public\/stats\/?$/i,
          "/api/stats"
        );
        const now = Date.now();
        if (!force && now - lastUploadAt < UPLOAD_MIN_INTERVAL) {
          return resolve({ sent: false, reason: "throttled" });
        }
        const hasData =
          statsBuf.market.length > 0 ||
          statsBuf.queueFinds > 0 ||
          (statsBuf.duckSold && statsBuf.duckSold.count > 0);
        if (!hasData && !force) {
          return resolve({ sent: false, reason: "empty" });
        }

        getBgInstallId(id => {
          let payload;
          try {
            payload = buildStatsPayload(id);
          } catch (e) {
            return resolve({ sent: false, reason: "payload: " + e.message });
          }
          const ac = ("AbortController" in self) ? new AbortController() : null;
          const timer = ac
            ? setTimeout(() => ac.abort(), 10000)
            : null;
          try {
            fetch(endpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
              signal: ac ? ac.signal : undefined
            })
              .then(resp => {
                if (timer) clearTimeout(timer);
                if (resp && resp.ok) {
                  statsBuf.market = [];
                  statsBuf.duckSold = { count: 0, cornSum: 0, starsSum: 0 };
                  statsBuf.queueFinds = 0;
                  statsBuf.queueByRarity = emptyRarityMap();
                  // Clear smartCatch session but keep config
                  statsBuf.smartCatch.session = { scans: 0, found: 0, matched: 0, opened: 0, skipped: { duplicate: 0, wrongRarity: 0, wrongLevel: 0, repeatPartner: 0 }, partners: [] };
                  lastUploadAt = Date.now();
                  persistStatsBuf();
                  resolve({ sent: true });
                } else {
                  resolve({
                    sent: false,
                    reason: "server " + (resp ? resp.status : "?")
                  });
                }
              })
              .catch(e => {
                if (timer) clearTimeout(timer);
                resolve({
                  sent: false,
                  reason:
                    e && e.name === "AbortError" ? "timeout" : "network"
                });
              });
          } catch (e) {
            if (timer) clearTimeout(timer);
            resolve({ sent: false, reason: "fetch: " + e.message });
          }
        });
      })
      .catch(() => resolve({ sent: false, reason: "storage" }));
  });
}

async function maybeUploadStats() {
  await uploadStatsOnce(false);
}

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm?.name === STATS_ALARM) {
    maybeUploadStats();
  }
});

try {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.shareEnabled && changes.shareEnabled.newValue) {
      ensureStatsAlarm();
      maybeUploadStats();
    }
  });
} catch {
  // ignore
}

loadStatsBuf();
ensureStatsAlarm();

chrome.runtime.onInstalled.addListener(details => {
  if (details?.reason !== "install" && details?.reason !== "update") return;
  try {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icon.svg",
      title: `Duck × My × Duck Catcher ${chrome.runtime.getManifest().version}`,
      message:
        "Новое: онбординг, живой статус, тёмная/светлая тема и EN-локализация. Анонимная статистика — в настройках, вкладка «Общее»."
    }).catch(() => {});
  } catch {
    // ignore
  }
});

// -----------------------------------------------------------------
// Version check: compare local manifest with API latestVersion
// -----------------------------------------------------------------

const VERSION_CHECK_ALARM = "dcVersionCheck";
const CURRENT_VERSION = chrome.runtime.getManifest().version;

async function checkForUpdates() {
  try {
    const resp = await fetch("https://myduckstats.vercel.app/api/public/stats?days=7", {
      cache: "no-store"
    });
    if (!resp.ok) return;
    const data = await resp.json();
    const latest = data.latestVersion;
    if (!latest || latest === CURRENT_VERSION) {
      chrome.action.setBadgeText({ text: "" });
      chrome.storage.local.set({ updateAvailable: false });
      return;
    }
    const isNewer = compareVersions(latest, CURRENT_VERSION) > 0;
    if (isNewer) {
      chrome.action.setBadgeText({ text: "!" });
      chrome.action.setBadgeBackgroundColor({ color: "#f59e0b" });
      chrome.storage.local.set({
        updateAvailable: true,
        latestVersion: latest
      });
    } else {
      chrome.action.setBadgeText({ text: "" });
      chrome.storage.local.set({ updateAvailable: false });
    }
  } catch {
    // network error — ignore
  }
}

function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

chrome.alarms.create(VERSION_CHECK_ALARM, { periodInMinutes: 360 });
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === VERSION_CHECK_ALARM) checkForUpdates();
});

checkForUpdates();

// -----------------------------------------------------------------
// Offscreen heartbeat: unthrottled timers -> TICK relay to game tabs
// -----------------------------------------------------------------

let heartTabCache = [];
let heartCacheAt = 0;
let heartDocReady = false;

async function ensureHeartbeatDoc() {
  if (heartDocReady) return;
  try {
    const contexts =
      typeof chrome.runtime.getContexts === "function"
        ? await chrome.runtime.getContexts({
            contextTypes: ["OFFSCREEN_DOCUMENT"]
          })
        : null;
    if (contexts && contexts.length > 0) {
      heartDocReady = true;
      return;
    }
  } catch {
    // getContexts unavailable, fall through
  }
  try {
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["AUDIO_PLAYBACK", "WORKERS"],
      justification:
        "Звук уведомлений + незатроттливаемые таймеры-пульсы для фоновых вкладок"
    });
    heartDocReady = true;
  } catch {
    heartDocReady = true;
  }
}

function refreshHeartTabs() {
  const now = Date.now();
  if (now - heartCacheAt < 10000) return;
  heartCacheAt = now;
  try {
    chrome.tabs.query({}, tabs => {
      heartTabCache = (tabs || [])
        .filter(t => {
          const u = t.url || t.pendingUrl || "";
          return (
            /^https:\/\/([^/]*\.)?duckmyduck\.com\//i.test(u) ||
            /^https:\/\/web\.telegram\.org\//i.test(u)
          );
        })
        .map(t => t.id);
    });
  } catch {
    // ignore
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "DC_HEART") return false;
  refreshHeartTabs();
  for (const tabId of heartTabCache) {
    try {
      chrome.tabs.sendMessage(tabId, { type: "TICK", collector: false }, () => {
        void chrome.runtime.lastError;
      });
    } catch {}
  }
  return false;
});

ensureHeartbeatDoc();

})();
