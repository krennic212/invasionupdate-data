/**
 * Shared rules for the Invasion Update data feed.
 *  - Only official federal / agency sources go live (data/harvest.json).
 *  - Everything else (X posts, reporters, news sites) goes to data/review.json.
 *  - The photo field is always "" in every file this repo writes.
 */
import { OFFICIAL_X_HANDLES, TRUSTED_REPORTER_X_HANDLES } from "./x-handles.mjs";

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

/**
 * Every dedupe key for a row: its name plus any a.k.a. (row.aka, a string or an array). A person
 * listed under an alias ("Verónica Bullene, a.k.a. Verónica Hernández Martínez") is the same person,
 * so neither name may be added again.
 */
/**
 * State election-crime newsrooms (Krennic 2026-10-20: "add the clear state voting cases and add state sources to the hourly
 * job"). A state attorney general / state police release is an official source for a STATE case. Exact host (and path
 * prefix where the host is a whole state portal), https only. These are NOT federal: isOfficialUrl stays federal-only, so
 * photos (scripts/photos.mjs) and the federal DOJ/DHS/ICE/CBP scan are unchanged; only routing and the live-source check
 * accept them.
 */
export const STATE_OFFICIAL_SOURCES = [
  { host: "myfloridalegal.com", path: "/", office: "FloridaAG" },
  { host: "fdle.state.fl.us", path: "/", office: "FDLE" },
  { host: "texasattorneygeneral.gov", path: "/", office: "TexasAG" },
  { host: "michigan.gov", path: "/ag/", office: "MichiganAG" },
  { host: "doj.nh.gov", path: "/", office: "NewHampshireDOJ" },
  { host: "ag.nv.gov", path: "/", office: "NevadaAG" },
  { host: "attorneygeneral.gov", path: "/", office: "PennsylvaniaAG" },
  { host: "ag.ks.gov", path: "/", office: "KansasAG" },
  { host: "law.georgia.gov", path: "/", office: "GeorgiaAG" },
  { host: "sos.ga.gov", path: "/", office: "GeorgiaSOS" },
  { host: "ncdoj.gov", path: "/", office: "NorthCarolinaAG" },
  { host: "ohioattorneygeneral.gov", path: "/", office: "OhioAG" },
  { host: "ohiosos.gov", path: "/", office: "OhioSOS" },
  { host: "azag.gov", path: "/", office: "ArizonaAG" },
  { host: "doj.state.wi.us", path: "/", office: "WisconsinDOJ" },
  { host: "alabamaag.gov", path: "/", office: "AlabamaAG" },
  { host: "oag.state.va.us", path: "/", office: "VirginiaAG" },
  { host: "ag.state.la.us", path: "/", office: "LouisianaAG" },
  { host: "in.gov", path: "/attorneygeneral/", office: "IndianaAG" },
  { host: "ago.mo.gov", path: "/", office: "MissouriAG" },
  { host: "tn.gov", path: "/attorneygeneral/", office: "TennesseeAG" },
  { host: "iowaattorneygeneral.gov", path: "/", office: "IowaAG" },
];

/** The STATE_OFFICIAL_SOURCES entry a URL belongs to, else null. */
export function stateOfficialSource(url) {
  if (!/^https:\/\//i.test(String(url || ""))) return null;
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const h = u.hostname.toLowerCase().replace(/^www\./, "");
  const path = u.pathname.toLowerCase();
  return STATE_OFFICIAL_SOURCES.find((s) => h === s.host && path.startsWith(s.path)) || null;
}

export function isStateOfficialUrl(url) {
  return Boolean(stateOfficialSource(url));
}

/** Live via a state newsroom (state cases only; never used for photos). */
export function isStateOfficialRow(row) {
  return urlsIn(row?.sourceUrl).some(isStateOfficialUrl);
}

export function nameKeysOf(row) {
  const akas = Array.isArray(row?.aka) ? row.aka : [row?.aka];
  return [row?.name, ...akas].map(nameKey).filter(Boolean);
}

/**
 * A roundup's short form of a name already listed: "avila gomez" for "fredy avila gomez" (OPA Sept 18, 2026, which
 * printed only the surname), "monica carzoli" for "monica ivette carzoli carillo", "paulo silva" for "paulo jorge silva".
 * Keys from nameKey(). Two words at least, so a lone surname never matches anyone.
 */
export function isShortFormOf(short, full) {
  const a = String(short || "").split(" ").filter(Boolean);
  const b = String(full || "").split(" ").filter(Boolean);
  if (a.length < 2 || a.length >= b.length) return false;
  if (b.slice(-a.length).join(" ") === a.join(" ")) return true;
  return a.length === 2 && a[0] === b[0] && b.slice(1).includes(a[1]);
}

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

/** Pre-publish source check: an official federal page OR a post by an official agency X account
 *  OR a post by a trusted reporter (TRUSTED_REPORTER_X_HANDLES, Krennic decision 2026-10-09).
 *  (isOfficialUrl / isOfficialRow stay .gov-only: photos and pending.json routing are unchanged.) */
const TRUSTED_X = new Set(TRUSTED_REPORTER_X_HANDLES.map((h) => h.toLowerCase()));

/** Handle of a post by a trusted reporter (Krennic decision 2026-10-09), else "". Same strict URL shape. */
export function trustedXHandle(url) {
  const m = String(url || "").match(/^https:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status\/(\d{1,25})\/?$/);
  return m && TRUSTED_X.has(m[1].toLowerCase()) ? m[1] : "";
}

export function isTrustedXPostUrl(url) {
  return Boolean(trustedXHandle(url));
}

/** News hosts the harvest is allowed to publish from. Daily Signal ICE-arrest exclusives
 *  (scripts/daily-signal.mjs) name the person, origin, and charge. Not a federal source. */
const TRUSTED_NEWS_HOSTS = ["dailysignal.com"];

export function isTrustedNewsUrl(url) {
  const h = hostOf(url);
  return /^https:\/\//i.test(url) && TRUSTED_NEWS_HOSTS.some((o) => h === o || h.endsWith(`.${o}`));
}

export function isLiveSourceRow(row) {
  return urlsIn(row?.sourceUrl).some((u) => isOfficialUrl(u) || isStateOfficialUrl(u) || isOfficialXPostUrl(u) || isTrustedXPostUrl(u) || isTrustedNewsUrl(u));
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
    if (isOfficialRow(r) || isStateOfficialRow(r)) live.push(noPhoto(r));
    else review.push({ ...noPhoto(r), reviewReason: reviewReason(r) });
  }
  return { live, review };
}
