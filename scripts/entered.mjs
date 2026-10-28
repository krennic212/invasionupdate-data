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
 * A removal or deportation date is not an entry date. "Deported on October 27, 2026"
 * must not become "Previously removed October 27, 2026."
 * A crime is not a status. "Green card fraud" must not become "LPR as posted."
 * On a post that names several people, pass the person's name so one person's
 * entry fact is not copied onto another. If it is not in that person's own
 * text, return "Not stated."
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

function personText(text, name) {
  const s = tidy(text);
  const who = tidy(name);
  if (!s || !who) return s;
  const parts = s.split(/(?<=[.!?])\s+/);
  if (parts.length < 2) return s;
  const last = who.split(" ").pop();
  for (let i = 0; i < parts.length; i++) {
    const hit = parts[i].includes(who) || (last && last.length > 3 && parts[i].includes(last));
    if (!hit) continue;
    const next = parts[i + 1] || "";
    // The next sentence is this person's only when it does not name someone else.
    const other = next && !next.includes(who) && /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/.test(next);
    return tidy(other ? parts[i] : `${parts[i]} ${next}`.trim());
  }
  return s;
}

/** Exact sentence in this person's text that contains the entered fact, or "". */
export function enteredSourceSentence(text, name, entered) {
  const value = tidy(entered);
  if (!value || /^not stated$/i.test(value)) return "";
  const s = personText(text, name);
  const years = value.match(/\b(?:19|20)\d{2}\b/g) || [];
  const parts = s.split(/(?<=[.!?])\s+/).filter(Boolean);
  const scored = parts.filter((p) => years.every((y) => p.includes(y)));
  const pool = scored.length ? scored : parts;
  if (/\bLPR\b|permanent resident|green card holder/i.test(value)) {
    const hit = pool.find((p) => /\b(?:lawful|legal)\s+permanent\s+resident|\bLPRs?\b|green card holder\b/i.test(p));
    return hit || "";
  }
  if (/previously|prior removal|re-?entr|deported/i.test(value)) {
    const hit = pool.find((p) => /\b(?:previously|prior\s+removal|re-?entr|deported\s+\d+\s+times|\d+-time)\b/i.test(p));
    if (hit) return hit;
  }
  if (years.length && !scored.length) return "";
  const token = value.split(/[,.]/).map((x) => x.trim()).find((x) => x.length > 12 && !/as posted|not illegally/i.test(x));
  if (token) {
    const bit = token.replace(/^(Entered illegally|Previously removed|LPR since)\s+/i, "").slice(0, 24);
    const hit = pool.find((p) => bit && p.toLowerCase().includes(bit.toLowerCase()));
    if (hit) return hit;
  }
  return years.length ? scored[0] || "" : pool[0] && pool[0].length < 400 ? pool[0] : "";
}

/** Short entered string from source text already in hand, or "Not stated". */
export function enteredFromText(text, name = "") {
  const s = personText(text, name);
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

  // A crime is not a status. "Green card fraud" is not LPR.
  const lpr = /\b(?:lawful permanent resident|legal permanent resident|\bLPRs?\b|green card holder)\b/i.test(s)
    || (/\bgreen card\b/i.test(s) && !/\bgreen card fraud\b/i.test(s));
  if (lpr) {
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

  // A removal date is not an entry. Only a stated prior removal or reentry.
  const prior = s.match(new RegExp(`\\b(?:previously\\s+(?:removed|deported)|prior\\s+removal|ordered\\s+(?:\\w+\\s+){0,3}(?:removed|deported))(?:[^.]{0,40}?)(${DATE})`, "i"));
  if (prior && !/\b(?:deported|removed)\s+on\s+[A-Z][a-z]+\s+\d{1,2},?\s+2026\b/i.test(s)) {
    return `Previously removed ${prior[1]}; reentry date not stated, as posted.`;
  }
  if (/\bpreviously\s+(?:removed|deported)\b|\bprior\s+removal\b|\billegal(?:ly)?\s+re-?entr/i.test(s)) {
    return "Previously removed; reentry date not stated, as posted.";
  }

  return ENTERED_BLANK;
}
