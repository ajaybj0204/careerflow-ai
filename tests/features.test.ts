import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";
import type { Database } from "@careerflow/database";
import { GeminiProvider, setAIProviderOverride, AINotConfiguredError, AIOutputError } from "@careerflow/ai";
import { readDocxParagraphs, extractText, DOCX_MIME } from "@careerflow/document-engine";
import { z } from "zod";
import {
  analyzeJdRules,
  answerQuestion,
  buildApplicationPackage,
  buildMatchReport,
  buildPrepPlan,
  checkExercise,
  checkProposedText,
  computeMetrics,
  createApplication,
  createLearningPath,
  createMatchReport,
  createTailorDraft,
  decideChange,
  detectScam,
  evaluateScenario,
  exportCoverLetter,
  finishMock,
  answerMock,
  startMockInterview,
  generateCoverLetter,
  getCareerContext,
  heuristicFeedback,
  incomeTaxNewRegime,
  rankJob,
  renderTailoredResume,
  savePostInterviewReview,
  setFactVerified,
  setStatusManually,
  setStorage,
  memoryStorage,
  suggestTailoring,
  takeHome,
  uploadMasterResume,
  buildRecommendations,
  extractOfferRules,
  readDocument,
} from "@careerflow/core";
import { createUser, freshDb } from "./helpers";
import { makeResumeDocx } from "./fixtures/resume";
import { FakeAI } from "./fixtures/ai";

let db: Database;
let user: string;
const q = <T = any>(sql: string, p: unknown[] = []) => db.withUser(user, (tx) => tx.query<T>(sql, p));

beforeAll(async () => {
  db = await freshDb();
  setStorage(memoryStorage());
});
afterAll(() => db.close());
beforeEach(async () => {
  user = await createUser(db, `f${crypto.randomUUID().slice(0, 8)}@example.test`);
  setAIProviderOverride(null); // no AI unless a test sets one
});
afterEach(() => setAIProviderOverride(undefined));

async function verifyAll() {
  await db.withUser(user, async (tx) => {
    for (const t of ["employment_history", "verified_skills", "education"] as const) {
      for (const r of await tx.query(`select id from ${t}`)) await setFactVerified(tx, t, r.id, true);
    }
  });
}

describe("master resume and career memory", () => {
  it("stores the original, extracts facts as unverified, and only verified facts reach AI context", async () => {
    const r = await uploadMasterResume(db, user, { name: "resume.docx", mime: DOCX_MIME, data: await makeResumeDocx() });
    expect(r.resume.format).toBe("docx");
    expect(r.resume.is_primary).toBe(true);
    expect(r.factsAdded).toBeGreaterThan(3);
    let ctx = await db.withUser(user, (tx) => getCareerContext(tx));
    expect(ctx.skills).toHaveLength(0); // nothing verified yet
    expect(ctx.pendingReview).toBeGreaterThan(0);
    await verifyAll();
    ctx = await db.withUser(user, (tx) => getCareerContext(tx));
    expect(ctx.skills.map((s) => s.name)).toEqual(expect.arrayContaining(["SQL", "Excel"]));
    const docs = await q("select kind from documents");
    expect(docs.map((d) => d.kind)).toEqual(["master_resume"]);
  });

  it("rejects unsafe uploads", async () => {
    await expect(uploadMasterResume(db, user, { name: "resume.pdf", mime: "application/pdf", data: Buffer.from("not a pdf") })).rejects.toThrow(/does not match/);
    await expect(uploadMasterResume(db, user, { name: "x.exe", mime: "application/x-msdownload", data: Buffer.from("MZ") })).rejects.toThrow(/not supported/);
  });
});

