"use server";

import { answerMock, buildPrepPlan, correctReview, createLearningPath, evaluateScenario, finishMock, recordExercise, savePostInterviewReview, startMockInterview, toggleModule } from "@careerflow/core";
import { act, list, num, optStr, str, type ActionState } from "@/lib/action";
import { assertRateLimit } from "@/lib/rate-limit";
import { userDb, withUser } from "@/lib/session";

export async function prepPlanAction(_: ActionState, f: FormData) {
  return act(async () => {
    const { user, db } = await userDb();
    assertRateLimit(user.id, "ai", 20, 60_000);
    const minutes = Number(str(f, "minutes")) as 15 | 30 | 60 | 120;
    if (![15, 30, 60, 120].includes(minutes)) throw new Error("Choose 15, 30, 60 or 120 minutes.");
    const plan = await buildPrepPlan(db, user.id, { applicationId: optStr(f, "applicationId"), minutes, stage: optStr(f, "stage") ?? undefined, role: optStr(f, "role") });
    return { data: { plan, applicationId: optStr(f, "applicationId"), minutes } };
  });
}

export async function startMockAction(_: ActionState, f: FormData) {
  return act(async () => {
    const { user, db } = await userDb();
    assertRateLimit(user.id, "ai", 20, 60_000);
    const r = await startMockInterview(db, user.id, { type: str(f, "type") || "hr", applicationId: optStr(f, "applicationId"), targetRole: optStr(f, "targetRole"), saveTranscript: f.get("saveTranscript") === "on" });
    return { data: r };
  });
}

export async function answerMockAction(_: ActionState, f: FormData) {
  return act(async () => {
    const { user, db } = await userDb();
    assertRateLimit(user.id, "ai", 40, 60_000);
    const answer = str(f, "answer");
    if (!answer) throw new Error("Type or speak your answer first.");
    const r = await answerMock(db, user.id, str(f, "sessionId"), answer);
    return { data: { ...r, answer } };
  });
}

export async function finishMockAction(_: ActionState, f: FormData) {
  return act(async () => {
    const { user, db } = await userDb();
    const r = await finishMock(db, user.id, str(f, "sessionId"));
    return { data: r };
  }, ["/app/interview"]);
}

export async function scenarioAction(_: ActionState, f: FormData) {
  return act(async () => {
    const { user, db } = await userDb();
    assertRateLimit(user.id, "ai", 20, 60_000);
    const answer = str(f, "answer");
    if (answer.length < 30) throw new Error("Write at least a few sentences describing your approach.");
    return { data: await evaluateScenario(db, user.id, str(f, "scenarioId"), answer) };
  }, ["/app/scenarios"]);
}

export async function postReviewAction(_: ActionState, f: FormData) {
  return act(async () => {
    const { user, db } = await userDb();
    const r = await savePostInterviewReview(db, user.id, {
      applicationId: optStr(f, "applicationId"),
      interviewId: optStr(f, "interviewId"),
      questionsAsked: str(f, "questions").split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 30),
      difficultTopics: list(f, "difficultTopics"),
      answersGiven: optStr(f, "answersGiven") ?? undefined,
      struggledWith: optStr(f, "struggledWith") ?? undefined,
      recruiterFeedback: optStr(f, "recruiterFeedback") ?? undefined,
      observations: optStr(f, "observations") ?? undefined,
      nextSteps: optStr(f, "nextSteps") ?? undefined,
    });
    return { message: "Saved. Your weakness tracker and practice questions were updated.", data: r };
  }, ["/app/interview", "/app/applications/[id]"]);
}

export async function correctReviewAction(_: ActionState, f: FormData) {
  return act(async () => {
    await withUser((tx) => correctReview(tx, str(f, "id"), str(f, "corrections"), list(f, "removeTopics")));
    return { message: "Thanks — your corrections were saved." };
  }, ["/app/interview"]);
}

export async function weaknessAction(_: ActionState, f: FormData) {
  return act(async () => {
    const op = str(f, "op");
    await withUser(async (tx, u) => {
      if (op === "add") await tx.query("insert into weaknesses (user_id, topic, source, evidence) values ($1,$2,'self',$3) on conflict do nothing", [u.id, str(f, "topic"), optStr(f, "evidence")]);
      else if (["open", "improving", "resolved"].includes(op)) await tx.query("update weaknesses set status = $2 where id = $1", [str(f, "id"), op]);
      else if (op === "delete") await tx.query("delete from weaknesses where id = $1", [str(f, "id")]);
    });
  }, ["/app/interview", "/app/skills"]);
}

export async function exerciseAction(_: ActionState, f: FormData) {
  return act(async () => {
    const response = num(f, "response");
    if (response === null || isNaN(response)) throw new Error("Choose or enter an answer.");
    const r = await withUser((tx, u) => recordExercise(tx, u.id, str(f, "id"), response));
    return { message: r.correct ? "Correct!" : `Not quite. Answer: ${r.answer}`, data: r };
  }, ["/app/skills"]);
}

export async function learningPathAction(_: ActionState, f: FormData) {
  return act(async () => {
    const { user, db } = await userDb();
    assertRateLimit(user.id, "ai", 10, 60_000);
    const days = str(f, "days") === "custom" ? num(f, "customDays") ?? 14 : Number(str(f, "days"));
    const r = await createLearningPath(db, user.id, { days, goal: optStr(f, "goal") ?? undefined, level: (str(f, "level") || "beginner") as any, focus: list(f, "focus") });
    return { message: `Plan created with ${r.modules} activities.` };
  }, ["/app/skills"]);
}

export async function moduleAction(_: ActionState, f: FormData) {
  return act(async () => {
    await withUser((tx, u) => toggleModule(tx, u.id, str(f, "id"), str(f, "done") === "1"));
  }, ["/app/skills"]);
}

export async function deletePathAction(_: ActionState, f: FormData) {
  return act(async () => {
    await withUser((tx) => tx.query("delete from learning_paths where id = $1", [str(f, "id")]));
  }, ["/app/skills"]);
}
