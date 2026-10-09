/**
 * Shared feed rule: never publish a victim's name.
 *
 * If a row's text names a victim, the name is replaced with a neutral description:
 *   "murder of 16-year-old Eddie Polec"                    -> "murder of a 16-year-old victim"
 *   "murder of Philadelphia high school student Eddie Polec" -> "murder of the victim"
 *   "the victim, Jane Roe, was ..."                        -> "the victim was ..."
 *   "victim Jane Roe"                                      -> "the victim"
 * Patterns are deliberately conservative: a crime word + "of" + optional age / short descriptor
 * + a capitalized two-to-four-word name, or the word "victim" right before a name.
 * The defendant's own name (row.name / row.aka) is never touched.
 *
 * Applied by the shared normalize step (scripts/dedupe.mjs, run on harvest.json and review.json
 * every workflow run), by every row writer (harvest.mjs, x-scan.mjs), and checked by validate.mjs.
 */
import { nameKey } from "./rules.mjs";

export const TEXT_FIELDS = ["crime", "usa", "text", "foreign", "entered", "picked", "victims"];

const CRIME = "(?:murder|murders|murdering|killing|killings|death|deaths|rape|raping|sexual assault|sexual abuse|assault|assaulting|stabbing|shooting|shooting death|beating|strangling|strangulation|kidnapping|abduction|manslaughter|homicide|carjacking|robbery|attempted murder|molestation|trafficking)";
const NAME_TOKEN = "[A-Z][a-zA-Z'’]+(?:-[A-Z][a-zA-Z'’]+)?";
const NAME = `(${NAME_TOKEN}(?:\\s+(?:de|del|de la|la|van|von)?\\s*${NAME_TOKEN}){1,3})`;
const AGE = "(?:(?:a|an|the)\\s+)?(?:(\\d{1,3})[- ]year[- ]old\\s+)?";
// Short descriptor before the name: "Philadelphia high school student", "Minnesota mom", "girlfriend",
// "his girlfriend", "St. Johns County resident". At most one capitalized place word + up to 4 lowercase words.
const LOWER = "(?!(?:in|at|on|near|from|with|for|during|by|while|under|and|or|to|into|outside|inside|within|across|after|before|of)\\b)[a-z]+\\s+";
const DESC = `((?:(?:his|her|their)\\s+)?(?:[A-Z][a-z]+\\s+){0,1}(?:${LOWER}){0,4})?`;
const STOP = /\b(United|States|America|American|County|City|State|Department|Police|Office|Officer|Officers|Federal|Court|District|Border|Patrol|Homeland|Security|ICE|DHS|HSI|ERO|FBI|DOJ|Mexico|Mexican|Guatemala|Honduras|El|Salvador|Venezuela|Ecuador|Colombia|Cuba|Haiti|China|India|Canada|January|February|March|April|May|June|July|August|September|October|November|December|Christmas|Easter)\b/;

const OF_RE = new RegExp(`\\b(${CRIME})\\s+of\\s+${AGE}${DESC}${NAME}(?=[\\s,.;:)!?'’"]|$)`, "g");
const VICTIM_COMMA_RE = new RegExp(`\\b(?:the\\s+)?victim,\\s+${NAME},\\s*`, "gi");
const VICTIM_RE = new RegExp(`\\b(?:the\\s+)?victim\\s+${NAME}(?=[\\s,.;:)!?'’"]|$)`, "g");

function isDefendant(candidate, row) {
  const c = nameKey(candidate).split(" ").filter(Boolean);
  for (const who of [row?.name, row?.aka]) {
    const d = new Set(nameKey(who).split(" ").filter(Boolean));
    if (!d.size) continue;
    const shared = c.filter((t) => d.has(t)).length;
    if (shared >= Math.min(2, c.length)) return true;
  }
  return false;
}

function okName(n, row) {
  if (STOP.test(n)) return false;
  if (isDefendant(n, row)) return false;
  return n.trim().split(/\s+/).length >= 2;
}

/** Scrub one string. Returns { text, names } (names = victim names removed). */
export function scrubText(s, row = {}) {
  let text = String(s ?? "");
  const names = [];
  text = text.replace(OF_RE, (m, crime, age, desc, name) => {
    if (!okName(name, row)) return m;
    names.push(name);
    return `${crime} of ${age ? `a ${age}-year-old victim` : "the victim"}`;
  });
  text = text.replace(VICTIM_COMMA_RE, (m, name) => {
    if (!okName(name, row)) return m;
    names.push(name);
    return /^The\s/.test(m) ? "The victim " : /^the\s/.test(m) ? "the victim " : "victim ";
  });
  text = text.replace(VICTIM_RE, (m, name) => {
    if (!okName(name, row)) return m;
    names.push(name);
    return /^The\s/.test(m) ? "The victim" : "the victim";
  });
  text = replaceKnown(text, names, row);
  return { text, names };
}

/** Replace already-found victim names (longest first), and their surname on its own, everywhere in s. */
function replaceKnown(s, names, row) {
  let t = s;
  const uniq = [...new Set(names)].sort((a, b) => b.length - a.length);
  for (const n of uniq) t = t.split(n).join("the victim");
  const defendant = new Set(nameKey(`${row?.name || ""} ${row?.aka || ""}`).split(" ").filter(Boolean));
  for (const n of uniq) {
    const last = n.trim().split(/\s+/).pop();
    if (last.length < 4 || defendant.has(nameKey(last)) || STOP.test(last)) continue;
    t = t.replace(new RegExp(`\\b${last.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b(?:['’]s)?`, "g"), (m, off, all) => {
      const start = off === 0 || /[.!?]\s+$/.test(all.slice(Math.max(0, off - 3), off));
      return `${start ? "The" : "the"} victim${/['’]s$/.test(m) ? "'s" : ""}`;
    });
  }
  return t;
}

/** Scrub every text field of a row. Returns { row, names } (row is a copy only if something changed). */
export function scrubVictimNames(row) {
  if (!row || typeof row !== "object") return { row, names: [] };
  const found = [];
  let out = row;
  for (const f of TEXT_FIELDS) {
    if (typeof row[f] !== "string") continue;
    const { text, names } = scrubText(row[f], row);
    if (names.length) found.push(...names);
    if (text !== row[f]) {
      if (out === row) out = { ...row };
      out[f] = text;
    }
  }
  // Names found in one field are removed from every other text field too.
  const uniq = [...new Set(found)];
  if (uniq.length) {
    for (const f of TEXT_FIELDS) {
      if (typeof out[f] !== "string") continue;
      const t = replaceKnown(out[f], uniq, row);
      if (t !== out[f]) {
        if (out === row) out = { ...row };
        out[f] = t;
      }
    }
  }
  return { row: out, names: uniq };
}

/** Pre-publish check: victim names still present (empty array = OK). */
export function victimNamesIn(row) {
  return scrubVictimNames(row).names;
}