describe("job description analysis and matching", () => {
  const JD = `Payments Operations Analyst\nLocation: Bengaluru (Hybrid)\nExperience: 2-4 years\n\nResponsibilities\n- Monitor UPI and card transaction success rates\n- Reconciliation of settlements and chargebacks\n- Build MIS reports in Excel and SQL\n\nRequirements\n- SQL, Excel, Power BI\n- Knowledge of KYC and merchant onboarding\n- Python is a plus`;

  it("extracts structure without AI", () => {
    const a = analyzeJdRules(JD, { roleTitle: "Payments Operations Analyst" });
    expect(a.experienceMinYears).toBe(2);
    expect(a.experienceMaxYears).toBe(4);
    expect(a.workMode).toBe("hybrid");
    expect(a.location).toBe("Bengaluru");
    expect(a.requiredSkills).toEqual(expect.arrayContaining(["SQL", "Excel", "Power BI", "KYC"]));
    expect(a.responsibilities.length).toBe(3);
  });

  it("explains the match against verified facts and never predicts hiring", async () => {
    await uploadMasterResume(db, user, { name: "resume.docx", mime: DOCX_MIME, data: await makeResumeDocx() });
    await verifyAll();
    await db.withUser(user, (tx) => tx.query("update career_profiles set years_experience = 3, preferred_locations = '{Bengaluru}', target_roles = '{Payments Operations}'"));
    const { application } = await db.withUser(user, (tx) => createApplication(tx, user, { company: "Acme Pay", roleTitle: "Payments Operations Analyst", jobDescription: JD }));
    const r = await createMatchReport(db, user, application.id, JD, { company: "Acme Pay", roleTitle: "Payments Operations Analyst" });
    expect(r.report.matchedSkills).toEqual(expect.arrayContaining(["SQL", "Excel", "Power BI", "KYC"]));
    expect(r.report.experience.fit).toBe("meets");
    expect(r.report.location.fit).toBe("yes");
    expect(r.report.disclaimer).toMatch(/not a prediction/);
    expect(r.method).toBe("rules");
  });
});

describe("AI resume tailoring with the fabrication guard", () => {
  it("applies accepted edits, blocks invented skills and numbers, and preserves the template", async () => {
    const original = await makeResumeDocx();
    const { resume } = await uploadMasterResume(db, user, { name: "resume.docx", mime: DOCX_MIME, data: original });
    await verifyAll();
    const paras = await readDocxParagraphs(original);
    const summary = paras.find((p) => p.role === "summary")!;
    const bullet = paras.find((p) => p.text.startsWith("Managed MID/TID"))!;
    const bullet2 = paras.find((p) => p.text.startsWith("Onboarded"))!;
    setAIProviderOverride(
      new FakeAI({
        "resume.tailor": () => ({
          edits: [
            { paragraphIndex: summary.index, proposed: "Payments operations professional with 2 years of merchant onboarding and KYC experience.", reason: "Leads with the role's focus" },
            { paragraphIndex: bullet.index, proposed: "Managed MID/TID creation and POS device mapping using Tableau dashboards.", reason: "Adds tooling" },
            { paragraphIndex: bullet2.index, proposed: "Onboarded 900+ merchants for partner banks with complete KYC documentation.", reason: "Bigger number" },
            { paragraphIndex: paras.find((p) => p.text.startsWith("Operations Executive"))!.index, proposed: "Senior Manager | Big Bank", reason: "Promotion" },
          ],
          skillsOrder: null,
          notes: null,
        }),
      }),
    );
    const { application } = await db.withUser(user, (tx) => createApplication(tx, user, { company: "Acme Pay", roleTitle: "Payments Ops" }));
    const draftId = await db.withUser(user, (tx) => createTailorDraft(tx, user, resume.id, application.id));
    const s = await suggestTailoring(db, user, draftId, "Payments operations role. KYC, onboarding.");
    expect(s.added).toBe(3); // the locked title line was dropped entirely
    expect(s.blocked).toBe(2); // Tableau (unverified skill) and 900 (invented number)
    const [draft] = await q("select changes from tailored_resumes where id = $1", [draftId]);
    const good = draft.changes.find((c: any) => c.decision === "pending");
    const blocked = draft.changes.find((c: any) => c.issues.some((i: any) => i.kind === "new_skill"));
    expect(blocked.decision).toBe("blocked");
    await expect(db.withUser(user, (tx) => decideChange(tx, draftId, blocked.id, "accepted"))).rejects.toThrow(/blocked/);
    await db.withUser(user, (tx) => decideChange(tx, draftId, good.id, "accepted"));
    const out = await renderTailoredResume(db, user, draftId);
    expect(out.validation.appliedEdits).toBe(1);
    expect(out.validation.pdfMode).toBe("simplified");
    const docx = await db.withUser(user, (tx) => readDocument(tx, out.docxId));
    const text = await extractText(docx.data, DOCX_MIME);
    expect(text).toContain("Payments operations professional with 2 years");
    expect(text).toContain("Operations Executive | Example Payments Pvt Ltd"); // facts unchanged
    expect(text).not.toContain("Tableau");
    // original master resume is untouched
    const orig = await db.withUser(user, (tx) => readDocument(tx, resume.document_id));
    expect(orig.data.equals(original)).toBe(true);
    const events = await q("select type from application_events where application_id = $1", [application.id]);
    expect(events.map((e) => e.type)).toContain("resume_prepared");
    const [app] = await q("select status from applications where id = $1", [application.id]);
    expect(app.status).toBe("saved"); // preparing documents never marks a job as applied
  });

  it("guard catches new organisations too", () => {
    const issues = checkProposedText({ original: "Handled KYC checks.", proposed: "Handled KYC checks at Goldman Sachs.", allowedSkills: new Set(["kyc"]), allowedNumbers: new Set(), allowedOrgs: ["example payments"] });
    expect(issues.map((i) => i.kind)).toContain("new_organisation");
  });
});

