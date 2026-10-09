#!/usr/bin/env node
/**
 * Severity score for every feed row + data/highlights.json (worst recent crimes first).
 *   node scripts/severity.mjs [harvest file] [highlights file]
 *
 * Reads ONLY the row's own charge wording (crime + text; the release headline `usa` is used
 * only when those name no scorable crime). It never edits crime/text/usa or the stage; it only
 * adds three fields right after `when`:
 *   severity        integer, SUM over the person's DISTINCT crimes of
 *                   points (scripts/severity-points.json) x stage weight x count bonus
 *   severityCrimes  labels of the crimes that scored, highest points first
 *   severityReason  the top label ("" when nothing scored), used as the card tag
 * Stage weight is PER CRIME (Krennic 2026-10-09: convicted 100%, charged / arrested / pending 90%):
 * on a row whose data stage is "Convicted" (or a "Removed" row whose wording says convicted / sentenced /
 * pleaded guilty), each crime takes the stage of the wording tied to it (stageNear: the nearest stage word
 * before it in the same sentence, or "<crime> charge pending" after it). A crime only ever mentioned under
 * pending / charged / accused / awaiting-trial wording gets stage.notConvicted; unclear -> the row stage.
 * Charged / Arrested / As posted / other rows: every crime = stage.notConvicted (never upgraded).
 * Each crime type counts once per person; "N counts of X" adds extraCountBonus per extra count,
 * capped at extraCountBonusCap.
 *
 * highlights.json: approved rows whose `when` is within the last highlights.days days
 * (same rule as the app's 7d filter: UTC midnight of `when` >= now - days), severity > 0,
 * sorted severity desc, then newest, then name; top highlights.limit.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const TABLE = JSON.parse(readFileSync(new URL("./severity-points.json", import.meta.url), "utf8"));

const CHILD = String.raw`(?:child(?:ren)?|minors?|juveniles?|(?:victim[- ]while[- ])?under(?:[- ]the[- ]age[- ]of)?[- ](?:1[0-7]|thirteen|fourteen|fifteen|sixteen|seventeen)|\d{1,2}[- ]year[- ]old (?:child|girl|boy|victim)|age 1[0-7]|less[- ]than[- ](?:1[0-7]|[1-9])[- ]years?(?:[- ]of[- ]age|[- ]old)?)`;
const OFFICER = String.raw`(?:police|law enforcement|nypd|lapd|ice|cbp|border patrol|federal|correctional|detention|peace)?\s*(?:officers?|detectives?|deput(?:y|ies)|troopers?|agents?|cops?|policem[ae]n)\b`;

const DRUG = String.raw`(?:fentanyl|cocaine|heroin|morphine|(?:crystal\s+)?(?:meth)?amphetamines?|meth|marijuana|cannabis|narcotics?|controlled\s+substances?|drugs?|opioids?|crack|oxycodone|methamphetamine)`;
const DRUG_TRADE = String.raw`(?:traffick\w*|distribut\w*|smuggl\w*|deliver\w*|manufactur\w*|mfr|importation|import\w*|sale|sell\w*|dealing)`;

/** Order matters: a matched span is blanked out before the later categories run. */
export const PATTERNS = [
  ["animalSex", [/\b(?:sexual (?:abuse|contact) (?:of|with) an animal|bestiality)\b/gi]],
  ["skip", [/\b(?:cruelty to animals?|animal cruelty)\b/gi]],
  ["childSex", [
    new RegExp(String.raw`\b(?:rape|sexual(?:ly)?\s+(?:abuse|assault|conduct|exploitation|contact|battery|offen[cs]e|intercourse|penetration)\w*|sex(?:ual)?\s+(?:abuse|assault|offen[cs]e|crimes?)|indecen(?:t|cy)(?:\s+\w+){0,4}|lewd(?:\s+(?:or|and)\s+lascivious)?(?:\s+\w+){0,3}|molest\w*|indecent liberties|sodomy)(?:(?!\s(?:and|or)\s|,)[^;.]){0,40}?\b(?:with|of|on|upon|against|involving|to|a)\b(?:(?!\s(?:and|or)\s|,)[^;.]){0,25}?${CHILD}`, "gi"),
    new RegExp(String.raw`\b(?:child|minor)\s+(?:porn\w*|sex\w*|molest\w*|exploitation|sexual abuse|abuse material)|\bchild molestation|\bmolest\w*|\bstatutory\s+(?:rape|sex\w*(?:\s+offen[cs]e)?)|\bcsam\b|obscene material depicting minors|harmful material to a minor|enticement of a minor|sexually abuse a \d{1,2}[- ]year[- ]old|criminal sexual conduct[^;.]{0,30}person under|\bcourse of sexual conduct\b`, "gi"),
    /\b(?:coercion and enticement|persuade,\s+induce,\s+entice|entice(?:ment)?,?\s+and\s+coerce)\b/gi,
  ]],
  ["attemptedMurder", [
    /\b(?:attempt(?:ed|ing)?|conspiracy|conspiring|solicitation)\s+(?:to\s+(?:commit\s+)?)?(?:(?:first|second|1st|2nd)[- ]degree\s+)?(?:murder|homicide|kill)\w*/gi,
  ]],
  ["officer", [
    new RegExp(String.raw`\b(?:assault\w*|attack\w*|stab\w*|shoot\w*|shot|strik\w*|battery|ramm\w*|injur\w*|fired at|dragg\w*|kill\w*)\b[^;,]{0,80}?\b${OFFICER}`, "gi"),
    new RegExp(String.raw`\b${OFFICER}[^;.]{0,30}\b(?:was|were)\s+(?:stabbed|shot|assaulted|attacked|struck|injured|dragged)`, "gi"),
  ]],
  ["murder", [/\b(?:murder\w*|homicide|manslaughter|massacr\w*)\b/gi]],
  ["kidnapping", [/\b(?:kidnap\w*|abduct\w*|human trafficking|sex trafficking|labor trafficking|trafficking (?:in|of) persons)\b/gi]],
  ["rape", [/\b(?:rap(?:e|ed|es|ing)|sexual\s+(?:assault|battery|abuse|penetration)|sex crimes?|indecent assault|sodomy|forcible fondling|(?:sexual\s+)?intercourse\s+with\s+(?:another|a person|an individual)\s+without\s+(?:\w+\s+)?consent)\b/gi]],
  // "sexually assaulted her": narrative wording, counted as rape only if no child sex crime / rape charge was found.
  ["rapeNarrative", [/\bsexually\s+(?:assault|abus|batter)\w*/gi]],
  ["childViolence", [
    new RegExp(String.raw`\b(?:child abuse|abuse of a child|cruelty to (?:a\s+)?(?:child|children|juvenile)|injury to (?:a\s+)?child|(?:assault|battery|beat\w*|strangl\w*|abus\w*)\b[^;.]{0,20}\b(?:on|of|upon|against)\s+(?:a\s+)?${CHILD})`, "gi"),
  ]],
  ["terrorism", [/\b(?:terrorist plot|terror plot|act of terrorism|terrorist attack|terrorist threat|domestic terrorism)\b/gi]],
  ["materialSupport", [/\bmaterial support\b/gi]],
  ["robberyAssault", [/\b(?:robb\w*|carjack\w*|(?:aggravated|felonious|malicious|domestic)\s+assault(?!\s+(?:weapon|rifle))\w*|(?:aggravated|domestic)\s+battery|domestic violence|deadly conduct)\b/gi]],
  ["assault", [/\b(?:assault(?!\s+(?:weapon|rifle))\w*|battery|strangulation)\b/gi]],
  ["alienSmuggling", [/\b(?:smuggl\w*\s+(?:illegal\s+)?aliens?|alien smuggling|human smuggling|smuggling of (?:illegal\s+)?aliens?)\b/gi]],
  ["weaponsSkip", [/\b(?:with|using)\s+an?\s+(?:deadly\s+|dangerous\s+)?(?:weapon|firearm|gun|knife)\b/gi]],
  ["weapons", [/\b(?:firearms?|guns?|handguns?|rifles?|shotguns?|ammunition|weapons?|explosives?)\b/gi]],
  // Trafficking (50) only with trafficking / distribution / intent-to-distribute / smuggling wording tied to a drug word;
  // any other drug wording ("possession of controlled substance", "drug charges") is Drug possession (30).
  ["drugs", [
    new RegExp(String.raw`\b${DRUG}\b(?:(?![.;,])[^]){0,40}?\b${DRUG_TRADE}|\b${DRUG_TRADE}(?:(?![.;,])[^]){0,40}?\b${DRUG}\b|\b(?:possess\w*\s+with\s+)?intent\s+to\s+(?:distribute|deliver|sell)\b|\bdrug[- ]traffick\w*`, "gi"),
  ]],
  ["drugPossession", [new RegExp(String.raw`\b${DRUG}\b`, "gi")]],
  ["fraud", [/\b(?:fraud\w*|identity theft|money laundering|launder\w*|forg\w*|counterfeit\w*|false statements?|false claims? (?:to|of) (?:u\.s\.\s+)?citizenship|vot(?:e|ed|ing)\s+(?:as|by)\s+(?:an\s+alien|a\s+non-?citizen)|unlawful(?:ly)? vot\w*|illegal(?:ly)? vot\w*|voter fraud|procure naturalization unlawfully|embezzl\w*|scam\w*)\b/gi]],
  ["theft", [/\b(?:burglar\w*|theft|larceny|shoplift\w*|receiving stolen|stolen property|breaking and entering)\b/gi]],
  ["dui", [/\b(?:(?:dui|dwi|owi)s?|driving under the influence|driving while (?:intoxicated|impaired|under the influence)|drunk driving|operating (?:a (?:motor )?vehicle )?while (?:intoxicated|impaired))\b/gi]],
  ["immigration", [/\b(?:illegal(?:ly)?\s+re-?entr\w*|illegal\s+entry|unlawful(?:ly)?\s+re-?entr\w*|illegally re-?entering|re-?entry (?:after|of a removed)|immigration violation|found in the united states after)\b/gi]],
];

const NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const COUNT_BEFORE = /\b(\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:(?:separate|pending|felony|misdemeanor)\s+)*(?:counts?\s+of\s+)?$/i;
const COUNT_AFTER = /^\s*(?:charges?|counts?)\b/i;

/** Editorial notes added by the harvest (not charge wording), URLs and handles. */
export function cleanText(s) {
  return String(s || "")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/@\w+/g, " ")
    .replace(/Do not (?:name|invent)[^.]*\./gi, " ")
    .replace(/Conviction stated = \w+\.|Not Removed\.|The arrest is not a removal\.|LPR ≠ illegally present\./gi, " ")
    .replace(/^\s*(?:Removed\.\s*)?(?:Convicted|Charged(?:\s*\(not convicted\))?|Arrested|As posted|Removed)\s*[:.]\s*/i, " ")
    .replace(/\s+/g, " ");
}

function headline(usa) {
  return String(usa || "").replace(/^[^:]{0,60}\b(?:release|post)\b[^:]*:\s*/i, "").replace(/\|\s*Homeland Security\s*$/i, "");
}

/** Distinct crime keys found in text, with the explicit count (1 if none stated). */
export function crimesIn(text) {
  return crimeHits(text).found;
}

/** crimesIn plus where each crime was matched: { found: Map key->count, at: Map key->[[start,end]...], text } (offsets in ` ${text} `). */
export function crimeHits(text) {
  let s = ` ${text} `;
  const orig = s;
  const found = new Map();
  const at = new Map();
  let officerLethal = false;
  for (const [key, res] of PATTERNS) {
    for (const re of res) {
      re.lastIndex = 0;
      const hits = [...s.matchAll(re)];
      for (const m of hits) {
        if (key !== "weaponsSkip" && key !== "skip") {
          const before = s.slice(Math.max(0, m.index - 40), m.index);
          const after = s.slice(m.index + m[0].length, m.index + m[0].length + 12);
          const b = before.match(COUNT_BEFORE);
          let n = 1;
          // "N counts of X" / "N X charges" / "two DUIs" (a number right before a plural DUI / DWI)
          if (b && (/counts?\s+of\s+$/i.test(before) || COUNT_AFTER.test(after) || (key === "dui" && /^(?:dui|dwi|owi)s$/i.test(m[0]) && /\s$/.test(before) && !/\bcounts?\s+of\s+$/i.test(before)))) n = Number(b[1]) || NUM[b[1].toLowerCase()] || 1;
          found.set(key, Math.max(found.get(key) || 0, n));
          if (!at.has(key)) at.set(key, []);
          at.get(key).push([m.index, m.index + m[0].length]);
          if (key === "officer" && /\b(?:stab\w*|shoot\w*|shot|kill\w*|fired at)\b/i.test(m[0])) officerLethal = true;
        }
      }
      for (const m of hits) s = s.slice(0, m.index) + " ".repeat(m[0].length) + s.slice(m.index + m[0].length);
    }
  }
  found.delete("weaponsSkip");
  found.delete("skip");
  if (found.has("rapeNarrative") && !found.has("rape") && !found.has("childSex")) { found.set("rape", found.get("rapeNarrative")); at.set("rape", at.get("rapeNarrative")); }
  found.delete("rapeNarrative");
  // Trafficking already covers the drugs it names ("trafficking in heroin and possession of heroin" = one drug crime).
  if (found.has("drugs")) found.delete("drugPossession");
  // Stabbing or shooting an officer, with no murder charge named, is attempted murder as well as an attack on an officer.
  if (officerLethal && !found.has("murder")) { found.set("attemptedMurder", Math.max(found.get("attemptedMurder") || 0, 1)); if (!at.has("attemptedMurder")) at.set("attemptedMurder", at.get("officer") || []); }
  for (const k of [...at.keys()]) if (!found.has(k)) at.delete(k);
  return { found, at, text: orig };
}

