/**
 * Krennic 2026-11-03 12:29 PM CT, on Julio De La Rosa: "If he wasn't convicted for voting but he was convicted for
 * something else, don't list him as voting."
 *
 * A row's stage label (Convicted / Charged / Pleaded guilty / Sentenced) must come from the voting case to be a voting row.
 * When the person's own words tie that stage to a different crime ("De La Rosa has been convicted of strangulation ...",
 * "Nieves-Borja has been charged with DUI", "sentenced ... for ... a false statement in a passport application"), the row
 * is listed under that crime: voting: false and the voting clause is cut from the quote with "[…]" (the rest stays
 * verbatim), so the card is never presented as a voting conviction / charge. If the stage wording is too generic to say
 * which crime it is ("charged with federal crimes", "convicted of fraud"), or names a fraud-family crime that may be the
 * voting scheme itself (identity theft, a false statement, a passport), the harvester holds the row for a person to decide.
 */
import { VOTING } from "./parse.mjs";

const CONVICT = [
  /\b(?:convicted|found guilty)\b[^.]{0,40}?\b(?:of|for)\s+([^.]+)/gi,
  /\bsentenced\b[^.]{0,120}?\bfor\s+([^.]+)/gi,
  /\b(?:pleaded|pled)\s+guilty\b[^.]{0,60}?\bto\s+([^.]+)/gi,
];
const STAGE_VERB = {
  Convicted: CONVICT,
  Sentenced: CONVICT,
  "Pleaded guilty": CONVICT,
  Charged: [/\b(?:charged|indicted)\b[^.]{0,60}?\b(?:with|for)\s+([^.]+)/gi],
};
const TITLE_STAGE = /\b(?:convicted|sentenced|pleads?|pleaded|guilty|charged|indicted)\b/i;
/** Abbreviation dots are not sentence ends ("U.S. citizenship", "Sept. 2"). */
const flat = (s) => String(s || "").replace(/\bU\.S\.(?:A\.)?/g, "US").replace(/\b(Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec|Jr|Sr|No|St|Mt|Ft|Dr|Mr|Mrs|Ms)\./g, "$1").replace(/\b([A-Z])\./g, "$1");
/** Fraud-family wording could be the voting scheme itself (identity theft used to register, a false citizenship claim). */
const FRAUDISH = /\bfraud|\bfalse\b|\bidentity\b|\bpassport\b|\bperjur|\bforg|\bimpersonat|\bconspir/i;
/** Words that tie a stage to the vote itself (the voting crime, registering, the citizenship claim made to vote). */
const VOTE_CRIME = /\bvot|\belect|\bballot|\bregist|\bcitizenship\b|\bUS citizen|\bnaturaliz|\b18 USC § 611|\bunqualified elector/i;
/** Stage objects that say nothing about which crime it is. */
const GENERIC = /^\s*(?:(?:a|two|three|several|multiple|various|related|federal|state|other|separate)\s+)*(?:fraud|false statements?|crimes?|charges?|counts?|offenses?|felon(?:y|ies)|violations?)\s*$/i;

/** { kind: "voting" | "other" | "unclear" | "none", clauses } for a stage label and the person's own sentence. */
export function stageCrimeOf(label, sentence, title = "") {
  const res = STAGE_VERB[String(label || "").replace(/\s*\(.*$/, "").trim()];
  if (!res) return { kind: "none", clauses: [] };
  const s = flat(sentence);
  const clauses = res.flatMap((re) => [...s.matchAll(new RegExp(re.source, re.flags))].map((m) => m[1].trim()));
  if (!clauses.length) return { kind: "none", clauses };
  if (clauses.some((c) => VOTE_CRIME.test(c) || VOTING.test(c))) return { kind: "voting", clauses };
  // A single-case headline that puts the stage on the vote ("... Sentenced ... After Using a Stolen Identity to Vote").
  const t = flat(title);
  if (TITLE_STAGE.test(t) && (VOTE_CRIME.test(t) || VOTING.test(t)) && !/\b(?:crackdown|dozens|roundup|arrests)\b/i.test(t)) return { kind: "voting", clauses };
  // The release words the stage itself about the vote somewhere else ("pleaded guilty ... to illegally voting") -> voting.
  if (clauses.some((c) => GENERIC.test(c) || FRAUDISH.test(c))) return { kind: "unclear", clauses };
  return { kind: "other", clauses };
}

/** The quote with every voting clause cut ("who illegally voted in the 2020 election" -> "[…]"); the rest verbatim. */
export function cutVotingClauses(text) {
  let s = String(text || "");
  for (let guard = 0; guard < 8; guard++) {
    const m = VOTING.exec(s);
    if (!m) break;
    const before = s.slice(0, m.index);
    const cuts = [before.lastIndexOf(" who "), before.lastIndexOf(", "), before.lastIndexOf(" and "), before.lastIndexOf(". ")];
    const best = Math.max(...cuts);
    const start = best < 0 ? 0 : best === before.lastIndexOf(". ") ? best + 2 : best;
    const restFrom = m.index + m[0].length;
    const endRel = s.slice(restFrom).search(/[,;]|\.(?=\s+[A-Z(“"]|\s*$)/); // "U.S. presidential" is not an end
    const end = endRel < 0 ? s.length : restFrom + endRel;
    s = `${s.slice(0, start)}${start > 0 && s[start - 1] !== " " ? " " : ""}[…]${s.slice(end)}`;
  }
  return s.replace(/\[…\](?:[\s,]*(?:and\s+)?\[…\])+/g, "[…]").replace(/\s+\[…\]/g, " […]").replace(/\s{2,}/g, " ");
}

/**
 * Apply the rule to a feed row in place. Returns { changed, hold } where hold is a holdReason (or "").
 * Only voting rows are touched; a row whose stage belongs to the vote is left alone.
 */
// Krennic 2026-11-03 3:51 PM CST: "Keep Akpom as voting." Rows pinned here are never untagged or held by this rule.
export const KEEP_VOTING_IDS = new Set(["x-2101379658272874808-joshua-nmelichukwu-akpom"]);

export function applyStageCrime(row, title = "") {
  if (!row?.voting) return { changed: false, hold: "" };
  if (KEEP_VOTING_IDS.has(row.id)) return { changed: false, hold: "" };
  const crime = String(row.crime || "");
  const i = crime.indexOf(":");
  if (i < 0) return { changed: false, hold: "" };
  const label = crime.slice(0, i);
  const sentence = crime.slice(i + 1);
  title = title || String(row.usa || "").replace(/^[^:]*:\s*/, "");
  const sc = stageCrimeOf(label, sentence, title);
  if (sc.kind === "unclear") {
    return { changed: false, hold: `stage "${label}" is for "${sc.clauses[0]}", not stated to be the voting case (Krennic 2026-11-03: never list as voting unless the stage is for voting)` };
  }
  if (sc.kind !== "other") return { changed: false, hold: "" };
  row.voting = false;
  row.crime = `${label}: ${cutVotingClauses(sentence.trim())}`.replace(/:\s*/, ": ");
  if (row.text) {
    const j = String(row.text).indexOf("as posted: ");
    row.text = j < 0 ? cutVotingClauses(row.text) : `${row.text.slice(0, j + 11)}${cutVotingClauses(row.text.slice(j + 11))}`;
  }
  row.stageCrime = sc.clauses.join("; ");
  return { changed: true, hold: "" };
}