describe("cover letters, packages and the copilot", () => {
  it("generates a grounded cover letter, exports DOCX/PDF and builds a ZIP package", async () => {
    await uploadMasterResume(db, user, { name: "resume.docx", mime: DOCX_MIME, data: await makeResumeDocx() });
    await verifyAll();
    const { application } = await db.withUser(user, (tx) => createApplication(tx, user, { company: "Acme Pay", roleTitle: "Payments Ops", jobDescription: "Payments ops with SQL" }));
    const ai = new FakeAI({
      "cover_letter.generate": () => ({ greeting: "Dear Hiring Team,", paragraphs: ["I am applying for the Payments Ops role at Acme Pay.", "At Example Payments I onboarded 300+ merchants with KYC documentation."], closing: "Sincerely,", usedFacts: ["Onboarded 300+ merchants"] }),
    });
    setAIProviderOverride(ai);
    const cl = await generateCoverLetter(db, user, { applicationId: application.id, tone: "concise" });
    expect(cl.issues).toHaveLength(0);
    expect(ai.calls[0].prompt).toContain("<career_context>");
    expect(ai.calls[0].prompt).toContain('<untrusted_data source="job_description">');
    const files = await db.withUser(user, (tx) => exportCoverLetter(tx, user, cl.id));
    expect(files.docxId).toBeTruthy();
    await createMatchReport(db, user, application.id, "Payments ops with SQL", { company: "Acme Pay", roleTitle: "Payments Ops" });
    const pkg = await db.withUser(user, (tx) => buildApplicationPackage(tx, user, application.id));
    expect(pkg.files).toEqual(expect.arrayContaining([expect.stringMatching(/Cover Letter.*\.docx/), expect.stringMatching(/Cover Letter.*\.pdf/), "Job Match Report.pdf"]));
    const [app] = await q("select status from applications where id = $1", [application.id]);
    expect(app.status).toBe("saved");
  });

  it("answers factual questions from the profile and never invents unknown facts", async () => {
    await db.withUser(user, (tx) => tx.query("update career_profiles set current_ctc_lpa = 5.75, expected_ctc_min_lpa = 7.5, expected_ctc_max_lpa = 8"));
    const a = await answerQuestion(db, user, { question: "What is your expected CTC?" });
    expect(a.answer).toContain("7.5–8 LPA");
    expect(a.method).toBe("profile");
    const n = await answerQuestion(db, user, { question: "What is your notice period?" });
    expect(n.answer).toBe("");
    expect(n.missingFacts[0]).toMatch(/not in your career profile/);
    await expect(answerQuestion(db, user, { question: "Why should we hire you?" })).rejects.toBeInstanceOf(AINotConfiguredError);
  });
});

describe("AI output validation", () => {
  it("retries once, then rejects invalid output without saving and logs only metadata", async () => {
    const audits: any[] = [];
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"answer": 42}' }] } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const p = new GeminiProvider("test-key", "gemini-test", (e) => void audits.push(e), fetchImpl);
    await expect(p.generateJson({ feature: "copilot.answer", system: "s", prompt: "secret prompt text", schema: z.object({ answer: z.string() }) })).rejects.toBeInstanceOf(AIOutputError);
    expect(calls).toBe(2);
    expect(audits.at(-1).status).toBe("invalid_output");
    expect(JSON.stringify(audits)).not.toContain("secret prompt text");
  });
});

