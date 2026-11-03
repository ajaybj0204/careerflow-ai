// CareerFlow form understanding: works out what an application-form field is asking for and which
// profile value answers it. Pure logic (no DOM, no network) so it can be unit-tested.
// Loaded as a plain script into pages; exposes globalThis.CFMatch.
(function () {
  if (globalThis.CFMatch) return;

  const norm = (s) =>
    String(s || "")
      .toLowerCase()
      .replace(/[_\-./[\]()]+/g, " ")
      .replace(/[^\p{L}\p{N}\s+]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();

  // Common words plus words that differ between forms but mean the same here ("about us" vs "about this job")
  const STOP = new Set("a an the of to for in on at and or is are do does did you your yours we our with be been this that what which how please if any have has us about job role position opening company organisation organization here".split(" "));
  const tokens = (s) => norm(s).split(" ").filter((t) => t && !STOP.has(t));

  /** Questions CareerFlow never answers for you (legal/personal). They are highlighted for you to fill. */
  const SENSITIVE = /\b(gender|sex|pronouns?|ethnic\w*|race|racial|veterans?|disab\w*|caste|religio\w*|marital|date of birth|birth ?date|dob|age|aadha+r|pan|pan card|passport|ssn|social security|national id|criminal|convict\w*|sexual orientation|nationality)\b/i;

  // Ordered: first match wins. `attr` matches name/id/autocomplete/automation ids; `label` matches the visible question.
  const RULES = [
    { key: "skip", label: /middle\s*name|maiden name|preferred (first )?name|nick ?name/i },
    { key: "firstName", attr: /\b(first ?name|given ?name|fname|firstname|legalname.*first)\b/i, label: /^(legal )?first\s*name|^given name/i },
    { key: "lastName", attr: /\b(last ?name|family ?name|surname|lname|lastname|legalname.*last)\b/i, label: /^(legal )?(last\s*name|surname|family name)/i },
    { key: "email", attr: /e ?mail/i, label: /e-?mail/i },
    { key: "phoneCountryCode", attr: /country ?code|dial ?code|phone ?code|phonecode|countrycode/i, label: /country\s*code|dial(l?ing)?\s*code|phone\s*code/i },
    { key: "phone", attr: /\b(phone|mobile|tel|cell|contact ?number)\b/i, label: /phone|mobile|contact (no|number)|whatsapp|telephone/i },
    { key: "linkedin", attr: /linkedin/i, label: /linked\s*in/i },
    { key: "github", attr: /github/i, label: /git\s*hub/i },
    { key: "portfolio", attr: /\b(portfolio|website|personal ?url|blog)\b/i, label: /portfolio|personal (web)?site|^website|blog|other (url|link|website)/i },
    { key: "fullName", attr: /^(full ?name|name|your ?name|candidate ?name|applicant ?name)$/i, label: /^(full\s*name|name|your (full )?name|candidate name|applicant name)$/i },
    { key: "currentCtc", label: /(current|present|last drawn|existing)\s*(annual\s*)?(ctc|salary|compensation|package|fixed)/i },
    { key: "expectedCtc", label: /(expected|desired)\s*(annual\s*)?(ctc|salary|compensation|package)|salary expectation|expected pay/i },
    { key: "noticePeriod", label: /notice\s*period|when can you (join|start)|earliest (start|joining) date|joining (time|availability)|availability to (join|start)|how soon can you join/i },
    { key: "yearsExperience", label: /(total|overall|years of|relevant|work)\s*(work\s*)?experience|experience\s*\(?in years|how many years|years of (professional|relevant)|^experience$/i },
    { key: "currentCompany", attr: /\b(current ?company|employer|org|organization|company ?name)\b/i, label: /^(current\s*)?(company|employer|organi[sz]ation)(\s*name)?$|current (company|employer|organi[sz]ation)|present employer/i },
    { key: "currentTitle", attr: /\b(current ?title|job ?title|designation)\b/i, label: /current (job )?(title|designation|role|position)|^(job )?title$|^designation$|present designation/i },
    { key: "city", attr: /\bcity\b/i, label: /^(current\s*)?city|town/i },
    { key: "state", attr: /\b(state|province|region)\b/i, label: /^(state|province|region)/i },
    { key: "country", attr: /\bcountry\b/i, label: /^country( of residence)?$|^country\b/i },
    { key: "location", attr: /\blocation\b/i, label: /^(current\s*)?location|where are you (currently )?(based|located)|current address city|place of residence/i },
    { key: "pincode", label: /pin\s*code|postal|zip/i },
    { key: "address", label: /address/i },
    { key: "school", attr: /\b(school|college|university|institution)\b/i, label: /^(school|college|university|institut(e|ion))( name| or (college|university))?$|name of (the )?(school|college|university|institution)/i },
    { key: "degree", label: /^(degree|qualification|highest qualification|education level)$/i },
    { key: "discipline", label: /discipline|major|field of study|specialization|specialisation|branch|stream/i },
    { key: "gradYear", label: /(graduation|passing)\s*(year|date)|year of (passing|graduation)|graduat(ed|ion) in/i },
    { key: "skills", label: /^(key\s*)?skills|technical skills|technologies you know/i },
    { key: "summary", label: /^(professional\s*)?summary$|about (yourself|you)$|tell us about yourself|profile summary|brief introduction/i },
    { key: "headline", label: /^headline$/i },
  ];

  /**
   * desc: { label, name, id, placeholder, autocomplete, type, tag, automationId }
   * Returns a profile key, "skip", "sensitive", "resume", "coverLetter" or null (unknown / open question).
   */
  function classifyField(desc) {
    const label = String(desc.label || "").replace(/\*/g, "").replace(/\(required\)|\(optional\)|required/gi, "").trim();
    // "job_application[last_name]" → "job application last name" so word rules apply to attributes too
    const attrs = [desc.name, desc.id, desc.automationId, desc.placeholder]
      .filter(Boolean)
      .join(" ")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[_\-[\].]+/g, " ");
    const all = `${label} ${attrs}`;
    if (SENSITIVE.test(label) || (!label && SENSITIVE.test(attrs))) return "sensitive";
    if (desc.type === "file") {
      if (/cover/i.test(all)) return "coverLetter";
      if (/resume|cv\b|curriculum|attach|upload/i.test(all) || !label) return "resume";
      return null;
    }
    const ac = String(desc.autocomplete || "").toLowerCase();
    const AC = { "given-name": "firstName", "family-name": "lastName", name: "fullName", email: "email", tel: "phone", "tel-national": "phone", "address-level2": "city", "address-level1": "state", "country-name": "country", country: "country", "postal-code": "pincode", organization: "currentCompany", "organization-title": "currentTitle", url: "portfolio" };
    if (AC[ac]) return AC[ac];
    if (desc.type === "email") return "email";
    if (desc.type === "tel") return "phone";
    // A long question ("Why do you want to work at our company?") is an open question, not a profile field
    const longQuestion = label.length > 70 || (/\?$/.test(label) && label.split(" ").length > 6);
    for (const r of RULES) {
      if (r.label && label && !longQuestion && r.label.test(label)) return r.key;
      if (r.attr && r.attr.test(attrs) && (!label || !longQuestion)) return r.key;
    }
    if (!label && /\bname\b/i.test(attrs) && !/company|school|user|file|ref/i.test(attrs)) return "fullName";
    return null;
  }

  const lpa = (n) => (n === null || n === undefined ? null : `${n} LPA`);

  /** The value for a classified field, or null when the profile does not have it. */
  function valueFor(key, data, desc) {
    const p = (data && data.profile) || {};
    const edu = (data && data.education && data.education[0]) || {};
    const numeric = desc && (desc.type === "number" || desc.inputmode === "numeric" || desc.inputmode === "decimal");
    switch (key) {
      case "firstName":
        return p.firstName;
      case "lastName":
        return p.lastName;
      case "fullName":
        return p.fullName;
      case "email":
        return p.email;
      case "phone": {
        if (!p.phone) return null;
        const digits = String(p.phone).replace(/[^\d+]/g, "");
        // Many Indian forms want the 10-digit number without +91
        if (desc && (numeric || /10.?digit|without (country|\+91)/i.test(desc.label || "") || Number(desc.maxLength) === 10)) return digits.replace(/^\+?91/, "").slice(-10);
        return p.phone;
      }
      case "phoneCountryCode":
        return p.phone && /^\+/.test(p.phone) ? (p.phone.match(/^\+\d{1,3}/) || ["+91"])[0] : "+91";
      case "linkedin":
        return p.linkedin;
      case "github":
        return p.github;
      case "portfolio":
        return p.portfolio || p.linkedin;
      case "city":
        return p.city;
      case "state":
        return p.state;
      case "country":
        return p.country;
      case "location":
        return p.location;
      case "currentCompany":
        return p.currentCompany;
      case "currentTitle":
        return p.currentTitle;
      case "yearsExperience":
        return p.yearsExperience === null || p.yearsExperience === undefined ? null : String(p.yearsExperience);
      case "noticePeriod":
        if (p.noticePeriodDays === null || p.noticePeriodDays === undefined) return null;
        if (numeric) return String(p.noticePeriodDays);
        return p.noticePeriodDays === 0 ? "Immediate" : `${p.noticePeriodDays} days`;
      case "currentCtc":
        return numeric ? (p.currentCtcLpa === null ? null : String(p.currentCtcLpa)) : lpa(p.currentCtcLpa);
      case "expectedCtc":
        return numeric ? (p.expectedCtcLpa === null ? null : String(p.expectedCtcLpa)) : p.expectedCtcText;
      case "school":
        return edu.institution || null;
      case "degree":
        return edu.degree || null;
      case "discipline":
        return edu.field || null;
      case "gradYear":
        return edu.endYear ? String(edu.endYear) : null;
      case "skills":
        return data && data.skills && data.skills.length ? data.skills.slice(0, 15).join(", ") : null;
      case "summary":
        return p.summary;
      case "headline":
        return p.headline;
      default:
        return null;
    }
  }

  /** Best saved answer for a question, by word overlap. Returns the answer text or null. */
  function matchSavedAnswer(question, answers) {
    const q = tokens(question);
    if (q.length === 0 || !answers || !answers.length) return null;
    const qn = norm(question);
    let best = null;
    let bestScore = 0;
    for (const a of answers) {
      const an = norm(a.question);
      if (an === qn) return a.answer;
      const t = tokens(a.question);
      if (!t.length) continue;
      const set = new Set(t);
      const inter = q.filter((x) => set.has(x)).length;
      // Overlap, or one question fully containing the other's key words ("visa sponsorship?" vs "visa sponsorship to work in India?")
      const shorter = Math.min(q.length, t.length);
      const score = Math.max(inter / Math.max(q.length, t.length), inter === shorter && shorter >= 3 ? 0.75 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = a.answer;
      }
    }
    return bestScore >= 0.7 ? best : null;
  }

  const YES = /^(yes|y|true|agree|i agree|i do|i am|i have|i will|willing|open to it|sure)\b/i;
  const NO = /^(no|n|false|not|i do not|i don't|i am not|i'm not|never)\b/i;

  /** Numbers in an option label: "2-3 years" → [2,3], "5+ years" → [5, Infinity], "Immediate" → [0,0], "1 month" → days. */
  function optionRange(text, unit) {
    const t = norm(text);
    if (/immediate|immediately|serving|already/.test(t)) return [0, 0];
    const nums = (t.match(/\d+(\.\d+)?/g) || []).map(Number);
    if (!nums.length) return null;
    let mult = 1;
    if (unit === "days" && /month/.test(t)) mult = 30;
    if (unit === "days" && /week/.test(t)) mult = 7;
    if (/\+|above|more than|over|plus/.test(t) && nums.length === 1) return [nums[0] * mult, Infinity];
    if (/less than|below|under|upto|up to|within/.test(t) && nums.length === 1) return [0, nums[0] * mult];
    if (nums.length >= 2) return [nums[0] * mult, nums[1] * mult];
    return [nums[0] * mult, nums[0] * mult];
  }

  const PLACEHOLDER_OPTION = /^(select|choose|please select|--|—|pick|none selected)\b|^\s*$/i;

  /**
   * Picks the option (index) that matches a wanted value. options: [{text, value}].
   * key helps with numeric ranges (experience, notice, CTC). Returns -1 if nothing matches well.
   */
  function chooseOption(options, wanted, key) {
    if (wanted === null || wanted === undefined || wanted === "") return -1;
    const w = norm(wanted);
    const real = options.map((o, i) => ({ i, t: norm(o.text || o.value), v: norm(o.value) })).filter((o) => o.t && !PLACEHOLDER_OPTION.test(o.t));
    let hit = real.find((o) => o.t === w || o.v === w);
    if (hit) return hit.i;
    // Yes / No style answers
    if (YES.test(String(wanted).trim())) {
      hit = real.find((o) => YES.test(o.t));
      if (hit) return hit.i;
    }
    if (NO.test(String(wanted).trim())) {
      hit = real.find((o) => NO.test(o.t));
      if (hit) return hit.i;
    }
    // Numeric ranges
    if (["yearsExperience", "noticePeriod", "currentCtc", "expectedCtc", "gradYear"].includes(key)) {
      const n = parseFloat(String(wanted).match(/\d+(\.\d+)?/)?.[0] ?? (/immediate/i.test(wanted) ? "0" : "NaN"));
      if (!Number.isNaN(n)) {
        const unit = key === "noticePeriod" ? "days" : null;
        for (const o of real) {
          const r = optionRange(o.t, unit);
          if (r && n >= r[0] && n <= r[1]) return o.i;
        }
      }
    }
    // Country code like "+91" against "India (+91)"
    if (key === "phoneCountryCode" || key === "country") {
      hit = real.find((o) => o.t.includes(w) || (w === "+91" && /india/.test(o.t)) || (w === "india" && /\+?91\b/.test(o.t) && /india/.test(o.t)));
      if (hit) return hit.i;
    }
    // Contains either way (e.g. "Bengaluru" vs "Bengaluru, Karnataka"), preferring the shortest such option
    const contains = real.filter((o) => (w.length >= 3 && o.t.includes(w)) || (o.t.length >= 3 && w.includes(o.t))).sort((a, b) => a.t.length - b.t.length);
    if (contains.length) return contains[0].i;
    return -1;
  }

  /** Is this an open question an AI draft could help with (rather than a short fact)? */
  function isOpenQuestion(desc) {
    const label = String(desc.label || "").trim();
    if (label.length < 12) return false;
    if (desc.tag === "textarea") return true;
    // One-line inputs: only real "explain yourself" questions, not short facts like "What is your favourite colour?"
    return /^(why|how would|how do|how have|describe|tell us|explain|share|what (makes|interests|excites|motivates|would))\b/i.test(label);
  }

  const SUBMIT_TEXT = /^(submit|apply|apply now|send application|submit application|finish|complete application|send)\b/i;
  const NOT_SUBMIT = /save|next|continue|back|upload|add|sign ?in|log ?in|search|cancel|previous|review/i;
  const CONFIRMATION = /thank(s| you)\s+for\s+(applying|your application|submitting|your interest)|application\s+(has been\s+|was\s+|is\s+)?(received|submitted|sent|complete)|we('ve| have)\s+received\s+your\s+application|successfully\s+(applied|submitted)|you('ve| have)\s+(successfully\s+)?applied|application\s+successful/i;

  globalThis.CFMatch = { norm, tokens, classifyField, valueFor, matchSavedAnswer, chooseOption, optionRange, isOpenQuestion, SENSITIVE, SUBMIT_TEXT, NOT_SUBMIT, CONFIRMATION };
})();
