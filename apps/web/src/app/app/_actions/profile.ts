"use server";

import { redirect } from "next/navigation";
import { careerProfileInput } from "@careerflow/shared";
import { deleteFact, setFactVerified, FACT_TABLES, type FactTable } from "@careerflow/core";
import { act, list, num, optStr, str, type ActionState } from "@/lib/action";
import { withUser } from "@/lib/session";

export async function saveProfile(_: ActionState, f: FormData) {
  return act(async () => {
    const input = careerProfileInput.parse({
      fullName: optStr(f, "fullName"),
      headline: optStr(f, "headline"),
      summary: optStr(f, "summary"),
      location: optStr(f, "location"),
      phone: optStr(f, "phone"),
      yearsExperience: num(f, "yearsExperience"),
      currentCtcLpa: num(f, "currentCtcLpa"),
      expectedCtcMinLpa: num(f, "expectedCtcMinLpa"),
      expectedCtcMaxLpa: num(f, "expectedCtcMaxLpa"),
      noticePeriodDays: num(f, "noticePeriodDays"),
      targetRoles: list(f, "targetRoles"),
      avoidRoles: list(f, "avoidRoles"),
      preferredLocations: list(f, "preferredLocations"),
      workModes: f.getAll("workModes").map(String),
      careerGoals: optStr(f, "careerGoals"),
      linkedinUrl: optStr(f, "linkedinUrl"),
      githubUrl: optStr(f, "githubUrl"),
      portfolioUrl: optStr(f, "portfolioUrl"),
      userType: (optStr(f, "userType") as any) ?? undefined,
    });
    await withUser(async (tx) => {
      await tx.query(
        `update career_profiles set headline=$1, summary=$2, location=$3, phone=$4, years_experience=$5, current_ctc_lpa=$6, expected_ctc_min_lpa=$7,
           expected_ctc_max_lpa=$8, notice_period_days=$9, target_roles=$10::text[], avoid_roles=$11::text[], preferred_locations=$12::text[],
           work_modes=$13::text[], career_goals=$14, linkedin_url=$15, github_url=$16, portfolio_url=$17`,
        [input.headline, input.summary, input.location, input.phone, input.yearsExperience ?? null, input.currentCtcLpa ?? null, input.expectedCtcMinLpa ?? null, input.expectedCtcMaxLpa ?? null, input.noticePeriodDays ?? null, input.targetRoles, input.avoidRoles, input.preferredLocations, input.workModes, input.careerGoals, input.linkedinUrl, input.githubUrl, input.portfolioUrl],
      );
      await tx.query("update profiles set full_name = coalesce($1, full_name), user_type = coalesce($2, user_type)", [input.fullName, input.userType ?? null]);
    });
    return { message: "Profile saved." };
  }, ["/app/profile"]);
}

export async function completeOnboarding(_: ActionState, f: FormData) {
  const r = await act(async () => {
    const userType = str(f, "userType") || "experienced";
    await withUser(async (tx) => {
      await tx.query("update profiles set user_type = $1, onboarding_completed = true, full_name = coalesce(nullif($2,''), full_name)", [userType, str(f, "fullName")]);
      await tx.query(
        "update career_profiles set target_roles = $1::text[], avoid_roles = $2::text[], preferred_locations = $3::text[], location = coalesce(nullif($4,''), location), current_ctc_lpa = $5, expected_ctc_min_lpa = $6, expected_ctc_max_lpa = $7",
        [list(f, "targetRoles"), list(f, "avoidRoles"), list(f, "preferredLocations"), str(f, "location"), num(f, "currentCtcLpa"), num(f, "expectedCtcMinLpa"), num(f, "expectedCtcMaxLpa")],
      );
      await tx.query("update user_preferences set ai_processing_consent = $1", [f.get("aiConsent") === "on"]);
    });
  });
  if (r.ok) redirect("/app?welcome=1");
  return r;
}

