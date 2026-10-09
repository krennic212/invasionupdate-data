/**
 * Shared rules for the Invasion Update data feed.
 *  - Only official federal / agency sources go live (data/harvest.json).
 *  - Everything else (X posts, reporters, news sites) goes to data/review.json.
 *  - The photo field is always "" in every file this repo writes.
 */
import { OFFICIAL_X_HANDLES } from "./x-handles.mjs";

/** Official federal / agency hosts. A row goes live only if its sourceUrl links one of these. */
export const OFFICIAL_HOSTS = [
  "justice.gov",
  "ice.gov",
  "dhs.gov",
  "cbp.gov",
  "uscis.gov",
  "state.gov",
  "fbi.gov",
  "usmarshals.gov",
  "dea.gov",
  "atf.gov",
];

export function nameKey(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** All http(s) URLs in a sourceUrl field (some rows list two, space-separated). */
export function urlsIn(s) {
  return String(s || "").match(/https?:\/\/[^\s·]+/gi) || [];
}

export function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function isOfficialUrl(url) {
  const h = hostOf(url);
  if (!h || !/^https:\/\//i.test(url)) return false;
  return OFFICIAL_HOSTS.some((o) => h === o || h.endsWith(`.${o}`));
}

const OFFICIAL_X = new Set(OFFICIAL_X_HANDLES.map((h) => h.toLowerCase()));

/**
 * Handle of an official agency X post URL, else "".
 * Only https://(www.|mobile.)x.com/<handle>/status/<digits> (or twitter.com), optional trailing "/",
 * and the handle must be in OFFICIAL_X_HANDLES (exact, case-insensitive).
 */
export function officialXHandle(url) {
  const m = String(url || "").match(/^https:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status\/(\d{1,25})\/?$/);
  return m && OFFICIAL_X.has(m[1].toLowerCase()) ? m[1] : "";
}

export function isOfficialXPostUrl(url) {
  return Boolean(officialXHandle(url));
}

/** Pre-publish source check: an official federal page OR a post by an official agency X account.
 *  (isOfficialUrl / isOfficialRow stay .gov-only: photos and pending.json routing are unchanged.) */
export function isLiveSourceRow(row) {
  return urlsIn(row?.sourceUrl).some((u) => isOfficialUrl(u) || isOfficialXPostUrl(u));
}

/** Live = at least one official federal source link on the row. */
export function isOfficialRow(row) {
  return urlsIn(row?.sourceUrl).some(isOfficialUrl);
}

/** Why a row went to review (for the report and review.json). */
export function reviewReason(row) {
  const urls = urlsIn(row?.sourceUrl);
  if (!urls.length) return "no source link";
  const hosts = [...new Set(urls.map(hostOf))];
  if (hosts.every((h) => h === "x.com" || h === "twitter.com")) return "X post (not an official .gov page)";
  return `non-official source (${hosts.join(", ")})`;
}

/** Copy of a row with photo forced to "". */
export function noPhoto(row) {
  return row && typeof row === "object" ? { ...row, photo: "" } : row;
}

/** Split rows into live (official) and review (everything else). Photos blanked on both. */
export function routeRows(rows) {
  const live = [];
  const review = [];
  for (const r of rows) {
    if (!r || typeof r !== "object" || typeof r.name !== "string" || !r.name.trim()) continue;
    if (isOfficialRow(r)) live.push(noPhoto(r));
    else review.push({ ...noPhoto(r), reviewReason: reviewReason(r) });
  }
  return { live, review };
}
