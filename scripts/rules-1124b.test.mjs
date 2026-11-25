// Krennic 2026-11-24 (standing OK for rule fixes that pass a dry run): a single-defendant official
// release title of the form "<Demonym> National" states nationality / non-citizen status.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { titleNationalStated, titleNationalFor, holdReasons, holdReasonsForRow } from "./guards.mjs";

const TITLE = "Peruvian National Extradited for Overseeing a Transnational Scheme to Impersonate Government Officials and Defraud U.S. Consumers";
const SENTENCE = "Karount Jannet Toledo Vazquez, 49, of Lima, Peru, was extradited to the United States and made her initial appearance in Miami federal court to face charges for her role in operating a large fraud and extortion scheme.";
const NAME = "Karount Jannet Toledo Vazquez";

test("title '<Demonym> National' is stated nationality (Toledo Vazquez)", () => {
  assert.equal(titleNationalStated(TITLE), true);
  assert.equal(titleNationalFor(NAME, TITLE, SENTENCE, SENTENCE, true), true);
  assert.deepEqual(holdReasons({ name: NAME, sentence: SENTENCE, title: TITLE, releaseText: SENTENCE, label: "Charged" }), []);
});

test("Toledo Vazquez row on the feed now passes the non-citizen guard", () => {
  const feed = JSON.parse(readFileSync(new URL("../data/harvest.json", import.meta.url), "utf8"));
  const rows = feed.filter((r) => /Toledo Vazquez/.test(r.name));
  assert.equal(rows.length, 1, rows.map((r) => r.name).join(", "));
  assert.deepEqual(holdReasonsForRow(rows[0]).filter((x) => /non-citizen/.test(x)), []);
  assert.ok(/^Charged: /.test(rows[0].crime), rows[0].crime);
});

test("titleNationalStated matches FL positives and rejects Guard/Bank/American/dual/U.S. citizen titles", () => {
  for (const t of ["Two Chinese Nationals Charged", "Greek National Pleads Guilty", "Nigerian National Sentenced in Romance Scam", "Jamaican National Extradited to Face Fraud Charges", TITLE]) {
    assert.equal(titleNationalStated(t), true, t);
  }
  for (const t of [
    "Former Air National Guard Member Sentenced for Fraud",
    "First National Bank Teller Charged With Embezzlement",
    "National Fraud Enforcement Division Announces Charges",
    "American National Sentenced",
    "Dual U.S. and Jamaican National Charged",
    "Jamaican National and U.S. Citizen Charged",
    "Native National Bank Officer Indicted",
    "Man Charged with Wire Fraud",
  ]) {
    assert.equal(titleNationalStated(t), false, t);
  }
});

test("U.S.-citizen wording anywhere still wins", () => {
  const bodyCitizen = "Jane Doe, 49, of Lima, Peru, a U.S. citizen, was extradited to the United States and made her initial appearance.";
  assert.equal(titleNationalFor("Jane Doe", TITLE, bodyCitizen, bodyCitizen, true), false);
  assert.ok(holdReasons({ name: "Jane Doe", sentence: bodyCitizen, title: TITLE, releaseText: bodyCitizen, label: "Charged", singleDefendant: true }).includes("not stated to be a non-citizen"));
  const natz = "Jane Doe, 49, of Lima, Peru, a naturalized United States citizen, was extradited.";
  assert.ok(holdReasons({ name: "Jane Doe", sentence: natz, title: TITLE, releaseText: natz, label: "Charged", singleDefendant: true }).includes("not stated to be a non-citizen"));
  const dual = "Jane Doe, 49, of Lima, Peru, a dual national, was extradited.";
  assert.ok(holdReasons({ name: "Jane Doe", sentence: dual, title: "Peruvian National Extradited", releaseText: dual, label: "Charged", singleDefendant: true }).includes("not stated to be a non-citizen"));
  assert.equal(titleNationalFor("Jane Doe", "Jamaican National and U.S. Citizen Charged", "Jane Doe, 49, of Kingston, was charged.", "", true), false);
});

test("multi-defendant releases do not use the title", () => {
  const title = "Jamaican National Extradited to Face Fraud Charges";
  const body = "Ashanie M. Campbell, 34, of Kingston, Jamaica, and Jeremie L. Cotton, 41, of Philadelphia, were charged in a fraud scheme.";
  assert.equal(titleNationalStated(title), true);
  assert.equal(titleNationalFor("Ashanie M. Campbell", title, body, body, false), false);
  assert.equal(titleNationalFor("Ashanie M. Campbell", title, body, body), false, "inferred multi from two Name, age patterns");
  assert.ok(holdReasons({ name: "Ashanie M. Campbell", sentence: body, title, releaseText: body, label: "Charged" }).includes("not stated to be a non-citizen"));
  assert.ok(holdReasons({ name: "Jeremie L. Cotton", sentence: body, title, releaseText: body, label: "Charged" }).includes("not stated to be a non-citizen"));
  const plural = "3 Mexican Nationals Plead Guilty to Laundering Money";
  assert.equal(titleNationalStated(plural), true);
  assert.equal(titleNationalFor("Juan Perez", plural, "Juan Perez, of Mexico, pleaded guilty.", "", null), false);
  const others = "Homeland Security Task Force Investigation Leads to Arrest of Chinese National, 2 Others Charged with Fraud";
  assert.equal(titleNationalFor("Jane Doe", others, "Jane Doe, of Beijing, was charged.", "", null), false);
});

test("Eagle guards still hold even when the title states nationality", () => {
  const t = "Peruvian National Extradited to Face Charges";
  assert.ok(holdReasons({ name: NAME, sentence: "Karount Jannet Toledo Vazquez, 17, of Lima, Peru, was extradited to face charges.", title: t, label: "Charged" }).includes("possible minor / juvenile"));
  assert.ok(holdReasons({ name: NAME, sentence: "Karount Jannet Toledo Vazquez, 49, of Lima, Peru, remains at large.", title: t, releaseText: "the suspect remains at large", label: "Charged" }).includes("suspect described as still at large"));
  assert.ok(holdReasons({ name: NAME, sentence: "Karount Jannet Toledo Vazquez, 49, of Lima, Peru, was charged with fraud.", title: t, label: "Convicted" }).some((x) => x.startsWith("stage")));
});

test("a body without nationality still holds when the title is not '<Demonym> National'", () => {
  assert.ok(holdReasons({ name: NAME, sentence: SENTENCE, title: "Woman Extradited for Overseeing a Fraud Scheme", releaseText: SENTENCE, label: "Charged" }).includes("not stated to be a non-citizen"));
});