describe("jobs, offers, scams", () => {
  it("ranks jobs with reasons and penalises roles to avoid", async () => {
    await db.withUser(user, (tx) => tx.query("insert into verified_skills (user_id, name, verified) values ($1,'SQL',true),($1,'Excel',true)", [user]));
    await db.withUser(user, (tx) => tx.query("update career_profiles set target_roles = '{Business Analyst}', avoid_roles = '{Voice BPO,Customer Support}', preferred_locations = '{Bengaluru}'"));
    const ctx = await db.withUser(user, (tx) => getCareerContext(tx));
    const good = rankJob({ title: "Business Analyst", description: "SQL and Excel reporting", location: "Bengaluru", workMode: "onsite", salaryMinLpa: null, salaryMaxLpa: null, postedAt: new Date() }, ctx);
    const bad = rankJob({ title: "Customer Support Executive - Voice BPO", description: "Calls", location: "Bengaluru", workMode: "onsite", salaryMinLpa: null, salaryMaxLpa: null, postedAt: new Date() }, ctx);
    expect(good.score).toBeGreaterThan(60);
    expect(good.reasons.join(" ")).toMatch(/SQL/);
    expect(bad.avoid).toBe(true);
    expect(bad.score).toBeLessThan(good.score);
  });

  it("computes take-home with stated assumptions", () => {
    expect(incomeTaxNewRegime(1275000).total).toBe(0); // ₹12L taxable after standard deduction → rebate
    expect(incomeTaxNewRegime(800000).total).toBe(0);
    const t = incomeTaxNewRegime(1675000); // taxable 16L: 0 + 20k + 40k + 60k = 1.2L + 4% cess
    expect(t.total).toBe(124800);
    const th = takeHome({ annualFixedCtc: 775000, pfMode: "capped" });
    expect(th.tax.total).toBe(0);
    expect(th.monthlyNet).toBeGreaterThan(55000);
    expect(th.assumptions.length).toBeGreaterThan(5);
  });

  it("extracts offer details without inventing missing ones", () => {
    const r = extractOfferRules("We are pleased to offer you the role. Annual Fixed CTC: ₹7,80,000. Notice period of 60 days. Probation period of 6 months. Health insurance included.");
    expect(r.fixedCtc).toBe(780000);
    expect(r.noticePeriodDays).toBe(60);
    expect(r.probationMonths).toBe(6);
    expect(r.variablePay).toBeNull();
    expect(r.joiningDate).toBeNull();
  });

  it("flags scam signals with evidence and never says 'genuine'", () => {
    const s = detectScam({ text: "Congratulations! You are selected without interview. Pay ₹2,500 registration fee to our UPI ID urgently.", senderEmail: "hr.amazon.jobs@gmail.com", claimedCompany: "Amazon" });
    expect(s.risk).toBe("high");
    expect(s.signals.map((x) => x.id)).toEqual(expect.arrayContaining(["fee", "free-mail", "offer-no-interview"]));
    const clean = detectScam({ text: "Thank you for applying. Our team will review your application.", senderEmail: "careers@acme.example", claimedCompany: "Acme" });
    expect(clean.risk).toBe("low");
    expect(clean.disclaimer).toMatch(/does not prove/);
  });
});

