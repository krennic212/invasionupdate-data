import test from "node:test";
import assert from "node:assert/strict";
import { buildMeta } from "./write-meta.mjs";

const rows = [
  { id: "a", name: "Lara Gonzalez", status: "approved", photo: "x" },
  { id: "b", name: "Oleg Korniev", status: "approved", photo: "" },
  { id: "c", name: "Held Person", status: "pending", photo: "" },
  { id: "d", name: "Jose Molina-Ovalle", status: "approved", photo: "" },
  { id: "e", name: "A", status: "approved", photo: "" },
  { id: "f", name: "B", status: "approved", photo: "" },
  { id: "g", name: "C", status: "approved", photo: "" },
];

test("a run that added people stamps lastAddedAt from the harvest status time", () => {
  const m = buildMeta({
    rows,
    review: [1, 2],
    status: { checkedAtIso: "2026-10-08T22:46:58.962Z", added: ["Lara Gonzalez", "Oleg Korniev", "Jose Molina-Ovalle"] },
    prev: null,
    now: "2026-10-08T22:46:59Z",
  });
  assert.equal(m.lastAddedAt, "2026-10-08T22:46:58Z");
  assert.equal(m.lastAddedCount, 3);
  assert.deepEqual(m.lastAdded, ["Lara Gonzalez", "Oleg Korniev", "Jose Molina-Ovalle"]);
  assert.equal(m.updatedAt, "2026-10-08T22:46:59Z");
  assert.equal(m.approved, 6);
  assert.equal(m.pending, 1);
  assert.equal(m.photos, 1);
  assert.equal(m.reviewRows, 2);
});

test("a photo-only or approval-only run keeps the previous lastAdded values", () => {
  const prev = { lastAddedAt: "2026-10-08T22:46:58Z", lastAddedCount: 3, lastAdded: ["A", "B", "C"] };
  const m = buildMeta({
    rows,
    review: [],
    status: { checkedAtIso: "2026-10-08T23:40:45.178Z", added: [] },
    prev,
    now: "2026-10-08T23:40:45Z",
  });
  assert.equal(m.updatedAt, "2026-10-08T23:40:45Z");
  assert.equal(m.lastAddedAt, "2026-10-08T22:46:58Z");
  assert.equal(m.lastAddedCount, 3);
  assert.deepEqual(m.lastAdded, ["A", "B", "C"]);
});

test("an older status file never moves lastAddedAt backwards", () => {
  const prev = { lastAddedAt: "2026-10-08T22:46:58Z", lastAddedCount: 3, lastAdded: ["A", "B", "C"] };
  const m = buildMeta({ rows, review: [], status: { checkedAtIso: "2026-10-08T20:00:00Z", added: ["Old"] }, prev, now: "2026-10-08T23:00:00Z" });
  assert.equal(m.lastAddedAt, "2026-10-08T22:46:58Z");
  assert.deepEqual(m.lastAdded, ["A", "B", "C"]);
});

test("no history and nothing added gives null / 0, not a fake time", () => {
  const m = buildMeta({ rows: [], review: null, status: null, prev: null, now: "2026-10-08T23:00:00Z" });
  assert.equal(m.lastAddedAt, null);
  assert.equal(m.lastAddedCount, 0);
  assert.deepEqual(m.lastAdded, []);
  assert.equal(m.rows, 0);
});

test("lastAdded lists only rows that are currently approved (held rows like a place name drop out)", () => {
  const live = [
    { id: "ny", name: "New York", status: "pending", holdReason: "not a person" },
    { id: "h", name: "Hsa Mu Na", status: "approved" },
    { id: "s", name: "Said Ibrahim", status: "approved" },
  ];
  const prev = { lastAddedAt: "2026-10-09T20:57:15Z", lastAddedCount: 3, lastAdded: ["New York", "Hsa Mu Na", "Said Ibrahim"] };
  const m = buildMeta({ rows: live, review: [], status: null, prev, now: "2026-10-09T22:00:00Z" });
  assert.deepEqual(m.lastAdded, ["Hsa Mu Na", "Said Ibrahim"]);
  assert.equal(m.lastAddedCount, 2);
  assert.equal(m.lastAddedAt, "2026-10-09T20:57:15Z");
  const fresh = buildMeta({ rows: live, review: [], status: { checkedAtIso: "2026-10-09T21:00:00Z", added: ["New York", "Hsa Mu Na"] }, prev, now: "2026-10-09T22:00:00Z" });
  assert.deepEqual(fresh.lastAdded, ["Hsa Mu Na"]);
  assert.equal(fresh.lastAddedCount, 1);
});

import { sha256 } from "./write-meta.mjs";
import { readFileSync as readMetaFile } from "node:fs";
test("meta: updatedAt follows harvest.json's sha256 (unchanged file keeps it, any change re-stamps it)", () => {
  const rows = [{ name: "A B", status: "approved" }];
  const text = `${JSON.stringify(rows, null, 2)}\n`;
  const first = buildMeta({ rows, review: [], status: null, prev: null, now: "2026-10-20T15:00:00Z", text });
  assert.equal(first.harvestSha256, sha256(text));
  assert.equal(buildMeta({ rows, review: [], status: null, prev: first, now: "2026-10-20T16:00:00Z", text }).updatedAt, "2026-10-20T15:00:00Z");
  const rows2 = [...rows, { name: "C D", status: "approved" }];
  const text2 = `${JSON.stringify(rows2, null, 2)}\n`;
  const next = buildMeta({ rows: rows2, review: [], status: null, prev: first, now: "2026-10-20T16:00:00Z", text: text2 });
  assert.deepEqual([next.rows, next.updatedAt], [2, "2026-10-20T16:00:00Z"]);
});

test("meta: the committed data/harvest-meta.json matches the committed data/harvest.json (run scripts/write-meta.mjs)", () => {
  const text = readMetaFile(new URL("../data/harvest.json", import.meta.url), "utf8");
  const meta = JSON.parse(readMetaFile(new URL("../data/harvest-meta.json", import.meta.url), "utf8"));
  const list = JSON.parse(text);
  assert.equal(meta.harvestSha256, sha256(text), "harvest-meta.json is stale: run node scripts/write-meta.mjs");
  assert.equal(meta.rows, list.length);
  assert.equal(meta.approved, list.filter((r) => r.status === "approved").length);
  assert.equal(meta.pending, list.filter((r) => r.status === "pending").length);
});
