/**
 * Pure rules for official-release photos (no network, no image library).
 *
 * A row may carry a photo only when ALL of these hold:
 *  - the row is approved, has no holdReason, and its source is an official federal page;
 *  - that release produces exactly one row (feed + review), the release text names exactly one
 *    person, and the title does not describe several defendants;
 *  - the image sits in the release's own uploaded content (not theme / chrome), is not a seal, logo,
 *    banner, flag, icon, social or generic image, and its alt / title / caption / file name names
 *    the person (first + last name) or says booking / mugshot.
 * The image is copied into data/photos/ and served from GitHub Pages; the feed never hotlinks.
 */
import { decode } from "./parse.mjs";
import { nameKey, urlsIn, isOfficialUrl } from "./rules.mjs";
import { holdReasonsForRow } from "./guards.mjs";

export const PAGES_BASE = "https://krennic212.github.io/invasionupdate-data/";
export const PHOTO_PREFIX = `${PAGES_BASE}photos/`;
export const MAX_PHOTO_BYTES = 300 * 1024;

const CHROME_PATH = /\/(themes?|profiles|modules|core|libraries|assets|static|img\/(icons?|social))\//i;
const UPLOAD_PATH = /\/(sites\/default\/files|d9|media|files|dhs-uploads)\//i;
const GENERIC = /\b(seal|logo|banner|flag|icon|badge|header|footer|social|og[-_ ]?image|default|placeholder|generic|stock|wordmark|thumb(nail)?|sprite|background|hero|share|twitter|facebook|instagram|youtube|flickr|map|chart|graphic|infographic|screenshot|podium|press conference|presser)\b|aboutice|eroRightBlock|eFileBanner|mm-crime|statsThumb|eoyThumb|hsiDD|dhsIceSocial|og-image|WOW\d/i;
const BOOKING = /\b(booking|mug ?shot|arrest photo)\b/i;

/** First official URL on a row (the release the row came from). */
export function officialUrlOf(row) {
  return urlsIn(row?.sourceUrl).find(isOfficialUrl) || "";
}

export function urlKey(url) {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}`.toLowerCase();
  } catch {
    return String(url || "").toLowerCase();
  }
}

/** How many rows (feed + review) cite each official release URL. */
export function releaseCounts(rows) {
  const n = new Map();
  for (const r of rows) {
    for (const u of urlsIn(r?.sourceUrl).filter(isOfficialUrl)) {
      const k = urlKey(u);
      n.set(k, (n.get(k) || 0) + 1);
    }
  }
  return n;
}

const MULTI_TITLE = /\b(two|three|four|five|six|seven|eight|nine|ten|\d+|several|multiple)\s+(\w+\s+){0,3}(men|women|people|persons|defendants|individuals|aliens|nationals|immigrants|members|suspects|fugitives|brothers|sisters|siblings|co-?conspirators|others)\b|\bco-?defendants?\b|\bdefendants\b|\band\s+(his|her)\s+(wife|husband|brother|sister|son|daughter|father|mother|partner)\b|\bcouple\b|\bduo\b|\btrio\b|\bring\b|\bnetwork\b/i;

export function titleIsMulti(title) {
  return MULTI_TITLE.test(String(title || ""));
}

/** Stable, file-safe key for a row's photo file. */
export function photoKey(row, takenIds = new Set()) {
  const id = String(row?.id || "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
  if (id && !takenIds.has(id)) return id;
  const slug = nameKey(row?.name).replace(/ /g, "-");
  let h = 0;
  for (const ch of officialUrlOf(row)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `${slug}-${h.toString(16)}`;
}

/** Does this text name the person? Needs the surname and the first name (or the two last name parts). */
export function namesPerson(text, name) {
  const hay = ` ${nameKey(decodeURIComponent(safe(text)).replace(/[_+]/g, " "))} `;
  const t = nameKey(name).split(" ").filter(Boolean);
  if (t.length < 2) return false;
  const last = t[t.length - 1];
  if (!hay.includes(` ${last} `)) return false;
  return hay.includes(` ${t[0]} `) || (t.length >= 3 && hay.includes(` ${t[t.length - 2]} `));
}

function safe(s) {
  try {
    decodeURIComponent(s);
    return s;
  } catch {
    return String(s).replace(/%/g, " ");
  }
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i")) || tag.match(new RegExp(`\\b${name}\\s*=\\s*'([^']*)'`, "i"));
  return m ? decode(m[1]) : "";
}

