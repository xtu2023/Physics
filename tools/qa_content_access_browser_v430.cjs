"use strict";
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { launchBrowser } = require("./browser-launcher.cjs");
const root = path.resolve(__dirname, "..");
const url = pathToFileURL(path.join(root, "index.html")).href;

async function ready(page) {
  await page.waitForFunction(() => globalThis.PhysicsStudioApp?.getQuestions?.().length >= 1897
    && globalThis.PhysicsExperience, null, { timeout: 30000 });
}
async function openQuestion(page, questionId) {
  await page.evaluate((id) => document.dispatchEvent(new CustomEvent("physics-studio-start-learning", { detail: { questionId: id } })), questionId);
  await page.locator("#labFinalAnswer").waitFor();
}
async function checkStudent(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    globalThis.PHYSICS_STUDIO_APP_EDITION = "student";
    localStorage.setItem("physics-experience-v2", JSON.stringify({ version: 2, onboarded: true, role: "student",
      displayName: "QA", grade: "高一", textbook: "沪科版", goal: "日常巩固", events: [], activeDates: [] }));
  });
  try {
    await page.goto(url); await ready(page);
    await page.locator('.student-bottom-nav [data-student-view="course"]').click();
    assert.match(await page.locator("[data-curriculum-edition-status]").innerText(), /未完成该版教材映射/);
    const questionId = "cs-original-1500-h1-0001";
    await openQuestion(page, questionId);
    await page.locator("#labFinalAnswer").fill("我的未提交答案 10 m/s");
    await page.locator("#model-object").fill("同一运动物体");
    await page.locator('[data-lab-action="save-practice-draft"]').click();
    await page.waitForFunction(() => document.getElementById("practiceDraftStatus")?.textContent.includes("草稿已保存"));
    assert.equal(await page.evaluate(() => PHYSICS_LEARNING_ENGINE.loadState().attempts.length), 0);
    await context.setOffline(true);
    await page.reload(); await ready(page);
    await openQuestion(page, questionId);
    assert.equal(await page.locator("#labFinalAnswer").inputValue(), "我的未提交答案 10 m/s");
    assert.equal(await page.locator("#model-object").inputValue(), "同一运动物体");
    await page.locator('.answer-actions [data-lab-tab="models"]').click();
    await page.locator('[data-model-type="uniform"]').click();
    await page.locator('[data-lab-action="begin-inquiry"]').click();
    await page.locator("#inquiryPrediction").fill("3秒时速度为零，位移9米，加速度仍向负方向");
    await page.locator("#inquiryReason").fill("以初速度为正，a恒定，使用v=v0+at和x=v0t+at²/2");
    await page.locator('[data-lab-action="predict-inquiry"]').click();
    await page.locator('[data-lab-action="observe-inquiry"]').waitFor();
    assert.match(await page.locator("#labModelOutput").innerText(), /先保存预测/);
    await page.locator('[data-lab-action="observe-inquiry"]').click();
    await page.locator("#inquiryExplanation").fill("v=0不等于a=0；这组输出只验证恒加速度理想模型，不是实测。");
    await page.locator('[data-lab-action="explain-inquiry"]').click();
    await page.waitForFunction(() => PHYSICS_LEARNING_ENGINE.loadState().experimentRecords.some((r) => r.type === "guided-inquiry" && r.status === "awaiting-transfer"));
    const result = await page.evaluate(() => {
      const state = PHYSICS_LEARNING_ENGINE.loadState();
      const record = state.experimentRecords.find((r) => r.type === "guided-inquiry");
      return { attempts: state.attempts.length, output: record.observations[0].output, grading: record.grading };
    });
    assert.equal(result.attempts, 0);
    assert.equal(result.output.velocity, 0);
    assert.equal(result.output.position, 9);
    assert.equal(result.grading.status, "review-required");
    assert.equal(result.grading.score, null);
    for (const viewport of [{ width: 390, height: 844 }, { width: 360, height: 800 }]) {
      await page.setViewportSize(viewport);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    }
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
}

