"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const context = { console, Date, Math, JSON, Object, Array, Map, Set, RegExp, String, Number, Boolean,
  crypto: crypto.webcrypto, document: { addEventListener() {} }, addEventListener() {} };
context.window = context;
context.globalThis = context;
vm.createContext(context);
for (const file of ["curriculum-taxonomy.js", "curriculum-mapping.js", "solution-format.js", "answer-schema.js",
  "curriculum-bank.js", "mock-exam-bank.js", "original-practice-bank.js", "targeted-practice-bank.js",
  "physics-visuals.js", "teaching-sequences.js", "learning-engine.js", "app.js", "backup-validator.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
}
const engine = context.PHYSICS_LEARNING_ENGINE;
const all = [context.PHYSICS_CURRICULUM_BANK, context.PHYSICS_MOCK_EXAM_BANK,
  context.PHYSICS_ORIGINAL_PRACTICE_BANK, context.PHYSICS_TARGETED_PRACTICE_BANK].flatMap((bank) => bank.questions);
assert.equal(all.length, 1897);
assert.equal(new Set(all.map((q) => q.id)).size, 1897);
const targeted = context.PHYSICS_TARGETED_PRACTICE_BANK;
for (const parts of [2, 3, 4, 5, 6, 10, 1000]) {
  const q = targeted.densityCutPayload(parts);
  assert.equal(q.modelParams.parts, parts);
  assert.ok(q.content.includes(`${parts} 块`));
  assert.ok(q.steps.some((line) => line.includes(`m/${parts}`) && line.includes(`V/${parts}`)));
  assert.ok(q.answer.includes(`${parts} 块`));
  assert.ok(!q.steps.some((line) => /减半|两块/.test(line)));
}
for (const parts of [0, -1, 1.5, "3", 1001, NaN]) assert.throws(() => targeted.densityCutPayload(parts));
const revised = targeted.questions.filter((q) => q.contentRevision === 2);
assert.equal(revised.length, 5);
const preserve = vm.runInContext("preserveBundledRevision", context);
const before = { ...revised[1], contentRevision: undefined, contentVersion: undefined,
  solution: "每块质量减半，两块密度相同", notes: "保留原笔记" };
const history = preserve(before, revised[1]);
assert.equal(history.previousContentRevisions.length, 1);
assert.equal(history.previousContentRevisions[0].solution, before.solution);
assert.equal(history.contentRevision, 2);
assert.equal(preserve({ ...revised[1], ...history }, revised[1]).previousContentRevisions.length, 1);
assert.equal(Object.keys(preserve({ ...before, userEdited: true }, revised[1])).length, 0);

// The JSON import schema must accept the actual published bank, not just a tiny fixture.
const backupPayload = { format: "physics-studio-backup", version: 4, exportedAt: new Date().toISOString(),
  questions: all.map((q) => q.id === revised[1].id ? { ...q, ...history } : q) };
const validation = context.PhysicsStudioBackupValidator.validate(backupPayload);
assert.equal(validation.valid, true, JSON.stringify(validation.errors?.slice(0, 5)));

const state = engine.defaultState();
state.profiles.push({ ...state.profiles[0], id: "student-b", portableProfileId: crypto.randomUUID() });
const question = all.find((q) => q.autoScorable === true);
const draft = { questionId: question.id, finalAnswer: "尚未提交的答案", model: { object: "物块" }, hintLevel: 2, elapsedSeconds: 35 };
engine.savePracticeDraft(state, question, draft);
assert.equal(state.attempts.length, 0, "draft must not become scored evidence");
assert.equal(engine.getPracticeDraft(state, question.id, "student-b"), null);
assert.throws(() => engine.savePracticeDraft(state, question, draft, "missing-student"));
const migrated = engine.normalizeState(JSON.parse(JSON.stringify(state)));
assert.equal(migrated.version, 10);
assert.equal(engine.getPracticeDraft(migrated, question.id).finalAnswer, draft.finalAnswer);
engine.savePracticeDraft(migrated, question, { ...draft, finalAnswer: "学生B答案" }, "student-b");
engine.removePracticeDraft(migrated, question.id);
assert.equal(migrated.practiceDrafts.length, 1);
assert.equal(migrated.practiceDrafts[0].profileId, "student-b");

const attempt = engine.recordAttempt(state, { question, questionId: question.id, questionType: "实验题",
  finalAnswer: "实验解释", grading: { status: "review-required", score: null }, model: { object: "小车" } });
assert.equal(attempt.difficulty, question.difficulty);
assert.equal(attempt.questionSnapshot.id, question.id);
assert.equal(attempt.questionType, "实验题");
assert.equal(engine.isValidAccuracyEvidence(attempt), false);
engine.completeManualReview(state, attempt.id, { status: "partial", score: 0.6, summary: "条件未说明", expectedRevision: 0 });
assert.equal(attempt.gradingHistory.length, 1);
assert.throws(() => engine.completeManualReview(state, attempt.id, { status: "correct", score: 1, allowRevision: true, expectedRevision: 0 }));
engine.completeManualReview(state, attempt.id, { status: "correct", score: 1, allowRevision: true, summary: "原草稿已含条件，修正评分", expectedRevision: 1 });
assert.equal(attempt.gradingHistory[1].previous.score, 0.6);
engine.undoManualReview(state, attempt.id, 2, "撤销误操作");
assert.equal(attempt.grading.score, 0.6);
assert.equal(attempt.gradingHistory.length, 3);
assert.throws(() => engine.undoManualReview(state, attempt.id, 3, "不能重复撤销"));
const pending = engine.recordAttempt(state, { questionId: question.id, grading: { status: "review-required", score: null } });
engine.completeManualReview(state, pending.id, { status: "correct", score: 1 });
engine.undoManualReview(state, pending.id, 1, "需要进一步核验");
assert.equal(engine.isPendingManualReview(pending), true);
assert.equal(engine.isValidAccuracyEvidence(pending), false);
assert.throws(() => engine.completeManualReview(state, pending.id, { status: "correct", score: 0.5 }));

const visual = context.PHYSICS_VISUALS;
const staticIncline = visual.inclineMotion({ angle: 10, mu: 0.5 });
assert.equal(staticIncline.regime, "static");
assert.equal(staticIncline.acceleration, 0);
assert.equal(staticIncline.friction, staticIncline.gravityAlong);
assert.ok(staticIncline.friction < staticIncline.staticLimit);
const sliding = visual.inclineMotion({ angle: 30, mu: 0.2, g: 10 });
assert.ok(Math.abs(sliding.acceleration - (5 - Math.sqrt(3))) < 1e-10);
assert.throws(() => visual.inclineMotion({ angle: 90 }));
assert.throws(() => visual.inclineMotion({ mu: 0.5, muStatic: 0.2 }));

const sequences = context.PhysicsStudioTeachingSequences;
for (const [model, task] of Object.entries(sequences.inquiries)) {
  const count = state.attempts.length;
  assert.throws(() => sequences.beginInquiry(state, model, "", ""));
  const record = sequences.beginInquiry(state, model, "我的预测", "依据及模型条件", "original-question");
  assert.throws(() => sequences.explainInquiry(state, record.id, "不能跳过观察"));
  sequences.observeInquiry(state, record.id, task.params);
  sequences.explainInquiry(state, record.id, "比较预测与记录，并说明条件");
  assert.equal(record.grading.status, "review-required");
  assert.equal(record.grading.score, null);
  assert.equal(state.attempts.length, count, "simulation viewing must not mint practice evidence");
  const evidence = engine.recordAttempt(state, { question, questionId: question.id,
    grading: { status: "review-required", score: null } });
  sequences.linkInquiryAttempt(state, record.id, evidence.id);
  assert.ok(record.transferEvidenceIds.includes(evidence.id));
  assert.equal(record.verificationStatus, "待教师复核");
  const attemptsBeforeReview = state.attempts.length;
  sequences.reviewInquiry(state, record.id, { decision: "checked", comment: "已按记录核对条件，另题仍须独立复测", expectedRevision: 0 });
  assert.equal(record.reviewHistory.length, 1);
  assert.equal(record.teacherFeedback.decision, "checked");
  assert.equal(record.grading.score, null);
  assert.equal(state.attempts.length, attemptsBeforeReview);
  assert.throws(() => sequences.reviewInquiry(state, record.id, { decision: "checked", comment: "旧版本不得覆盖", expectedRevision: 0 }));
  const oldProfile = state.activeProfileId;
  state.activeProfileId = "student-b";
  assert.throws(() => sequences.linkInquiryAttempt(state, record.id, evidence.id));
  state.activeProfileId = oldProfile;
}
const labSource = fs.readFileSync(path.join(root, "learning-lab.js"), "utf8");
assert.match(labSource.slice(labSource.indexOf("function deleteProfileLearningData()"), labSource.indexOf("function openDataHealthTarget")), /"practiceDrafts"/, "privacy deletion must include saved practice drafts");
assert.equal(sequences.inquiryOutput("uniform", sequences.inquiries.uniform.params).velocity, 0);
assert.equal(sequences.inquiryOutput("uniform", sequences.inquiries.uniform.params).acceleration, -2);
assert.equal(sequences.inquiryOutput("circuit", sequences.inquiries.circuit.params).totalCurrent, 1);
assert.equal(sequences.inquiryOutput("wave", sequences.inquiries.wave.params).wavelength, 4);
assert.match(context.PHYSICS_CURRICULUM_MAPPING.editionStatus("沪科版").message, /未完成该版教材映射/);
assert.equal(context.PHYSICS_CURRICULUM_MAPPING.editionStatus("人教版").mapped, true);

console.log(JSON.stringify({ status: "passed", publishedQuestions: all.length, revisedDensityQuestions: revised.length,
  backupSchemaFullBank: validation.valid, practiceDraftIsolation: true, reviewAuditAndUndo: true,
  guidedInquiries: Object.keys(sequences.inquiries).length,
  exactSectionMappings: all.filter((q) => q.curriculumReviewStatus === "catalog-exact").length,
  unresolvedSectionMappings: all.filter((q) => q.curriculumReviewStatus !== "catalog-exact").length,
  autoScorable: all.filter((q) => q.autoScorable === true).length,
  manualReview: all.filter((q) => q.autoScorable !== true).length }, null, 2));
