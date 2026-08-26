(() => {
  "use strict";

  let beepUrl = null;

  function getBeepUrl() {
    if (beepUrl) return beepUrl;
    try {
      const sr = 22050;
      const durSec = 0.3;
      const n = Math.round(sr * durSec);
      const buf = new ArrayBuffer(44 + n * 2);
      const v = new DataView(buf);
      const wstr = (off, s) => {
        for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
      };
      wstr(0, "RIFF");
      v.setUint32(4, 36 + n * 2, true);
      wstr(8, "WAVE");
      wstr(12, "fmt ");
      v.setUint32(16, 16, true);
      v.setUint16(20, 1, true);
      v.setUint16(22, 1, true);
      v.setUint32(24, sr, true);
      v.setUint32(28, sr * 2, true);
      v.setUint16(32, 2, true);
      v.setUint16(34, 16, true);
      wstr(36, "data");
      v.setUint32(40, n * 2, true);
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const env = Math.exp(-t * 12);
        v.setInt16(
          44 + i * 2,
          Math.round(Math.sin(2 * Math.PI * 660 * t) * env * 0.35 * 32767),
          true
        );
      }
      beepUrl = URL.createObjectURL(
        new Blob([buf], { type: "audio/wav" })
      );
    } catch {
      beepUrl = null;
    }
    return beepUrl;
  }

  function playNotificationSound() {
    try {
      const url = getBeepUrl();
      if (!url) return;
      const audio = new Audio(url);
      audio.volume = 0.5;
      audio.play().catch(() => {});
    } catch {
      // ignore
    }
  }

  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === "PLAY_SOUND") {
      playNotificationSound();
    }
  });

  setInterval(() => {
    try {
      chrome.runtime.sendMessage({ type: "DC_HEART" }).catch(() => {});
    } catch {
      // ignore
    }
  }, 1000);
})();
