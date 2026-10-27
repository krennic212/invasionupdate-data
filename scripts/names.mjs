/**
 * Person-name cleanup and checks shared by every writer (release harvest, X scan, Daily Signal, pending intake).
 * Krennic 2026-10-27: the scan produced "Pantaleon Chacon Madrid Oct" (date word stuck on), "Nevada.Mario Garcia"
 * (place joined to the name by a period with no space) and "Sidney Pino-Becque" (hyphenated surname cut short).
 *
 *  - cleanPersonName(): strips trailing month / weekday / date words and joined place text. Never invents letters.
 *  - suspiciousName(): reasons a name looks wrong (empty = fine). guards.mjs holdReasons() holds such a row pending.
 */

// Month words that are not also common given names / surnames ("Jan", "Jun", "May", "June", "August" are, so they
// count only when written as an abbreviation with a period or followed by a day number: "Jun. 3", "May 21").
const MONTH = "Feb|Apr|Aug|Sep|Sept|Oct|Nov|Dec|January|February|September|October|November|December";
const MONTH_AMBIG = "Jan|Mar|May|Jun|Jul|June|July|March|April|August";
const WEEKDAY = "Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Today|Yesterday|Tonight";
/** Trailing date words: "... Madrid Oct" / "... Madrid Oct. 21" / "... Doe Jun. 3" / "... Doe Monday". */
const TRAILING_DATE = new RegExp(`(?:\\s+(?:(?:${MONTH})\\.?(?:\\s+\\d{1,2}(?:st|nd|rd|th)?,?)?|(?:${MONTH_AMBIG})(?:\\.(?:\\s+\\d{1,2}(?:st|nd|rd|th)?,?)?|\\s+\\d{1,2}(?:st|nd|rd|th)?,?)|(?:${WEEKDAY}),?)(?:\\s+\\d{4})?)+$`);
/** A date word as the LAST token of a name (flagged). */
const LAST_DATE = new RegExp(`(?:^|\\s)(?:(?:${MONTH})\\.?|(?:${MONTH_AMBIG})\\.|${WEEKDAY})$`);
/** A date word anywhere in the name (flagged). */
const DATE_TOKEN = new RegExp(`^(?:(?:${MONTH})\\.?|(?:${MONTH_AMBIG})\\.|${WEEKDAY})$`);

/** Headline / label words that are never part of a name ("ARRESTED", "ICE", "WANTED"), checked on all-caps names. */
const CAPS_JUNK = /\b(?:ICE|DHS|HSI|ERO|CBP|FBI|DOJ|USBP|BREAKING|ARRESTED|ARREST|ARRESTS|CAUGHT|WANTED|REMOVED|DEPORTED|DEPORTATION|CONVICTED|CHARGED|SENTENCED|INDICTED|ALIEN|ALIENS|ILLEGAL|CRIMINAL|WORST|OFFENDER|PREDATOR|PEDOPHILE|MURDERER|RAPIST|GANG|MEMBER|MS|TDA|UPDATE|ALERT|NEWS|THE|AND|OF|FROM|IN|FOR|WITH)\b/;

const PERIOD_INSIDE = /[A-Za-zÀ-ÿ]{2}\.[A-Za-zÀ-ÿ]/; // "Nevada.Mario" (initials "J.R." / "A. B." are fine)

/**
 * Clean a name the parser pulled out of a post or release:
 *  "Pantaleon Chacon Madrid Oct" -> "Pantaleon Chacon Madrid"; "Nevada.Mario Garcia" -> "Mario Garcia";
 *  "Jane Doe Oct. 21" -> "Jane Doe". Hyphenated surnames are kept whole. Returns "" when nothing name-like is left.
 */
export function cleanPersonName(raw) {
  let n = String(raw || "").replace(/\s+/g, " ").trim();
  // Place text joined by a period with no space: "Nevada.Mario Garcia" -> keep what follows the last joined period.
  const joined = n.match(/^(?:.*[A-Za-zÀ-ÿ]{2}\.)([A-ZÁÉÍÓÚÑÜ][^.]*)$/);
  if (joined && PERIOD_INSIDE.test(n)) n = joined[1].trim();
  // Trailing month / weekday / date words: "... Madrid Oct" / "... Madrid Oct. 21". A bare "May" / "June" is left (real names).
  let prev;
  do {
    prev = n;
    const m = n.match(TRAILING_DATE);
    if (m && n.slice(0, m.index).trim().split(/\s+/).length >= 2) n = n.slice(0, m.index).trim();
  } while (n !== prev);
  n = n.replace(/[,;:]+$/, "").trim();
  return n;
}

/** Reasons a person name looks wrong (empty array = looks fine). */
export function suspiciousName(raw) {
  const n = String(raw || "").replace(/\s+/g, " ").trim();
  const out = [];
  if (!n) return ["empty name"];
  const toks = n.split(" ");
  if (toks.length < 2) out.push("single word");
  if (LAST_DATE.test(n) && toks.length >= 2) out.push(`ends with a month / day word ("${toks[toks.length - 1]}")`);
  if (PERIOD_INSIDE.test(n)) out.push("period inside the name (place or sentence text joined to it)");
  if (/\d/.test(n)) out.push("digits in the name");
  if (/[@#:;|/\\()[\]{}"“”]/.test(n)) out.push("punctuation that is never part of a name");
  const letters = n.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (letters && letters === letters.toUpperCase() && letters.length >= 2) {
    if (CAPS_JUNK.test(n) || toks.some((t) => t.replace(/[^A-Za-zÀ-ÿ]/g, "").length < 2 && !/^[A-Z]\.$/.test(t))) out.push("all-caps headline text, not a name");
  }
  const bad = toks.slice(0, -1).find((t) => DATE_TOKEN.test(t));
  if (bad) out.push(`date word inside the name ("${bad}")`);
  return out;
}

export function isSuspiciousName(raw) {
  return suspiciousName(raw).length > 0;
}
