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