// Stage wording that sets the stage of the crimes after it (until the next one or the sentence end).
const CONVICT_MARK = /\b(?:convicted|convictions?|sentenced|pleaded guilty|pled guilty|pleads guilty|found guilty|guilty plea)\b/gi;
const PENDING_MARK = /\b(?:pending|charged|charges?|charging|indicted|indictment|accused|alleged(?:ly)?|awaiting\s+trial|faces|facing|arrested\s+(?:for|on)|arrests?\s+for|wanted\s+for|suspected\s+of|complaint)\b/gi;
// "... murder charge pending" / "... charges are pending": the marker sits after the crime.
const PENDING_AFTER = /^[^.;,]{0,30}?\b(?:charges?|counts?)\s+(?:is\s+|are\s+|remain\s+|still\s+)?pending\b/i;

/**
 * Stage of ONE crime occurrence from the stage wording tied to it: the nearest stage word before it in the
 * same sentence ("convicted of X and has pending charges for Y"), or "<X> charge(s) pending" right after it.
 * null when the sentence says nothing (caller falls back to the row stage).
 */
export function stageNear(text, start, end) {
  if (PENDING_AFTER.test(text.slice(end, end + 60))) return "notConvicted";
  const sentStart = Math.max(text.lastIndexOf(". ", start), text.lastIndexOf("! ", start), text.lastIndexOf("? ", start), 0);
  const seg = text.slice(sentStart, start);
  let best = null;
  for (const [re, st] of [[CONVICT_MARK, "convicted"], [PENDING_MARK, "notConvicted"]]) {
    re.lastIndex = 0;
    for (const m of seg.matchAll(re)) if (!best || m.index > best.i) best = { i: m.index, st };
  }
  return best ? best.st : null;
}

