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

import { leadingGivenNameVariant, findLikelyDuplicates, countryKey } from "./dedupe.mjs";

test("leading given-name variant: longer name is shorter plus leading given names", () => {
  assert.equal(leadingGivenNameVariant("Juan Leonardo Parra Altamirano", "Leonardo Parra Altamirano"), true);
  assert.equal(leadingGivenNameVariant("Leonardo Parra Altamirano", "Juan Leonardo Parra Altamirano"), true);
  assert.equal(leadingGivenNameVariant("Jose Doe", "John Doe"), false);
  assert.equal(leadingGivenNameVariant("Juan Perez", "Juan Perez"), false);
  assert.equal(leadingGivenNameVariant("Maria Elena Vargas", "Elena Vargas"), true);
  assert.equal(leadingGivenNameVariant("Ana Vargas Lopez", "Maria Vargas Lopez"), false);
});

test("likely duplicate report: same country + leading given-name variant, no auto-merge", () => {
  const live = {
    id: "x-1-juan-leonardo-parra-altamirano",
    name: "Juan Leonardo Parra Altamirano",
    origin: "Ecuador",
    sourceUrl: "https://x.com/EROBoston/status/1",
    photo: "",
  };
  const rev = {
    id: "dhs-1",
    name: "Leonardo Parra Altamirano",
    origin: "Ecuador",
    sourceUrl: "https://x.com/DHSgov/status/2",
    photo: "",
  };
  const otherCountry = { ...rev, id: "dhs-2", origin: "Mexico" };
  const unrelated = { id: "x-2", name: "Juan Perez", origin: "Ecuador", sourceUrl: "https://x.com/ICEgov/status/3", photo: "" };

  const hits = findLikelyDuplicates([
    { file: "data/harvest.json", rows: [live, unrelated] },
    { file: "data/review.json", rows: [rev, otherCountry] },
  ]);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].a.name, "Juan Leonardo Parra Altamirano");
  assert.equal(hits[0].b.name, "Leonardo Parra Altamirano");
  assert.match(hits[0].reason, /leading given-name|surname|country/i);

  // Same-URL exact dedupe still merges; likely-duplicate pairs are NOT collapsed.
  const { rows, merged } = dedupeRows([live, rev]);
  assert.equal(rows.length, 2);
  assert.equal(merged.length, 0);
  assert.equal(countryKey({ origin: "Not stated" }), "");
});
