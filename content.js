(() => {
  "use strict";

  const S = window.DC;
  if (!S) return;

  let settings = { ...S.DEFAULTS };
  let contextAlive = true;
  let lastOpened = "";
  let lastOpenedAt = 0;
  const openedStarts = new Set();
  let breedingStartedAt = 0;
  const sightedStarts = new Set();
  const processedBreedNicks = new Set();
  const partnerHistory = new Map();
  let sessionStats = {
    startedAt: 0,
    scans: 0,
    linksFound: 0,
    matched: 0,
    opened: 0,
    skipped: { duplicate: 0, wrongRarity: 0, wrongLevel: 0, repeatPartner: 0 },
    partners: []
  };

  const stats = {
    active: true,
    lastScanAt: 0,
    linksTotal: 0,
    matched: false,
    matchedText: "",
    playClicks: 0,
    dialogsHandled: 0,
    closeClicks: 0,
    lastError: "",
    lastAutoPlay: "",
    seenLinks: [],
    paused: false,
    scheduledOff: false,
    dryRun: false,
    hidden: false,
    collector: false,
    smartCatch: {
      enabled: false,
      myDuck: { rarity: "Rare", level: 5 },
      session: { scans: 0, found: 0, matched: 0, opened: 0, skipped: { duplicate: 0, wrongRarity: 0, wrongLevel: 0, repeatPartner: 0 }, partners: [] }
    }
  };

  function sendMsg(msg) {
    S.safeSend(msg, () => contextAlive, v => { contextAlive = v; });
  }

  let lastStatusPush = 0;
  function pushStatus() {
    const now = Date.now();
    if (now - lastStatusPush < 1000) return;
    lastStatusPush = now;
    sendMsg({ type: "STATUS_UPDATE", stats });
  }

  function persistOpenedStarts() {
    try {
      const list = Array.from(openedStarts).slice(-500);
      chrome.storage.session.set({ openedStarts: list }, () => {
        void chrome.runtime.lastError;
      });
    } catch {
      // storage.session may be unavailable
    }
  }

  function persistSightedStarts() {
    try {
      const list = Array.from(sightedStarts).slice(-2000);
      chrome.storage.session.set({ sightedStarts: list }, () => {
        void chrome.runtime.lastError;
      });
    } catch {
      // storage.session may be unavailable
    }
  }

  function persistProcessedBreedNicks() {
    try {
      const list = Array.from(processedBreedNicks).slice(-500);
      chrome.storage.session.set({ processedBreedNicks: list }, () => {
        void chrome.runtime.lastError;
      });
    } catch {
      // storage.session may be unavailable
    }
  }

  function persistPartnerHistory() {
    try {
      const max = settings.partnerHistoryMax || 200;
      const arr = Array.from(partnerHistory.entries()).slice(-max);
      chrome.storage.local.set({ partnerHistory: arr }, () => {
        void chrome.runtime.lastError;
      });
    } catch {
      // storage.local may be unavailable
    }
  }

  function getStart(url) {
    try {
      const u = new URL(url, location.href);
      const host = u.hostname.toLowerCase().replace(/^www\./, "");
      if (host !== "t.me") return "";
      if (u.pathname.toLowerCase() !== "/myduck") return "";
      return u.searchParams.get("start") || "";
    } catch {
      return "";
    }
  }

  function toWebDeepLink(href) {
    try {
      const u = new URL(href, location.href);
      const botName = u.pathname.replace(/^\/+/, "");
      const search = u.search;
      const ver = (location.pathname.match(/^\/([akz])\//) || [])[1] || "a";
      return `https://web.telegram.org/${ver}/#${botName}${search}`;
    } catch {
      return href;
    }
  }

  function findMessageContainer(el) {
    let node = el;
    for (let i = 0; i < 12 && node; i++, node = node.parentElement) {
      if (node.getAttribute?.("data-message-id")) return node;
    }
    return null;
  }

  function getMessageTimestamp(container) {
    if (!container) return 0;
    const ts = container.getAttribute("data-timestamp");
    if (ts) {
      const n = Number(ts);
      if (n > 1e12) return n;
      if (n > 1e9) return n * 1000;
    }
    return 0;
  }

  function getCandidateText(a) {
    const container = findMessageContainer(a);
    if (container) return (container.textContent || "").trim();

    let node = a;
    let prevLen = 0;
    let best = "";
    for (let i = 0; i < 5 && node; i++, node = node.parentElement) {
      const text = (node.textContent || "").trim();
      const len = text.length;
      if (prevLen > 20 && len > prevLen * 2.5) break;
      if (len > best.length && len < 2000 && len > 5) best = text;
      prevLen = len;
    }
    return best;
  }

  function findLinks() {
    const result = [];
    const seen = new Set();
    document.querySelectorAll("a[href]").forEach(a => {
      const href = a.href || a.getAttribute("href") || "";
      const start = getStart(href);
      if (!start || seen.has(start)) return;
      const text = getCandidateText(a);
      const container = findMessageContainer(a);
      const messageTimestamp = getMessageTimestamp(container);
      result.push({ a, href, start, text, messageTimestamp });
      seen.add(start);
    });
    return result;
  }

  function openCandidate(candidate) {
    const now = Date.now();
    if (openedStarts.has(candidate.start)) {
      S.log("Content", "skip, already opened:", candidate.start);
      return;
    }
    if (candidate.start === lastOpened && now - lastOpenedAt < 20000) {
      S.log("Content", "skip, opened recently:", candidate.start);
      return;
    }

    S.log("Content", "OPENING duck link:", candidate.href.slice(0, 100));
    lastOpened = candidate.start;
    lastOpenedAt = now;
    openedStarts.add(candidate.start);
    persistOpenedStarts();
    breedingStartedAt = 0;

    candidate.a.dataset.duckCatcher = "matched";
    candidate.a.scrollIntoView({ block: "center", behavior: "instant" });

    sendMsg({
      type: "DUCK_FOUND",
      rarity: candidate.rarityMatch || settings.rarity,
      text: candidate.text
    });

    if (!settings.dryRun) {
      S.addCatchHistory(
        candidate.rarityMatch || "Unknown",
        candidate.text,
        Date.now()
      );
      if (settings.smartCatchEnabled) recordPartner(candidate);
    }

    if (settings.soundEnabled) {
      S.playSound();
    }

    if (settings.dryRun) {
      S.log("Content", "[DRY-RUN] would click:", candidate.href.slice(0, 100));
      stats.matchedText = "[DRY-RUN] " + candidate.text.slice(0, 120);
      pushStatus();
      return;
    }

    if (!contextAlive) return;

    const beforeHash = location.hash;
    S.realClick(candidate.a);
    S.log("Content", "clicked duck link in-page:", candidate.href.slice(0, 100));

    let attempts = 0;
    const verify = setInterval(() => {
      if (!contextAlive) {
        clearInterval(verify);
        return;
      }
      if (reachedBreeding(beforeHash)) {
        clearInterval(verify);
        return;
      }
      attempts++;
      if (attempts >= 8) {
        clearInterval(verify);
        S.log("Content", "in-page click did not navigate (gave up)");
      }
    }, 600);
  }

  function reachedBreeding(hashBefore) {
    if (location.hash !== hashBefore) return true;
    if (/myduck/i.test(location.hash)) return true;
    try {
      const t = visibleChatText();
      if (S.BREEDING_RE.test(t)) return true;
    } catch {
      // ignore
    }
    return false;
  }

  function shouldCatch(candidate) {
    if (!settings.smartCatchEnabled) return true;
    if (!candidate.rarityMatch) return false;

    if (!settings.targetRarities.includes(candidate.rarityMatch)) {
      sessionStats.skipped.wrongRarity++;
      return false;
    }

    const level = S.extractLevel(candidate.text);
    if (level !== null) {
      if (level < settings.minPartnerLevel || level > settings.maxPartnerLevel) {
        sessionStats.skipped.wrongLevel++;
        return false;
      }
    }

    if (settings.onlyNewLinks && openedStarts.has(candidate.start)) {
      sessionStats.skipped.duplicate++;
      return false;
    }

    const nick = S.extractBreedNickname(candidate.text);
    if (settings.avoidRepeatPartner && nick && partnerHistory.has(nick)) {
      sessionStats.skipped.repeatPartner++;
      return false;
    }

    return true;
  }

  function recordPartner(candidate) {
    const nick = S.extractBreedNickname(candidate.text);
    if (!nick) return;
    const existing = partnerHistory.get(nick) || { count: 0, lastSeen: 0 };
    existing.count++;
    existing.lastSeen = Date.now();
    existing.rarity = candidate.rarityMatch;
    const level = S.extractLevel(candidate.text);
    if (level !== null) existing.level = level;
    partnerHistory.set(nick, existing);
    persistPartnerHistory();

    sessionStats.partners.push({ nick, rarity: candidate.rarityMatch, level: level ?? null, ts: Date.now() });
    if (sessionStats.partners.length > 100) sessionStats.partners.shift();
  }

  function scan() {
    if (!contextAlive) return;
    stats.lastScanAt = Date.now();

    if (!settings.enabled) {
      stats.active = false;
      stats.linksTotal = 0;
      stats.matched = false;
      pushStatus();
      return;
    }

    if (!S.isChatAllowed(location.hash, settings)) {
      stats.active = true;
      stats.linksTotal = 0;
      stats.matched = false;
      stats.matchedText = "chat filtered out";
      pushStatus();
      return;
    }

    stats.active = true;
    const links = findLinks();
    stats.linksTotal = links.length;
    stats.matched = false;
    stats.matchedText = "";
    stats.seenLinks = links.slice(-8).map(l => ({
      start: l.start,
      text: l.text.slice(0, 100)
    }));

    if (settings.smartCatchEnabled) {
      sessionStats.scans++;
      sessionStats.linksFound += links.length;
    }

    const selected = S.getSelectedRarities(settings);
    const customRarities = settings.customRarities;
    S.log(
      "Content",
      `scan: ${links.length} duck links, rarities:`,
      selected
    );

    const matched = [];
    for (let i = links.length - 1; i >= 0; i--) {
      const candidate = links[i];
      if (openedStarts.has(candidate.start)) continue;
      const rarityMatch = S.matchesRarity(candidate.text, selected, customRarities);
      S.log(
        "Content",
        `check ${candidate.start}:`,
        rarityMatch ? `MATCH (${rarityMatch})` : "no match"
      );
      if (!rarityMatch) continue;
      candidate.rarityMatch = rarityMatch;

      if (settings.smartCatchEnabled && !shouldCatch(candidate)) {
        S.log("Content", `smartCatch skip ${candidate.start}`);
        continue;
      }

      matched.push(candidate);
    }

    // Rarity observation: count every newly seen duck card by rarity.
    // Runs regardless of dryRun — anonymous frequency stats only.
    for (let i = links.length - 1; i >= 0; i--) {
      const candidate = links[i];
      if (sightedStarts.has(candidate.start)) continue;
      const r = S.matchesRarity(
        candidate.text,
        S.RARITY_LIST,
        customRarities
      );
      if (!r) continue;
      sightedStarts.add(candidate.start);
      sendMsg({ type: "DUCK_SEEN", rarity: r });
      if (settings.dryRun) {
        S.addCatchHistory(r, candidate.text, Date.now(), { mode: "sight" });
        S.log("Content", `sight: ${candidate.start} (${r})`);
      }
    }
    persistSightedStarts();

    if (matched.length) {
      const best = S.bestCandidate(matched);
      stats.matched = true;
      stats.matchedText = best.text.slice(0, 120);

      if (settings.autoOpen) {
        openCandidate(best);
        if (settings.smartCatchEnabled) recordPartner(best);
      } else {
        best.a.dataset.duckCatcher = "matched";
        sendMsg({
          type: "DUCK_FOUND",
          rarity: best.rarityMatch,
          text: best.text
        });
      }
    }

    pushStatus();
  }

  const playAttempts = new WeakMap();
  const MAX_PLAY_ATTEMPTS = 3;
  const PLAY_RETRY_MS = 2200;

  function findPlayButtons() {
    const candidates = document.querySelectorAll(
      'button, [role="button"], ' +
        'div[class*="button" i], a[class*="button" i], ' +
        'div[class*="btn" i], a[class*="btn" i], ' +
        'div[class*="keyboard"] button, ' +
        'div[class*="keyboard"] [role="button"]'
    );
    const result = [];
    for (const el of candidates) {
      const text = S.norm(el.innerText || el.textContent || "");
      if (!text || text.length > 50) continue;
      if (!S.PLAY_RE.test(text)) continue;
      if (/чат|group/.test(text)) continue;
      if (!S.isVisible(el)) continue;
      result.push(el);
    }
    if (!result.length) {
      const all = document.querySelectorAll("div, span, a");
      for (const el of all) {
        if (result.some(r => r.contains(el))) continue;
        const text = S.norm(el.innerText || el.textContent || "");
        if (!text || text !== S.norm(el.textContent || "")) continue;
        if (text.length > 50 || text.length < 3) continue;
        if (!S.PLAY_RE.test(text)) continue;
        if (/чат|group/.test(text)) continue;
        if (!S.isVisible(el)) continue;
        const cs = getComputedStyle(el);
        if (
          cs.cursor === "pointer" ||
          el.closest?.("button, [role='button']")
        ) {
          result.push(el);
        }
      }
    }
    return result;
  }

  function miniAppIsOpen() {
    for (const f of document.querySelectorAll("iframe")) {
      const r = f.getBoundingClientRect();
      if (r.width > 200 && r.height > 200) return true;
    }
    return false;
  }

  function findPlayButtonsIn(root) {
    const candidates = root.querySelectorAll(
      'button, [role="button"], ' +
        'div[class*="button" i], a[class*="button" i], ' +
        'div[class*="btn" i], a[class*="btn" i]'
    );
    const result = [];
    for (const el of candidates) {
      const text = S.norm(el.innerText || el.textContent || "");
      if (!text || text.length > 50) continue;
      if (!S.PLAY_RE.test(text)) continue;
      if (/чат|group/.test(text)) continue;
      if (!S.isVisible(el)) continue;
      result.push(el);
    }
    return result;
  }

  let lastBtnText = "";
  let lastBtnAt = 0;

  function clickPlayButton(btn) {
    const now = Date.now();
    const text = (btn.textContent || "").trim();
    if (text && text === lastBtnText && now - lastBtnAt < 2500) return;

    const info = playAttempts.get(btn);
    if (!info) {
      S.realClick(btn);
      playAttempts.set(btn, { attempts: 1, at: now });
      lastBtnText = text;
      lastBtnAt = now;
      stats.playClicks++;
      S.log("Content", "CLICKED play button:", text);
      return;
    }
    if (info.attempts >= MAX_PLAY_ATTEMPTS) return;
    if (miniAppIsOpen()) return;
    if (now - info.at < PLAY_RETRY_MS) return;

    S.realClick(btn);
    info.attempts++;
    info.at = now;
    lastBtnText = text;
    lastBtnAt = now;
    stats.playClicks++;
    S.log("Content", `retry #${info.attempts} on play button`);
  }

  function findPlayButtonsNear(anchor) {
    const container = findMessageContainer(anchor);
    if (!container) return [];
    const inside = findPlayButtonsIn(container);
    if (inside.length) return inside;
    let parent = container.parentElement;
    for (let i = 0; i < 3 && parent; i++, parent = parent.parentElement) {
      const btns = findPlayButtonsIn(parent);
      const filtered = btns.filter(b => {
        const mc = findMessageContainer(b);
        return !mc || mc === container;
      });
      if (filtered.length) return filtered;
    }
    return [];
  }

  function isInViewport(el) {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
  }

  let domVersion = 0;
  let chatTextCache = "";
  let chatTextVersion = -1;

  function visibleChatText() {
    if (chatTextVersion === domVersion) return chatTextCache;
    const parts = [];
    for (const m of document.querySelectorAll("[data-message-id]")) {
      const r = m.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight || r.width < 4 || r.height < 4) continue;
      const st = getComputedStyle(m);
      if (st.display === "none" || st.visibility === "hidden") continue;
      parts.push(m.textContent || "");
    }
    chatTextCache = parts.join("\n");
    chatTextVersion = domVersion;
    return chatTextCache;
  }

  function isBotChatPage() {
    if (/myduck/i.test(location.hash)) return true;
    try {
      const t = visibleChatText();
      return S.BREEDING_RE.test(t);
    } catch {
      return false;
    }
  }

  function autoPlay() {
    if (!settings.enabled) {
      stats.lastAutoPlay = "disabled";
      return;
    }
    if (!settings.autoPlay) {
      stats.lastAutoPlay = "autoPlay off";
      return;
    }

    const links = findLinks();
    const pending = links.filter(c => !openedStarts.has(c.start));
    const inBotChat = isBotChatPage();

    const breedingActive =
      settings.closeAfterBreed &&
      breedingStartedAt > 0 &&
      Date.now() - breedingStartedAt < 120000;

    if (inBotChat) {
      if (breedingActive && !pending.length) {
        stats.lastAutoPlay = "breeding in progress, waiting";
        return;
      }
      const legendaryBtn = findLegendaryBreedButton();
      if (legendaryBtn) {
        const nick = extractNickFromContainer(legendaryBtn.container);
        if (nick && processedBreedNicks.has(nick)) {
          stats.lastAutoPlay = `legendary breed: skip already processed ${nick}`;
          return;
        }
        stats.lastAutoPlay = `legendary breed, click: ${legendaryBtn.btn.textContent.trim().slice(0, 50)}`;
        if (settings.dryRun) {
          S.log("Content", "[DRY-RUN] would click legendary breed button:", legendaryBtn.btn.textContent.trim().slice(0, 50));
        } else {
          clickPlayButton(legendaryBtn.btn);
          if (nick) {
            processedBreedNicks.add(nick);
            persistProcessedBreedNicks();
            if (settings.smartCatchEnabled) {
              const candidate = { text: legendaryBtn.container.textContent || "", rarityMatch: "Legendary" };
              recordPartner(candidate);
            }
          }
        }
        return;
      }
      const allBtns = findPlayButtons();
      if (!allBtns.length) {
        stats.lastAutoPlay = "bot chat, no play buttons";
        return;
      }
      const visible = allBtns.filter(isInViewport);
      const pool = visible.length ? visible : allBtns;
      const btn = pool[pool.length - 1];
      stats.lastAutoPlay = `bot chat, click: ${btn.textContent.trim().slice(0, 50)}`;
      if (settings.dryRun) {
        S.log("Content", "[DRY-RUN] would click play button:", btn.textContent.trim().slice(0, 50));
      } else {
        clickPlayButton(btn);
      }
      return;
    }

    if (pending.length) {
      let matched = null;
    const selected = settings.smartCatchEnabled
      ? S.RARITY_LIST
      : S.getSelectedRarities(settings);
      for (let i = pending.length - 1; i >= 0; i--) {
        const rarity = S.matchesRarity(pending[i].text, selected, settings.customRarities);
        if (rarity) {
          matched = pending[i];
          matched.rarityMatch = rarity;
          break;
        }
      }
      if (!matched) {
        stats.lastAutoPlay = `pending=${pending.length}, no rarity match`;
        return;
      }
      const btns = findPlayButtonsNear(matched.a);
      if (!btns.length) {
        stats.lastAutoPlay = "matched duck, no play button";
        return;
      }
      const btn = btns[btns.length - 1];
      stats.lastAutoPlay = `match, click: ${btn.textContent.trim().slice(0, 50)}`;
      if (settings.dryRun) {
        S.log("Content", "[DRY-RUN] would click play button:", btn.textContent.trim().slice(0, 50));
      } else {
        clickPlayButton(btn);
      }
      return;
    }

    if (breedingActive) {
      stats.lastAutoPlay = "breeding in progress, waiting";
      return;
    }
    const allBtns = findPlayButtons();
    if (!allBtns.length) {
      stats.lastAutoPlay = "no play buttons";
      return;
    }
    const visible = allBtns.filter(isInViewport);
    const pool = visible.length ? visible : allBtns;
    const btn = pool[pool.length - 1];
    stats.lastAutoPlay = `fallback, click: ${btn.textContent.trim().slice(0, 50)}`;
    if (settings.dryRun) {
      S.log("Content", "[DRY-RUN] would click play button:", btn.textContent.trim().slice(0, 50));
    } else {
      clickPlayButton(btn);
    }
  }

  function findLegendaryBreedButton() {
    const messages = document.querySelectorAll("[data-message-id]");
    for (const msg of messages) {
      const text = msg.textContent || "";
      if (!S.LEGENDARY_BREED_RE.test(text)) continue;
      const btns = findPlayButtonsIn(msg);
      if (btns.length) {
        return { container: msg, btn: btns[btns.length - 1] };
      }
    }
    return null;
  }

  function extractNickFromContainer(container) {
    const text = container.textContent || "";
    return S.extractBreedNickname(text);
  }

  function handleAppChooserDialogs() {
    const dialogs = document.querySelectorAll(
      '[role="dialog"], [class*="popup" i], [class*="modal" i]'
    );
    for (const dialog of dialogs) {
      if (dialog.dataset.duckCatcherSeen) continue;
      const text = S.norm(dialog.innerText || "");
      if (!S.CHOOSER_RE_DESKTOP.test(text)) continue;
      if (!S.CHOOSER_RE_WEB.test(text)) continue;

      const buttons = Array.from(
        dialog.querySelectorAll('button, [role="button"]')
      ).filter(S.isVisible);
      if (buttons.length < 2) continue;

      const webBtn = buttons.find(b => {
        const t = S.norm(b.innerText || b.textContent || "");
        return (
          S.CHOOSER_RE_WEB.test(t) && !S.CHOOSER_RE_WEB_BAD.test(t)
        );
      });
      if (webBtn) {
        dialog.dataset.duckCatcherSeen = "1";
        if (settings.dryRun) {
          S.log("Content", "[DRY-RUN] would click web button in dialog");
        } else {
          S.realClick(webBtn);
        }
        stats.dialogsHandled++;
      }
    }
  }

  function closeMiniApp() {
    const frames = Array.from(document.querySelectorAll("iframe"));
    const frame = frames.find(f =>
      /duckmyduck/i.test(f.src || f.getAttribute("src") || "")
    );
    const root =
      (frame &&
        frame.closest(
          '[class*="web_app" i], [class*="webapp" i], [class*="bubble" i], [class*="mini" i], [class*="WebApp" i]'
        )) ||
      frame?.parentElement ||
      document;

    const selectors = [
      'button[aria-label="Close"]',
      'button[aria-label="Закрыть"]',
      'button[title="Close"]',
      'button[title="Закрыть"]',
      'button[class*="close" i]',
      'div[class*="close" i][role="button"]'
    ];
    for (const sel of selectors) {
      const btn = root.querySelector(sel);
      if (btn && S.isVisible(btn)) {
        if (settings.dryRun) {
          S.log("Content", "[DRY-RUN] would close mini-app");
        } else {
          S.realClick(btn);
        }
        stats.closeClicks++;
        return true;
      }
    }

    const bubble = frame?.closest('[class*="web_app" i], [class*="bubble" i]');
    if (bubble) {
      const btns = Array.from(bubble.querySelectorAll("button, [role='button']"))
        .filter(S.isVisible)
        .filter(b => {
          const r = b.getBoundingClientRect();
          return r.width < 40 && r.height < 40;
        });
      const close = btns[btns.length - 1];
      if (close) {
        if (settings.dryRun) {
          S.log("Content", "[DRY-RUN] would close mini-app");
        } else {
          S.realClick(close);
        }
        stats.closeClicks++;
        return true;
      }
    }
    return false;
  }

  function clickGoToBottom() {
    const btn = document.querySelector(
      'button[aria-label="Go to bottom"], button[title="Go to bottom"]'
    );
    if (btn && S.isVisible(btn)) {
      S.realClick(btn);
      return true;
    }
    return false;
  }

  function findChatContainer() {
    const messages = document.querySelectorAll("[data-message-id]");
    if (!messages.length) return null;
    let node = messages[messages.length - 1];
    for (let i = 0; i < 15 && node; i++, node = node.parentElement) {
      const style = getComputedStyle(node);
      if (["auto", "scroll"].includes(style.overflowY)) {
        const maxScroll = node.scrollHeight - node.clientHeight;
        if (maxScroll > 50) return node;
      }
    }
    return null;
  }

  function autoScroll() {
    if (!settings.enabled || !settings.autoScroll) return;
    if (clickGoToBottom()) return;
    const chat = findChatContainer();
    if (chat) {
      if (settings.dryRun && !document.hidden) {
        S.log("Content", "[DRY-RUN] scroll only in background");
      } else {
        S.humanScroll(chat, "down");
      }
    }
  }

  function tick() {
    if (!contextAlive) return;
    try {
      stats.hidden = document.hidden;
      stats.paused = false;
      stats.scheduledOff = false;
      stats.dryRun = Boolean(settings.dryRun);

      if (S.isPaused(settings)) {
        stats.paused = true;
        stats.active = false;
        pushStatus();
        return;
      }
      if (!S.isWithinSchedule(settings)) {
        stats.scheduledOff = true;
        stats.active = false;
        pushStatus();
        return;
      }

      if (settings.cooldownUntil && Date.now() < settings.cooldownUntil) {
        stats.active = true;
        stats.matched = false;
        const remainMs = settings.cooldownUntil - Date.now();
        const remainMin = Math.ceil(remainMs / 60000);
        stats.matchedText = `cooldown: ${remainMin} мин`;
        pushStatus();
        return;
      }

      if (settings.dryRun) {
        scan();
      } else {
        autoScroll();
        scan();
        autoPlay();
        handleAppChooserDialogs();
      }

      // Update smartCatch stats for UI
      if (settings.smartCatchEnabled) {
        stats.smartCatch.enabled = true;
        stats.smartCatch.myDuck = { rarity: settings.myDuckRarity, level: settings.myDuckLevel };
        stats.smartCatch.session = {
          scans: sessionStats.scans,
          found: sessionStats.linksFound,
          matched: sessionStats.matched,
          opened: sessionStats.opened,
          skipped: { ...sessionStats.skipped },
          partners: [...sessionStats.partners].slice(-20)
        };
      } else {
        stats.smartCatch.enabled = false;
      }

      if (!settings.cooldownUntil || Date.now() >= settings.cooldownUntil) {
        try {
          const text = visibleChatText();
          const cooldownEnd = S.parseCooldown(text);
          if (cooldownEnd > Date.now()) {
            settings.cooldownUntil = cooldownEnd;
            S.log("Content", "cooldown detected, until:", new Date(cooldownEnd).toLocaleTimeString());
          }
        } catch {
          // ignore
        }
      }

      try { S.autoDumpSchedule(); } catch { /* ignore */ }
    } catch (err) {
      stats.lastError = String(err?.message || err).slice(0, 120);
      S.log("Content", "tick error:", stats.lastError);
      pushStatus();
    }
  }

  let tickTimer = null;
  let nextTickAt = 0;

  function scheduleTick() {
    if (!contextAlive) return;
    const base = settings.dryRun ? 3000 : 300;
    const jitter = S.randomJitter(base, base * 4);
    nextTickAt = Date.now() + jitter;
    clearTimeout(tickTimer);
    tickTimer = setTimeout(tick, jitter);
  }

  try {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message?.type === "GET_STATUS") {
        sendResponse({ ok: true, stats, settings });
      }
      if (message?.type === "TICK") {
        if (message.collector) {
          stats.collector = true;
          try {
            chrome.storage.session.set({ dcCollector: true }, () => {
              void chrome.runtime.lastError;
            });
          } catch {
            // ignore
          }
        }
        if ((document.hidden || stats.collector) && contextAlive) {
          tick();
          scheduleTick();
        }
      }
      if (message?.type === "SET_COLLECTOR") {
        stats.collector = true;
        try {
          chrome.storage.session.set({ dcCollector: true }, () => {
            void chrome.runtime.lastError;
          });
        } catch {
          // ignore
        }
      }
      if (message?.type === "RESET_SMART_STATS") {
        sessionStats = {
          startedAt: Date.now(),
          scans: 0,
          linksFound: 0,
          matched: 0,
          opened: 0,
          skipped: { duplicate: 0, wrongRarity: 0, wrongLevel: 0, repeatPartner: 0 },
          partners: []
        };
        sendResponse({ ok: true });
      }
    });
  } catch {
    contextAlive = false;
    return;
  }

  // Periodic smartCatch stats update to background
  let smartCatchSendTimer = null;
  function scheduleSmartCatchSend() {
    if (smartCatchSendTimer) clearTimeout(smartCatchSendTimer);
    smartCatchSendTimer = setTimeout(() => {
      if (!contextAlive) return;
      if (!settings.smartCatchEnabled) return;
      try {
        chrome.runtime.sendMessage({
          type: "SMART_CATCH_UPDATE",
          data: {
            enabled: true,
            myDuck: { rarity: settings.myDuckRarity, level: settings.myDuckLevel },
            targets: { rarities: settings.targetRarities, minLevel: settings.minPartnerLevel, maxLevel: settings.maxPartnerLevel },
            session: {
              scans: sessionStats.scans,
              found: sessionStats.linksFound,
              matched: sessionStats.matched,
              opened: sessionStats.opened,
              skipped: { ...sessionStats.skipped },
              partners: [...sessionStats.partners].slice(-20)
            }
          }
        }, () => { void chrome.runtime.lastError; });
      } catch { /* ignore */ }
      scheduleSmartCatchSend();
    }, 5000);
  }
  scheduleSmartCatchSend();

  try {
    window.addEventListener("message", e => {
      if (!e.data || e.data.duckCatcherBreedStarted !== true) return;
      if (!/^https:\/\/(web\.)?duckmyduck\.com$/i.test(e.origin || "")) return;
      breedingStartedAt = Date.now();
      S.log("Content", "mini-app reported breeding started");
      closeMiniApp();
      pushStatus();
    });
  } catch {
    // ignore
  }

  try {
    chrome.storage.sync.get(S.DEFAULTS, result => {
      if (!contextAlive) return;
      settings = { ...S.DEFAULTS, ...result };
      if (!Array.isArray(settings.selectedRarities)) {
        settings.selectedRarities = Array.isArray(settings.rarity)
          ? settings.rarity
          : typeof settings.rarity === "string"
          ? [settings.rarity]
          : ["Common"];
      }
      S.setDebug(settings.debug);
      S.log("Content", "settings loaded:", settings);
      scheduleTick();
      pushStatus();
    });
  } catch {
    contextAlive = false;
    return;
  }

  try {
    chrome.storage.session.get("openedStarts", result => {
      if (!contextAlive) return;
      const saved = result?.openedStarts;
      if (Array.isArray(saved)) {
        for (const s of saved) openedStarts.add(String(s));
      }
    });
  } catch {
    // storage.session unavailable
  }

  try {
    chrome.storage.session.get("sightedStarts", result => {
      if (!contextAlive) return;
      const saved = result?.sightedStarts;
      if (Array.isArray(saved)) {
        for (const s of saved) sightedStarts.add(String(s));
      }
    });
  } catch {
    // storage.session unavailable
  }

  try {
    chrome.storage.session.get("processedBreedNicks", result => {
      if (!contextAlive) return;
      const saved = result?.processedBreedNicks;
      if (Array.isArray(saved)) {
        for (const s of saved) processedBreedNicks.add(String(s));
      }
    });
  } catch {
    // storage.session unavailable
  }

  try {
    chrome.storage.local.get("partnerHistory", result => {
      if (!contextAlive) return;
      const saved = result?.partnerHistory;
      if (Array.isArray(saved)) {
        for (const [nick, data] of saved) {
          partnerHistory.set(nick, data);
        }
        // Clean old entries (older than 30 days)
        const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
        for (const [nick, data] of partnerHistory.entries()) {
          if (data.lastSeen < cutoff) partnerHistory.delete(nick);
        }
      }
    });
  } catch {
    // storage.local unavailable
  }

  try {
    chrome.storage.session.get("dcCollector", result => {
      if (!contextAlive) return;
      if (result?.dcCollector) stats.collector = true;
    });
  } catch {
    // storage.session unavailable
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

  document.addEventListener("visibilitychange", () => {
    if (!contextAlive) return;
    stats.hidden = document.hidden;
    pushStatus();
  });

  const observer = new MutationObserver(mutations => {
    if (mutations.length) domVersion++;
    if (!contextAlive) return;
    if (Date.now() >= nextTickAt) {
      scheduleTick();
    }
    if (
      (stats.collector || document.hidden) &&
      Date.now() - stats.lastScanAt >= 1500
    ) {
      tick();
    }
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

  S.makeWorkerTicker(700, () => {
    if (!contextAlive) return;
    if (!document.hidden && !stats.collector) return;
    try {
      tick();
    } catch {
      // ignore
    }
  });

  document.addEventListener("keydown", e => {
    if (!contextAlive) return;
    if (e.ctrlKey && e.shiftKey && e.key === "D") {
      e.preventDefault();
      settings.enabled = !settings.enabled;
      chrome.storage.sync.set({ enabled: settings.enabled }, () => {
        void chrome.runtime.lastError;
      });
      showToast(settings.enabled ? "Включено" : "Выключено");
    }
    if (e.ctrlKey && e.shiftKey && e.key === "R") {
      e.preventDefault();
      settings.dryRun = !settings.dryRun;
      chrome.storage.sync.set({ dryRun: settings.dryRun }, () => {
        void chrome.runtime.lastError;
      });
      showToast(settings.dryRun ? "Dry-Run: ON" : "Dry-Run: OFF");
    }
    if (e.ctrlKey && e.shiftKey && e.key === "P") {
      e.preventDefault();
      if (S.isPaused(settings)) {
        chrome.storage.sync.set({ pauseUntil: 0 }, () => {
          void chrome.runtime.lastError;
        });
        showToast("Пауза снята");
      } else {
        const until = Date.now() + 30 * 60000;
        chrome.storage.sync.set({ pauseUntil: until }, () => {
          void chrome.runtime.lastError;
        });
        showToast("Пауза 30 мин");
      }
    }
  });

  function showToast(text) {
    const el = document.createElement("div");
    el.textContent = text;
    Object.assign(el.style, {
      position: "fixed",
      bottom: "20px",
      right: "20px",
      padding: "10px 18px",
      borderRadius: "8px",
      background: "#1a1d27",
      color: "#e5e7eb",
      border: "1px solid #22c55e",
      fontSize: "13px",
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      zIndex: "999999",
      boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
      transition: "opacity 0.3s",
      pointerEvents: "none"
    });
    document.body.appendChild(el);
    setTimeout(() => { el.style.opacity = "0"; }, 1500);
    setTimeout(() => { el.remove(); }, 2000);
  }
})();
