import { untrusted } from "@careerflow/ai";
import { renderPdf, type PdfBlock } from "@careerflow/document-engine";
import {
  answerFeedbackSchema,
  detectSkills,
  mockFeedbackSchema,
  mockTurnSchema,
  postInterviewAnalysisSchema,
  prepPlanSchema,
  tokenSimilarity,
  type AnswerFeedback,
} from "@careerflow/shared";
import type { Database, Tx } from "@careerflow/database";
import { aiFor } from "./ai";
import { getCareerContext, renderCareerContext } from "./career-memory";
import { MOCK_TYPE_QUESTIONS, ROLE_GUIDES } from "./interview-content";

export function guideForRole(role: string | null | undefined) {
  if (!role) return null;
  let best = null as (typeof ROLE_GUIDES)[number] | null;
  let bestSim = 0;
  for (const g of ROLE_GUIDES) {
    const s = tokenSimilarity(g.role, role);
    if (s > bestSim) {
      best = g;
      bestSim = s;
    }
  }
  return bestSim >= 0.34 ? best : null;
}

// ---------------------------------------------------------------------------
// Transparent rule-based feedback (used when AI is not configured, and as a baseline)
// ---------------------------------------------------------------------------
const FILLERS = /\b(um+|uh+|like|basically|actually|you know|kind of|sort of)\b/gi;

export function heuristicFeedback(question: string, answer: string): AnswerFeedback {
  const words = answer.trim().split(/\s+/).filter(Boolean);
  const strengths: string[] = [];
  const gaps: string[] = [];
  const steps: string[] = [];
  const behavioural = /tell me about a time|describe a (time|situation)|give an example/i.test(question);
  const hasSituation = /\b(when|at my|in my (role|previous)|we were|our team|the situation)\b/i.test(answer);
  const hasAction = /\b(i (did|built|created|led|analy[sz]ed|set up|spoke|worked|reviewed|proposed|automated|fixed|called|escalated|decided))\b/i.test(answer);
  const hasResult = /\b(result|reduced|increased|improved|saved|resolved|outcome|as a result|so that|which led)\b/i.test(answer);
  const hasNumbers = /\d/.test(answer);
  const fillers = (answer.match(FILLERS) ?? []).length;
  const weSentences = (answer.match(/\bwe\b/gi) ?? []).length;
  const iSentences = (answer.match(/\bi\b/gi) ?? []).length;

  if (words.length < 40) gaps.push(`The answer is short (${words.length} words). Interviewers usually expect 60–200 words with a concrete example.`);
  else if (words.length > 320) gaps.push(`The answer is long (${words.length} words). Aim to finish in about 2 minutes.`);
  else strengths.push(`Good length (${words.length} words).`);
  if (behavioural) {
    if (hasSituation) strengths.push("You set the context.");
    else gaps.push("Add the situation: where, when and what the problem was.");
    if (hasAction) strengths.push("You described your own actions.");
    else gaps.push("Say clearly what YOU did (use 'I', not only 'we').");
    if (hasResult) strengths.push("You stated an outcome.");
    else gaps.push("End with the result and what you learned.");
    steps.push("Situation (1–2 sentences)", "Task: your responsibility", "Actions you took (2–4 points)", "Result, ideally measured, and the lesson");
  }
  if (hasNumbers) strengths.push("You used specifics (numbers/details).");
  else gaps.push("Add specifics such as volumes, time saved or tools used — only real figures.");
  if (weSentences > iSentences * 2 && weSentences > 3) gaps.push("Mostly 'we' — clarify your personal contribution.");
  if (fillers > 3) gaps.push(`${fillers} filler words detected (e.g. "basically", "like"). Pause instead.`);
  const skills = detectSkills(answer);
  if (skills.length) strengths.push(`Mentions relevant skills: ${skills.slice(0, 5).join(", ")}.`);
  if (!steps.length) steps.push("Answer the question directly in the first sentence", "Support it with one real example", "Close by linking it to the role");
  return {
    strengths,
    gaps,
    structureNotes: "Rule-based feedback: checks length, structure (situation, actions, result), specifics, ownership and filler words. Connect an AI key for content-level feedback.",
    improvedApproach: steps,
    topicsToPractice: gaps.length > 2 ? ["Structuring answers with STAR"] : [],
  };
}

