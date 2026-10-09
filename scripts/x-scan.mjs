#!/usr/bin/env node
/**
 * X scan: turn already-fetched X posts (from the X MCP tools; this script never calls X)
 * into feed rows.
 *
 *   node scripts/x-scan.mjs <posts.json> [more.json ...] [--picks picks.json] [--write] [--state data/x-scan-state.json]
 *
 * Input files: raw search_posts_all / get_users_posts responses ({ data: [...], includes: { users } })
 * or plain arrays of posts. A post needs id, text, created_at and an author handle (from
 * includes.users via author_id, a `username` field, or its x.com `url`).
 *
 * Rules (same as the .gov harvest, see guards.mjs):
 *  - Only a post by a LIVE_X_HANDLES account (official agency + trusted reporter) can go live (data/harvest.json, status "approved").
 *    Reporter / media / any other account -> data/review.json, never live.
 *  - A person becomes a row only when the post itself names them with non-citizen wording
 *    (parse.mjs extractPeople), or via an explicit pick whose sentence is verbatim in the post.
 *  - crime = "<Stage>: <the post's own sentence>", word for word ("illegal alien" kept). Stage comes
 *    from the post's wording only and is never escalated.
 *  - Any hard guard (minor, at large, non-citizen not stated, stage) -> review.json as "pending" with holdReason.
 *  - photo is "" here. photoCandidates lists EVERY live official-post row whose post has any photo, with ALL
 *    of its images (original size + alt text; `pick` = the image whose alt names the person). Multi-person
 *    posts are flagged "multi-person: match by alt text or caption only". After LOOKING at the images, every
 *    candidate gets a recorded decision: scripts/x-photo.mjs --reviewed or --none "<why>"
 *    (check with: node scripts/x-photo.mjs --todo <scan output.json>). sourceUrl = https://x.com/<handle>/status/<id>; when = post date (CT).
 *  - Dedupe by normalized name against harvest.json + review.json (and within the run). Nothing is deleted.
 *  - Retweets are skipped (the original author's post is what counts).
 *
 * picks.json (optional, for names the pattern misses): { "<postId>": [{ "name": "...", "sentence": "<verbatim from post>", "hold": "<optional reason>" }] }
 * "hold" can only send a row to review (never make one live), e.g. when the sentence's non-citizen wording is about a co-defendant.
 * Without --write it only prints what it would add. With --write it updates harvest/review, data/harvest-meta.json
 * (counts; lastAddedAt / lastAddedCount / lastAdded when live rows were added) and the state file
 * (lastSeenId = highest post id read, for the next run's since_id).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { extractPeople, statusFrom, stripPriors, dateParts, slug, cityFrom, latLonFor } from "./parse.mjs";
import { holdReasons } from "./guards.mjs";
import { nameKey } from "./rules.mjs";
import { LIVE_X_HANDLES, TRUSTED_REPORTER_X_HANDLES } from "./x-handles.mjs";
import { buildMeta } from "./write-meta.mjs";
import { writeSeverityFiles } from "./severity.mjs";
import { scrubVictimNames } from "./victims.mjs";
import { countryFor } from "./country.mjs";

const OFFICIAL = new Map(LIVE_X_HANDLES.map((h) => [h.toLowerCase(), h]));
const TRUSTED = new Set(TRUSTED_REPORTER_X_HANDLES.map((h) => h.toLowerCase()));

export function agencyOf(handle) {
  const h = String(handle).toLowerCase();
  if (TRUSTED.has(h)) return { label: "Trusted reporter", confirmedBy: `Reporter (@${handle})` };
  if (/^(ice|ero)/.test(h)) return { label: "ICE", confirmedBy: "ICE" };
  if (/^hsi/.test(h)) return { label: "HSI", confirmedBy: "ICE" };
  if (/^(dhs|spoxdhs|secmullindhs)/.test(h)) return { label: "DHS", confirmedBy: "DHS" };
  if (/^(cbp|usbp|borderpatrol)/.test(h)) return { label: "CBP", confirmedBy: "DHS" };
  if (/^(statedept|secrubio|travelgov)$/.test(h)) return { label: "State", confirmedBy: "State" };
  return { label: "DOJ", confirmedBy: "DOJ" };
}

const FORMAL_CHARGE = /\b(charged|charges|charging|indicted|indictment|complaint|accused)\b/i;

/**
 * Stage label for an X row. Same as the .gov harvest (statusFrom), except that an arrest / detention /
 * apprehension with no formal-charge wording in the sentence is "Arrested", never "Charged": an ICE or
 * Border Patrol arrest is not a criminal charge, and the label must not be later than the post says.
 */