const FACT_SQL: Record<FactTable, { cols: string[]; build: (f: FormData) => unknown[] }> = {
  employment_history: {
    cols: ["company", "title", "location", "start_date", "end_date", "is_current", "bullets"],
    build: (f) => [str(f, "company"), str(f, "title"), optStr(f, "location"), optStr(f, "start_date") ? `${str(f, "start_date")}-01` : null, f.get("is_current") === "on" ? null : optStr(f, "end_date") ? `${str(f, "end_date")}-01` : null, f.get("is_current") === "on", str(f, "bullets").split("\n").map((s) => s.replace(/^[•\-*]\s*/, "").trim()).filter(Boolean)],
  },
  education: { cols: ["institution", "degree", "field", "end_year", "grade"], build: (f) => [str(f, "institution"), optStr(f, "degree"), optStr(f, "field"), num(f, "end_year"), optStr(f, "grade")] },
  verified_skills: { cols: ["name", "category", "level", "years", "evidence"], build: (f) => [str(f, "name"), optStr(f, "category"), optStr(f, "level"), num(f, "years"), optStr(f, "evidence")] },
  certifications: { cols: ["name", "issuer", "issued_on", "credential_url"], build: (f) => [str(f, "name"), optStr(f, "issuer"), optStr(f, "issued_on"), optStr(f, "credential_url")] },
  portfolio_projects: {
    cols: ["name", "description", "url", "repo_url", "tech", "highlights", "status"],
    build: (f) => [str(f, "name"), optStr(f, "description"), optStr(f, "url"), optStr(f, "repo_url"), list(f, "tech"), str(f, "highlights").split("\n").map((s) => s.trim()).filter(Boolean), str(f, "status") || "completed"],
  },
  verified_achievements: { cols: ["description", "metric"], build: (f) => [str(f, "description"), optStr(f, "metric")] },
};

/** Adds a fact typed by the user. Facts the user enters themselves are verified. */
export async function addFact(_: ActionState, f: FormData) {
  return act(async () => {
    const table = str(f, "table") as FactTable;
    if (!FACT_TABLES.includes(table)) throw new Error("Unknown section");
    const spec = FACT_SQL[table];
    const values = spec.build(f);
    if (!values[0]) throw new Error("Please fill in the required field.");
    for (const v of values) if (typeof v === "string" && v.length > 3000) throw new Error("Text is too long.");
    await withUser(async (tx, u) => {
      const ph = spec.cols.map((c, i) => (["bullets", "tech", "highlights"].includes(c) ? `$${i + 2}::text[]` : `$${i + 2}`));
      const sql =
        table === "verified_skills"
          ? `insert into verified_skills (user_id, ${spec.cols.join(",")}, source, verified) values ($1, ${ph.join(",")}, 'user_verified', true)
             on conflict (user_id, lower(name)) do update set verified = true, source = 'user_verified', level = coalesce(excluded.level, verified_skills.level), years = coalesce(excluded.years, verified_skills.years), evidence = coalesce(excluded.evidence, verified_skills.evidence)`
          : `insert into ${table} (user_id, ${spec.cols.join(",")}, source, verified) values ($1, ${ph.join(",")}, 'user_verified', true)`;
      await tx.query(sql, [u.id, ...values]);
    });
    return { message: "Added to your verified profile." };
  }, ["/app/profile"]);
}

export async function verifyFact(_: ActionState, f: FormData) {
  return act(async () => {
    const table = str(f, "table") as FactTable;
    await withUser((tx) => setFactVerified(tx, table, str(f, "id"), str(f, "verified") !== "false"));
    return { message: str(f, "verified") === "false" ? "Marked as unverified." : "Verified." };
  }, ["/app/profile"]);
}

export async function removeFact(_: ActionState, f: FormData) {
  return act(async () => {
    await withUser((tx) => deleteFact(tx, str(f, "table") as FactTable, str(f, "id")));
    return { message: "Removed." };
  }, ["/app/profile"]);
}

export async function verifyAllExtracted(_: ActionState, f: FormData) {
  return act(async () => {
    const table = str(f, "table") as FactTable;
    if (!FACT_TABLES.includes(table)) throw new Error("Unknown section");
    await withUser((tx) => tx.query(`update ${table} set verified = true, source = 'user_verified' where not verified`));
    return { message: "All items in this section are now verified." };
  }, ["/app/profile"]);
}

export async function setProjectStatus(_: ActionState, f: FormData) {
  return act(async () => {
    const status = str(f, "status");
    if (!["completed", "in_progress", "idea"].includes(status)) throw new Error("Invalid status");
    await withUser((tx) => tx.query("update portfolio_projects set status = $2 where id = $1", [str(f, "id"), status]));
  }, ["/app/profile"]);
}