describe("interview and skills", () => {
  it("gives transparent rule-based feedback on real answers", () => {
    const f = heuristicFeedback("Tell me about a time you improved a process.", "We did some stuff.");
    expect(f.gaps.join(" ")).toMatch(/short/);
    const g = heuristicFeedback(
      "Tell me about a time you improved a process.",
      "In my previous role our merchant onboarding queue had a 7 day backlog. I analysed each step in Excel and found document rework caused most delays. I created a checklist and reviewed it with the sales team. As a result rework fell and the backlog cleared within three weeks, which reduced escalations.",
    );
    expect(g.strengths.join(" ")).toMatch(/context|actions|outcome/);
  });

  it("runs a mock interview without AI and deletes the transcript without consent", async () => {
    const { sessionId, question } = await startMockInterview(db, user, { type: "hr", saveTranscript: false });
    expect(question).toBe("Tell me about yourself.");
    const next = await answerMock(db, user, sessionId, "I work in payments operations handling merchant onboarding and KYC. I want to grow into business analysis.");
    expect(next.question).toBeTruthy();
    const { feedback, method } = await finishMock(db, user, sessionId);
    expect(method).toBe("rules");
    expect(feedback.perAnswer).toHaveLength(1);
    const [s] = await q("select transcript, status from mock_interview_sessions where id = $1", [sessionId]);
    expect(s.status).toBe("completed");
    expect(s.transcript).toEqual([]);
  });

  it("scores scenario answers against the model approach and tracks weak areas", async () => {
    const [sc] = await q("select id from interview_scenarios where slug = 'settlement-mismatch'");
    const weak = await evaluateScenario(db, user, sc.id, "I would apologise to the merchant.");
    expect(weak.coverage).toBeLessThan(0.4);
    const strong = await evaluateScenario(db, user, sc.id, "First get the merchant's transaction report and our settlement report for the same cut-off window. Match on transaction IDs and RRN. Separate timing differences from the T+1 cut-off, refunds, chargebacks, MDR and GST deductions and failed transactions. Check reserves or holds applied by risk. Quantify each bucket, raise a ticket with the acquiring bank for anything unexplained, and share the breakup with the merchant.");
    expect(strong.coverage).toBeGreaterThan(0.5);
    expect((await q("select * from weaknesses")).length).toBe(1);
    expect((await q("select * from skill_progress where activity_type = 'scenario'")).length).toBe(2);
  });

  it("learns from post-interview reviews", async () => {
    const r = await savePostInterviewReview(db, user, { questionsAsked: ["Explain the UPI flow", "What is a chargeback?"], difficultTopics: ["Chargebacks"], struggledWith: "Representment timelines" });
    expect(r.analysis.weakTopics[0].topic).toBe("Chargebacks");
    expect((await q("select * from interview_questions where source = 'post_interview'")).length).toBe(2);
    const plan = await buildPrepPlan(db, user, { minutes: 30 });
    expect(plan.blocks.reduce((s, b) => s + b.minutes, 0)).toBe(30);
    expect(plan.likelyQuestions).toEqual(expect.arrayContaining(["Explain the UPI flow"]));
  });

  it("checks exercises and builds learning paths from real gaps", async () => {
    expect(checkExercise("sql-1", 1).correct).toBe(true);
    expect(checkExercise("apt-3", 1062).correct).toBe(true);
    expect(checkExercise("bc-2", 6.8).correct).toBe(true);
    await db.withUser(user, (tx) => createApplication(tx, user, { company: "A", roleTitle: "Analyst", jobDescription: "Power BI and SQL" }));
    const p = await createLearningPath(db, user, { days: 7, level: "beginner" });
    expect(p.generatedBy).toBe("rules");
    const mods = await q("select * from learning_modules where path_id = $1", [p.id]);
    expect(mods.length).toBe(7);
    expect(mods.some((m) => m.skill === "Power BI")).toBe(true);
  });
});

describe("analytics and strategy use real records", () => {
  it("computes metrics with defined denominators", async () => {
    await db.withUser(user, async (tx) => {
      const a = await createApplication(tx, user, { company: "A", roleTitle: "Data Analyst", status: "applied", jobPortal: "Naukri" });
      const b = await createApplication(tx, user, { company: "B", roleTitle: "Data Analyst", status: "applied", jobPortal: "Naukri" });
      await createApplication(tx, user, { company: "C", roleTitle: "Business Analyst", status: "applied", jobPortal: "LinkedIn" });
      await createApplication(tx, user, { company: "D", roleTitle: "Business Analyst", status: "saved" });
      await setStatusManually(tx, user, a.application.id, "interview_scheduled");
      await setStatusManually(tx, user, b.application.id, "rejected");
    });
    const m = await db.withUser(user, (tx) => computeMetrics(tx));
    expect(m.saved).toBe(1);
    expect(m.submitted).toBe(3);
    expect(m.responded).toBe(2);
    expect(m.interviews).toBe(1);
    expect(m.rejections).toBe(1);
    expect(m.responseRate).toBe(66.7);
    expect(m.byPlatform.find((p) => p.key === "Naukri")?.submitted).toBe(2);
    const recs = await db.withUser(user, (tx) => buildRecommendations(tx));
    expect(recs.find((r) => r.kind === "resume")?.title).toMatch(/Not enough data/);
  });

  it("isolates every user's data", async () => {
    const other = await createUser(db, `o${crypto.randomUUID().slice(0, 8)}@example.test`);
    await db.withUser(other, (tx) => createApplication(tx, other, { company: "Secret Co", roleTitle: "X", status: "applied" }));
    const m = await db.withUser(user, (tx) => computeMetrics(tx));
    expect(m.submitted).toBe(0);
    expect(await q("select * from applications where company = 'Secret Co'")).toHaveLength(0);
  });
});
