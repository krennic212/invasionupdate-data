import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { idProblems, fixIds, rowIdBase, uniqueId, whenCompact } from "./ids.mjs";
import { scan, normalizePosts } from "./x-scan.mjs";

test("ids: empty and duplicate ids (within or across feed / review) are problems", () => {
  const p = idProblems({
    harvest: [{ id: "a", name: "A" }, { id: "", name: "B" }, { name: "C" }, { id: "a", name: "D" }],
    review: [{ id: "a", name: "E" }, { id: "r1", name: "F" }],
  });
  assert.equal(p.length, 4);
  assert.ok(p.some((x) => /row 1 \(B\): empty id/.test(x)));
  assert.ok(p.some((x) => /row 2 \(C\): empty id/.test(x)));
  assert.ok(p.some((x) => /row 3 \(D\): duplicate id "a"/.test(x)));
  assert.ok(p.some((x) => /review row 0 \(E\): duplicate id "a"/.test(x)));
  assert.deepEqual(idProblems({ harvest: [{ id: "a" }, { id: "b" }], review: [{ id: "c" }] }), []);
});

test("ids: fixIds renames every empty / shared id in the house style and changes nothing else", () => {
  const harvest = [
    { id: "2101053675519033827", name: "Miguel Galeas Rodriguez", when: "18 Sep 2026", sourceUrl: "https://www.dhs.gov/news/x" },
    { id: "2101053675519033827", name: "Sergio Vieyra Torres", when: "18 Sep 2026", sourceUrl: "https://www.dhs.gov/news/x" },
    { id: "", name: "Rene Pop-Chub", when: "14 Apr 2025", sourceUrl: "https://www.ice.gov/news/releases/y", photo: "https://krennic212.github.io/invasionupdate-data/photos/rene-pop-chub-6f95346e.jpg" },
    { id: "", name: "Jose Flores-Flores", when: "16 Sep 2026", sourceUrl: "https://www.justice.gov/usao-sdtx/pr/z" },
    { id: "ice-20250414-rene-pop-chub", name: "Other Row", when: "14 Apr 2025" },
    { id: "keep-me", name: "Unique" },
  ];
  const review = [{ id: "2101053675519033827", name: "Review Person", when: "1 Sep 2026" }];
  const before = JSON.parse(JSON.stringify(harvest));
  const ren = fixIds({ harvest, review });
  assert.equal(ren.length, 5);
  assert.deepEqual(harvest.map((r) => r.id), [
    "x-2101053675519033827-miguel-galeas-rodriguez", "x-2101053675519033827-sergio-vieyra-torres",
    "ice-20250414-rene-pop-chub-2", "doj-20260916-jose-flores-flores", "ice-20250414-rene-pop-chub", "keep-me",
  ]);
  assert.equal(review[0].id, "x-2101053675519033827-review-person");
  // only id changed; photo URL / file kept
  harvest.forEach((r, i) => assert.deepEqual({ ...r, id: 0 }, { ...before[i], id: 0 }));
  assert.equal(harvest[2].photo, before[2].photo);
  assert.deepEqual(idProblems({ harvest, review }), []);
  assert.equal(whenCompact("3 Apr 2025"), "20250403");
  assert.equal(rowIdBase({ name: "Ana Ruiz", sourceUrl: "https://x.com/ICEgov/status/123" }), "x-123-ana-ruiz");
  const taken = new Set(["a"]);
  assert.equal(uniqueId("a", taken), "a-2");
  assert.equal(uniqueId("", taken), "row");
});

test("validate.mjs fails on a duplicate or empty id", () => {
  const rows = JSON.parse(readFileSync("data/harvest.json", "utf8"));
  const dir = mkdtempSync(join(tmpdir(), "ids-"));
  const dup = rows.map((r) => ({ ...r }));
  dup[1].id = dup[0].id;
  writeFileSync(join(dir, "dup.json"), JSON.stringify(dup));
  const a = spawnSync(process.execPath, ["scripts/validate.mjs", join(dir, "dup.json")], { encoding: "utf8" });
  assert.equal(a.status, 1);
  assert.match(a.stderr, /duplicate id/);
  const empty = rows.map((r) => ({ ...r }));
  empty[2].id = "";
  writeFileSync(join(dir, "empty.json"), JSON.stringify(empty));
  const b = spawnSync(process.execPath, ["scripts/validate.mjs", join(dir, "empty.json")], { encoding: "utf8" });
  assert.equal(b.status, 1);
  assert.match(b.stderr, /empty id/);
  // the real feed passes
  assert.equal(spawnSync(process.execPath, ["scripts/validate.mjs"], { encoding: "utf8" }).status, 0);
});

test("x-scan: a multi-person post gives every person its own id, even when an id is already taken", () => {
  const posts = normalizePosts([{ id: "41", username: "ICEgov", created_at: "2026-10-09T15:00:00Z",
    text: "ICE arrested Pedro Gomez Ruiz, an illegal alien from Honduras charged with robbery.\nICE arrested Mario Lopez Diaz, an illegal alien from Mexico charged with assault." }]);
  const existing = [{ id: "x-41-mario-lopez-diaz", name: "Somebody Else" }];
  const { live, review } = scan(posts, { existing });
  const ids = [...live, ...review].map((r) => r.id);
  assert.deepEqual(ids.sort(), ["x-41-mario-lopez-diaz-2", "x-41-pedro-gomez-ruiz"]);
  assert.deepEqual(idProblems({ harvest: [...existing, ...live], review }), []);
});
