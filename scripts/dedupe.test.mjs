import test from "node:test";
import assert from "node:assert/strict";
import { dedupeRows } from "./dedupe.mjs";
import { routeRows, isOfficialRow } from "./rules.mjs";

const row = (o) => ({ name: "Jane Doe", when: "1 Oct 2026", sourceUrl: "https://www.justice.gov/usao-mn/pr/doe-charged-illegal-reentry", photo: "", ...o });

test("exact duplicate rows collapse to the first", () => {
  const { rows } = dedupeRows([row({ city: "A" }), row({ city: "B" })]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].city, "A");
});

test("usao vs opa copy of the same release for the same person collapses", () => {
  const { rows } = dedupeRows([row(), row({ sourceUrl: "https://www.justice.gov/opa/pr/doe-charged-illegal-reentry" })]);
  assert.equal(rows.length, 1);
});

test("co-defendants on the same release are never merged", () => {
  const { rows } = dedupeRows([row(), row({ name: "John Roe" }), row({ name: "Jane Doe-Roe" })]);
  assert.equal(rows.length, 3);
});

test("photos are blanked, other fields untouched", () => {
  const src = row({ photo: "https://pbs.twimg.com/media/x.jpg", crime: "Charged: as posted" });
  const { rows } = dedupeRows([src]);
  assert.deepEqual(rows[0], { ...src, photo: "" });
});

test("only official federal sources go live; X / news go to review", () => {
  const { live, review } = routeRows([
    row(),
    row({ name: "A", sourceUrl: "https://www.dhs.gov/news/2026/10/05/x" }),
    row({ name: "B", sourceUrl: "https://x.com/ICEgov/status/1", photo: "https://pbs.twimg.com/a.jpg" }),
    row({ name: "C", sourceUrl: "https://www.dailywire.com/news/x" }),
    row({ name: "D", sourceUrl: "https://www.dhs.gov/news/2026/09/18/x https://x.com/DHSgov/status/2" }),
    row({ name: "E", sourceUrl: "https://fakejustice.gov.example.com/pr/x" }),
  ]);
  assert.deepEqual(live.map((r) => r.name), ["Jane Doe", "A", "D"]);
  assert.deepEqual(review.map((r) => r.name), ["B", "C", "E"]);
  assert.ok([...live, ...review].every((r) => r.photo === ""));
  assert.match(review[0].reviewReason, /X post/);
});

test("look-alike hosts are not official", () => {
  assert.equal(isOfficialRow({ sourceUrl: "https://justice.gov.evil.com/x" }), false);
  assert.equal(isOfficialRow({ sourceUrl: "http://www.ice.gov/x" }), false);
  assert.equal(isOfficialRow({ sourceUrl: "https://www.ice.gov/news/releases/x" }), true);
});
