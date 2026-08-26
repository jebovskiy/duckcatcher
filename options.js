(() => {
  "use strict";

  const S = window.DC || {};
  const I18N = window.DC_I18N;
  const t = I18N.t;

  const RARITIES = [
    "Common", "Uncommon", "Rare", "Epic",
    "Legendary", "Mythic", "Unique", "Secret"
  ];

  const TOGGLES = [
    "enabled",
    "autoOpen",
    "autoScroll",
    "autoPlay",
    "autoBreed",
    "closeAfterBreed",
    "soundEnabled",
    "autoSellEnabled",
    "smartCatchEnabled",
    "onlyNewLinks",
    "avoidRepeatPartner"
  ];

  const $ = id => document.getElementById(id);

  /* ---------- dev mode ---------- */

  function enableDevTab() {
    document.querySelector('.tab[data-tab="dev"]').hidden = false;
    $("devHint").hidden = false;
  }

  async function detectDevMode() {
    let urlDev = false;
    try {
      urlDev = new URLSearchParams(location.search).get("debug") === "1";
    } catch {}
    let stored = false;
    try {
      const r = await chrome.storage.local.get({ devMode: false });
      stored = Boolean(r.devMode);
    } catch {}
    if (urlDev || stored) enableDevTab();
  }

  function setupSecretToggle() {
    let clicks = 0;
    let timer = null;
    $("pageHeader").addEventListener("click", () => {
      clicks++;
      clearTimeout(timer);
      timer = setTimeout(() => (clicks = 0), 2000);
      if (clicks >= 5) {
        clicks = 0;
        chrome.storage.local.get({ devMode: false }, r => {
          const next = !r.devMode;
          chrome.storage.local.set({ devMode: next }, () => {
            if (next) enableDevTab();
            else location.reload();
          });
        });
      }
    });
  }

  /* ---------- tabs ---------- */

  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
      tab.classList.add("active");
      $(`tab-${tab.dataset.tab}`).classList.add("active");
    });
  });

  /* ---------- rarities ---------- */

  function buildRarityGrid() {
    const grid = $("rarityGrid");
    for (const r of RARITIES) {
      const item = document.createElement("label");
      item.className = "rarity-item";
      item.innerHTML = `<input type="checkbox" id="opt_rarity_${r.toLowerCase()}"><span>${r}</span>`;
      grid.appendChild(item);
      item.querySelector("input").addEventListener("change", save);
    }
  }

  function buildTargetRarityGrid() {
    const grid = $("targetRarityGrid");
    const defaultTargets = ["Rare", "Epic", "Legendary"];
    for (const r of RARITIES) {
      const item = document.createElement("label");
      item.className = "rarity-item";
      const checked = defaultTargets.includes(r) ? "checked" : "";
      item.innerHTML = `<input type="checkbox" id="opt_target_${r.toLowerCase()}" ${checked}><span>${r}</span>`;
      grid.appendChild(item);
      item.querySelector("input").addEventListener("change", save);
    }
  }

  /* ---------- feature gating ---------- */

  let currentTier = { tier: "free", features: {} };

  function applyTierGating() {
    const f = currentTier.features || {};
    const isFree = currentTier.tier === "free";

    const proRequired = [
      "opt_autoSellEnabled",
      "opt_autoSellMinCorn",
      "opt_autoSellMinStars"
    ];
    for (const id of proRequired) {
      const el = $(id);
      if (!el) continue;
      el.disabled = isFree && !f.autoSell;
      const wrapper = el.closest(".field, .field-row, label");
      if (wrapper) {
        if (isFree && !f.autoSell) {
          wrapper.classList.add("tier-locked");
          wrapper.title = "Требуется Pro тариф";
        } else {
          wrapper.classList.remove("tier-locked");
          wrapper.title = "";
        }
      }
    }

    const addBtn = $("addCustomRarity");
    if (addBtn) {
      const items = document.querySelectorAll(".custom-rarity-item");
      const limit = f.maxRegexPatterns || 3;
      addBtn.disabled = items.length >= limit;
      if (items.length >= limit) {
        addBtn.title = `Лимит ${limit} паттернов на вашем тарифе`;
      } else {
        addBtn.title = "";
      }
    }

    const tierBadge = $("tierBadge");
    if (tierBadge) {
      const tierNames = { free: "Free", pro: "Pro", premium: "Premium" };
      tierBadge.textContent = tierNames[currentTier.tier] || "Free";
      tierBadge.className = `tier-badge tier-${currentTier.tier}`;
    }
  }

  function loadTier() {
    S.checkSubscription(sub => {
      currentTier = sub;
      applyTierGating();
      updateUpgradeUI();
    });
  }

  function updateUpgradeUI() {
    const upgradeEl = $("tierUpgrade");
    if (!upgradeEl) return;
    if (currentTier.tier === "free") {
      upgradeEl.hidden = false;
    } else {
      upgradeEl.hidden = true;
    }
  }

  let starsPollTimer = null;
  let starsCountdownTimer = null;

  function stopStarsPolling() {
    if (starsPollTimer) { clearInterval(starsPollTimer); starsPollTimer = null; }
    if (starsCountdownTimer) { clearInterval(starsCountdownTimer); starsCountdownTimer = null; }
  }

  function handleStarsPay() {
    const btn = $("starsPayBtn");
    const statusEl = $("starsStatus");
    if (!btn || !statusEl) return;

    stopStarsPolling();
    btn.disabled = true;
    btn.textContent = "⏳ Создаю…";
    statusEl.textContent = "";
    statusEl.className = "stars-status";

    S.getInstallId(installId => {
      if (!installId) {
        statusEl.textContent = "Ошибка: нет installId";
        statusEl.className = "stars-status err";
        btn.disabled = false;
        btn.textContent = "⭐ Оплатить звёздами";
        return;
      }

      fetch(`https://myduckstats.vercel.app/api/stars-invoice?tier=pro&installId=${encodeURIComponent(installId)}`)
        .then(r => r.json())
        .then(data => {
          if (!data.ok || !data.invoiceLink) {
            statusEl.textContent = data.err || "Ошибка создания инвойса";
            statusEl.className = "stars-status err";
            btn.disabled = false;
            btn.textContent = "⭐ Оплатить звёздами";
            return;
          }

          let win = null;
          try { win = window.open(data.invoiceLink, "_blank"); } catch {}
          if (!win) {
            statusEl.textContent = "Popup заблокирован. Открой вручную.";
            statusEl.className = "stars-status err";
            btn.disabled = false;
            btn.textContent = "⭐ Оплатить звёздами";
            return;
          }

          btn.textContent = "❌ Отмена";
          btn.disabled = false;
          const origHandler = btn.onclick;
          btn.onclick = function() {
            stopStarsPolling();
            btn.textContent = "⭐ Оплатить звёздами";
            btn.disabled = false;
            btn.onclick = origHandler;
            statusEl.textContent = "";
            statusEl.className = "stars-status";
          };

          let seconds = 120;
          statusEl.textContent = "Жду оплату… " + seconds + " сек";
          statusEl.className = "stars-status";

          starsCountdownTimer = setInterval(() => {
            seconds--;
            if (seconds <= 0) {
              stopStarsPolling();
              statusEl.textContent = "Время истекло. Попробуй снова.";
              statusEl.className = "stars-status err";
              btn.textContent = "⭐ Оплатить звёздами";
              btn.disabled = false;
              btn.onclick = origHandler;
              return;
            }
            statusEl.textContent = "Жду оплату… " + seconds + " сек";
          }, 1000);

          starsPollTimer = setInterval(() => {
            S.checkSubscription(sub => {
              if (sub.tier !== "free") {
                stopStarsPolling();
                currentTier = sub;
                applyTierGating();
                updateUpgradeUI();
                statusEl.textContent = "✅ Подписка " + sub.tier.toUpperCase() + " активирована!";
                statusEl.className = "stars-status ok";
                btn.textContent = "✅ Готово";
                btn.disabled = true;
                btn.onclick = null;
              }
            });
          }, 3000);
        })
        .catch(e => {
          statusEl.textContent = "Сетевая ошибка: " + (e.message || e);
          statusEl.className = "stars-status err";
          btn.disabled = false;
          btn.textContent = "⭐ Оплатить звёздами";
        });
    });
  }

  /* ---------- load / save ---------- */

  function load() {
    buildRarityGrid();
    buildTargetRarityGrid();

    chrome.storage.sync.get({ ...S.DEFAULTS, debug: false }, s => {
        for (const key of TOGGLES) {
          const el = $(`opt_${key}`);
          if (el) el.checked = Boolean(s[key]);
        }
        $("opt_dryRun").checked = Boolean(s.dryRun);
        $("opt_debug").checked = Boolean(s.debug);

        const rarities = Array.isArray(s.selectedRarities)
          ? s.selectedRarities
          : ["Common"];
        for (const r of RARITIES) {
          const cb = $(`opt_rarity_${r.toLowerCase()}`);
          if (cb) cb.checked = rarities.includes(r);
        }

        // Target rarities for Smart Catch
        const targetRarities = Array.isArray(s.targetRarities) && s.targetRarities.length
          ? s.targetRarities
          : ["Rare", "Epic", "Legendary"];
        for (const r of RARITIES) {
          const cb = $(`opt_target_${r.toLowerCase()}`);
          if (cb) cb.checked = targetRarities.includes(r);
        }

        $("opt_autoSellMinCorn").value = s.autoSellMinCorn || 0;
        $("opt_autoSellMinStars").value = s.autoSellMinStars || 0;

        $("opt_scheduleEnabled").checked = Boolean(s.scheduleEnabled);
        $("opt_scheduleFrom").value = s.scheduleFrom || "09:00";
        $("opt_scheduleTo").value = s.scheduleTo || "23:00";

        $("opt_chatFilterMode").value = s.chatFilterMode || "all";
        $("opt_chatFilterList").value = (s.chatFilterList || []).join("\n");

        $("opt_theme").value = s.theme || "auto";
        $("opt_lang").value = s.lang || "auto";

        $("opt_shareEnabled").checked = Boolean(s.shareEnabled);
        $("opt_shareEndpoint").value = s.shareEndpoint || "";

        // Smart Catch specific
        $("opt_myDuckRarity").value = s.myDuckRarity || "Rare";
        $("opt_myDuckLevel").value = s.myDuckLevel || 5;
        $("opt_minPartnerLevel").value = s.minPartnerLevel || 1;
        $("opt_maxPartnerLevel").value = s.maxPartnerLevel || 5;

        loadCustomRarities(s.customRarities || []);

        chrome.storage.local.get({ dumpAutoEnabled: false }, lr => {
          $("opt_dumpAutoEnabled").checked = Boolean(lr.dumpAutoEnabled);
        });

        loadPauseStatus();
        loadHistory();
        loadStats();
        loadSmartStatsPeriodic();
        loadDebugInfo();
      }
    );
  }

  function collectSyncData() {
    const data = {};
    for (const key of TOGGLES) {
      const el = $(`opt_${key}`);
      if (el) data[key] = el.checked;
    }
    data.dryRun = $("opt_dryRun").checked;
    data.debug = $("opt_debug").checked;

    const selected = RARITIES.filter(r => {
      const cb = $(`opt_rarity_${r.toLowerCase()}`);
      return cb && cb.checked;
    });
    data.selectedRarities = selected.length ? selected : ["Common"];
    data.rarity = data.selectedRarities;

    // Target rarities for Smart Catch
    const targetRarities = RARITIES.filter(r => {
      const cb = $(`opt_target_${r.toLowerCase()}`);
      return cb && cb.checked;
    });
    data.targetRarities = targetRarities.length ? targetRarities : ["Rare", "Epic", "Legendary"];

    data.autoSellMinCorn = Math.max(0, Number($("opt_autoSellMinCorn").value) || 0);
    data.autoSellMinStars = Math.max(0, Number($("opt_autoSellMinStars").value) || 0);

    data.scheduleEnabled = $("opt_scheduleEnabled").checked;
    data.scheduleFrom = $("opt_scheduleFrom").value;
    data.scheduleTo = $("opt_scheduleTo").value;

    data.chatFilterMode = $("opt_chatFilterMode").value;
    data.chatFilterList = $("opt_chatFilterList").value
      .split("\n")
      .map(x => x.trim())
      .filter(Boolean)
      .slice(0, 100);

    data.theme = $("opt_theme").value;
    data.lang = $("opt_lang").value;

    // Smart Catch specific
    data.myDuckRarity = $("opt_myDuckRarity").value;
    data.myDuckLevel = Math.max(1, Math.min(5, Number($("opt_myDuckLevel").value) || 5));
    data.minPartnerLevel = Math.max(1, Math.min(5, Number($("opt_minPartnerLevel").value) || 1));
    data.maxPartnerLevel = Math.max(1, Math.min(5, Number($("opt_maxPartnerLevel").value) || 5));

    data.customRarities = collectCustomRarities().slice(0, currentTier.features?.maxRegexPatterns || 3);
    return data;
  }

  function save(extra, cb) {
    const data = { ...collectSyncData(), ...(extra || {}) };
    chrome.storage.sync.set(data, () => {
      if (cb) cb();
    });
  }

  /* ---------- share (consent flow) ---------- */

  function saveShare(shareOn) {
    const endpointVal = $("opt_shareEndpoint").value.trim();
    const statusEl = $("shareStatus");

    const finish = msg => {
      if (msg) statusEl.textContent = msg;
      setTimeout(() => (statusEl.textContent = ""), 3000);
    };

    if (!shareOn) {
      save({ shareEnabled: false, shareEndpoint: endpointVal });
      finish("");
      return;
    }

    let origin = null;
    try {
      const u = new URL(endpointVal);
      if (u.protocol === "https:" && u.hostname && u.hostname.includes(".")) {
        origin = u.origin + "/*";
      }
    } catch {}
    if (!origin) {
      $("opt_shareEnabled").checked = false;
      save({ shareEnabled: false, shareEndpoint: endpointVal });
      finish(t("share.badEndpoint"));
      return;
    }

    try {
      chrome.permissions.request({ origins: [origin] }, granted => {
        save(
          { shareEnabled: granted, shareEndpoint: endpointVal },
          () => {
            if (!granted) $("opt_shareEnabled").checked = false;
            finish(granted ? t("share.granted") : t("share.denied"));
          }
        );
      });
    } catch {
      save({ shareEnabled: true, shareEndpoint: endpointVal });
      finish(t("saved.ok"));
    }
  }

  $("sendNow").addEventListener("click", () => {
    const statusEl = $("shareStatus");
    statusEl.textContent = "…";
    chrome.storage.sync.set(
      { shareEndpoint: $("opt_shareEndpoint").value.trim() },
      () => {
        try {
          chrome.runtime.sendMessage({ type: "SEND_STATS_NOW" }, r => {
            const err = chrome.runtime.lastError;
            if (err || !r) {
              statusEl.textContent = t("share.fail", {
                r: err ? err.message.slice(0, 80) : "no response"
              });
            } else if (r.sent) {
              statusEl.textContent = t("share.sentOk");
            } else {
              statusEl.textContent = t("share.fail", { r: r.reason || "?" });
            }
            setTimeout(() => (statusEl.textContent = ""), 6000);
          });
        } catch (e) {
          statusEl.textContent = t("share.fail", { r: e.message.slice(0, 80) });
        }
      }
    );
  });

  /* ---------- pause ---------- */

  function loadPauseStatus() {
    chrome.storage.local.get({ pauseUntil: 0 }, r => {
      const until = r.pauseUntil || 0;
      const el = $("pauseStatus");
      if (until > Date.now()) {
        el.textContent = t("pause.until", {
          time: new Date(until).toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit"
          }),
          n: Math.ceil((until - Date.now()) / 60000)
        });
      } else {
        el.textContent = t("pause.notActive");
      }
    });
  }

  function pauseFor(minutes) {
    chrome.storage.local.set({ pauseUntil: Date.now() + minutes * 60000 }, loadPauseStatus);
  }

  /* ---------- history / stats ---------- */

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function loadHistory() {
    const rangeHours = parseInt($("historyTimeRange").value, 10) || 0;
    const cutoff = rangeHours ? Date.now() - rangeHours * 3600000 : 0;

    chrome.storage.local.get({ catchHistory: [] }, r => {
      const all = r.catchHistory || [];
      const history = cutoff ? all.filter(h => h.timestamp >= cutoff) : all;

      $("historyCount").textContent = t("history.count", {
        n: history.length,
        all: all.length
      });

      const list = $("historyList");
      if (!history.length) {
        list.innerHTML = `<div class="empty-state">${
          cutoff ? t("history.emptyRange") : t("history.empty")
        }</div>`;
        return;
      }
      list.innerHTML = history
        .slice(0, 100)
        .map(h => {
          const badge = `badge-${(h.rarity || "common").toLowerCase()}`;
          const time = new Date(h.timestamp).toLocaleString(undefined, {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit"
          });
          const text = escapeHtml((h.text || "").slice(0, 100));
          const tag =
            h.mode === "sight" ? ` · ${t("tag.sight")}` : "";
          return `<div class="history-item">
            <span class="rarity-badge ${badge}">${escapeHtml(h.rarity)}${tag}</span>
            <span class="history-text">${text}</span>
            <span class="history-time">${time}</span>
          </div>`;
        })
        .join("");
    });
  }

  function loadStats() {
    const rangeHours = parseInt($("statsTimeRange").value, 10) || 0;
    const cutoff = rangeHours ? Date.now() - rangeHours * 3600000 : 0;

    chrome.storage.local.get({ catchHistory: [], breedClicks: 0 }, r => {
      const all = r.catchHistory || [];
      const history = cutoff ? all.filter(h => h.timestamp >= cutoff) : all;

      const caught = history.filter(h => h.mode !== "sight");
      const sighted = history.filter(h => h.mode === "sight");

      const rarityCount = {};
      for (const h of caught) {
        rarityCount[h.rarity] = (rarityCount[h.rarity] || 0) + 1;
      }

      const statsContent = $("statsContent");
      let html = `<div class="stat-card"><div class="stat-value">${caught.length}</div><div class="stat-label">${t("stat.caught", { range: rangeHours ? t("stat.perHour", { n: rangeHours }) : "" })}</div></div>`;

      if (!rangeHours) {
        html += `<div class="stat-card"><div class="stat-value">${r.breedClicks || 0}</div><div class="stat-label">${t("stat.breeds")}</div></div>`;
      }

      for (const [rarity, count] of Object.entries(rarityCount).sort((a, b) => b[1] - a[1])) {
        const badge = `badge-${rarity.toLowerCase()}`;
        html += `<div class="stat-card"><div class="stat-value">${count}</div><div class="stat-label"><span class="rarity-badge ${badge}">${escapeHtml(rarity)}</span></div></div>`;
      }
      statsContent.innerHTML = html;

      buildTimeline(caught, rangeHours);

      const sightRarityCount = {};
      for (const h of sighted) {
        sightRarityCount[h.rarity] = (sightRarityCount[h.rarity] || 0) + 1;
      }
      const sightContent = $("sightStatsContent");
      if (!sighted.length) {
        sightContent.innerHTML = `<div class="empty-state">${t("sight.empty")}</div>`;
      } else {
        let sh = `<div class="stat-card"><div class="stat-value">${sighted.length}</div><div class="stat-label">${t("stat.sightTotal")}</div></div>`;
        for (const [rarity, count] of Object.entries(sightRarityCount).sort((a, b) => b[1] - a[1])) {
          const badge = `badge-${rarity.toLowerCase()}`;
          sh += `<div class="stat-card"><div class="stat-value">${count}</div><div class="stat-label"><span class="rarity-badge ${badge}">${escapeHtml(rarity)}</span></div></div>`;
        }
        sightContent.innerHTML = sh;
      }
    });
  }

  function loadSmartStats() {
    chrome.runtime.sendMessage({ type: "GET_STATUS" }, r => {
      if (!r || !r.stats) return;
      const sc = r.stats.smartCatch;
      if (!sc || !sc.enabled) {
        $("smartStats").innerHTML = `<div class="empty-state">${t("smart.disabled")}</div>`;
        return;
      }
      const s = sc.session;
      const html = `
        <div class="stat-grid">
          <div class="stat-card"><div class="stat-value">${s.scans || 0}</div><div class="stat-label">${t("smart.scans")}</div></div>
          <div class="stat-card"><div class="stat-value">${s.found || 0}</div><div class="stat-label">${t("smart.found")}</div></div>
          <div class="stat-card"><div class="stat-value">${s.matched || 0}</div><div class="stat-label">${t("smart.matched")}</div></div>
          <div class="stat-card"><div class="stat-value">${s.opened || 0}</div><div class="stat-label">${t("smart.opened")}</div></div>
          <div class="stat-card"><div class="stat-value">${s.skipped?.duplicate || 0}</div><div class="stat-label">${t("smart.skipDup")}</div></div>
          <div class="stat-card"><div class="stat-value">${s.skipped?.wrongRarity || 0}</div><div class="stat-label">${t("smart.skipRarity")}</div></div>
          <div class="stat-card"><div class="stat-value">${s.skipped?.wrongLevel || 0}</div><div class="stat-label">${t("smart.skipLevel")}</div></div>
          <div class="stat-card"><div class="stat-value">${s.skipped?.repeatPartner || 0}</div><div class="stat-label">${t("smart.skipRepeat")}</div></div>
        </div>
        <div class="partner-list" style="margin-top:12px">
          <h4>${t("smart.recentPartners")}</h4>
          ${(s.partners || []).slice(-10).reverse().map(p => `
            <div class="partner-item">
              <span class="rarity-badge badge-${(p.rarity || '').toLowerCase()}">${escapeHtml(p.rarity || '?')}</span>
              <span>Lv${p.level ?? '?'}</span>
              <span>${new Date(p.ts).toLocaleTimeString()}</span>
            </div>
          `).join('') || `<div class="empty-state">${t("smart.noPartners")}</div>`}
        </div>
      `;
      $("smartStats").innerHTML = html;
    });
  }

  function loadSmartStatsPeriodic() {
    loadSmartStats();
    setTimeout(loadSmartStatsPeriodic, 3000);
  }

  function buildTimeline(history, rangeHours) {
    const el = $("statsTimeline");
    if (!history.length) {
      el.innerHTML = "";
      return;
    }

    const bucketSize =
      rangeHours <= 12 ? 3600000 : rangeHours <= 72 ? 6 * 3600000 : 86400000;
    const buckets = new Map();
    const now = Date.now();
    const start = rangeHours
      ? now - rangeHours * 3600000
      : history[history.length - 1].timestamp;
    const end = now;

    for (let ts = Math.floor(start / bucketSize) * bucketSize; ts <= end; ts += bucketSize) {
      buckets.set(ts, 0);
    }
    for (const h of history) {
      const key = Math.floor(h.timestamp / bucketSize) * bucketSize;
      if (buckets.has(key)) buckets.set(key, buckets.get(key) + 1);
    }

    const entries = Array.from(buckets.entries()).sort((a, b) => a[0] - b[0]);
    const maxVal = Math.max(1, ...entries.map(e => e[1]));
    const barMaxH = 80;

    let html = '<div class="timeline-bars">';
    for (const [ts, count] of entries) {
      const d = new Date(ts);
      const label =
        rangeHours <= 72
          ? d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
          : d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
      const h = Math.max(2, Math.round((count / maxVal) * barMaxH));
      html += `<div class="timeline-col" title="${label}: ${count}">
        <div class="timeline-bar" style="height:${h}px"></div>
        <div class="timeline-label">${label}</div>
        <div class="timeline-value">${count || ""}</div>
      </div>`;
    }
    html += "</div>";
    el.innerHTML = html;
  }

  /* ---------- diagnostics / dump ---------- */

  function loadDebugInfo() {
    chrome.storage.local.get({ miniappStatus: null, catchHistory: [], breedClicks: 0 }, r => {
      const lines = [];
      lines.push(`breedClicks: ${r.breedClicks || 0}`);
      lines.push(`catchHistory: ${r.catchHistory?.length || 0}`);
      if (r.miniappStatus) {
        const m = r.miniappStatus;
        lines.push("", "mini-app:");
        lines.push(`  url: ${m.url || "?"}`);
        lines.push(`  ready: ${m.ready ?? "?"}`);
        lines.push(`  buttonFound: ${m.buttonFound}`);
        lines.push(`  buttonText: ${m.buttonText || "?"}`);
        lines.push(`  breedClicks: ${m.breedClicks || 0}`);
        if (m.lastError) lines.push(`  lastError: ${m.lastError}`);
        if (m.bodySample) lines.push(`  body: ${m.bodySample}`);
      }
      $("debugContent").textContent = lines.join("\n");
    });
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  function exportJSON() {
    chrome.storage.local.get({ catchHistory: [] }, r => {
      const blob = new Blob([JSON.stringify(r.catchHistory, null, 2)], {
        type: "application/json"
      });
      downloadBlob(blob, "duck-catcher-history.json");
    });
  }

  function exportCSV() {
    chrome.storage.local.get({ catchHistory: [] }, r => {
      const lines = ["rarity,text,timestamp,datetime"];
      for (const h of r.catchHistory || []) {
        const d = new Date(h.timestamp).toISOString();
        const text = (h.text || "").replace(/"/g, '""');
        lines.push(`"${h.rarity}","${text}","${h.timestamp}","${d}"`);
      }
      downloadBlob(
        new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" }),
        "duck-catcher-history.csv"
      );
    });
  }

  /* ---------- custom rarities ---------- */

  function escapeAttr(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  }

  function loadCustomRarities(list) {
    const container = $("customRarityList");
    container.innerHTML = "";
    for (const item of list) {
      addCustomRarityRow(container, item.name || "", item.patterns || [], item.rank || 50);
    }
  }

  function addCustomRarityRow(container, name, patterns, rank) {
    const el = document.createElement("div");
    el.className = "custom-rarity-item";
    el.innerHTML =
      '<div class="custom-rarity-row">' +
        `<span class="custom-rarity-label">${t("cr.name")}</span>` +
        `<input type="text" class="cr-name" value="${escapeAttr(name)}" placeholder="${t("cr.namePh")}">` +
        `<span class="custom-rarity-label">${t("cr.rank")}</span>` +
        `<input type="number" class="cr-rank" value="${rank}" min="0" max="999">` +
        `<button class="btn-remove" title="${t("cr.remove")}">✕</button>` +
      "</div>" +
      '<div class="custom-rarity-row">' +
        `<span class="custom-rarity-label">${t("cr.pattern")}</span>` +
        `<input type="text" class="cr-patterns" value="${escapeAttr(patterns.join(", "))}" placeholder="${t("cr.patternPh")}">` +
      "</div>";
    container.appendChild(el);
    el.querySelector(".btn-remove").addEventListener("click", () => {
      el.remove();
      save();
    });
    el.querySelectorAll("input").forEach(inp => inp.addEventListener("change", save));
  }

  function collectCustomRarities() {
    const result = [];
    for (const el of document.querySelectorAll(".custom-rarity-item")) {
      const name = el.querySelector(".cr-name").value.trim();
      const patternsRaw = el.querySelector(".cr-patterns").value.trim();
      const rank = parseInt(el.querySelector(".cr-rank").value, 10) || 50;
      if (!name || !patternsRaw) continue;
      const patterns = patternsRaw.split(",").map(s => s.trim()).filter(Boolean);
      if (patterns.length) result.push({ name, patterns, rank });
    }
    return result;
  }

  /* ---------- wire up ---------- */

  buildRarityGrid();

  for (const key of [...TOGGLES, "dryRun", "debug"]) {
    const el = $(`opt_${key}`);
    if (el) el.addEventListener("change", save);
  }

  $("opt_autoSellMinCorn").addEventListener("change", save);
  $("opt_autoSellMinStars").addEventListener("change", save);

  $("rarityAll").addEventListener("click", () => {
    document.querySelectorAll("#rarityGrid input").forEach(cb => (cb.checked = true));
    save();
  });
  $("rarityNone").addEventListener("click", () => {
    document.querySelectorAll("#rarityGrid input").forEach(cb => (cb.checked = false));
    save();
  });

  $("addCustomRarity").addEventListener("click", () => {
    addCustomRarityRow($("customRarityList"), "", [], 50);
  });

  $("opt_chatFilterMode").addEventListener("change", save);
  $("opt_chatFilterList").addEventListener("change", save);

  $("opt_scheduleEnabled").addEventListener("change", save);
  $("opt_scheduleFrom").addEventListener("change", save);
  $("opt_scheduleTo").addEventListener("change", save);

  $("pause15").addEventListener("click", () => pauseFor(15));
  $("pause30b").addEventListener("click", () => pauseFor(30));
  $("pause60b").addEventListener("click", () => pauseFor(60));
  $("pauseResume").addEventListener("click", () =>
    chrome.storage.local.set({ pauseUntil: 0 }, loadPauseStatus)
  );

  $("exportJSON").addEventListener("click", exportJSON);
  $("exportCSV").addEventListener("click", exportCSV);
  $("clearHistory").addEventListener("click", () => {
    if (!confirm(t("confirm.clearHistory"))) return;
    chrome.storage.local.set({ catchHistory: [] }, () => {
      loadHistory();
      loadStats();
    });
  });

  $("historyTimeRange").addEventListener("change", loadHistory);
  $("statsTimeRange").addEventListener("change", loadStats);

  $("opt_theme").addEventListener("change", e => {
    I18N.applyTheme(e.target.value);
    save({ theme: e.target.value });
  });
  $("opt_lang").addEventListener("change", e => {
    save({ lang: e.target.value }, () => location.reload());
  });

  $("opt_shareEnabled").addEventListener("change", e => {
    saveShare(e.target.checked);
  });
  $("opt_shareEndpoint").addEventListener("change", () => {
    if ($("opt_shareEnabled").checked) saveShare(true);
    else save();
  });

  $("opt_dumpAutoEnabled").addEventListener("change", () => {
    chrome.storage.local.set({
      dumpAutoEnabled: $("opt_dumpAutoEnabled").checked
    });
  });

  function loadDumpInfo() {
    S.getDumpHistory().then(({ history }) => {
      const el = $("dumpInfo");
      if (!el) return;
      if (!history.length) {
        el.textContent = t("dump.empty");
      } else {
        el.textContent = t("dump.exported", { n: history.length });
      }
    }).catch(() => {});
  }

  $("exportDump").addEventListener("click", () => {
    S.getDumpHistory().then(({ history, meta }) => {
      if (!history.length) {
        $("dumpInfo").textContent = t("dump.empty");
        return;
      }
      const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      S.downloadDump(`duck-catcher-dump-${ts}.json`, S.buildDumpJSON(history, meta));
      $("dumpInfo").textContent = t("dump.exported", { n: history.length });
    });
  });

  $("clearDump").addEventListener("click", () => {
    if (!confirm(t("confirm.clearDump"))) return;
    S.clearDumpHistory().then(loadDumpInfo);
  });

  // Smart Catch target rarity all/none
  const targetAllBtn = $("targetRarityAll");
  const targetNoneBtn = $("targetRarityNone");
  if (targetAllBtn) targetAllBtn.addEventListener("click", () => {
    document.querySelectorAll("#targetRarityGrid input").forEach(cb => (cb.checked = true));
    save();
  });
  if (targetNoneBtn) targetNoneBtn.addEventListener("click", () => {
    document.querySelectorAll("#targetRarityGrid input").forEach(cb => (cb.checked = false));
    save();
  });

  // Smart Catch reset stats
  const smartResetBtn = $("smartResetStats");
  if (smartResetBtn) smartResetBtn.addEventListener("click", () => {
    if (!confirm(t("smart.confirmReset"))) return;
    chrome.runtime.sendMessage({ type: "RESET_SMART_STATS" }, () => {
      loadSmartStats();
    });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if ("catchHistory" in changes) {
      loadHistory();
      loadStats();
    }
    if ("breedClicks" in changes) loadStats();
    if ("miniappStatus" in changes) loadDebugInfo();
    if ("pauseUntil" in changes) loadPauseStatus();
    if ("dumpHistory" in changes) loadDumpInfo();
  });

  setInterval(() => {
    loadPauseStatus();
    loadDebugInfo();
  }, 10000);

  setupSecretToggle();

  const starsBtn = $("starsPayBtn");
  if (starsBtn) starsBtn.addEventListener("click", handleStarsPay);

  I18N.init().then(() => {
    detectDevMode();
    load();
    loadTier();
    loadDumpInfo();
  });
})();
