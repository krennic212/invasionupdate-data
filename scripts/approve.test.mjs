import test from "node:test";
import assert from "node:assert/strict";
import { approveRows } from "./approve.mjs";

const rows = [
  { id: "a", name: "A", status: "approved" },
  { id: "b", name: "B", status: "pending" },
  { id: "c", name: "C", status: "pending" },
];

test("approve all flips every pending row, leaves approved rows alone", () => {
  const { rows: out, approved } = approveRows(rows, "all");
  assert.deepEqual(out.map((r) => r.status), ["approved", "approved", "approved"]);
  assert.deepEqual(approved, ["b", "c"]);
});

test("approve by id flips only those rows", () => {
  const { rows: out, unknown } = approveRows(rows, "c");
  assert.deepEqual(out.map((r) => r.status), ["approved", "pending", "approved"]);
  assert.deepEqual(unknown, []);
});

test("unknown or already-approved ids are reported, nothing is deleted", () => {
  const { rows: out, unknown } = approveRows(rows, "a,zzz");
  assert.equal(out.length, 3);
  assert.deepEqual(unknown, ["a", "zzz"]);
});

test("empty input is an error", () => {
  assert.throws(() => approveRows(rows, ""));
});
