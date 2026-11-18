(() => {
  "use strict";

  const PRODUCT_ID = "physics-studio";
  const CODE_PREFIX = "PSA1";
  const MAX_CODE_LENGTH = 4096;
  const PUBLIC_KEY = window.PHYSICS_STUDIO_ACTIVATION_PUBLIC_KEY;
  const LEGACY_PUBLIC_KEYS = Object.freeze([Object.freeze({
    version: 1,
    product: "physics-studio",
    algorithm: "ECDSA_P256_SHA256",
    spkiBase64: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEN9D2Z6eiihQsZxjoCsKUBM9UNUy6eVJyuQBNUYpuvUxi4aU7SzGgsNsvJW/65ke0tFvnvMe/po07kEaYLJN39Q==",
    fingerprintSha256: "1B8228FB76BA1D1ABE0A01187BC0A9C0E7129FF2F98432C1220C95FC449038F4"
  })]);
  let importedPublicKeysPromise = null;
  // v4.3 removes product licensing. Keep the legacy signature-verification
  // API for old backups/tools, but never read a device ID or a stored code on
  // startup. This is access policy, not a fabricated successful signature.
  const whenReady = Promise.resolve(Object.freeze({ required: false, mode: "open" }));

  const api = Object.freeze({
    version: "3.0.0",
    required: false,
    whenReady,
    whenActivated: whenReady,
    validateCode,
    formatDeviceRequest,
    publicKeyFingerprint: PUBLIC_KEY?.fingerprintSha256 || ""
  });
  window.PhysicsStudioActivation = api;

  function start() {
    document.body?.classList.remove("activation-pending");
    document.getElementById?.("activationGate")?.remove();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else if (document.body) {
    start();
  }

  function assertPublicKeyConfiguration() {
    if (!PUBLIC_KEY
      || PUBLIC_KEY.version !== 1
      || PUBLIC_KEY.product !== PRODUCT_ID
      || PUBLIC_KEY.algorithm !== "ECDSA_P256_SHA256"
      || !/^[A-F0-9]{64}$/.test(PUBLIC_KEY.fingerprintSha256 || "")
      || !PUBLIC_KEY.spkiBase64) {
      throw new Error("发布公钥缺失或格式错误，请联系软件所有者重新安装正式版本。");
    }
    if (!window.crypto?.subtle) {
      throw new Error("当前系统不支持必要的数字签名校验，请升级 Android System WebView 或 Microsoft Edge WebView2。");
    }
  }

  async function validateCode(rawCode, expectedDeviceId) {
    assertPublicKeyConfiguration();
    const code = String(rawCode || "").replace(/\s+/g, "");
    if (code.length < 80 || code.length > MAX_CODE_LENGTH) {
      throw new Error("激活码长度不正确。");
    }
    const parts = code.split(".");
    if (parts.length !== 3 || parts[0] !== CODE_PREFIX) {
      throw new Error("激活码前缀或分段格式错误。");
    }
    const payloadBytes = fromBase64Url(parts[1]);
    const signature = fromBase64Url(parts[2]);
    if (signature.length !== 64) throw new Error("激活码签名长度错误。");

    let payload;
    try {
      payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(payloadBytes));
    } catch {
      throw new Error("激活码载荷不是有效的 UTF-8 JSON。");
    }
    validatePayload(payload, expectedDeviceId);

    const publicKeys = await importPublicKeys();
    const verificationResults = await Promise.all(publicKeys.map(({ publicKey, fingerprint }) => {
      if (payload.kid && payload.kid !== fingerprint.slice(0, 16)) return false;
      return crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        publicKey,
        signature,
        payloadBytes
      );
    }));
    const valid = verificationResults.some(Boolean);
    if (!valid) throw new Error("数字签名校验失败；该激活码不是由可信所有者签发。");
    return Object.freeze({ ...payload });
  }

  function validatePayload(payload, expectedDeviceId) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("激活码载荷格式错误。");
    }
    const allowed = new Set(["v", "product", "licenseId", "device", "issuedAt", "expiresAt", "note", "kid", "scope"]);
    const unknown = Object.keys(payload).filter((key) => !allowed.has(key));
    if (unknown.length) throw new Error("激活码包含不支持的字段。");
    if (payload.v !== 1 || payload.product !== PRODUCT_ID) {
      throw new Error("激活码不适用于当前产品或版本。");
    }
    if (!/^[a-f0-9]{32}$/.test(String(payload.licenseId || ""))) {
      throw new Error("激活码编号格式错误。");
    }
    if (payload.scope === "portable") {
      if (payload.device !== undefined && payload.device !== null) {
        throw new Error("便携激活码不得包含设备绑定字段。");
      }
    } else if (payload.scope === undefined) {
      const actualDevice = normalizeDeviceId(payload.device);
      const expected = normalizeDeviceId(expectedDeviceId);
      if (actualDevice !== expected) {
        throw new Error("该激活码绑定的是另一台设备。");
      }
    } else {
      throw new Error("激活码包含不支持的授权范围。");
    }
    if (payload.kid !== undefined && !/^[A-F0-9]{16}$/.test(payload.kid)) {
      throw new Error("激活码密钥标识格式错误。");
    }
    const issuedAt = Date.parse(payload.issuedAt);
    if (!Number.isFinite(issuedAt) || issuedAt > Date.now() + 5 * 60 * 1000) {
      throw new Error("激活码签发时间无效。");
    }
    if (payload.expiresAt !== null) {
      const expiresAt = Date.parse(payload.expiresAt);
      if (!Number.isFinite(expiresAt) || expiresAt <= issuedAt) {
        throw new Error("激活码有效期格式错误。");
      }
      if (expiresAt < Date.now()) throw new Error("激活码已过期。");
    }
    if (typeof payload.note !== "string" || payload.note.length > 100) {
      throw new Error("激活码备注格式错误。");
    }
  }

  function importPublicKeys() {
    if (!importedPublicKeysPromise) {
      const trusted = [PUBLIC_KEY, ...(PUBLIC_KEY.historicalPublicKeys || []), ...LEGACY_PUBLIC_KEYS].filter((key, index, keys) => {
        return key?.spkiBase64
          && keys.findIndex((candidate) => candidate?.spkiBase64 === key.spkiBase64) === index;
      });
      importedPublicKeysPromise = Promise.all(trusted.map((key) => {
        return crypto.subtle.importKey(
          "spki",
          base64ToBytes(key.spkiBase64),
          { name: "ECDSA", namedCurve: "P-256" },
          false,
          ["verify"]
        ).then((publicKey) => ({ publicKey, fingerprint: key.fingerprintSha256 }));
      }));
    }
    return importedPublicKeysPromise;
  }

  function normalizeDeviceId(value) {
    const normalized = String(value || "").replace(/[^0-9a-f]/gi, "").toUpperCase();
    if (!/^[A-F0-9]{64}$/.test(normalized)) {
      throw new Error("无法取得有效的64位设备摘要。");
    }
    return normalized;
  }

  function formatDeviceRequest(deviceId) {
    const normalized = normalizeDeviceId(deviceId);
    return `PSDEV-${normalized.match(/.{8}/g).join("-")}`;
  }

  function fromBase64Url(value) {
    if (!/^[A-Za-z0-9_-]+$/.test(value || "")) throw new Error("激活码包含无效的 Base64URL 字符。");
    const padding = value.length % 4;
    if (padding === 1) throw new Error("激活码 Base64URL 长度错误。");
    return base64ToBytes(value.replace(/-/g, "+").replace(/_/g, "/") + (padding ? "=".repeat(4 - padding) : ""));
  }

  function base64ToBytes(value) {
    let binary;
    try {
      binary = atob(value);
    } catch {
      throw new Error("激活码 Base64 数据损坏。");
    }
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  }

  function toBase64Url(bytes) {
    let binary = "";
    bytes.forEach((value) => { binary += String.fromCharCode(value); });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function bytesToHex(bytes) {
    return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("").toUpperCase();
  }
})();