// ---------------------------------------------------------------------------
// Interview Tomorrow mode
// ---------------------------------------------------------------------------
export async function buildPrepPlan(db: Database, userId: string, input: { applicationId?: string | null; minutes: 15 | 30 | 60 | 120; stage?: string; role?: string | null }) {
  const data = await db.withUser(userId, async (tx) => {
    const app = input.applicationId ? await tx.one("select * from applications where id = $1", [input.applicationId]) : null;
    const report = input.applicationId ? await tx.one("select * from job_match_reports where application_id = $1 order by created_at desc limit 1", [input.applicationId]) : null;
    const weaknesses = await tx.query("select topic from weaknesses where status <> 'resolved' order by updated_at desc limit 8");
    const asked = await tx.query("select question from interview_questions where user_id is not null order by created_at desc limit 10");
    return { app, report, weaknesses: weaknesses.map((w) => w.topic as string), asked: asked.map((a) => a.question as string), ctx: await getCareerContext(tx) };
  });
  const role = input.role ?? data.app?.role_title ?? data.ctx.profile.targetRoles[0] ?? null;
  const guide = guideForRole(role);
  const missing: string[] = data.report?.match?.missingSkills ?? [];
  const jdSkills: string[] = data.report?.analysis?.requiredSkills ?? (data.app?.job_description ? detectSkills(data.app.job_description) : []);
  const resumePoints = data.ctx.employment
    .flatMap((e) => e.bullets.map((b) => ({ b, e })))
    .filter(({ b }) => !jdSkills.length || detectSkills(b).some((s) => jdSkills.includes(s)))
    .slice(0, 6)
    .map(({ b, e }) => `${b} (${e.company})`);

  const ai = aiFor(db, userId);
  if (ai) {
    try {
      const { data: plan } = await ai.generateJson({
        feature: "interview.prep_plan",
        userId,
        schema: prepPlanSchema,
        system: `Create a focused ${input.minutes}-minute interview preparation plan. Blocks must add up to ${input.minutes} minutes. Likely questions must be specific to the role and job description. keyPointsFromResume must only use verified facts.`,
        prompt: [
          renderCareerContext(data.ctx),
          `Role: ${role ?? "unknown"}; Company: ${data.app?.company ?? "unknown"}; Stage: ${input.stage ?? "unknown"}`,
          data.weaknesses.length ? `Known weak areas: ${data.weaknesses.join(", ")}` : "",
          missing.length ? `Skills in the JD that are not in the profile: ${missing.join(", ")}` : "",
          data.app?.job_description ? untrusted("job_description", data.app.job_description, 8000) : "",
        ].join("\n\n"),
        temperature: 0.4,
      });
      return { ...plan, role, method: "ai" as const };
    } catch {
      /* fall back to rules */
    }
  }
  const m = input.minutes;
  const blocks = [
    { minutes: Math.max(5, Math.round(m * 0.2)), title: "Know the role and company", activities: ["Re-read the job description and underline the top 5 requirements", data.app ? `Check ${data.app.company}'s website: products, customers, recent news` : "Review the company's products and recent news"] },
    { minutes: Math.max(5, Math.round(m * 0.3)), title: "Your story", activities: ["Practise 'Tell me about yourself' aloud (90 seconds)", "Prepare 2 STAR stories from your verified experience", ...resumePoints.slice(0, 2).map((p) => `Be ready to explain: ${p}`)] },
    { minutes: Math.max(5, Math.round(m * 0.35)), title: "Role knowledge", activities: [...(guide?.fundamentals.slice(0, 3) ?? ["Revise core concepts for the role"]), ...(data.weaknesses.slice(0, 2).map((w) => `Revisit weak area: ${w}`))] },
    { minutes: Math.max(5, m - Math.round(m * 0.85)), title: "Logistics and questions to ask", activities: ["Confirm time, link/venue and interviewer names", "Prepare 2 questions to ask the interviewer", "Keep your resume and notes handy"] },
  ];
  const total = blocks.reduce((s, b) => s + b.minutes, 0);
  blocks[blocks.length - 1].minutes += m - total;
  return {
    blocks,
    likelyQuestions: [...(guide?.questions.map((q) => q.q) ?? []), ...data.asked, ...missing.slice(0, 3).map((s) => `How familiar are you with ${s}? (Answer honestly.)`)].slice(0, 12),
    keyPointsFromResume: resumePoints,
    role,
    method: "rules" as const,
  };
}