/**
 * Pick the one person-specific image in an official release, or "" if there is none
 * (or more than one distinct candidate, which means the photo is ambiguous).
 */
export function pickImage(html, pageUrl, name) {
  const src = String(html || "").replace(/<(script|style|noscript|header|nav|footer)\b[\s\S]*?<\/\1>/gi, " ");
  const found = new Map();
  const consider = (rawUrl, label, caption) => {
    if (!rawUrl) return;
    let url;
    try {
      url = new URL(rawUrl, pageUrl).href.split("#")[0];
    } catch {
      return;
    }
    if (!isOfficialUrl(url)) return;
    const path = new URL(url).pathname;
    if (!/\.(jpe?g|png|webp)(\.webp)?$/i.test(path)) return;
    if (CHROME_PATH.test(path) || !UPLOAD_PATH.test(path)) return;
    const file = decodeURIComponent(safe(path.split("/").pop() || ""));
    const text = `${label} ${caption}`;
    if (GENERIC.test(file) || GENERIC.test(text)) return;
    const specific = namesPerson(`${text} ${file}`, name) || BOOKING.test(`${text} ${file}`);
    if (!specific) return;
    // Same picture in different sizes (styles/large/...) counts once.
    const k = file.replace(/\.webp$/i, "").replace(/_\d+(?=\.)/, "").toLowerCase();
    if (!found.has(k)) found.set(k, url.replace(/\/styles\/[^/]+\/public\//, "/").replace(/(\.(jpe?g|png))\.webp(\?.*)?$/i, "$1").replace(/\?itok=[^&]*$/, ""));
  };
  for (const m of src.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const after = src.slice(m.index + tag.length, m.index + tag.length + 400);
    const cap = (after.match(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i) || [])[1] || "";
    consider(attr(tag, "src") || attr(tag, "data-src"), `${attr(tag, "alt")} ${attr(tag, "title")}`, cap.replace(/<[^>]+>/g, " "));
  }
  for (const m of src.matchAll(/<a\b[^>]*href="([^"]+\.(?:jpe?g|png|webp))"[^>]*>/gi)) {
    const tag = m[0];
    consider(m[1], `${attr(tag, "title")} ${attr(tag, "aria-label")} ${attr(tag, "data-cbox-img-attrs")}`, "");
  }
  return found.size === 1 ? [...found.values()][0] : "";
}

/** Shape check for a downloaded image: not tiny, not a banner strip. */
export function shapeOk(width, height) {
  if (!width || !height) return false;
  if (Math.min(width, height) < 100) return false;
  const r = width / height;
  return r >= 0.4 && r <= 2.0;
}

/**
 * Pre-publish rule for one row's photo. Returns "" when fine, else the problem.
 * ctx: { counts: releaseCounts(feed+review), checks: photo-checks.json, fileBytes(name) -> number|null }
 */
export function photoProblem(row, ctx) {
  const photo = String(row?.photo || "");
  if (!photo) return "";
  if (!photo.startsWith(PHOTO_PREFIX)) return "photo is not served from the data repo's Pages site";
  const file = photo.slice(PHOTO_PREFIX.length);
  if (!/^[a-z0-9-]+\.jpg$/.test(file)) return "photo file name is not a data/photos/<key>.jpg file";
  const bytes = ctx.fileBytes(file);
  if (bytes == null) return `photo file data/photos/${file} does not exist`;
  if (bytes > MAX_PHOTO_BYTES) return `photo file is ${bytes} bytes (max ${MAX_PHOTO_BYTES})`;
  if (row.status !== "approved" || row.holdReason) return "photo on a row that is not approved or is held by a guard";
  const g = holdReasonsForRow(row);
  if (g.length) return `photo withheld by guard rule (${g.join("; ")})`;
  const rel = officialUrlOf(row);
  if (!rel) return "photo on a row without an official source";
  if ((ctx.counts.get(urlKey(rel)) || 0) !== 1) return "photo on a row whose release has more than one row";
  if (!isOfficialUrl(String(row.photoSourceUrl || ""))) return "photoSourceUrl is not an official federal URL";
  const chk = ctx.checks[urlKey(rel)];
  if (!chk || chk.result !== "photo" || chk.file !== file) return "no single-person photo check on record for this release";
  return "";
}
