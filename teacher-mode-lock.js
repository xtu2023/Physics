(() => {
  "use strict";

  const STORAGE_KEY = "physics-teacher-mode-lock-v1";
  const SESSION_KEY = "physics-teacher-mode-session-v1";
  const RETRY_KEY = "physics-teacher-mode-retries-v1";
  const ITERATIONS = 150000;
  let unlocked = false;
  let unlocking = false;

  // This is a shared-device privacy lock, not server authentication. Keep the
  // bounded cooldown across reloads; never persist PINs or attempted PINs.
  function retryState() {
    try {
      const value = JSON.parse(storage()?.getItem(RETRY_KEY) || "{}");
      return { failures: Math.min(100, Math.max(0, Number(value.failures) || 0)),
        blockedUntil: Math.min(Date.now() + 300000, Math.max(0, Number(value.blockedUntil) || 0)) };
    } catch (_) { return { failures: 0, blockedUntil: 0 }; }
  }

  function retryAfterSeconds() {
    return Math.max(0, Math.ceil((retryState().blockedUntil - Date.now()) / 1000));
  }

  function failedAttempt() {
    const value = retryState();
    value.failures += 1;
    value.blockedUntil = value.failures >= 5
      ? Date.now() + Math.min(300000, 60000 * (value.failures - 4)) : 0;
    storage().setItem(RETRY_KEY, JSON.stringify(value));
  }

  function storage() {
    return window.PhysicsStudioStorageRepository || window.localStorage;
  }

  function readLock() {
    try {
      const value = JSON.parse(storage()?.getItem(STORAGE_KEY) || "null");
      return value && typeof value === "object" && value.salt && value.hash ? value : null;
    } catch (_) {
      return null;
    }
  }

  function bytesToBase64(bytes) {
    let binary = "";
    new Uint8Array(bytes).forEach((item) => { binary += String.fromCharCode(item); });
    return btoa(binary);
  }

  function base64ToBytes(value) {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  }

  async function derive(pin, salt, iterations = ITERATIONS) {
    if (!window.crypto?.subtle || !window.TextEncoder) throw new Error("当前环境不支持教师 PIN 加密。");
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
    return crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, key, 256);
  }

  function constantTimeEqual(a, b) {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let index = 0; index < a.length; index += 1) diff |= a[index] ^ b[index];
    return diff === 0;
  }

  function pinValid(pin) {
    return /^\d{6,12}$/.test(String(pin || ""));
  }

  const api = {
    hasPin() { return Boolean(storage()?.getItem(STORAGE_KEY)); },
    isUnlocked() {
      if (unlocked) return true;
      try { return sessionStorage.getItem(SESSION_KEY) === "unlocked"; } catch (_) { return false; }
    },
    async setup(pin) {
      if (api.hasPin() && !api.isUnlocked()) throw new Error("请先解锁现有教师 PIN，不能通过重新设置绕过锁定。");
      if (!pinValid(pin)) throw new Error("PIN需为6至12位数字。");
      if (!storage()?.setItem) throw new Error("本机存储不可用，PIN未保存。");
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const hash = await derive(String(pin), salt);
      storage()?.setItem(STORAGE_KEY, JSON.stringify({ version: 1, salt: bytesToBase64(salt), hash: bytesToBase64(hash), iterations: ITERATIONS }));
      storage().removeItem(RETRY_KEY);
      unlocked = true;
      try { sessionStorage.setItem(SESSION_KEY, "unlocked"); } catch (_) { /* session storage may be unavailable in file mode */ }
      return true;
    },
    async unlock(pin) {
      if (unlocking || retryAfterSeconds() > 0) return false;
      const record = readLock();
      if (!record) return false;
      if (!pinValid(pin)) { failedAttempt(); return false; }
      unlocking = true;
      try {
        const iterations = Number(record.iterations) || ITERATIONS;
        if (!Number.isSafeInteger(iterations) || iterations < ITERATIONS || iterations > 2000000) return false;
        const actual = new Uint8Array(await derive(String(pin), base64ToBytes(record.salt), iterations));
        const ok = constantTimeEqual(actual, base64ToBytes(record.hash));
        if (ok) {
          storage().removeItem(RETRY_KEY);
          unlocked = true;
          try { sessionStorage.setItem(SESSION_KEY, "unlocked"); } catch (_) { /* ignore */ }
        } else failedAttempt();
        return ok;
      } catch (_) {
        return false;
      } finally {
        unlocking = false;
      }
    },
    lock() {
      unlocked = false;
      try { sessionStorage.removeItem(SESSION_KEY); } catch (_) { /* ignore */ }
    },
    status() { return { configured: api.hasPin(), unlocked: api.isUnlocked(), iterations: ITERATIONS,
      retryAfterSeconds: retryAfterSeconds(), scope: "local-device-only" }; }
  };

  window.PhysicsStudioTeacherLock = Object.freeze(api);
})();