export async function prepPlanPdf(plan: Awaited<ReturnType<typeof buildPrepPlan>>, title: string) {
  const blocks: PdfBlock[] = [{ text: title, kind: "title" }];
  for (const b of plan.blocks) {
    blocks.push({ text: `${b.title} (${b.minutes} min)`, kind: "heading" });
    for (const a of b.activities) blocks.push({ text: a, kind: "bullet" });
  }
  blocks.push({ text: "Likely questions", kind: "heading" });
  for (const q of plan.likelyQuestions) blocks.push({ text: q, kind: "bullet" });
  if (plan.keyPointsFromResume.length) {
    blocks.push({ text: "From your resume", kind: "heading" });
    for (const p of plan.keyPointsFromResume) blocks.push({ text: p, kind: "bullet" });
  }
  return renderPdf(blocks, { title, footer: "CareerFlow AI quick revision" });
}

// ---------------------------------------------------------------------------
// Mock interviews
// ---------------------------------------------------------------------------
type Turn = { role: "interviewer" | "candidate"; text: string; at: string };

export async function startMockInterview(db: Database, userId: string, input: { type: string; applicationId?: string | null; targetRole?: string | null; saveTranscript: boolean }) {
  const first = await nextQuestion(db, userId, input.type, input.applicationId ?? null, input.targetRole ?? null, []);
  return db.withUser(userId, async (tx) => {
    const row = await tx.one<{ id: string }>(
      "insert into mock_interview_sessions (user_id, application_id, interview_type, target_role, transcript, transcript_saved) values ($1,$2,$3,$4,$5::jsonb,$6) returning id",
      [userId, input.applicationId ?? null, input.type, input.targetRole ?? null, JSON.stringify([{ role: "interviewer", text: first.question, at: new Date().toISOString() }]), input.saveTranscript],
    );
    return { sessionId: row!.id, question: first.question };
  });
}

async function nextQuestion(db: Database, userId: string, type: string, applicationId: string | null, role: string | null, transcript: Turn[]): Promise<{ question: string | null; done: boolean }> {
  const asked = transcript.filter((t) => t.role === "interviewer").map((t) => t.text);
  const maxQ = 6;
  if (asked.length >= maxQ) return { question: null, done: true };
  const ai = aiFor(db, userId);
  const ctxData = await db.withUser(userId, async (tx) => ({
    ctx: await getCareerContext(tx),
    app: applicationId ? await tx.one("select company, role_title, job_description from applications where id = $1", [applicationId]) : null,
    bank: await tx.query("select question from interview_questions where user_id is not null order by random() limit 5"),
  }));
  if (ai) {
    try {
      const { data } = await ai.generateJson({
        feature: "interview.mock_turn",
        userId,
        schema: mockTurnSchema,
        system: `You are a realistic ${type} interviewer for ${ctxData.app?.role_title ?? role ?? "the candidate's target role"}${ctxData.app ? ` at ${ctxData.app.company}` : ""}. Ask ONE question at a time. If the last answer was vague, ask a short follow-up about it; otherwise move to a new topic. Resume-based questions must refer to facts in <career_context>. Stop after ${maxQ} questions (done = true).`,
        prompt: [renderCareerContext(ctxData.ctx), ctxData.app?.job_description ? untrusted("job_description", ctxData.app.job_description, 5000) : "", untrusted("transcript", JSON.stringify(transcript.slice(-8)), 8000)].join("\n\n"),
        temperature: 0.7,
      });
      if (data.done || !data.nextQuestion) return { question: null, done: true };
      return { question: data.nextQuestion, done: false };
    } catch {
      /* fall back */
    }
  }
  const guide = guideForRole(ctxData.app?.role_title ?? role);
  let pool = MOCK_TYPE_QUESTIONS[type] ?? [];
  if (type === "resume") pool = ctxData.ctx.employment.flatMap((e) => [`Walk me through your role as ${e.title} at ${e.company}.`, ...e.bullets.slice(0, 2).map((b) => `You wrote: "${b}". How did you do that, and what was the result?`)]).concat(ctxData.ctx.projects.map((p) => `Tell me about your project ${p.name}. What was your contribution?`));
  if (type === "company" || type === "technical") pool = [...pool, ...(guide?.questions.map((q) => q.q) ?? [])];
  if (type === "company" && ctxData.app) pool = [`Why do you want to work at ${ctxData.app.company}?`, `What do you know about ${ctxData.app.company}'s business?`, ...pool];
  pool = [...pool, ...ctxData.bank.map((b) => b.question as string)];
  if (!pool.length) pool = MOCK_TYPE_QUESTIONS.behavioral;
  const q = pool.find((p) => !asked.includes(p));
  return q && asked.length < Math.min(maxQ, pool.length) ? { question: q, done: false } : { question: null, done: true };
}

