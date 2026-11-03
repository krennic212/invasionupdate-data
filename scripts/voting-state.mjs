/**
 * Krennic 2026-11-03: voting rows whose release gives no city (ICE/DHS voter-fraud roundups, Oct 23 / Oct 28 / Nov 2, 2026)
 * are shown. When the person's own sentence names exactly one U.S. state ("voted in 2022 and 2024 in Missouri",
 * "according to the Minnesota Secretary of State"), the row is pinned to that state; otherwise it is shown with no pin
 * (city "Not stated", lat/lon null). Never a made-up town.
 */
import { STATES, geoForPlace } from "./parse.mjs";

const STATE_LIST = Object.keys(STATES).sort((a, b) => b.length - a.length);
const STATE_RE = new RegExp(`\\b(${STATE_LIST.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "g");

/** The one U.S. state the sentence names, or "" (none, or two different states). "New Mexico" never counts as "Mexico". */
export function stateInSentence(sentence) {
  const s = String(sentence || "").replace(/\bUnited States\b/g, " ").replace(/\bWashington,? D\.?C\.?\b/g, " ");
  const found = new Set([...s.matchAll(STATE_RE)].map((m) => m[1]));
  return found.size === 1 ? [...found][0] : "";
}

export function placeVotingByState(row) {
  if (!/^not stated$/i.test(String(row.city || "Not stated").trim())) return row;
  const crime = String(row.crime || "");
  const sentence = crime.slice(crime.indexOf(":") + 1);
  const st = stateInSentence(sentence);
  if (!st) { row.city = "Not stated"; row.lat = null; row.lon = null; return row; }
  const g = geoForPlace(st);
  row.city = st;
  row.lat = g?.lat ?? null;
  row.lon = g?.lon ?? null;
  return row;
}
