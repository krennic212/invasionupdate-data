import test from "node:test";
import assert from "node:assert/strict";
import { buildMeta } from "./write-meta.mjs";

const rows = [
  { id: "a", status: "approved", photo: "x" },
  { id: "b", status: "approved", photo: "" },
  { id: "c", status: "pending", photo: "" },
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
  assert.equal(m.approved, 2);
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