export async function answerMock(db: Database, userId: string, sessionId: string, answer: string) {
  const s = await db.withUser(userId, (tx) => tx.one("select * from mock_interview_sessions where id = $1 and status = 'active'", [sessionId]));
  if (!s) throw new Error("This mock interview is not active.");
  const transcript: Turn[] = [...s.transcript, { role: "candidate", text: answer.slice(0, 6000), at: new Date().toISOString() }];
  const next = await nextQuestion(db, userId, s.interview_type, s.application_id, s.target_role, transcript);
  if (next.question) transcript.push({ role: "interviewer", text: next.question, at: new Date().toISOString() });
  await db.withUser(userId, (tx) => tx.query("update mock_interview_sessions set transcript = $2::jsonb where id = $1", [sessionId, JSON.stringify(transcript)]));
  return { question: next.question, done: next.done };
}

/** Ends the session and produces feedback from the actual answers. Transcript is deleted unless the user consented. */
export async function finishMock(db: Database, userId: string, sessionId: string) {
  const s = await db.withUser(userId, (tx) => tx.one("select * from mock_interview_sessions where id = $1", [sessionId]));
  if (!s) throw new Error("Session not found");
  const transcript: Turn[] = s.transcript;
  const pairs: { question: string; answer: string }[] = [];
  for (let i = 0; i < transcript.length; i++)
    if (transcript[i].role === "interviewer" && transcript[i + 1]?.role === "candidate") pairs.push({ question: transcript[i].text, answer: transcript[i + 1].text });
  if (!pairs.length) throw new Error("Answer at least one question to get feedback.");
  let feedback: any;
  let method = "rules";
  const ai = aiFor(db, userId);
  if (ai) {
    try {
      const ctx = await db.withUser(userId, (tx) => getCareerContext(tx));
      const { data } = await ai.generateJson({
        feature: "interview.mock_feedback",
        userId,
        schema: mockFeedbackSchema,
        system: "Give honest, specific interview feedback based only on what the candidate actually said. Quote or paraphrase their answers. Do not score with made-up numbers. Do not predict hiring outcomes.",
        prompt: [renderCareerContext(ctx), untrusted("interview_transcript", JSON.stringify(pairs), 20000)].join("\n\n"),
        temperature: 0.3,
      });
      feedback = data;
      method = "ai";
    } catch {
      /* fall back */
    }
  }
  if (!feedback) {
    const per = pairs.map((p) => ({ p, f: heuristicFeedback(p.question, p.answer) }));
    feedback = {
      summary: `You answered ${pairs.length} question(s). Rule-based review of structure, specifics and length.`,
      perAnswer: per.map(({ p, f }) => ({ question: p.question, observation: [...f.strengths, ...f.gaps].join(" "), suggestion: f.improvedApproach.join(" → ") })),
      strengths: [...new Set(per.flatMap(({ f }) => f.strengths))].slice(0, 6),
      improvements: [...new Set(per.flatMap(({ f }) => f.gaps))].slice(0, 6),
      topicsToPractice: [...new Set(per.flatMap(({ f }) => f.topicsToPractice))].slice(0, 6),
    };
  }
  await db.withUser(userId, async (tx) => {
    await tx.query("insert into mock_interview_feedback (user_id, session_id, feedback) values ($1,$2,$3::jsonb)", [userId, sessionId, JSON.stringify({ ...feedback, method })]);
    await tx.query("update mock_interview_sessions set status = 'completed', ended_at = now(), transcript = case when transcript_saved then transcript else '[]'::jsonb end where id = $1", [sessionId]);
    await tx.query("insert into skill_progress (user_id, skill, activity_type, activity_ref, notes) values ($1,$2,'mock_interview',$3,$4)", [userId, `Interviewing (${s.interview_type})`, sessionId, `${pairs.length} answers`]);
    for (const t of (feedback.topicsToPractice ?? []).slice(0, 5)) await upsertWeakness(tx, userId, t, "mock_interview", "From mock interview feedback");
  });
  return { feedback, method };
}

