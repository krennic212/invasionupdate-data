/**
 * Krennic 2026-11-06 ("Fix everything in the rules so less are missed in the future"): Charged -> Convicted when a LATER
 * official release about the same person reports the plea, verdict or sentence (a sentence shows Convicted).
 *
 * The person is already on the feed, so the hourly harvest used to skip the later release. Now the later release's own
 * label (parse.mjs rowLabel, the same reader as a new row) moves the existing row forward when ALL of these hold:
 *  - the existing row is approved, from another release, dated earlier, same full name (2+ words) and same state;
 *  - its label is Arrested / Charged / Pleaded guilty and the new label is later (Pleaded guilty or Convicted), never back;
 *  - the new hit passes every hard guard in guards.mjs (stage wording, minor, at large, non-citizen stated);
 *  - a voting row moves only when the new sentence is itself about the vote (the Nov 3 voting-label rule stays in charge).
 * The row keeps its id, sourceUrl, place and photo. Its label becomes the new release's own sentence (verbatim), with
 * stageSourceUrl / stageUsa naming that release, and the old label kept in stageFrom. Nothing is invented.
 */
import { toRow, VOTING } from "./parse.mjs";
import { holdReasons } from "./guards.mjs";
import { nameKey } from "./rules.mjs";
import { fillCity } from "./office-city.mjs";

export const STAGE_RANK = { Arrested: 1, Charged: 2, "Pleaded guilty": 3, Convicted: 4 };
const STATE_CODE = { Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA", Colorado: "CO", Connecticut: "CT", Delaware: "DE", "District of Columbia": "DC", Florida: "FL", Georgia: "GA", Hawaii: "HI", Idaho: "ID", Illinois: "IL", Indiana: "IN", Iowa: "IA", Kansas: "KS", Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD", Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS", Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV", "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY", "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH", Oklahoma: "OK", Oregon: "OR", Pennsylvania: "PA", "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT", Vermont: "VT", Virginia: "VA", Washington: "WA", "West Virginia": "WV", Wisconsin: "WI", Wyoming: "WY", "Puerto Rico": "PR", Guam: "GU", "Virgin Islands": "VI" };
// "Houston, TX" -> TX; a state-only place ("Texas", the court district's state) -> TX.
const stateOf = (city) => {
  const c = String(city || "").trim();
  return (c.match(/,\s*([A-Z]{2})\s*$/) || [])[1] || STATE_CODE[c] || STATE_CODE[c.replace(/,\s*[A-Z]{2}$/, "")] || "";
};
const labelOf = (crime) => {
  const s = String(crime || "");
  const i = s.indexOf(":");
  return i > 0 ? s.slice(0, i) : "";
};

export function upgradeStage(existing, hit, rel) {
  const k = nameKey(hit?.name);
  if (!k || k.split(" ").length < 2 || !Array.isArray(existing)) return null;
  // Same place reader as a new row (harvest.mjs: toRow, then fillCity for the office seat).
  const next = fillCity(toRow(hit, rel));
  const label = labelOf(next.crime);
  if (!(STAGE_RANK[label] >= 3)) return null;
  const reasons = holdReasons({ name: hit.name, sentence: hit.sentence, title: rel.title, releaseText: (rel.blocks || []).join(" "), label, mononym: !!hit.mononym });
  if (reasons.length) return null;
  const st = stateOf(next.city);
  const t = Date.parse(`${rel.date}T12:00:00Z`);
  if (!st || !Number.isFinite(t)) return null;
  const prev = existing.find((e) => {
    if (!e || e.status !== "approved" || e.sourceUrl === rel.url || nameKey(e.name) !== k) return false;
    if (stateOf(e.city) !== st) return false;
    const et = Date.parse(`${e.when} 12:00 UTC`);
    return Number.isFinite(et) && et < t;
  });
  if (!prev) return null;
  const from = labelOf(prev.crime);
  if (!STAGE_RANK[from] || STAGE_RANK[label] <= STAGE_RANK[from]) return null;
  if (prev.voting && !VOTING.test(hit.sentence)) return null;
  prev.stageFrom = from;
  prev.crime = `${label}: ${hit.sentence}`;
  prev.stageSourceUrl = rel.url;
  prev.stageUsa = next.usa;
  const tag = ` Update (${next.usa}): ${hit.sentence}`;
  if (!String(prev.text || "").includes(hit.sentence)) prev.text = `${prev.text || ""}${tag}`;
  return `${prev.name} (${from} -> ${label})`;
}
