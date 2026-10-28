/**
 * Entered U.S. for a NEW row (Krennic 2026-10-28).
 *
 * Before a new live row is committed, set `entered` from text already in hand
 * (the release sentence or the X post). Stop at the first stated fact.
 * If none, "Not stated". Never invent a date, a year, a port, a visa type,
 * or "illegally present." Do not rewrite rows that already have an entered value.
 *
 * This file is step 1 only (mine the text already open). Steps below are for
 * the writer, not this script, and only when this returns "Not stated":
 *  2. If the post links justice.gov / ice.gov / dhs.gov (not wow.dhs.gov),
 *     open that page with a plain script and copy the entry sentence.
 *  3. One cheap search of that exact name plus entered / visa / removed /
 *     reentry, limited to those official hosts. Same person only.
 *  4. Give up. Leave "Not stated." No PACER. No paid source.
 * If a fetch is blocked or nearly empty, leave "Not stated" and list the name.
 * Do not switch to a browser unless told to.
 *
 * "Illegal alien from [country]" is not an entry fact.
 * This arrest's own removal is not an entry date unless the source states a
 * prior removal or a reentry.
 */
import { entryDates } from "./tags.mjs";

export const ENTERED_BLANK = "Not stated";

function tidy(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function asPosted(phrase) {
  const t = tidy(phrase).replace(/[.\s]+$/, "");
  if (!t) return ENTERED_BLANK;
  if (/as posted/i.test(t)) return /[.!?]$/.test(t) ? t : `${t}.`;
  return `${t}, as posted.`;
}

const DATE = "(?:\\d{1,2}/\\d{1,2}/(?:19|20)\\d{2}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+(?:19|20)\\d{2}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\.?,?\\s+(?:of\\s+)?(?:19|20)\\d{2}|(?:19|20)\\d{2})";

/** Short entered string from source text already in hand, or "Not stated". */
export function enteredFromText(text) {
  const s = tidy(text);
  if (!s) return ENTERED_BLANK;

  const dates = entryDates(s);
  if (dates.length) {
    const when = dates[0];
    if (/\b(re-?entered|re-?entry|reentry)\b/i.test(s)) {
      return asPosted(`Illegally reentered ${when}; entry date as posted`);
    }
    return asPosted(`Entered illegally ${when}`);
  }

  const visa = s.match(/\b((?:B-1|B-2|F-1|F-2|H-1B|H-2A|H-2B|J-1|K-1|M-1|TN)\b[^.]{0,60}?visa|(?:student|tourist|visitor|work)\s+visa)([^.]{0,80})/i);
  if (visa) {
    const bit = tidy(`${visa[1]}${visa[2] || ""}`).replace(/\s+,/g, ",");
    return asPosted(bit.charAt(0).toUpperCase() + bit.slice(1));
  }

  if (/\b(lawful permanent resident|legal permanent resident|green card|\bLPRs?\b)/i.test(s)) {
    const since = s.match(new RegExp(`\\b(?:since|in)\\s+(${DATE})\\b`, "i"));
    return since
      ? `LPR since ${since[1]}, as posted. LPR is not illegally present.`
      : "LPR as posted. LPR is not illegally present.";
  }

  if (/\bDACA\b|Deferred Action for Childhood Arrivals/i.test(s) && !/\b(?:denied|denial|applied for|application)\b/i.test(s)) {
    return "DACA as posted.";
  }
  if (/\bCHNV\b|Cuba,?\s+Haiti,?\s+Nicaragua,?\s+(?:and\s+)?Venezuela\s+parole/i.test(s)) {
    return "CHNV parole as posted.";
  }
  if (/\bTPS\b|temporary protected status/i.test(s)) return "TPS as posted.";
  if (/\brefugee\b/i.test(s)) return "Refugee as posted.";
  if (/\bover-?stay(?:ed|s)?\b/i.test(s)) return "Visa overstay, as posted.";
  if (/\bparoled\s+into\b|\bhumanitarian parole\b|\bparole\s+program\b/i.test(s)) {
    return "Paroled into the U.S., as posted.";
  }

  if (/\bentered\s+(?:the\s+(?:United States|U\.?S\.?|country)\s+)?illegally\b|\billegal(?:ly)?\s+re-?entr/i.test(s) && !/\bentered\s+(?:a|his|her)\s+(?:plea|guilty)/i.test(s)) {
    return "Entered illegally, as posted; date not stated.";
  }
  if (/\bentered\s+without\s+inspection\b|\bcrossed\s+the\s+(?:southern\s+)?border\b/i.test(s)) {
    return "Entered illegally, as posted; date not stated.";
  }

  const prior = s.match(new RegExp(`\\b(?:previously\\s+(?:removed|deported)|prior\\s+removal|removal\\s+order|ordered\\s+(?:removed|deported)|(?:removed|deported)\\s+(?:in|on)\\s+)(?:[^.]{0,40}?)(${DATE})`, "i"));
  if (prior) return `Previously removed ${prior[1]}; reentry date not stated, as posted.`;
  if (/\bpreviously\s+(?:removed|deported)\b|\bprior\s+removal\b|\billegal(?:ly)?\s+re-?entr/i.test(s)) {
    return "Previously removed; reentry date not stated, as posted.";
  }

  return ENTERED_BLANK;
}
