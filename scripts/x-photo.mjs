#!/usr/bin/env node
/**
 * Attach (or record "no photo" for) the image of ONE official agency X post to its single live row.
 * The agent must first LOOK at the image and confirm it is a single-person headshot / booking photo
 * of the named person (not a graphic, collage, group shot, flyer, or a minor).
 *
 *   node scripts/x-photo.mjs <rowId> <https://pbs.twimg.com/media/...> --reviewed "booking photo, one person, matches post"
 *   node scripts/x-photo.mjs <rowId> --none "graphic / collage / several people"
 *
 * Refuses unless: the row is in data/harvest.json, approved, not held by any guard, its source is an
 * OFFICIAL_X_HANDLES post, that post produced exactly one row (feed + review) and names exactly one
 * person, and the image is on pbs.twimg.com/media. The image is resized to <= 300 KB JPEG, stored in
 * data/photos/<key>.jpg (served from Pages, never hotlinked), and the check is recorded in
 * data/photo-checks.json keyed by the post URL. Then the row is re-checked with photoProblem().
 */
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from "node:fs";
import sharp from "sharp";
import { isOfficialXPostUrl, urlsIn } from "./rules.mjs";
import { holdReasonsForRow } from "./guards.mjs";
import { extractPeople } from "./parse.mjs";
import { PHOTO_PREFIX, MAX_PHOTO_BYTES, isXMediaUrl, photoKey, photoProblem, releaseCounts, shapeOk, urlKey } from "./photo-rules.mjs";

const die = (m) => { console.error(`x-photo: ${m}`); process.exit(1); };
const args = process.argv.slice(2);
const flag = (k) => { const i = args.indexOf(k); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v || ""; };
const reviewed = flag("--reviewed");
const none = flag("--none");
const [rowId, img] = args;
const rows = JSON.parse(readFileSync("data/harvest.json", "utf8"));
const review = existsSync("data/review.json") ? JSON.parse(readFileSync("data/review.json", "utf8")) : [];
const checks = existsSync("data/photo-checks.json") ? JSON.parse(readFileSync("data/photo-checks.json", "utf8")) : {};
const r = rows.find((x) => x?.id === rowId);
if (!r) die(`no live row with id ${rowId}`);
const post = urlsIn(r.sourceUrl).find(isOfficialXPostUrl);
if (!post) die("row source is not an official agency X post");
const k = urlKey(post);
const save = () => {
  writeFileSync("data/harvest.json", `${JSON.stringify(rows, null, 2)}\n`);
  writeFileSync("data/photo-checks.json", `${JSON.stringify(checks, null, 2)}\n`);
};
if (none !== null) {
  checks[k] = { checkedAt: new Date().toISOString(), name: r.name, result: "none", why: none || "no single-person photo" };
  if (r.photo) { r.photo = ""; delete r.photoSourceUrl; r.photoHold = none || "no single-person photo"; }
  save();
  console.log(JSON.stringify({ id: rowId, result: "none", why: checks[k].why }));
  process.exit(0);
}
if (!reviewed) die('pass --reviewed "<what you saw>" after looking at the image, or --none "<why>"');
if (r.status !== "approved" || r.holdReason) die("row is not approved or is held");
const guard = holdReasonsForRow(r);
if (guard.length) die(`guard holds this row: ${guard.join("; ")}`);
if ((releaseCounts([...rows, ...review]).get(k) || 0) !== 1) die("this post produced more than one row");
const people = extractPeople([String(r.text || "").replace(/^@\S+ [A-Z][a-z]{2} \d{1,2}, \d{4}, as posted: /, "")]);
if (people.length > 1) die(`post names ${people.length} people`);
if (!isXMediaUrl(img)) die("image must be the post's own pbs.twimg.com/media URL");
const res = await fetch(img, { signal: AbortSignal.timeout(25000) });
if (!res.ok || !/^image\//.test(res.headers.get("content-type") || "")) die(`download failed: ${res.status} ${res.headers.get("content-type")}`);
const buf = Buffer.from(await res.arrayBuffer());
const meta = await sharp(buf).metadata();
if (!shapeOk(meta.width, meta.height)) die(`image shape ${meta.width}x${meta.height} looks like a banner / icon`);
let out;
for (const [w, q] of [[800, 82], [640, 78], [520, 72], [420, 65], [340, 60]]) {
  out = await sharp(buf).rotate().resize({ width: Math.min(w, meta.width), withoutEnlargement: true }).jpeg({ quality: q, mozjpeg: true }).toBuffer();
  if (out.length <= MAX_PHOTO_BYTES) break;
}
if (out.length > MAX_PHOTO_BYTES) die("could not get the image under 300 KB");
mkdirSync("data/photos", { recursive: true });
const file = `${photoKey(r)}.jpg`;
writeFileSync(`data/photos/${file}`, out);
r.photo = `${PHOTO_PREFIX}${file}`;
r.photoSourceUrl = img;
delete r.photoHold;
checks[k] = { checkedAt: new Date().toISOString(), name: r.name, result: "photo", file, image: img, bytes: out.length, reviewed };
const problem = photoProblem(r, { counts: releaseCounts([...rows, ...review]), checks, fileBytes: (f) => (existsSync(`data/photos/${f}`) ? statSync(`data/photos/${f}`).size : null) });
if (problem) die(`photo would fail the pre-publish check: ${problem}`);
save();
console.log(JSON.stringify({ id: rowId, photo: r.photo, bytes: out.length }));
