import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
// @ts-expect-error plain JS module shipped with the extension
import { buildJob, normalizeAppUrl, parseJobPostingJsonLd, portalFromHost } from "../apps/extension/src/lib.js";

describe("Chrome extension", () => {
  it("uses minimal permissions and no broad host access", () => {
    const m = JSON.parse(fs.readFileSync(path.join(__dirname, "../apps/extension/src/manifest.json"), "utf8"));
    expect(m.manifest_version).toBe(3);
    expect(m.permissions.sort()).toEqual(["activeTab", "scripting", "storage"]);
    expect(m.host_permissions).toBeUndefined();
    expect(m.content_scripts).toBeUndefined(); // no always-on page access
    expect(m.background).toBeUndefined();
  });

  it("parses schema.org JobPosting data", () => {
    const ld = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "JobPosting",
      title: "Payments Operations Analyst",
      hiringOrganization: { "@type": "Organization", name: "Acme Pay" },
      jobLocation: { "@type": "Place", address: { addressLocality: "Bengaluru", addressRegion: "KA" } },
      description: "<p>Reconcile <b>settlements</b>.</p><ul><li>SQL</li></ul>",
      identifier: { value: "REQ-77" },
    });
    const j = parseJobPostingJsonLd(["not json", ld]);
    expect(j).toMatchObject({ roleTitle: "Payments Operations Analyst", company: "Acme Pay", location: "Bengaluru, KA", externalJobId: "REQ-77" });
    expect(j.description).toContain("Reconcile settlements");
  });

  it("builds a job from page data and detects the portal", () => {
    const job = buildJob({ url: "https://www.naukri.com/job-listings-data-analyst-123?src=x#top", title: "", h1: "Data Analyst - Beta Corp", ogTitle: "", siteName: "", selection: "", mainText: "Long description", jsonLd: [] });
    expect(job.portal).toBe("Naukri");
    expect(job.roleTitle).toBe("Data Analyst");
    expect(job.company).toBe("Beta Corp");
    expect(job.url).toBe("https://www.naukri.com/job-listings-data-analyst-123?src=x");
    expect(portalFromHost("boards.greenhouse.io")).toBe("Company site (Greenhouse)");
  });

  it("only accepts https app URLs (http only for localhost)", () => {
    expect(normalizeAppUrl("http://localhost:3100/")).toBe("http://localhost:3100");
    expect(normalizeAppUrl("https://cf.example.com/app")).toBe("https://cf.example.com");
    expect(() => normalizeAppUrl("http://evil.example.com")).toThrow(/https/);
  });
});
