(() => {
  "use strict";

  const RU = {
    "status.loading": "Загрузка…",
    "st.active": "Активно · ищу уток…",
    "st.activeLinks": "Активно · {n} ссылок",
    "st.matched": "Нашёл утку!",
    "st.paused": "Пауза",
    "st.pausedLeft": "Пауза · ещё {n} мин",
    "st.schedule": "Вне расписания",
    "st.off": "Выключено",
    "st.dryrun": "Dry-Run · без кликов",
    "st.collector": "Коллектор в фоне",
    "st.collectorStart": "Запускаю коллектор…",
    "st.openTelegram": "Открой Telegram Web",
    "st.noContent": "Нет связи — обнови страницу (F5)",
    "mode.catch": "Ловля",
    "mode.dry": "Dry-Run",

    "recent.title": "Последние уловы",
    "recent.empty": "Пока ничего не поймано",
    "tag.sight": "наблюд.",

    "market.title": "Рынок",
    "market.staleTitle": "Монитор рынка не активен",
    "market.staleHint": "1. Перезагрузи расширение в chrome://extensions\n2. Обнови (F5) страницу с игрой\n3. Открой вкладку «Рынок» в игре",
    "market.notFound": "Рынок не найден на странице",
    "market.left": "осталось {t}",
    "market.avgCorn": "🌽 сред. {v}",
    "market.avgStars": "⭐ сред. {v}",
    "market.noPrices": "Цены не обнаружены",

    "rarity.label": "Какие редкости ловить",
    "tip.rarity": "Если на экране несколько уток — будет поймана самая редкая из выбранных.",
    "rarity.all": "Ловит все редкости",
    "rarity.none": "Ничего не поймает",
    "rarity.range": "Ловит: {a} → {b} ({n})",
    "rarity.one": "Ловит: {a}",

    "toggle.master": "Ловить",
    "toggle.sound": "Звук при ловле",

    "pause.30": "Пауза 30 мин",
    "pause.60": "Пауза 1 час",
    "pause.resume": "▶ Продолжить",
    "pause.left": "Пауза ещё {n} мин",

    "btn.options": "Все настройки",
    "btn.save": "Сохранить",
    "saved.ok": "✓ Сохранено",
    "share.badEndpoint": "✗ Нужен корректный https:// адрес (например https://site.ru/api/stats)",
    "share.granted": "✓ Сохранено, доступ к серверу выдан",
    "share.denied": "Сохранено, но доступ не выдан — шаринг выключен",

    "wiz.hi": "Привет!",
    "wiz.intro": "Я ловлю уток в Telegram-чатах по твоему фильтру и умею открывать их автоматически.",
    "wiz.next": "Далее",
    "wiz.done": "Готово",
    "wiz.skip": "Пропустить",
    "wiz.step2title": "Что ловим?",
    "wiz.step2text": "Выбери редкости — можно поменять позже.",
    "wiz.step3title": "Авто-режимы",
    "wiz.step3text": "Включи то, что нужно сразу:",
    "opt.autoOpen": "Открывать ссылки автоматически",
    "opt.autoBreed": "Авто-разведение",
    "opt.soundEnabled": "Звук при поимке",

    "tab.catch": "Утки",
    "tab.auto": "Автоматизация",
    "tab.history": "История и статистика",
    "tab.general": "Общее",
    "tab.dev": "Для разработчиков",

    "g.rarity": "Выбор редкости",
    "g.customRarity": "Кастомные редкости",
    "g.chats": "Фильтр чатов",
    "g.main": "Главное",
    "g.modes": "Авто-режимы",
    "g.sell": "Авто-продажа",
    "g.schedule": "Расписание и пауза",
    "g.history": "История поимок",
    "g.stats": "Статистика",
    "g.sight": "Наблюдения по редкостям",
    "g.appearance": "Внешний вид",
    "g.share": "Общая статистика",
    "g.debugMode": "Режим отладки",
    "g.diag": "Диагностика",
    "g.dump": "Полный дамп",

    "opt.enabled": "Расширение включено",
    "opt.autoScroll": "Автоскролл чата",
    "opt.autoPlay": "Авто-запуск игры",
    "opt.closeAfterBreed": "Закрывать мини-апп после разведения",
    "opt.dryRun": "Dry-Run (только логировать, не кликать)",
    "opt.debugLogs": "Включить DEBUG-логи",
    "opt.autoSellEnabled": "Продавать сразу, если цена ≥",
    "opt.minCorn": "🌽 Корн",
    "opt.minStars": "⭐ Звезды",
    "opt.scheduleEnabled": "Включить расписание",
    "opt.from": "С",
    "opt.to": "До",

    "tip.customRarity": "Свои правила, если игра ввела новую категорию или локализацию. Паттерн — regex или точное совпадение. Чем выше приоритет, тем важнее правило.",
    "tip.chats": "Сканировать только выбранные каналы. Username или ID из URL (#username или #-100123456), по одному на строку.",
    "tip.dryRun": "Показывает, что бот собирался бы сделать, без реального клика.",
    "tip.debugLogs": "Подробное логирование в консоль. Выключи после отладки.",
    "tip.share": "Раз в 15 мин отправляется: тип рынка, средние цены сделок, счётчики продаж и находок. Без ников, чатов и ID уток.",
    "tip.dump": "Полная история до 15000 записей с метаданными. Для бэкапа и анализа.",

    "rarity.addCustom": "+ Добавить",
    "rarity.selectAll": "Выбрать все",
    "rarity.selectNone": "Снять все",
    "chats.mode": "Режим фильтра",
    "chats.modeAll": "Все чаты",
    "chats.whitelist": "Только указанные",
    "chats.blacklist": "Кроме указанных",
    "chats.placeholder": "username1\n-100123456789\nmychannel",
    "cr.name": "Имя",
    "cr.rank": "Приоритет",
    "cr.pattern": "Паттерн",
    "cr.namePh": "МояРедкость",
    "cr.patternPh": "regex или текст, через запятую",
    "cr.remove": "Удалить",

    "pause.notActive": "Пауза не активна",
    "pause.until": "Приостановлено до {time} (ещё {n} мин)",

    "history.showFor": "Показывать за",
    "time.all": "Все время",
    "h.8": "8 часов",
    "h.12": "12 часов",
    "h.24": "24 часа",
    "h.72": "3 дня",
    "h.168": "7 дней",
    "stats.period": "Период",
    "export.json": "Экспорт JSON",
    "export.csv": "Экспорт CSV",
    "clear.history": "Очистить",
    "confirm.clearHistory": "Очистить всю историю поимок?",
    "confirm.clearDump": "Очистить полный дамп?",
    "history.empty": "Пока ничего не поймано",
    "history.emptyRange": "Нет поимок за выбранный период",
    "history.count": "{n} из {all}",

    "stat.caught": "Поймано{range}",
    "stat.sighted": "Наблюдений",
    "stat.breeds": "Разведений",
    "stat.sightTotal": "Всего наблюдений",
    "stat.perHour": " за {n}ч",
    "sight.empty": "Нет наблюдений",

    "appearance.theme": "Тема",
    "theme.auto": "Как в системе",
    "theme.dark": "Тёмная",
    "theme.light": "Светлая",
    "appearance.lang": "Язык",
    "lang.auto": "Как в системе",
    "share.enabled": "Делиться анонимной статистикой",
    "share.endpointPh": "https://твой-сайт/api/stats",
    "share.testBtn": "Отправить сейчас",
    "share.sentOk": "✓ Доставлено на сервер",
    "share.fail": "✗ Не отправлено: {r}",

    "dump.auto": "Автосохранение каждые 30 мин",
    "dump.download": "Скачать дамп JSON",
    "dump.clear": "Очистить дамп",
    "dump.empty": "Дамп пуст",
    "dump.exported": "Экспортировано: {n} записей",
    "dump.cleared": "Дамп очищен",
    "dev.hint": "Эта вкладка видна только в режиме разработчика (?debug=1 или 5 кликов по заголовку).",

    // Smart Catch
    "tab.smart": "Smart Catch",
    "g.smartCatch": "Smart Catch",
    "g.myDuck": "Моя утка",
    "g.targets": "Целевые партнёры",
    "g.filters": "Фильтры",
    "g.sessionStats": "Статистика сессии",
    "smart.myRarity": "Редкость",
    "smart.myLevel": "Уровень",
    "smart.targetRarities": "Редкости партнёра",
    "smart.minLevel": "Мин. уровень",
    "smart.maxLevel": "Макс. уровень",
    "opt.smartCatchEnabled": "Включить Smart Catch",
    "opt.myDuckRarity": "Редкость своей утки",
    "opt.myDuckLevel": "Уровень своей утки",
    "opt.minPartnerLevel": "Мин. уровень партнёра",
    "opt.maxPartnerLevel": "Макс. уровень партнёра",
    "opt.onlyNewLinks": "Только новые ссылки",
    "opt.avoidRepeatPartner": "Не ловить повторно одного партнёра",
    "smart.scans": "Сканирований",
    "smart.found": "Найдено уток",
    "smart.matched": "Подошло",
    "smart.opened": "Открыто",
    "smart.skipDup": "Пропущено (дубль)",
    "smart.skipRarity": "Пропущено (редкость)",
    "smart.skipLevel": "Пропущено (уровень)",
    "smart.skipRepeat": "Пропущено (повтор)",
    "smart.recentPartners": "Последние партнёры",
    "smart.noPartners": "Партнёров пока нет",
    "smart.disabled": "Smart Catch выключен",
    "smart.resetStats": "Сбросить статистику",
    "smart.confirmReset": "Сбросить статистику Smart Catch?",
    "smart.startCatch": "Запустить лов",
    "smart.stopCatch": "Остановить",
    "smart.advanced": "Все настройки",
    "rarity.targetAll": "Выбрать все",
    "rarity.targetNone": "Снять все",
  };

  const EN = {
    "status.loading": "Loading…",
    "st.active": "Active · hunting ducks…",
    "st.activeLinks": "Active · {n} links",
    "st.matched": "Duck found!",
    "st.paused": "Paused",
    "st.pausedLeft": "Paused · {n} min left",
    "st.schedule": "Outside schedule",
    "st.off": "Disabled",
    "st.dryrun": "Dry-Run · no clicks",
    "st.collector": "Collector in background",
    "st.collectorStart": "Starting collector…",
    "st.openTelegram": "Open Telegram Web",
    "st.noContent": "No connection — reload the page (F5)",
    "mode.catch": "Catching",
    "mode.dry": "Dry-Run",

    "recent.title": "Recent catches",
    "recent.empty": "Nothing caught yet",
    "tag.sight": "sight",

    "market.title": "Market",
    "market.staleTitle": "Market monitor is not active",
    "market.staleHint": "1. Reload the extension in chrome://extensions\n2. Refresh (F5) the game page\n3. Open the «Market» tab in the game",
    "market.notFound": "Market not found on page",
    "market.left": "{t} left",
    "market.avgCorn": "🌽 avg {v}",
    "market.avgStars": "⭐ avg {v}",
    "market.noPrices": "No prices detected",

    "rarity.label": "Rarities to catch",
    "tip.rarity": "If several ducks are on screen, the rarest selected one is caught.",
    "rarity.all": "Catches all rarities",
    "rarity.none": "Won't catch anything",
    "rarity.range": "Catches: {a} → {b} ({n})",
    "rarity.one": "Catches: {a}",

    "toggle.master": "Catch",
    "toggle.sound": "Sound on catch",

    "pause.30": "Pause 30 min",
    "pause.60": "Pause 1 hour",
    "pause.resume": "▶ Resume",
    "pause.left": "Paused · {n} min left",

    "btn.options": "All settings",
    "btn.save": "Save",
    "saved.ok": "✓ Saved",
    "share.badEndpoint": "✗ A valid https:// URL is required (e.g. https://site.ru/api/stats)",
    "share.granted": "✓ Saved, server access granted",
    "share.denied": "Saved, but access denied — sharing disabled",

    "wiz.hi": "Hi there!",
    "wiz.intro": "I hunt ducks in Telegram chats by your filter and can open them automatically.",
    "wiz.next": "Next",
    "wiz.done": "Done",
    "wiz.skip": "Skip",
    "wiz.step2title": "What to catch?",
    "wiz.step2text": "Pick rarities — you can change this later.",
    "wiz.step3title": "Auto modes",
    "wiz.step3text": "Turn on what you need right away:",
    "opt.autoOpen": "Open links automatically",
    "opt.autoBreed": "Auto-breeding",
    "opt.soundEnabled": "Sound on catch",

    "tab.catch": "Ducks",
    "tab.auto": "Automation",
    "tab.history": "History & stats",
    "tab.general": "General",
    "tab.dev": "Developer",

    "g.rarity": "Rarity selection",
    "g.customRarity": "Custom rarities",
    "g.chats": "Chat filter",
    "g.main": "Main",
    "g.modes": "Auto modes",
    "g.sell": "Auto-sell",
    "g.schedule": "Schedule & pause",
    "g.history": "Catch history",
    "g.stats": "Statistics",
    "g.sight": "Sightings by rarity",
    "g.appearance": "Appearance",
    "g.share": "Shared statistics",
    "g.debugMode": "Debug mode",
    "g.diag": "Diagnostics",
    "g.dump": "Full dump",

    "opt.enabled": "Extension enabled",
    "opt.autoScroll": "Auto-scroll chat",
    "opt.autoPlay": "Auto-start the game",
    "opt.closeAfterBreed": "Close mini-app after breeding",
    "opt.dryRun": "Dry-Run (log only, no clicks)",
    "opt.debugLogs": "Enable DEBUG logs",
    "opt.autoSellEnabled": "Sell instantly if price ≥",
    "opt.minCorn": "🌽 Corn",
    "opt.minStars": "⭐ Stars",
    "opt.scheduleEnabled": "Enable schedule",
    "opt.from": "From",
    "opt.to": "To",

    "tip.customRarity": "Your own rules if the game adds a new category or locale. Pattern is a regex or exact match. Higher priority wins.",
    "tip.chats": "Scan only selected channels. Username or ID from the URL (#username or #-100123456), one per line.",
    "tip.dryRun": "Shows what the bot would do without actually clicking.",
    "tip.debugLogs": "Verbose console logging. Turn off after debugging.",
    "tip.share": "Every 15 min we send: market type, average trade prices, sales and finds counters. No nicknames, chats or duck IDs.",
    "tip.dump": "Full history up to 15000 records with metadata. For backup and analysis.",

    "rarity.addCustom": "+ Add",
    "rarity.selectAll": "Select all",
    "rarity.selectNone": "Clear all",
    "chats.mode": "Filter mode",
    "chats.modeAll": "All chats",
    "chats.whitelist": "Only listed",
    "chats.blacklist": "All except listed",
    "chats.placeholder": "username1\n-100123456789\nmychannel",
    "cr.name": "Name",
    "cr.rank": "Priority",
    "cr.pattern": "Pattern",
    "cr.namePh": "MyRarity",
    "cr.patternPh": "regex or text, comma-separated",
    "cr.remove": "Remove",

    "pause.notActive": "No active pause",
    "pause.until": "Paused until {time} ({n} min left)",

    "history.showFor": "Show for",
    "time.all": "All time",
    "h.8": "8 hours",
    "h.12": "12 hours",
    "h.24": "24 hours",
    "h.72": "3 days",
    "h.168": "7 days",
    "stats.period": "Period",
    "export.json": "Export JSON",
    "export.csv": "Export CSV",
    "clear.history": "Clear",
    "confirm.clearHistory": "Clear the whole catch history?",
    "confirm.clearDump": "Clear the full dump?",
    "history.empty": "Nothing caught yet",
    "history.emptyRange": "No catches in this period",
    "history.count": "{n} of {all}",

    "stat.caught": "Caught{range}",
    "stat.sighted": "Sightings",
    "stat.breeds": "Breedings",
    "stat.sightTotal": "Total sightings",
    "stat.perHour": " in {n}h",
    "sight.empty": "No sightings",

    "appearance.theme": "Theme",
    "theme.auto": "System",
    "theme.dark": "Dark",
    "theme.light": "Light",
    "appearance.lang": "Language",
    "lang.auto": "System",
    "share.enabled": "Share anonymous statistics",
    "share.endpointPh": "https://your-site/api/stats",
    "share.testBtn": "Send now",
    "share.sentOk": "✓ Delivered to server",
    "share.fail": "✗ Not sent: {r}",

    "dump.auto": "Auto-save every 30 min",
    "dump.download": "Download dump JSON",
    "dump.clear": "Clear dump",
    "dump.empty": "Dump is empty",
    "dump.exported": "Exported: {n} records",
    "dump.cleared": "Dump cleared",
    "dev.hint": "This tab is only visible in developer mode (?debug=1 or 5 clicks on the header).",

    // Smart Catch
    "tab.smart": "Smart Catch",
    "g.smartCatch": "Smart Catch",
    "g.myDuck": "My Duck",
    "g.targets": "Target Partners",
    "g.filters": "Filters",
    "g.sessionStats": "Session Stats",
    "smart.myRarity": "Rarity",
    "smart.myLevel": "Level",
    "smart.targetRarities": "Partner Rarities",
    "smart.minLevel": "Min Level",
    "smart.maxLevel": "Max Level",
    "opt.smartCatchEnabled": "Enable Smart Catch",
    "opt.myDuckRarity": "My Duck Rarity",
    "opt.myDuckLevel": "My Duck Level",
    "opt.minPartnerLevel": "Min Partner Level",
    "opt.maxPartnerLevel": "Max Partner Level",
    "opt.onlyNewLinks": "Only New Links",
    "opt.avoidRepeatPartner": "Avoid Repeat Partner",
    "smart.scans": "Scans",
    "smart.found": "Ducks Found",
    "smart.matched": "Matched",
    "smart.opened": "Opened",
    "smart.skipDup": "Skipped (Dup)",
    "smart.skipRarity": "Skipped (Rarity)",
    "smart.skipLevel": "Skipped (Level)",
    "smart.skipRepeat": "Skipped (Repeat)",
    "smart.recentPartners": "Recent Partners",
    "smart.noPartners": "No Partners Yet",
    "smart.disabled": "Smart Catch Disabled",
    "smart.resetStats": "Reset Stats",
    "smart.confirmReset": "Reset Smart Catch Statistics?",
    "smart.startCatch": "Start Catching",
    "smart.stopCatch": "Stop",
    "smart.advanced": "All Settings",
    "rarity.targetAll": "Select All",
    "rarity.targetNone": "Select None",
  };

  const DICTS = { ru: RU, en: EN };
  let LANG = "ru";

  function detectLang() {
    try {
      const u = chrome.i18n.getUILanguage();
      return u && /^ru|be|uk|kk/i.test(u) ? "ru" : "en";
    } catch {
      return "ru";
    }
  }

  function t(key, vars) {
    const d = DICTS[LANG] || DICTS.ru;
    let s = d[key] || DICTS.ru[key] || key;
    if (vars) {
      for (const k of Object.keys(vars)) {
        s = s.split("{" + k + "}").join(String(vars[k]));
      }
    }
    return s;
  }

  function apply(root) {
    root = root || document;
    root.querySelectorAll("[data-i18n]").forEach(el => {
      el.textContent = t(el.dataset.i18n);
    });
    root.querySelectorAll("[data-i18n-ph]").forEach(el => {
      el.setAttribute("placeholder", t(el.dataset.i18nPh));
    });
    root.querySelectorAll("[data-i18n-tip]").forEach(el => {
      el.setAttribute("data-tip", t(el.dataset.i18nTip));
    });
  }

  function applyTheme(mode) {
    const m = mode || "auto";
    let eff = m;
    if (m === "auto") {
      try {
        eff = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
      } catch {
        eff = "dark";
      }
    }
    document.documentElement.dataset.theme = eff;
  }

  async function init() {
    try {
      const s = await chrome.storage.sync.get({ lang: "auto", theme: "auto" });
      LANG = !s.lang || s.lang === "auto" ? detectLang() : s.lang;
      applyTheme(s.theme);
      if (s.theme === "auto") {
        try {
          window
            .matchMedia("(prefers-color-scheme: light)")
            .addEventListener("change", () => applyTheme("auto"));
        } catch {}
      }
    } catch {
      LANG = detectLang();
      applyTheme("auto");
    }
    apply();
  }

  window.DC_I18N = { t, apply, init, applyTheme, get lang() { return LANG; } };
})();
