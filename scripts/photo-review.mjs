#!/usr/bin/env node
/**
 * Visual check for an official-release photo (the step code cannot do).
 * LOOK at data/photos/<file> first. Rule: one person only, no child, and no second person whose face
 * can be seen (a back turned / face fully out of frame is fine).
 *
 * <rowId> is the row's id (or its exact name when the id is empty).
 *   node scripts/photo-review.mjs <rowId> --ok "single booking photo, one adult, no other faces"
 *   node scripts/photo-review.mjs <rowId> --drop "second person's face visible (officer at right)"
 *
 * --ok   publishes the saved file: photo = Pages URL, photoSourceUrl = original image, photoHold
 *        cleared, check result "photo" with the reviewed note. Refused if the pre-publish check fails.
 * --drop clears photo (the file is kept), sets photoHold = reason, check result "dropped".
 * Works for rows whose source has a check on record with a saved file (release photos; X photos use
 * scripts/x-photo.mjs to attach, but --drop works for them too).
 */
import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { PHOTO_PREFIX, photoProblem, photoReleaseOf, releaseCounts, urlKey } from "./photo-rules.mjs";

const die = (m) => { console.error(`photo-review: ${m}`); process.exit(1); };
const args = process.argv.slice(2);
const flag = (k) => { const i = args.indexOf(k); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v || ""; };
const ok = flag("--ok");
const drop = flag("--drop");
const [rowId] = args;
if (!rowId || (ok === null) === (drop === null)) die('usage: <rowId> --ok "<what you saw>" | --drop "<why>"');
if (ok !== null && !ok.trim()) die("--ok needs a note describing what you saw");
if (drop !== null && !drop.trim()) die("--drop needs a reason");
const rows = JSON.parse(readFileSync("data/harvest.json", "utf8"));
const review = existsSync("data/review.json") ? JSON.parse(readFileSync("data/review.json", "utf8")) : [];
const checks = existsSync("data/photo-checks.json") ? JSON.parse(readFileSync("data/photo-checks.json", "utf8")) : {};
// Rows from the original bundle may have an empty id: the exact name works too.
const r = rows.find((x) => x?.id && x.id === rowId) || rows.find((x) => x?.name === rowId);
if (!r) die(`no live row with id ${rowId}`);
const rel = photoReleaseOf(r);
if (!rel) die("row has no official source");
const k = urlKey(rel);
const chk = checks[k];
if (!chk || !chk.file || !chk.image) die("no saved image on record for this row's source");
const fileBytes = (f) => (existsSync(`data/photos/${f}`) ? statSync(`data/photos/${f}`).size : null);
const now = new Date().toISOString();
if (drop !== null) {
  r.photo = "";
  delete r.photoSourceUrl;
  r.photoHold = drop.trim();
  checks[k] = { ...chk, result: "dropped", why: drop.trim(), reviewedAt: now };
  delete checks[k].reviewed;
} else {
  if (fileBytes(chk.file) == null) die(`data/photos/${chk.file} is missing`);
  r.photo = `${PHOTO_PREFIX}${chk.file}`;
  r.photoSourceUrl = chk.image;
  delete r.photoHold;
  checks[k] = { ...chk, result: "photo", reviewed: ok.trim(), reviewedAt: now };
  delete checks[k].why;
  const problem = photoProblem(r, { counts: releaseCounts([...rows, ...review]), checks, fileBytes });
  if (problem) die(`photo would fail the pre-publish check: ${problem}`);
}
writeFileSync("data/harvest.json", `${JSON.stringify(rows, null, 2)}\n`);
writeFileSync("data/photo-checks.json", `${JSON.stringify(checks, null, 2)}\n`);
console.log(JSON.stringify({ id: rowId, name: r.name, photo: r.photo, photoHold: r.photoHold || "" }));
