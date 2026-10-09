#!/usr/bin/env node
/**
 * Attach official-release photos to eligible feed rows (and backfill older rows).
 * Rules live in scripts/photo-rules.mjs. Per run:
 *  - rows that no longer qualify (held, not approved, release now has 2+ rows) lose their photo;
 *  - each eligible row whose release has not been checked yet is checked once: fetch the official
 *    release page, require that it names exactly one person and the title is not multi-defendant,
 *    pick the single person-specific image, download it, resize to <= 300 KB JPEG, and save it as
 *    data/photos/<key>.jpg. The result is recorded in data/photo-checks.json so it is not refetched.
 *  - network errors are not recorded, so the release is retried next run.
 *  - VISUAL CHECK: code cannot tell whether an image shows a child or a second person whose face can
 *    be seen, so a newly found image is never published here. The file is saved and the row is held:
 *    photo "", photoHold "needs visual check", check result "held" (with file + image). A person /
 *    agent looks at it and runs scripts/photo-review.mjs <rowId> --ok "<what you saw>" or --drop "<why>".
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import sharp from "sharp";
import { extractPeople, htmlBlocks, decode } from "./parse.mjs";
import { isOfficialRow, isOfficialUrl } from "./rules.mjs";
import { holdReasonsForRow } from "./guards.mjs";
import {
  MAX_PHOTO_BYTES, PHOTO_PREFIX, officialUrlOf, pickImage, photoKey, releaseCounts, shapeOk, titleIsMulti, urlKey, photoProblem,
} from "./photo-rules.mjs";

const HARVEST = "data/harvest.json";
const REVIEW = "data/review.json";
const CHECKS = "data/photo-checks.json";
const DIR = "data/photos";
const UA = "InvasionUpdateHarvest/2.0 (+https://github.com/krennic212/invasionupdate-data)";
const MAX_FETCH = Number(process.env.PHOTO_MAX_FETCH || 60);

const readJson = (f, d) => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : d);
const writeJson = (f, v) => writeFileSync(f, `${JSON.stringify(v, null, 2)}\n`);

async function get(url, accept) {
  const res = await fetch(url, { headers: { "user-agent": UA, accept }, redirect: "follow", signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  if (!isOfficialUrl(res.url)) throw new Error(`redirected off official site: ${res.url}`);
  return res;
}

/** All title-ish text (og:title, <title>, first <h1>), so a multi-defendant headline is caught wherever it is. */
function titleOf(html) {
  const og = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i);
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  return decode([og?.[1], t?.[1], h1?.[1]].filter(Boolean).join(" | ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

async function toJpeg(buf) {
  const meta = await sharp(buf).metadata();
  if (!shapeOk(meta.width, meta.height)) return { error: `image shape ${meta.width}x${meta.height} looks like a banner or icon` };
  for (const [w, q] of [[800, 82], [640, 78], [520, 72], [420, 65], [340, 60]]) {
    const out = await sharp(buf).rotate().resize({ width: Math.min(w, meta.width), withoutEnlargement: true }).jpeg({ quality: q, mozjpeg: true }).toBuffer();
    if (out.length <= MAX_PHOTO_BYTES) return { out, width: meta.width, height: meta.height };
  }
  return { error: "could not get the image under 300 KB" };
}

async function main() {
  const rows = readJson(HARVEST, []);
  const review = readJson(REVIEW, []);
  const checks = readJson(CHECKS, {});
  mkdirSync(DIR, { recursive: true });
  const counts = releaseCounts([...rows, ...review]);
  const taken = new Set();
  const log = { held: [], removed: [], none: [], errors: [] };
  let fetched = 0;

  // 1) Withdraw photos that no longer pass the rules (never delete files).
  const fileBytes = (f) => (existsSync(`${DIR}/${f}`) ? statSync(`${DIR}/${f}`).size : null);
  for (const r of rows) {
    const why = r.photo ? photoProblem(r, { counts, checks, fileBytes }) : "";
    if (why) {
      log.removed.push(`${r.name}: ${why}`);
      r.photo = "";
      delete r.photoSourceUrl;
      if (/^needs visual check/.test(why)) r.photoHold = "needs visual check";
    } else if (!r.photo && r.photoSourceUrl) {
      delete r.photoSourceUrl;
    }
    if (r.photo) taken.add(r.photo.slice(PHOTO_PREFIX.length).replace(/\.jpg$/, ""));
  }

  // 2) Check eligible rows once per release.
  for (const r of rows) {
    if (r.photo || r.photoHold || r.status !== "approved" || r.holdReason || !isOfficialRow(r)) continue;
    const rel = officialUrlOf(r);
    const k = urlKey(rel);
    if ((counts.get(k) || 0) !== 1) continue;
    if (checks[k]) continue;
    const guard = holdReasonsForRow(r);
    if (guard.length) { log.none.push(`${r.name}: guard (${guard.join("; ")})`); continue; } // not recorded: re-checked if the row changes
    if (fetched >= MAX_FETCH) break;
    fetched += 1;
    let html;
    try {
      html = await (await get(rel, "text/html,*/*")).text();
    } catch (e) {
      log.errors.push(`${r.name}: ${e.message}`);
      continue; // retry next run
    }
    const record = (result, extra = {}) => {
      checks[k] = { checkedAt: new Date().toISOString(), name: r.name, result, ...extra };
    };
    const title = titleOf(html);
    const people = extractPeople(htmlBlocks(html), { title }).map((p) => p.name);
    if (titleIsMulti(title)) { record("none", { why: "release title describes several people" }); log.none.push(`${r.name}: multi-person title`); continue; }
    if (people.length > 1) { record("none", { why: `release names ${people.length} people` }); log.none.push(`${r.name}: release names ${people.length} people`); continue; }
    const img = pickImage(html, rel, r.name);
    if (!img) { record("none", { why: "no single person-specific image in the release" }); log.none.push(`${r.name}: no person-specific image`); continue; }
    let buf;
    try {
      const res = await get(img, "image/*");
      if (!/^image\//i.test(res.headers.get("content-type") || "")) throw new Error(`not an image: ${res.headers.get("content-type")}`);
      buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 8 * 1024 * 1024) throw new Error("image over 8 MB");
    } catch (e) {
      log.errors.push(`${r.name}: ${e.message}`);
      continue;
    }
    let conv;
    try {
      conv = await toJpeg(buf);
    } catch (e) {
      conv = { error: `unreadable image (${e.message})` };
    }
    if (conv.error) { record("none", { why: conv.error, image: img }); log.none.push(`${r.name}: ${conv.error}`); continue; }
    const key = photoKey(r, taken);
    taken.add(key);
    const file = `${key}.jpg`;
    writeFileSync(`${DIR}/${file}`, conv.out);
    // Never published automatically: held until someone looks at it (scripts/photo-review.mjs).
    r.photo = "";
    r.photoHold = "needs visual check";
    record("held", { file, image: img, bytes: conv.out.length, why: "needs visual check" });
    log.held.push(`${r.name} <- ${img} (data/photos/${file})`);
  }

  writeJson(HARVEST, rows);
  writeJson(CHECKS, checks);
  console.log(JSON.stringify({ fetched, withPhoto: rows.filter((r) => r.photo).length, ...log }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