const CONVICT_WORDS = /\b(?:convicted|convictions?|sentenced|pleaded guilty|pled guilty|found guilty)\b/i;

/** "convicted" (full points) or "notConvicted". Follows the data's stage; never upgrades a Charged/Arrested/As posted row. */
export function stageOf(row) {
  const c = String(row?.crime || "").trim();
  if (/^(?:Removed\.\s*)?Convicted\b/i.test(c)) return "convicted";
  if (/^Removed\b/i.test(c) && CONVICT_WORDS.test(c) && !/\bnot convicted\b/i.test(c)) return "convicted";
  return "notConvicted";
}

/**
 * releaseRows: how many feed rows share this row's release (sourceUrl). The release headline is
 * only used for a release about 1-2 people; a round-up headline ("... gang members deported")
 * says nothing about any one person.
 */
export function scoreRow(row, table = TABLE, { releaseRows = 1 } = {}) {
  let hits = crimeHits(cleanText(`${row?.crime || ""} . ${row?.text || ""}`));
  let from = "charge";
  if (!hits.found.size && releaseRows <= 2) {
    hits = crimeHits(cleanText(headline(row?.usa)));
    from = hits.found.size ? "headline" : "none";
  }
  const rowStage = stageOf(row);
  const parts = [...hits.found].map(([key, n]) => {
    const def = table.crimes[key];
    const bonus = Math.min(table.extraCountBonusCap, table.extraCountBonus * Math.max(0, n - 1));
    // Per-crime stage: the wording tied to this crime decides; unclear -> the row stage. Never above the row stage
    // (a Charged / Arrested / As posted row is never scored as convicted). Any convicted mention wins for the crime.
    let stage = rowStage;
    if (rowStage === "convicted" && from === "charge") {
      const st = (hits.at.get(key) || []).map(([a, b]) => stageNear(hits.text, a, b) || rowStage);
      if (st.length && !st.includes("convicted")) stage = "notConvicted";
    }
    const w = table.stage[stage] ?? 1;
    return { key, label: def.label, count: n, stage, points: def.points * w * (1 + bonus) };
  }).sort((a, b) => b.points - a.points || a.label.localeCompare(b.label));
  const severity = Math.round(parts.reduce((t, p) => t + p.points, 0));
  return { severity, severityReason: parts[0]?.label || "", severityCrimes: parts.map((p) => p.label), parts, from, stage: rowStage };
}