export async function upsertWeakness(tx: Tx, userId: string, topic: string, source: string, evidence: string) {
  await tx.query(
    `insert into weaknesses (user_id, topic, source, evidence) values ($1,$2,$3,$4)
     on conflict (user_id, lower(topic)) do update set evidence = excluded.evidence, status = case when weaknesses.status = 'resolved' then 'open' else weaknesses.status end, updated_at = now()`,
    [userId, topic.slice(0, 120), source, evidence.slice(0, 500)],
  );
}

// ---------------------------------------------------------------------------
// Scenario Lab
// ---------------------------------------------------------------------------
function keyTerms(step: string): string[] {
  const stop = new Set(["the", "and", "for", "with", "from", "that", "this", "your", "into", "what", "when", "then", "them", "their", "make", "sure", "each", "only", "clear", "first", "check", "find", "split", "against", "same", "where", "which", "within", "about"]);
  return [...new Set(step.toLowerCase().replace(/[^a-z0-9/ ]/g, " ").split(/\s+/).filter((w) => w.length > 3 && !stop.has(w)))];
}

export function scoreScenarioAnswer(modelApproach: string[], answer: string) {
  const a = answer.toLowerCase();
  const steps = modelApproach.map((step) => {
    const terms = keyTerms(step);
    const hits = terms.filter((t) => a.includes(t.slice(0, Math.max(5, t.length - 2))));
    return { step, covered: terms.length ? hits.length / terms.length >= 0.25 : false };
  });
  const covered = steps.filter((s) => s.covered).length;
  return { steps, coverage: modelApproach.length ? covered / modelApproach.length : 0 };
}

export async function evaluateScenario(db: Database, userId: string, scenarioId: string, answer: string) {
  const sc = await db.withUser(userId, (tx) => tx.one("select * from interview_scenarios where id = $1", [scenarioId]));
  if (!sc) throw new Error("Scenario not found");
  const rules = scoreScenarioAnswer(sc.model_approach, answer);
  let feedback: AnswerFeedback = {
    strengths: rules.steps.filter((s) => s.covered).map((s) => `Covered: ${s.step}`),
    gaps: rules.steps.filter((s) => !s.covered).map((s) => `Not covered: ${s.step}`),
    structureNotes: `You covered about ${Math.round(rules.coverage * 100)}% of the model approach's steps (keyword check). This is a practice scenario, not personal experience.`,
    improvedApproach: sc.model_approach,
    topicsToPractice: rules.coverage < 0.5 ? [sc.domain] : [],
  };
  let method: "rules" | "ai" = "rules";
  const ai = aiFor(db, userId);
  if (ai) {
    try {
      const { data } = await ai.generateJson({
        feature: "scenario.evaluate",
        userId,
        schema: answerFeedbackSchema,
        system: "Evaluate the candidate's answer to a hypothetical workplace scenario. Compare with the model approach, be specific about what was strong and what was missing, and keep it encouraging but honest. Do not treat the scenario as the candidate's real experience.",
        prompt: `Scenario: ${sc.title}\nSituation: ${sc.situation}\nTask: ${sc.task}\nModel approach: ${JSON.stringify(sc.model_approach)}\n\n${untrusted("candidate_answer", answer, 8000)}`,
        temperature: 0.3,
      });
      feedback = data;
      method = "ai";
    } catch {
      /* keep rules feedback */
    }
  }
  await db.withUser(userId, async (tx) => {
    await tx.query("insert into scenario_attempts (user_id, scenario_id, answer, feedback, method) values ($1,$2,$3,$4::jsonb,$5)", [userId, scenarioId, answer.slice(0, 10000), JSON.stringify({ ...feedback, coverage: rules.coverage }), method]);
    await tx.query("insert into skill_progress (user_id, skill, activity_type, activity_ref, correct) values ($1,$2,'scenario',$3,$4)", [userId, sc.domain, scenarioId, rules.coverage >= 0.5]);
    if (rules.coverage < 0.4) await upsertWeakness(tx, userId, `${sc.domain}: ${sc.title}`, "scenario", `Covered ${Math.round(rules.coverage * 100)}% of the model approach`);
  });
  return { feedback, coverage: rules.coverage, steps: rules.steps, method };
}

