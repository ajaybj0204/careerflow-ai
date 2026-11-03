import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "@careerflow/database";
import { DOCX_MIME } from "@careerflow/document-engine";
import { getAutofillData, getResumeFile, markAppliedFromExtension, memoryStorage, saveLearnedAnswers, setStorage, splitLocation, uploadMasterResume } from "@careerflow/core";
import { createUser, freshDb } from "./helpers";
import { makeResumeDocx } from "./fixtures/resume";
// The extension's matching logic is a plain script that registers globalThis.CFMatch
import "../apps/extension/src/fieldmatch.js";

const M = (globalThis as any).CFMatch;

const DATA = {
  profile: {
    fullName: "Ajay B J",
    firstName: "Ajay B",
    lastName: "J",
    email: "ajay@example.com",
    phone: "+91 98765 43210",
    location: "Bengaluru, Karnataka, India",
    city: "Bengaluru",
    state: "Karnataka",
    country: "India",
    linkedin: "https://linkedin.com/in/ajay-b-j",
    github: null,
    portfolio: "https://ajay-bj-portfolio.vercel.app",
    headline: "Business Operations Associate",
    summary: "Payments operations professional.",
    yearsExperience: 2.5,
    noticePeriodDays: 30,
    currentCtcLpa: 6,
    expectedCtcLpa: 9,
    expectedCtcText: "9-11 LPA",
    currentCompany: "Razorpay",
    currentTitle: "Business Operations Associate",
  },
  education: [{ institution: "New Horizon College of Engineering", degree: "BE", field: "Information Science", endYear: 2023, grade: null }],
  skills: ["SQL", "Excel", "Power BI"],
  answers: [
    { question: "Are you willing to relocate?", answer: "Yes" },
    { question: "Do you require visa sponsorship to work in India?", answer: "No" },
    { question: "How did you hear about us?", answer: "LinkedIn" },
  ],
};

describe("form field understanding", () => {
  const cls = (d: Record<string, unknown>) => M.classifyField({ label: "", name: "", id: "", placeholder: "", autocomplete: "", type: "text", tag: "input", ...d });

  it("recognises common fields by label, attribute and autocomplete", () => {
    expect(cls({ label: "First Name *" })).toBe("firstName");
    expect(cls({ name: "job_application[last_name]" })).toBe("lastName");
    expect(cls({ label: "Email", type: "email" })).toBe("email");
    expect(cls({ label: "Mobile Number" })).toBe("phone");
    expect(cls({ autocomplete: "given-name" })).toBe("firstName");
    expect(cls({ label: "LinkedIn Profile" })).toBe("linkedin");
    expect(cls({ label: "Current CTC (in LPA)" })).toBe("currentCtc");
    expect(cls({ label: "Expected CTC" })).toBe("expectedCtc");
    expect(cls({ label: "Notice Period" })).toBe("noticePeriod");
    expect(cls({ label: "Total Experience (years)" })).toBe("yearsExperience");
    expect(cls({ label: "Current Company" })).toBe("currentCompany");
    expect(cls({ label: "City" })).toBe("city");
    expect(cls({ automationId: "legalNameSection_firstName" })).toBe("firstName");
    expect(cls({ label: "Resume/CV", type: "file" })).toBe("resume");
    expect(cls({ label: "Cover Letter", type: "file" })).toBe("coverLetter");
  });

  it("never fills personal or legal questions", () => {
    expect(cls({ label: "Gender" })).toBe("sensitive");
    expect(cls({ label: "Date of Birth" })).toBe("sensitive");
    expect(cls({ label: "PAN number" })).toBe("sensitive");
    expect(cls({ label: "Do you identify as a person with a disability?" })).toBe("sensitive");
  });

  it("treats long questions as open questions, not profile fields", () => {
    const d = { label: "Why do you want to work at our company and what makes you a good fit?", tag: "textarea" };
    expect(cls(d)).toBeNull();
    expect(M.isOpenQuestion(d)).toBe(true);
    expect(M.isOpenQuestion({ label: "City", tag: "input" })).toBe(false);
  });

  it("gives values in the shape the field expects", () => {
    expect(M.valueFor("phone", DATA, { label: "Phone", type: "tel" })).toBe("+91 98765 43210");
    expect(M.valueFor("phone", DATA, { label: "Mobile (10 digits)", type: "text" })).toBe("9876543210");
    expect(M.valueFor("noticePeriod", DATA, { type: "text" })).toBe("30 days");
    expect(M.valueFor("noticePeriod", DATA, { type: "number" })).toBe("30");
    expect(M.valueFor("currentCtc", DATA, { type: "text" })).toBe("6 LPA");
    expect(M.valueFor("github", DATA, {})).toBeNull();
    expect(M.valueFor("school", DATA, {})).toBe("New Horizon College of Engineering");
  });

  it("matches saved answers to similar wording, but not to unrelated questions", () => {
    expect(M.matchSavedAnswer("Are you willing to relocate?", DATA.answers)).toBe("Yes");
    expect(M.matchSavedAnswer("Willing to relocate", DATA.answers)).toBe("Yes");
    expect(M.matchSavedAnswer("Do you require visa sponsorship?", DATA.answers)).toBe("No");
    expect(M.matchSavedAnswer("What is your favourite programming language?", DATA.answers)).toBeNull();
  });

  it("picks the right dropdown option, including number ranges", () => {
    const opts = (...t: string[]) => t.map((x) => ({ text: x, value: x }));
    expect(M.chooseOption(opts("Select...", "0-1 years", "2-3 years", "4-6 years"), "2.5", "yearsExperience")).toBe(2);
    expect(M.chooseOption(opts("Select", "Immediate", "15 days", "1 month", "2 months", "3 months"), "30 days", "noticePeriod")).toBe(3);
    expect(M.chooseOption(opts("Choose", "Yes", "No"), "No", null)).toBe(2);
    expect(M.chooseOption(opts("--", "United States (+1)", "India (+91)"), "+91", "phoneCountryCode")).toBe(2);
    expect(M.chooseOption(opts("Select", "Mumbai", "Bengaluru", "Delhi"), "Bengaluru, Karnataka, India", "location")).toBe(2);
    expect(M.chooseOption(opts("Select", "Red", "Blue"), "Bengaluru", "city")).toBe(-1);
  });

  it("spots submit buttons and confirmation messages", () => {
    expect(M.SUBMIT_TEXT.test("Submit application")).toBe(true);
    expect(M.SUBMIT_TEXT.test("Apply")).toBe(true);
    expect(M.NOT_SUBMIT.test("Save and continue")).toBe(true);
    expect(M.CONFIRMATION.test("Thank you for applying to Acme!")).toBe(true);
    expect(M.CONFIRMATION.test("Your application has been submitted.")).toBe(true);
    expect(M.CONFIRMATION.test("Please complete all required fields")).toBe(false);
  });
});