async function checkTeacher(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    globalThis.PHYSICS_STUDIO_APP_EDITION = "teacher";
    // Fixture: already unlocked session. Real PIN tests run in qa_teacher_lock.
    sessionStorage.setItem("physics-teacher-mode-session-v1", "unlocked");
    localStorage.setItem("physics-experience-v2", JSON.stringify({ version: 2, onboarded: true, role: "teacher",
      displayName: "QA", grade: "高一", textbook: "人教版", goal: "日常巩固", events: [], activeDates: [] }));
  });
  try {
    await page.goto(url); await ready(page);
    const id = await page.evaluate(async () => {
      const engine = PHYSICS_LEARNING_ENGINE;
      const state = engine.loadState();
      const question = PhysicsStudioApp.getQuestions().find((q) => q.grade === "高一" && q.autoScorable === false);
      const attempt = engine.recordAttempt(state, { question, questionId: question.id, finalAnswer: "实验数据和解释的原始答案",
        grading: { status: "review-required", score: null }, model: { object: "实验小车" } });
      const sequence = PhysicsStudioTeachingSequences;
      const inquiry = sequence.beginInquiry(state, "uniform", "速度零，加速度非零", "使用v=v0+at并保持加速度恒定");
      sequence.observeInquiry(state, inquiry.id, sequence.inquiries.uniform.params);
      sequence.explainInquiry(state, inquiry.id, "位置9m，速度零，但加速度仍为−2m/s²");
      engine.saveState(state); await engine.awaitLastSave();
      document.dispatchEvent(new CustomEvent("physics-learning-state-changed", { detail: { restored: true } }));
      return attempt.id;
    });
    await page.locator('#teacherExperienceBar [data-teacher-action="center"]').click();
    const article = page.locator(`[data-review-attempt="${id}"]`);
    await article.waitFor();
    await article.locator("[data-review-comment]").fill("需要补充控制变量");
    await article.locator("[data-review-partial-score]").fill("0.7");
    await article.locator('[data-review-status="partial"]').click();
    await page.waitForFunction((id) => PHYSICS_LEARNING_ENGINE.loadState().attempts.find((a) => a.id === id)?.grading.score === 0.7, id);
    await page.getByText("最近已批阅与改分记录（1 份）", { exact: true }).click();
    await article.locator("[data-review-comment]").fill("复查原草稿已说明控制变量，修正评分");
    await article.locator('[data-review-status="correct"]').click();
    await page.waitForFunction((id) => PHYSICS_LEARNING_ENGINE.loadState().attempts.find((a) => a.id === id)?.reviewRevision === 2, id);
    await page.getByText("最近已批阅与改分记录（1 份）", { exact: true }).click();
    await article.locator("[data-review-comment]").fill("撤销此次改分，等待进一步核验");
    await article.locator('[data-lab-action="undo-manual-review"]').click();
    await page.waitForFunction((id) => PHYSICS_LEARNING_ENGINE.loadState().attempts.find((a) => a.id === id)?.reviewRevision === 3, id);
    const result = await page.evaluate((id) => PHYSICS_LEARNING_ENGINE.loadState().attempts.find((a) => a.id === id), id);
    assert.equal(result.grading.score, 0.7);
    assert.equal(result.gradingHistory.length, 3);
    assert.equal(result.gradingHistory[0].previous.status, "review-required");
    assert.ok(result.questionSnapshot.content.length > 0);
    const inquiryReview = page.locator('[data-inquiry-review]').first();
    await inquiryReview.locator('summary').click();
    await inquiryReview.locator('[data-inquiry-review-comment]').fill('已核对坐标方向和恒加速度条件；请延迟独立复测。');
    await inquiryReview.locator('[data-decision="checked"]').click();
    await page.waitForFunction(() => PHYSICS_LEARNING_ENGINE.loadState().experimentRecords[0]?.teacherFeedback?.decision === 'checked');
    assert.equal(await page.evaluate(() => PHYSICS_LEARNING_ENGINE.loadState().attempts.length), 1);
  } finally { await context.close(); }
}

(async () => {
  const browser = await launchBrowser({ headless: true, args: ["--allow-file-access-from-files"] });
  try {
    await checkStudent(browser);
    await checkTeacher(browser);
    console.log(JSON.stringify({ status: "passed", offlineDraftResume: true, inquiryPredictionToExplanation: true,
      reviewRevisionAndUndoUI: true, unscoredInquiryExcluded: true, viewports: ["390x844", "360x800", "1280x800"] }));
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