// ---------------------------------------------------------------------------
// Post-interview learning loop
// ---------------------------------------------------------------------------
export async function savePostInterviewReview(
  db: Database,
  userId: string,
  r: { applicationId?: string | null; interviewId?: string | null; questionsAsked: string[]; difficultTopics: string[]; answersGiven?: string; struggledWith?: string; recruiterFeedback?: string; observations?: string; nextSteps?: string },
) {
  const ctx = await db.withUser(userId, (tx) => getCareerContext(tx));
  let analysis: any = {
    summary: "Saved. Difficult topics were added to your weakness tracker and the questions were added to your practice bank.",
    weakTopics: r.difficultTopics.map((t) => ({ topic: t, evidence: "You marked this as difficult" })),
    strengths: [],
    practiceQuestions: r.questionsAsked,
    revisionPlan: r.difficultTopics.map((t) => `Revise ${t} and practise one answer aloud`),
    method: "rules",
  };
  const ai = aiFor(db, userId);
  if (ai && (r.questionsAsked.length || r.struggledWith)) {
    try {
      const { data } = await ai.generateJson({
        feature: "interview.post_review",
        userId,
        schema: postInterviewAnalysisSchema,
        system: "Analyse the candidate's own notes after a real interview. Identify weak topics with evidence from their notes, strengths, practice questions and a short revision plan. Only use what is in the notes.",
        prompt: [renderCareerContext(ctx), untrusted("interview_notes", JSON.stringify(r), 12000)].join("\n\n"),
        temperature: 0.3,
      });
      analysis = { ...data, weakTopics: [...data.weakTopics, ...analysis.weakTopics.filter((w: any) => !data.weakTopics.some((d) => d.topic.toLowerCase() === w.topic.toLowerCase()))], method: "ai" };
    } catch {
      /* keep rules analysis */
    }
  }
  return db.withUser(userId, async (tx) => {
    const row = await tx.one<{ id: string }>(
      `insert into post_interview_reviews (user_id, interview_id, application_id, questions_asked, difficult_topics, answers_given, struggled_with, recruiter_feedback, observations, next_steps, analysis)
       values ($1,$2,$3,$4::text[],$5::text[],$6,$7,$8,$9,$10,$11::jsonb) returning id`,
      [userId, r.interviewId ?? null, r.applicationId ?? null, r.questionsAsked, r.difficultTopics, r.answersGiven ?? null, r.struggledWith ?? null, r.recruiterFeedback ?? null, r.observations ?? null, r.nextSteps ?? null, JSON.stringify(analysis)],
    );
    const app = r.applicationId ? await tx.one("select role_title from applications where id = $1", [r.applicationId]) : null;
    for (const q of r.questionsAsked.slice(0, 30))
      await tx.query("insert into interview_questions (user_id, role, category, question, source) values ($1, $2, 'asked', $3, 'post_interview')", [userId, app?.role_title ?? "General", q.slice(0, 500)]);
    for (const w of analysis.weakTopics.slice(0, 10)) await upsertWeakness(tx, userId, w.topic, "post_interview", w.evidence);
    if (r.interviewId) await tx.query("update interviews set status = 'completed' where id = $1", [r.interviewId]);
    return { id: row!.id, analysis };
  });
}

export async function correctReview(tx: Tx, reviewId: string, corrections: string, removeTopics: string[]) {
  await tx.query("update post_interview_reviews set user_corrections = $2 where id = $1", [reviewId, corrections]);
  for (const t of removeTopics) await tx.query("update weaknesses set status = 'resolved', evidence = 'Removed by you after review' where lower(topic) = lower($1)", [t]);
}