const FIELDS = ["severity", "severityReason", "severityCrimes"];

/** Same row with severity fields placed right after `when` (or at the end). Nothing else changes. */
export function withSeverity(row, table = TABLE, opts = {}) {
  if (!row || typeof row !== "object") return row;
  const s = scoreRow(row, table, opts);
  const add = { severity: s.severity, severityReason: s.severityReason, severityCrimes: s.severityCrimes };
  const out = {};
  let placed = false;
  for (const [k, v] of Object.entries(row)) {
    if (FIELDS.includes(k)) continue;
    out[k] = v;
    if (k === "when") { Object.assign(out, add); placed = true; }
  }
  if (!placed) Object.assign(out, add);
  return out;
}

const MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
/** UTC midnight of a "9 Oct 2026" date (0 if unparseable), same as the app's parse of `when`. */
export function whenMs(when) {
  const m = String(when || "").match(/\b(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?,?\s+(\d{4})\b/);
  if (!m || MON[m[2].toLowerCase()] == null) return 0;
  return Date.UTC(+m[3], MON[m[2].toLowerCase()], +m[1]);
}

export function inWindow(row, now = Date.now(), days = TABLE.highlights.days) {
  const ms = whenMs(row?.when);
  return ms > 0 && ms >= now - days * 86400000 && ms <= now + 86400000;
}

export const releaseKey = (r) => (String(r?.sourceUrl || "").match(/https?:\/\/[^\s]+/i)?.[0] || "").replace(/[),.;]+$/, "").toLowerCase();

/** Every row with severity fields (release sizes counted across the whole list). */
export function withSeverityAll(rows, table = TABLE) {
  const list = Array.isArray(rows) ? rows : [];
  const sizes = new Map();
  for (const r of list) { const k = releaseKey(r); if (k) sizes.set(k, (sizes.get(k) || 0) + 1); }
  return list.map((r) => withSeverity(r, table, { releaseRows: sizes.get(releaseKey(r)) || 1 }));
}

export function buildHighlights(rows, { now = Date.now(), table = TABLE } = {}) {
  const { days, limit } = table.highlights;
  const list = (Array.isArray(rows) ? rows : [])
    .filter((r) => r?.status === "approved" && inWindow(r, now, days))
    .map((r) => ({ r, s: Number.isFinite(r.severity) ? { severity: r.severity, severityReason: r.severityReason, severityCrimes: r.severityCrimes } : scoreRow(r, table) }))
    .filter((x) => x.s.severity > 0)
    .sort((a, b) => b.s.severity - a.s.severity || whenMs(b.r.when) - whenMs(a.r.when) || a.r.name.localeCompare(b.r.name));
  return {
    // Date only (America/Chicago), so the file changes at most once a day when no rows change.
    asOf: new Date(now).toLocaleDateString("en-CA", { timeZone: "America/Chicago" }),
    windowDays: days,
    total: list.length,
    rows: list.slice(0, limit).map(({ r, s }) => ({
      id: r.id, name: r.name, when: r.when, severity: s.severity, severityReason: s.severityReason, severityCrimes: s.severityCrimes,
    })),
  };
}

/** Adds severity to every row of the harvest file and writes the highlights file. */
export function writeSeverityFiles(harvestFile = "data/harvest.json", highlightsFile = "data/highlights.json", now = Date.now()) {
  const rows = withSeverityAll(JSON.parse(readFileSync(harvestFile, "utf8")));
  writeFileSync(harvestFile, `${JSON.stringify(rows, null, 2)}\n`);
  const hl = buildHighlights(rows, { now });
  writeFileSync(highlightsFile, `${JSON.stringify(hl, null, 2)}\n`);
  return { rows: rows.length, scored: rows.filter((r) => r.severity > 0).length, highlights: hl.rows.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const res = writeSeverityFiles(process.argv[2] || process.env.HARVEST_FILE || "data/harvest.json", process.argv[3] || "data/highlights.json");
  console.log(JSON.stringify(res));
}