export function xLabel(sentence) {
  const label = statusFrom(sentence, "");
  if (label === "Charged" && !FORMAL_CHARGE.test(stripPriors(sentence))) return "Arrested";
  return label;
}

/** Normalize one response / array into [{ id, text, created_at, username }]. */
export function normalizePosts(payload) {
  const list = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
  const users = new Map((payload?.includes?.users || []).map((u) => [String(u.id), u.username]));
  const media = new Map((payload?.includes?.media || []).map((m) => [String(m.media_key), m]));
  const out = [];
  for (const p of list) {
    if (!p || !p.id || typeof p.text !== "string") continue;
    const fromUrl = String(p.url || "").match(/(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status\//)?.[1];
    const username = p.username || p.author?.username || users.get(String(p.author_id)) || fromUrl || "";
    out.push({ id: String(p.id), text: p.note_tweet?.text || p.text, created_at: p.created_at || "", username, referenced: p.referenced_tweets || [],
      media: Array.isArray(p.media) ? p.media : (p.attachments?.media_keys || []).map((k) => media.get(String(k))).filter(Boolean).map((m) => ({ type: m.type, url: m.url || "", alt: m.alt_text || "" })) });
  }
  return out;
}

const isRetweet = (p) => /^RT @/.test(p.text) || p.referenced.some((r) => r.type === "retweeted");
const stripLinks = (s) => String(s).replace(/\s*https:\/\/t\.co\/\w+/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();

/** Post text -> blocks for extractPeople (lines / paragraphs). */
function blocksOf(text) {
  return stripLinks(text).split(/\n+/).map((b) => b.replace(/\s+/g, " ").trim()).filter(Boolean);
}

export function ctIso(createdAt) {
  const d = new Date(createdAt);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

/** Rows for one post (not yet deduped). Each: { row, live } */
export function rowsForPost(post, picks = []) {
  if (isRetweet(post)) return [];
  const iso = ctIso(post.created_at);
  const d = iso && dateParts(iso);
  if (!d) return [];
  const official = OFFICIAL.get(post.username.toLowerCase());
  const handle = official || post.username;
  const a = agencyOf(handle);
  const clean = stripLinks(post.text).replace(/\s+/g, " ");
  const hits = extractPeople(blocksOf(post.text));
  for (const p of picks) {
    const sentence = String(p.sentence || "").replace(/\s+/g, " ").trim();
    if (!p.name || !sentence || !clean.includes(sentence) || !clean.includes(p.name)) {
      throw new Error(`pick for post ${post.id} (${p.name}): name and sentence must appear verbatim in the post`);
    }
    const same = hits.find((h) => nameKey(h.name) === nameKey(p.name));
    if (same) { if (p.hold) same.hold = String(p.hold); }
    else hits.push({ name: p.name, origin: p.origin || "", sentence, city: cityFrom(sentence), hold: p.hold ? String(p.hold) : "" });
  }
  const url = `https://x.com/${handle}/status/${post.id}`;
  return hits.map((hit) => {
    const label = xLabel(hit.sentence);
    const reasons = holdReasons({ name: hit.name, sentence: hit.sentence, title: "", releaseText: clean, label });
    // A pick can only ADD a hold (e.g. the sentence's non-citizen wording describes a co-defendant, not this person).
    if (hit.hold) reasons.push(`reviewer hold: ${hit.hold}`);
    const base = scrubVictimNames({
      name: hit.name,
      city: hit.city || "Not stated",
      crime: `${label}: ${hit.sentence}`,
      usa: `${a.label} X post ${d.long} (@${handle})`,
      foreign: "Not stated in post",
      picked: `${d.picked} (@${handle} post)`,
      entered: "Not stated",
      office: handle,
      id: `x-${post.id}-${slug(hit.name)}`,
      when: d.when,
      text: `@${handle} ${d.long}, as posted: ${clean}`,
      photo: "",
      via: `@${handle} ${post.id}`,
      sourceUrl: url,
      voting: /\b(illegal(ly)? vot|unlawful(ly)? vot|voting (as|by)|voted in|vote in|registered to vote)/i.test(hit.sentence),
      origin: hit.origin || countryFor(hit.name, clean) || "Not stated", // only wording tied to this person

      confirmedBy: a.confirmedBy,
      ...latLonFor(hit.city),
    }).row; // shared feed rule: victim names -> neutral description
    if (!official) return { live: false, row: { ...base, status: "pending", reviewReason: `X post by @${handle}: not an official agency account` } };
    if (reasons.length) return { live: false, row: { ...base, status: "pending", holdReason: reasons.join("; "), reviewReason: `held by guard: ${reasons.join("; ")}` } };
    return { live: true, row: { ...base, status: "approved" } };
  });
}

/**
 * The same post id can come back more than once in a run (e.g. page 1 without note_tweet, page 2 with it).
 * Keep ONE copy per id: the one with the longest text (note_tweet full text beats the 280-char cut),
 * whichever order the copies arrive in. Ties keep the first copy. Media missing on the kept copy is
 * filled from another copy of the same post.
 */
export function collapseById(posts) {
  const byId = new Map();
  for (const p of posts) {
    if (!p || !p.id) continue;
    const id = String(p.id);
    const cur = byId.get(id);
    if (!cur) { byId.set(id, p); continue; }
    const longer = String(p.text || "").length > String(cur.text || "").length ? p : cur;
    const other = longer === p ? cur : p;
    const media = (longer.media || []).length ? longer.media : (other.media || []);
    byId.set(id, { ...longer, media });
  }
  return [...byId.values()];
}

/** pbs.twimg.com/media/<id>.<ext> -> the original-size URL x-photo.mjs accepts (?format=<ext>&name=orig). */
export function xOrigUrl(url) {
  const m = String(url || "").match(/^https:\/\/pbs\.twimg\.com\/media\/([A-Za-z0-9_-]+)\.(jpe?g|png|webp)$/i);
  return m ? `https://pbs.twimg.com/media/${m[1]}?format=${m[2].toLowerCase().replace("jpeg", "jpg")}&name=orig` : String(url || "");
}

const fold = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Does an image's alt text name the person (first AND last name word)? */
export function altNamesPerson(alt, name) {
  const words = fold(name).split(/[^a-z]+/).filter((w) => w.length >= 2);
  if (words.length < 2) return false;
  const altWords = new Set(fold(alt).split(/[^a-z]+/));
  return altWords.has(words[0]) && altWords.has(words[words.length - 1]);
}

const MULTI_PERSON = "multi-person: match by alt text or caption only";

/**
 * Pure: photo candidate for one row of an official (not trusted-reporter) post, or null when the post
 * has no photo. images = ALL of the post's photos (original size, with alt text); pick = the one image
 * whose alt text names the person (when exactly one does).
 */
export function photoCandidateFor(p, row, id, rowsInPost) {
  if (TRUSTED.has(String(p?.username).toLowerCase())) return null;
  const photos = (p?.media || []).filter((m) => m && m.type === "photo" && m.url);
  if (!photos.length) return null;
  const images = photos.map((m) => ({ url: xOrigUrl(m.url), alt: m.alt || "", namesPerson: altNamesPerson(m.alt, row.name) }));
  const named = images.filter((i) => i.namesPerson);
  const pick = named.length === 1 ? named[0].url : null;
  const c = { id, name: row.name, post: row.sourceUrl, images, pick, image: pick || (images.length === 1 ? images[0].url : null) };
  if (rowsInPost > 1) Object.assign(c, { multiPerson: true, flag: MULTI_PERSON });
  return c;
}

/** Pure: posts -> { live, review, skipped, maxId } deduped against existing rows. */
export function scan(posts, { existing = [], picks = {} } = {}) {
  const have = new Set(existing.map((r) => nameKey(r?.name)).filter(Boolean));
  const ids = new Set(existing.map((r) => r?.id).filter(Boolean));
  const live = [];
  const review = [];
  const skipped = [];
  const photoCandidates = [];
  let maxId = 0n;
  // Duplicates of one post id are collapsed first, keeping the full-text copy (not whichever came first).
  const sorted = collapseById(posts).sort((x, y) => (BigInt(x.id) < BigInt(y.id) ? -1 : BigInt(x.id) > BigInt(y.id) ? 1 : 0));
  const seenPost = new Set();
  const made = new Map();
  for (const p of sorted) {
    if (seenPost.has(p.id)) continue;
    seenPost.add(p.id);
    if (BigInt(p.id) > maxId) maxId = BigInt(p.id);
    made.set(p.id, rowsForPost(p, picks[p.id] || []));
  }
  // Same person in several posts this run: keep the earliest post that can go live, else the earliest post.
  const best = new Map();
  for (const list of made.values()) for (const m of list) {
    const k = nameKey(m.row.name);
    const cur = best.get(k);
    if (!cur || (!cur.live && m.live)) best.set(k, m);
  }
  for (const p of sorted) {
    const list = made.get(p.id);
    if (!list) continue;
    made.delete(p.id);
    for (const m of list) {
      const { row, live: isLive } = m;
      const k = nameKey(row.name);
      if (have.has(k)) { skipped.push(`${row.name} (already in feed/review)`); continue; }
      if (best.get(k) !== m) { skipped.push(`${row.name} (same person in another post this run)`); continue; }
      have.add(k);
      let id = row.id;
      for (let n = 2; ids.has(id); n++) id = `${row.id}-${n}`;
      ids.add(id);
      (isLive ? live : review).push({ ...row, id });
      // Every image of a live official post is a photo candidate (never silently dropped); the agent must
      // LOOK at each one and record a decision with x-photo.mjs (--reviewed or --none). Multi-person posts are
      // listed too, flagged: only an image whose alt text / caption names this person could ever match.
      const c = photoCandidateFor(p, row, id, list.length);
      if (isLive && c) photoCandidates.push(c);
    }
  }
  return { live, review, skipped, photoCandidates, maxId: maxId ? String(maxId) : "" };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (k, d) => { const i = args.indexOf(k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
  const write = args.includes("--write");
  if (write) args.splice(args.indexOf("--write"), 1);
  const picksFile = opt("--picks", "");
  const stateFile = opt("--state", "data/x-scan-state.json");
  const HARVEST = process.env.HARVEST_FILE || "data/harvest.json";
  const REVIEW = process.env.REVIEW_FILE || "data/review.json";
  const harvest = JSON.parse(readFileSync(HARVEST, "utf8"));
  const review = JSON.parse(readFileSync(REVIEW, "utf8"));
  const posts = args.flatMap((f) => normalizePosts(JSON.parse(readFileSync(f, "utf8"))));
  const picks = picksFile ? JSON.parse(readFileSync(picksFile, "utf8")) : {};
  const res = scan(posts, { existing: [...harvest, ...review], picks });
  const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, "utf8")) : {};
  if (write) {
    if (res.live.length) writeFileSync(HARVEST, `${JSON.stringify([...res.live.reverse(), ...harvest], null, 2)}\n`);
    if (res.review.length) writeFileSync(REVIEW, `${JSON.stringify([...res.review.reverse(), ...review], null, 2)}\n`);
    if (res.live.length) writeSeverityFiles(HARVEST, HARVEST.replace(/[^/\\]*$/, "highlights.json")); // severity on new live rows + data/highlights.json
    const prev = BigInt(state.lastSeenId || 0);
    const next = res.maxId && BigInt(res.maxId) > prev ? res.maxId : String(state.lastSeenId || "");
    if (res.live.length || res.review.length) {
      // harvest-meta.json: counts + lastAddedAt / lastAdded (live rows only; review rows are not in the feed).
      const META = "data/harvest-meta.json";
      const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
      const meta = buildMeta({
        rows: JSON.parse(readFileSync(HARVEST, "utf8")),
        review: JSON.parse(readFileSync(REVIEW, "utf8")),
        status: { checkedAtIso: now, added: res.live.map((r) => r.name) },
        prev: existsSync(META) ? JSON.parse(readFileSync(META, "utf8")) : null,
        now,
      });
      writeFileSync(META, `${JSON.stringify(meta, null, 2)}\n`);
    }
    writeFileSync(stateFile, `${JSON.stringify({ lastSeenId: next, lastRunAt: new Date().toISOString(), postsRead: collapseById(posts).length, addedLive: res.live.map((r) => r.name), addedReview: res.review.map((r) => r.name) }, null, 2)}\n`);
  }
  console.log(JSON.stringify({ write, postsRead: collapseById(posts).length, live: res.live.map((r) => ({ name: r.name, crime: r.crime, sourceUrl: r.sourceUrl })), review: res.review.map((r) => ({ name: r.name, why: r.reviewReason, sourceUrl: r.sourceUrl })), skipped: res.skipped, photoCandidates: res.photoCandidates, maxId: res.maxId }, null, 2));
}
