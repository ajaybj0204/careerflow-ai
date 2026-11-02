"use server";

import { answerQuestion, draftOutreach, extractQuestionsFromImage, linkedinSuggestions, saveApprovedAnswer } from "@careerflow/core";
import { act, fileFrom, list, num, optStr, str, type ActionState } from "@/lib/action";
import { assertRateLimit } from "@/lib/rate-limit";
import { userDb, withUser } from "@/lib/session";

export async function copilotAnswerAction(_: ActionState, f: FormData) {
  return act(async () => {
    const { user, db } = await userDb();
    assertRateLimit(user.id, "ai", 30, 60_000);
    const question = str(f, "question");
    if (!question) throw new Error("Type or paste a question.");
    const r = await answerQuestion(db, user.id, {
      question: question.slice(0, 2000),
      applicationId: optStr(f, "applicationId"),
      tone: (optStr(f, "tone") as any) ?? "professional",
      charLimit: num(f, "charLimit"),
      length: (optStr(f, "length") as any) ?? "detailed",
      instruction: optStr(f, "instruction") ?? undefined,
    });
    return { data: { ...r, question } };
  });
}

export async function screenshotQuestionsAction(_: ActionState, f: FormData) {
  return act(async () => {
    const { user, db } = await userDb();
    assertRateLimit(user.id, "ai", 10, 60_000);
    const file = await fileFrom(f, "image");
    if (!file) throw new Error("Choose a screenshot.");
    if (!/^image\/(png|jpeg|webp)$/.test(file.mime)) throw new Error("Upload a PNG, JPG or WEBP screenshot.");
    if (file.data.length > 5 * 1024 * 1024) throw new Error("Screenshots must be under 5 MB.");
    const questions = await extractQuestionsFromImage(db, user.id, { mimeType: file.mime, dataBase64: file.data.toString("base64") });
    return { message: `Found ${questions.length} question(s).`, data: { questions } };
  });
}

export async function saveAnswerAction(_: ActionState, f: FormData) {
  return act(async () => {
    const q = str(f, "question");
    const a = str(f, "answer");
    if (!q || !a) throw new Error("Question and answer are required.");
    await withUser((tx, u) => saveApprovedAnswer(tx, u.id, { id: optStr(f, "id") ?? undefined, question: q, answer: a, applicationId: optStr(f, "applicationId"), tags: list(f, "tags") }));
    return { message: "Saved to your answer library." };
  }, ["/app/copilot", "/app/applications/[id]"]);
}

export async function deleteAnswerAction(_: ActionState, f: FormData) {
  return act(async () => {
    await withUser((tx) => tx.query("delete from approved_answers where id = $1", [str(f, "id")]));
  }, ["/app/copilot"]);
}

export async function outreachAction(_: ActionState, f: FormData) {
  return act(async () => {
    const { user, db } = await userDb();
    assertRateLimit(user.id, "ai", 20, 60_000);
    const r = await draftOutreach(db, user.id, { kind: str(f, "kind"), applicationId: optStr(f, "applicationId"), recruiterId: optStr(f, "recruiterId"), notes: optStr(f, "notes") });
    return { message: "Draft ready. Review it, then send it yourself.", data: r };
  }, ["/app/messages"]);
}

export async function updateDraftAction(_: ActionState, f: FormData) {
  return act(async () => {
    const status = str(f, "status");
    await withUser((tx) =>
      tx.query("update outreach_drafts set subject = coalesce($2, subject), body = coalesce($3, body), status = coalesce($4, status) where id = $1", [str(f, "id"), optStr(f, "subject"), optStr(f, "body"), status === "sent_by_user" ? "sent_by_user" : null]),
    );
    return { message: status === "sent_by_user" ? "Marked as sent by you." : "Saved." };
  }, ["/app/messages"]);
}

export async function deleteDraftAction(_: ActionState, f: FormData) {
  return act(async () => {
    await withUser((tx) => tx.query("delete from outreach_drafts where id = $1", [str(f, "id")]));
  }, ["/app/messages"]);
}

export async function linkedinAction(_: ActionState, _f: FormData) {
  return act(async () => {
    const { user, db } = await userDb();
    assertRateLimit(user.id, "ai", 10, 60_000);
    return { data: await linkedinSuggestions(db, user.id) };
  });
}
