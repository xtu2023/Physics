"use strict";

// Product licensing was removed in v4.3. Test the real startup without a
// license stub or private key; legacy signature tests remain separate.
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { launchBrowser } = require("./browser-launcher.cjs");
const root = path.resolve(__dirname, "..");

(async () => {
  const browser = await launchBrowser({ headless: true, args: ["--allow-file-access-from-files"] });
  try {
    for (const edition of ["student", "teacher", "legacy"]) {
      const context = await browser.newContext({ viewport: edition === "student" ? { width: 390, height: 844 } : { width: 1280, height: 800 } });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.addInitScript((editionName) => {
        globalThis.PHYSICS_STUDIO_APP_EDITION = editionName;
        globalThis.__nativeLicenseCalls = 0;
        globalThis.AndroidBridge = {
          getDeviceId() { globalThis.__nativeLicenseCalls++; throw new Error("must not request device ID"); },
          getActivationCode() { globalThis.__nativeLicenseCalls++; return "expired-or-malformed-legacy-code"; }
        };
        localStorage.setItem("physics-studio-activation-v1", "legacy-untouched");
        localStorage.setItem("physics-experience-v2", JSON.stringify({ version: 2, onboarded: true,
          role: editionName === "teacher" ? "teacher" : "student", displayName: "QA", grade: "高一",
          textbook: "人教版", goal: "日常巩固", events: [], activeDates: [] }));
      }, edition);
      await page.goto(pathToFileURL(path.join(root, "index.html")).href);
      await page.waitForFunction(() => globalThis.PhysicsStudioApp?.getQuestions?.().length >= 1897, null, { timeout: 30000 });
      assert.equal(await page.locator("#activationGate, #activationCode").count(), 0);
      const initial = await page.evaluate(() => ({ required: PhysicsStudioActivation.required,
        nativeCalls: globalThis.__nativeLicenseCalls,
        legacyCode: localStorage.getItem("physics-studio-activation-v1"),
        teacherUnlocked: globalThis.PhysicsStudioTeacherLock?.isUnlocked() || false,
        stateVersion: PHYSICS_LEARNING_ENGINE.loadState().version }));
      assert.equal(initial.required, false);
      assert.equal(initial.nativeCalls, 0);
      assert.equal(initial.legacyCode, "legacy-untouched");
      assert.equal(initial.teacherUnlocked, false, "removing activation must not unlock teacher management");
      assert.equal(initial.stateVersion, 10);
      await context.setOffline(true);
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => globalThis.PhysicsStudioApp?.getQuestions?.().length >= 1897, null, { timeout: 30000 });
      assert.equal(await page.locator("#activationGate").count(), 0);
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log(JSON.stringify({ status: "passed", editions: ["student", "teacher", "Windows-shared"],
      noActivationStub: true, coldStart: true, offlineReload: true, legacyDataRetained: true, teacherPinPreserved: true }));
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