describe("autofill data and tracking (server side)", () => {
  let db: Database;
  let user: string;

  beforeAll(async () => {
    setStorage(memoryStorage());
  });
  beforeEach(async () => {
    db = await freshDb();
    user = await createUser(db, "asha@example.com");
  });
  afterAll(async () => {
    await db?.close();
  });

  it("returns verified profile facts, a name split, missing items and the resume", async () => {
    await db.withUser(user, async (tx) => {
      await tx.query("update profiles set full_name = 'Asha Rao'");
      await tx.query("update career_profiles set phone = '+91 90000 00000', location = 'Pune, Maharashtra', notice_period_days = 0, expected_ctc_min_lpa = 12");
      await tx.query("insert into employment_history (user_id, company, title, is_current, verified) values ($1, 'Acme Pay', 'Ops Analyst', true, true)", [user]);
      await tx.query("insert into employment_history (user_id, company, title, is_current, verified) values ($1, 'Unverified Co', 'Guess', false, false)", [user]);
    });
    let d = await db.withUser(user, (tx) => getAutofillData(tx));
    expect(d.profile).toMatchObject({ firstName: "Asha", lastName: "Rao", city: "Pune", state: "Maharashtra", country: "India", currentCompany: "Acme Pay", currentTitle: "Ops Analyst", noticePeriodDays: 0, expectedCtcText: "12 LPA" });
    expect(d.missing).toEqual(expect.arrayContaining(["LinkedIn URL", "Resume"]));
    expect(d.resume.available).toBe(false);

    await uploadMasterResume(db, user, { name: "asha-resume.docx", mime: DOCX_MIME, data: await makeResumeDocx() });
    d = await db.withUser(user, (tx) => getAutofillData(tx));
    expect(d.resume.available).toBe(true);
    const f = await db.withUser(user, (tx) => getResumeFile(tx));
    expect(f?.fileName).toMatch(/\.docx$/);
    expect(Buffer.from(f!.base64, "base64").subarray(0, 2).toString()).toBe("PK"); // a real DOCX (zip)
  });

  it("learns answers typed into forms and updates the same question instead of duplicating", async () => {
    await db.withUser(user, (tx) => saveLearnedAnswers(tx, user, [{ question: "Are you willing to relocate?", answer: "Yes" }, { question: "x", answer: "too short question" }]));
    await db.withUser(user, (tx) => saveLearnedAnswers(tx, user, [{ question: "Are you willing to relocate ?", answer: "Yes, within India" }]));
    const rows = await db.withUser(user, (tx) => tx.query("select question, answer from approved_answers"));
    expect(rows).toEqual([{ question: "Are you willing to relocate?", answer: "Yes, within India" }]);
  });

  it("tracks a submitted application once, reusing a saved one and never moving a later stage back", async () => {
    const job = { company: "Acme Pay", roleTitle: "Payments Analyst", url: "https://boards.greenhouse.io/acme/jobs/1" };
    const a = await db.withUser(user, (tx) => markAppliedFromExtension(tx, user, job));
    expect(a).toMatchObject({ existing: false, moved: true, status: "applied" });
    const b = await db.withUser(user, (tx) => markAppliedFromExtension(tx, user, job));
    expect(b).toMatchObject({ id: a.id, existing: true, moved: false });
    await db.withUser(user, (tx) => tx.query("update applications set status = 'interview_scheduled' where id = $1", [a.id]));
    const c = await db.withUser(user, (tx) => markAppliedFromExtension(tx, user, job));
    expect(c).toMatchObject({ moved: false, status: "interview_scheduled" });
    const apps = await db.withUser(user, (tx) => tx.query("select status from applications"));
    expect(apps).toHaveLength(1);
  });

  it("splits Indian locations sensibly", () => {
    expect(splitLocation("Bengaluru, Karnataka, India")).toEqual({ city: "Bengaluru", state: "Karnataka", country: "India" });
    expect(splitLocation("Hyderabad")).toEqual({ city: "Hyderabad", state: null, country: "India" });
    expect(splitLocation("Dubai, UAE")).toEqual({ city: "Dubai", state: null, country: "UAE" });
  });
});
