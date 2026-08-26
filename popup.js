(() => {
  "use strict";

  const t = window.DC_I18N.t;
  const RARITIES = [
    "Common", "Uncommon", "Rare", "Epic",
    "Legendary", "Mythic", "Unique", "Secret"
  ];

  const $ = id => document.getElementById(id);

  /* ---------- switch helpers ---------- */

  function toggleSwitch(el) {
    el.classList.toggle("on");
    el.setAttribute("aria-checked", String(el.classList.contains("on")));
  }

  function setSwitch(el, on) {
    el.classList.toggle("on", on);
    el.setAttribute("aria-checked", String(on));
  }

  /* ---------- rarity grid ---------- */

  const RARITY_COLORS = {
    Common: "#97a1b5", Uncommon: "#33d17a", Rare: "#4f9dff", Epic: "#b57bff",
    Legendary: "#ffb020", Mythic: "#ff5c72", Unique: "#2ed3c3", Secret: "#8a8bff"
  };

  function buildRarityGrid() {
    const grid = $("rarityGrid");
    const chips = $("targetChips");
    if (!grid) return;
    grid.innerHTML = "";
    for (const r of RARITIES) {
      const btn = document.createElement("div");
      btn.className = "rbtn";
      btn.dataset.rarity = r;
      btn.style.color = RARITY_COLORS[r];
      btn.innerHTML = `<span class="d" style="background:${RARITY_COLORS[r]}"></span>${r}`;
      btn.addEventListener("click", () => {
        btn.classList.toggle("active");
        saveSmart();
        renderTargetChips();
      });
      grid.appendChild(btn);
    }
  }

  function renderTargetChips() {
    const chips = $("targetChips");
    if (!chips) return;
    const active = getTargetRarities();
    chips.innerHTML = active.map(r => {
      const c = RARITY_COLORS[r] || "#6b7280";
      return `<span class="rchip" style="background:${c}22;color:${c}"><span class="d" style="background:${c}"></span>${r}</span>`;
    }).join("");
    if (!active.length) {
      chips.innerHTML = `<span class="rchip" style="color:var(--text-faint)">—</span>`;
    }
  }

  function getTargetRarities() {
    return Array.from($("rarityGrid").querySelectorAll(".rbtn.active")).map(
      b => b.dataset.rarity
    );
  }

  /* ---------- target line ---------- */

  function updateTargetLine() {
    const targets = getTargetRarities();
    const min = $("opt_minPartnerLevel")?.value || "1";
    const max = $("opt_maxPartnerLevel")?.value || "5";
    const el = $("targetLine");
    if (!el) return;
    if (!targets.length) {
      el.innerHTML = "Цель: <b>не задана</b>";
    } else {
      const names = targets.map(r => `<b>${r}</b>`).join(" · ");
      el.innerHTML = `Ищу: ${names} · ур ${min}–${max}`;
    }
  }

  /* ---------- smart data ---------- */

  function saveSmart() {
    const data = {};
    data.smartCatchEnabled = $("swSmartCatch")?.classList.contains("on") || false;
    data.dryRun = $("swDryRun")?.classList.contains("on") || false;
    data.targetRarities = getTargetRarities();
    data.minPartnerLevel = Math.max(1, Math.min(5, Number($("opt_minPartnerLevel")?.value) || 1));
    data.maxPartnerLevel = Math.max(1, Math.min(5, Number($("opt_maxPartnerLevel")?.value) || 5));
    data.selectedRarities = data.targetRarities.length ? [...data.targetRarities] : ["Common"];
    data.rarity = data.selectedRarities;
    chrome.storage.sync.set(data);
    updateTargetLine();
  }

  /* ---------- CTA ---------- */

  let ctaRunning = false;

  function setupCTA() {
    const btn = $("mainBtn");
    if (!btn) return;
    btn.addEventListener("click", () => {
      const next = !ctaRunning;
      ctaRunning = next;
      chrome.storage.sync.set({ enabled: next });
      setCTA(next);
    });
  }

  function setCTA(running) {
    ctaRunning = running;
    const btn = $("mainBtn");
    if (!btn) return;
    btn.classList.toggle("running", running);
    btn.textContent = running ? "■ Остановить лов" : "▶ Запустить лов";
  }

  /* ---------- load ---------- */

  function load() {
    chrome.storage.sync.get(
      {
        enabled: true,
        soundEnabled: true,
        dryRun: false,
        smartCatchEnabled: false,
        targetRarities: ["Rare", "Epic", "Legendary"],
        minPartnerLevel: 1,
        maxPartnerLevel: 5,
        selectedRarities: ["Common"],
        onboarded: false
      },
      s => {
        setCTA(Boolean(s.enabled));

        setSwitch($("swSmartCatch"), Boolean(s.smartCatchEnabled));
        setSwitch($("swDryRun"), Boolean(s.dryRun));

        const targets = Array.isArray(s.targetRarities) && s.targetRarities.length
          ? s.targetRarities : ["Rare", "Epic", "Legendary"];
        for (const rbtn of $("rarityGrid").querySelectorAll(".rbtn")) {
          rbtn.classList.toggle("active", targets.includes(rbtn.dataset.rarity));
        }
        $("opt_minPartnerLevel").value = s.minPartnerLevel || 1;
        $("opt_maxPartnerLevel").value = s.maxPartnerLevel || 5;
        renderTargetChips();
        updateTargetLine();
        saveSmart();

        // Version
        try {
          $("versionLabel").textContent = "v" + chrome.runtime.getManifest().version;
        } catch {}

        if (!s.onboarded) openWizard();
      }
    );
  }

  /* ---------- status ---------- */

  function setStatus(cls, text) {
    const indicator = $("statusIndicator");
    const dot = $("statusDot");
    const label = $("statusText");
    if (!indicator) return;
    indicator.className = "status-indicator " + cls;
    if (dot) dot.className = "status-dot";
    if (label) label.textContent = text;
  }

  function checkLiveStatus() {
    const openTg = $("openTg");
    const indicator = $("statusIndicator");
    chrome.runtime.sendMessage({ type: "GET_COLLECTOR_STATUS" }, resp => {
      if (!chrome.runtime.lastError && resp && resp.dryRun) {
        if (openTg) openTg.classList.add("hidden");
        if (indicator) { indicator.classList.remove("hidden"); setStatus("dry", "Dry-Run"); }
        return;
      }
      chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        const tab = tabs[0];
        if (!tab?.url || !/^https:\/\/web\.telegram\.org\//i.test(tab.url)) {
          if (openTg) openTg.classList.remove("hidden");
          if (indicator) indicator.classList.add("hidden");
          return;
        }
        if (openTg) openTg.classList.add("hidden");
        if (indicator) indicator.classList.remove("hidden");
        chrome.tabs.sendMessage(tab.id, { type: "GET_STATUS" }, response => {
          if (chrome.runtime.lastError || !response?.ok) {
            setStatus("off", "Отключен");
            return;
          }
          const { stats } = response;
          if (stats.dryRun) {
            setStatus("dry", "Наблюдает");
          } else if (stats.paused) {
            setStatus("dry", "Пауза");
          } else if (stats.scheduledOff) {
            setStatus("dry", "Расписание");
          } else if (!stats.active) {
            setStatus("off", "Отключен");
            setCTA(false);
          } else if (stats.matched) {
            setStatus("live", "Ловит!");
          } else {
            setStatus("live", Number.isFinite(stats.linksTotal) ? `Ловит · ${stats.linksTotal}` : "Ловит");
          }
        });
      });
    });
  }

  /* ---------- recent catches ---------- */

  function formatTime(ts) {
    if (!ts) return "";
    const diff = Date.now() - ts;
    if (diff < 60000) return "·";
    if (diff < 3600000) return Math.floor(diff / 60000) + "м";
    if (diff < 86400000) return Math.floor(diff / 3600000) + "ч";
    return new Date(ts).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function renderRecent(history) {
    const list = $("recentList");
    if (!history.length) {
      list.innerHTML = `<div class="empty-state">${t("recent.empty") || "Пока ничего не поймано"}</div>`;
      return;
    }
    list.innerHTML = history.slice(0, 5).map(h => {
      const rar = (h.rarity || "common").toLowerCase();
      const badgeCls = "catch-badge " + rar;
      const time = formatTime(h.timestamp);
      const rawText = String(h.text || "");
      const linkMatch = rawText.match(/(https?:\/\/[^\s]+)/);
      const link = linkMatch ? linkMatch[1] : "";
      const name = link ? rawText.replace(link, "").trim() : rawText.slice(0, 48);
      const linkDisplay = link ? link.replace(/^https?:\/\/(t\.me\/myduck\?start=\S+).*/, "$1").slice(0, 40) : "";
      return `<div class="catch-row">
        <span class="${badgeCls}">${escapeHtml(h.rarity || "?")}</span>
        <div class="catch-info">
          <div class="catch-name">${escapeHtml(name)}</div>
          ${linkDisplay ? `<div class="catch-link">${escapeHtml(linkDisplay)}</div>` : ""}
        </div>
        <span class="catch-time">${time}</span>
      </div>`;
    }).join("");
  }

  function loadRecent() {
    chrome.storage.local.get({ catchHistory: [] }, r =>
      renderRecent(r.catchHistory || [])
    );
  }

  /* ---------- onboarding wizard ---------- */

  function openWizard() {
    const wiz = $("wizard");
    wiz.hidden = false;
    showStep(1);
  }

  function showStep(n) {
    document.querySelectorAll(".wiz-step").forEach(el => {
      el.hidden = el.dataset.step !== String(n);
    });
  }

  function finishWizard(saveData) {
    chrome.storage.sync.set({ ...saveData, onboarded: true }, () => {
      $("wizard").hidden = true;
      load();
    });
  }

  function getWizardChips() {
    return Array.from($("wizRarities")?.querySelectorAll(".chip.on") || []).map(c => c.dataset.rarity);
  }

  function setupWizard() {
    document.querySelectorAll(".wiz-btn[data-goto]").forEach(btn => {
      btn.addEventListener("click", () => showStep(Number(btn.dataset.goto)));
    });

    $("wizDone").addEventListener("click", () => {
      finishWizard({
        targetRarities: getWizardChips().length ? getWizardChips() : ["Rare", "Epic", "Legendary"],
        autoOpen: $("wiz_autoOpen").checked,
        autoBreed: $("wiz_autoBreed").checked,
        soundEnabled: $("wiz_soundEnabled").checked,
        enabled: true,
        smartCatchEnabled: true
      });
    });

    $("wizSkip").addEventListener("click", () => finishWizard({}));

    // Build wizard chips
    const wizRarities = $("wizRarities");
    if (wizRarities) {
      wizRarities.innerHTML = "";
      for (const r of RARITIES) {
        const chip = document.createElement("span");
        chip.className = "chip";
        chip.dataset.rarity = r;
        chip.textContent = r;
        chip.addEventListener("click", () => chip.classList.toggle("on"));
        wizRarities.appendChild(chip);
      }
    }
  }

  /* ---------- wire up ---------- */

  $("swSmartCatch")?.addEventListener("click", () => {
    toggleSwitch($("swSmartCatch"));
    saveSmart();
  });

  $("swDryRun")?.addEventListener("click", () => {
    toggleSwitch($("swDryRun"));
    saveSmart();
  });

  $("opt_minPartnerLevel")?.addEventListener("change", saveSmart);
  $("opt_maxPartnerLevel")?.addEventListener("change", saveSmart);

  $("openOptions")?.addEventListener("click", e => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  setupWizard();

  function applyTheme(light) {
    document.body.classList.toggle("light", light);
    const btn = $("themeBtn");
    if (btn) btn.textContent = light ? "☾" : "☀";
  }

  $("themeBtn")?.addEventListener("click", () => {
    const isLight = document.body.classList.toggle("light");
    chrome.storage.local.set({ popupTheme: isLight ? "light" : "dark" });
    applyTheme(isLight);
  });

  chrome.storage.local.get({ popupTheme: "dark" }, r => {
    applyTheme(r.popupTheme === "light");
  });

  DC_I18N.init().then(() => {
    buildRarityGrid();
    setupCTA();
    load();
    loadRecent();
    checkLiveStatus();
    checkUpdateBanner();
  });

  function checkUpdateBanner() {
    chrome.storage.local.get(["updateAvailable", "latestVersion"], r => {
      const banner = $("updateBanner");
      const ver = $("updateVersion");
      if (r.updateAvailable && banner) {
        banner.classList.remove("hidden");
        if (ver) ver.textContent = r.latestVersion || "";
      }
    });
  }

  setInterval(checkLiveStatus, 5000);

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "sync") {
        if ("dryRun" in changes) {
          setSwitch($("swDryRun"), Boolean(changes.dryRun.newValue));
          updateTargetLine();
        }
        if ("smartCatchEnabled" in changes) {
          setSwitch($("swSmartCatch"), Boolean(changes.smartCatchEnabled.newValue));
        }
        if ("targetRarities" in changes) {
          const targets = changes.targetRarities.newValue || [];
          for (const rbtn of $("rarityGrid").querySelectorAll(".rbtn")) {
            rbtn.classList.toggle("active", targets.includes(rbtn.dataset.rarity));
          }
          renderTargetChips();
          updateTargetLine();
        }
        if ("enabled" in changes) {
          setCTA(Boolean(changes.enabled.newValue));
        }
      }
      if (area !== "local") return;
      if ("catchHistory" in changes) loadRecent();
      if ("updateAvailable" in changes) checkUpdateBanner();
    });
  } catch {}
})();
