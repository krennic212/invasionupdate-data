import { test } from "node:test";
import assert from "node:assert/strict";
import { searchWindow, snowflakeTime, buildQueries } from "./x-queries.mjs";

const ID = "2108578564874416599";
const T = snowflakeTime(ID);

test("snowflakeTime decodes a 2026 id", () => {
  assert.equal(new Date(T).getUTCFullYear(), 2026);
});

test("uses since_id when lastSeenId is older than 75 minutes", () => {
  assert.deepEqual(searchWindow(ID, T + 3 * 3600_000), { since_id: ID });
});

test("uses start_time = now - 75 min when lastSeenId is newer (keeps the 75 min floor)", () => {
  const now = T + 10 * 60_000;
  const w = searchWindow(ID, now);
  assert.ok(w.start_time && !w.since_id);
  assert.equal(Date.parse(w.start_time), Math.floor((now - 75 * 60_000) / 1000) * 1000);
});

test("no lastSeenId falls back to start_time", () => {
  assert.ok(searchWindow(undefined, T).start_time);
});

test("queries stay within 1024 chars", () => {
  for (const q of buildQueries()) assert.ok(q.length <= 1024);
});
