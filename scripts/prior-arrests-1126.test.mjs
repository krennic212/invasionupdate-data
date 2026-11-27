import { test } from "node:test";
import assert from "node:assert/strict";
import { priorFromRelease, siblingNames } from "./prior-arrests.mjs";
import { fillNulls, backfill } from "./backfill-prior-release.mjs";

// Phrasings found in whole official releases during the 2026-11-26 backfill.
test("'He had twice been arrested in California for domestic violence' -> 2, floor (count is for one offense)", () => {
  const p = priorFromRelease("Axel Eduardo Chavez-Marroquin was charged. He had twice been arrested in California for domestic violence.", "Axel Eduardo Chavez-Marroquin");
  assert.equal(p.priorArrests, 2);
  assert.equal(p.priorArrestsPlus, true);
});
test("'Border Patrol later arrested Figueroa three times between ...' -> 3, floor; first half of a hyphenated surname names the person", () => {
  const p = priorFromRelease("ICE arrested Moises Alberto Figueroa-Bonilla May 27. The Border Patrol later arrested Figueroa three times between Nov. 2015 and Feb. 2019.", "Moises Alberto Figueroa-Bonilla");
  assert.equal(p.priorArrests, 3);
  assert.equal(p.priorArrestsPlus, true);
});
test("'released Flores back into the community on two separate occasions' -> releases 2, never arrests", () => {
  const p = priorFromRelease("Officers arrested Alex Yonatan Flores-Arce, May 22 after the jail released Flores back into the community on two separate occasions.", "Alex Yonatan Flores-Arce");
  assert.equal(p.priorReleases, 2);
  assert.equal(p.priorArrests, null);
});
test("a sibling surname that is one of this person's given names does not hide the person's sentences", () => {
  const rel = "Image Jose Manuel Munoz Ramos, an illegal alien from Mexico. He has previously been removed from the United States THREE times in 2002, 2015, and 2018. Image Elias Izquiero Manuel, an illegal alien from Mexico.";
  assert.equal(priorFromRelease(rel, "Jose Manuel Munoz Ramos", ["Elias Izquiero Manuel"]).priorRemovals, 3);
  assert.equal(priorFromRelease(rel, "Elias Izquiero Manuel", ["Jose Manuel Munoz Ramos"]).priorRemovals, null);
});
test("a list of charges is still no count; 'several arrests' is still no count", () => {
  assert.equal(priorFromRelease("Jon Doe was charged. He has a record of several arrests since 2025 for charges including arson.", "Jon Doe").priorArrests, null);
  assert.equal(priorFromRelease("Jon Doe was charged. His criminal history includes arrests for assault, theft and DUI.", "Jon Doe").priorArrests, null);
});
test("siblingNames: a bare X handle in via is not a shared source", () => {
  const rows = [
    { id: "a", name: "Alex Flores-Arce", sourceUrl: "https://www.ice.gov/news/releases/one", via: "@EROBaltimore 1" },
    { id: "b", name: "Arturo Flores", sourceUrl: "https://www.ice.gov/news/releases/two", via: "@EROBaltimore 2" },
  ];
  assert.deepEqual(siblingNames(rows)(rows[0]), []);
});
test("fillNulls never overwrites a filled field", () => {
  const row = { priorArrests: 4, priorArrestsPlus: false, priorArrestsQuote: "four arrests", priorReleases: null, priorConvictions: 1, priorRemovals: null };
  const f = fillNulls(row, { priorArrests: 9, priorArrestsPlus: true, priorArrestsQuote: "x", priorReleases: 2, priorConvictions: 5, priorRemovals: 3 });
  assert.deepEqual(f, ["priorReleases", "priorRemovals"]);
  assert.equal(row.priorArrests, 4);
  assert.equal(row.priorArrestsQuote, "four arrests");
  assert.equal(row.priorConvictions, 1);
});
test("backfill skips rows with an approvalNote and non-official sources", () => {
  const base = { priorArrests: null, priorArrestsPlus: false, priorArrestsQuote: null, priorReleases: null, priorConvictions: null, priorRemovals: null };
  const rows = [
    { ...base, id: "1", name: "Jon Doe", sourceUrl: "https://www.dhs.gov/news/x", approvalNote: "Krennic ok" },
    { ...base, id: "2", name: "Jan Roe", sourceUrl: "https://x.com/ICEgov/status/1" },
    { ...base, id: "3", name: "Jim Poe", sourceUrl: "https://www.dhs.gov/news/y" },
  ];
  const rep = backfill(rows, rows, () => "Jon Doe has five prior arrests. Jan Roe has five prior arrests. Jim Poe has five prior arrests.");
  assert.equal(rep.checked, 1);
  assert.equal(rows[0].priorArrests, null);
  assert.equal(rows[1].priorArrests, null);
  assert.equal(rows[2].priorArrests, 5);
});
