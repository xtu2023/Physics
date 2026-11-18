const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const lockSource = fs.readFileSync(path.join(__dirname, "..", "teacher-mode-lock.js"), "utf8");
const shellSource = fs.readFileSync(path.join(__dirname, "..", "experience-shell.js"), "utf8");
const labSource = fs.readFileSync(path.join(__dirname, "..", "learning-lab.js"), "utf8");
assert.match(lockSource, /PBKDF2/);
assert.match(lockSource, /SHA-256/);
assert.match(lockSource, /getRandomValues/);
assert.match(lockSource, /sessionStorage/);
assert.match(lockSource, /physics-teacher-mode-lock-v1/);
assert.doesNotMatch(lockSource, /setItem\([^,]+,\s*pin\)/i, "PIN must not be written as plaintext");
assert.match(shellSource, /async function ensureTeacherUnlocked/);
assert.match(shellSource, /window\.PhysicsStudioTeacherLock\.isUnlocked/);
assert.match(shellSource, /data-teacher-action="lock"/);
assert.match(labSource, /PhysicsStudioTeacherLock.*isUnlocked/);

async function runtimeChecks() {
  const vm = require("node:vm");
  const crypto = require("node:crypto").webcrypto;
  const records = new Map();
  const sessions = new Map();
  const adapter = (map) => ({ getItem: (key) => map.get(key) || null,
    setItem: (key, value) => map.set(key, value), removeItem: (key) => map.delete(key) });
  let now = Date.now();
  class Clock extends Date { static now() { return now; } }
  function load() {
    const context = { crypto, TextEncoder, Date: Clock, btoa, atob, Uint8Array,
      localStorage: adapter(records), sessionStorage: adapter(sessions) };
    context.window = context;
    vm.createContext(context);
    vm.runInContext(lockSource, context);
    return context.PhysicsStudioTeacherLock;
  }
  const lock = load();
  await lock.setup("763291");
  assert.equal(lock.isUnlocked(), true);
  assert.ok(!records.get("physics-teacher-mode-lock-v1").includes("763291"));
  lock.lock();
  await assert.rejects(lock.setup("123456"), /先解锁/);
  for (let i = 0; i < 5; i++) assert.equal(await lock.unlock("111111"), false);
  assert.equal(lock.status().retryAfterSeconds, 60);
  assert.equal(await lock.unlock("763291"), false, "correct PIN must not bypass active cooldown");
  const reopened = load();
  assert.equal(reopened.status().retryAfterSeconds, 60, "reload must not reset cooldown");
  now += 60001;
  assert.equal(await reopened.unlock("763291"), true);
  assert.equal(reopened.status().retryAfterSeconds, 0);
  reopened.lock();
  assert.equal(reopened.isUnlocked(), false);
  console.log(JSON.stringify({ status: "passed", pinStorage: "PBKDF2+salt", sessionUnlock: true,
    roleSwitchGate: true, lockAction: true, retryLimitAndRecovery: true, resetBypassBlocked: true }, null, 2));
}
runtimeChecks().catch((error) => { console.error(error); process.exitCode = 1; });
