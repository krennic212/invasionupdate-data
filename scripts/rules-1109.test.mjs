// Krennic 2026-11-09 (card t125s776): "Yes, update that guard" - a defendant's foreign public office states non-citizen status.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { foreignOfficeFor, holdReasons, holdReasonsForRow } from "./guards.mjs";

const P = "Juan Carlos Perez";
test("defendant's own foreign office counts (Benítez-style)", () => {
  assert.equal(foreignOfficeFor("Luis Benítez Alcántara", "Luis Benítez Alcántara, 49, of Mexico City, was arrested on Sunday in Colombia. He is charged in a second superseding indictment with nine counts of being an accessory after the fact. Benítez Alcántara was a district judge in Mexico City who allegedly accepted $2 million in exchange for granting bond."), true);
  assert.equal(foreignOfficeFor(P, "Juan Carlos Perez, 51, a Mexican federal judge, was charged."), true);
  assert.equal(foreignOfficeFor(P, "Former Guatemalan official Juan Carlos Perez was indicted."), true);
  assert.equal(foreignOfficeFor(P, "Juan Carlos Perez, a Honduran police officer, was arrested."), true);
  assert.deepEqual(holdReasons({ name: P, sentence: "Juan Carlos Perez, a former Mexican judge, was charged with money laundering.", label: "Charged" }), []);
});

test("Benítez row on the feed passes the guard by itself and is listed once", () => {
  const feed = JSON.parse(readFileSync(new URL("../data/harvest.json", import.meta.url), "utf8"));
  const rows = feed.filter((r) => /Ben[ií]tez Alc[aá]ntara/.test(r.name));
  assert.equal(rows.length, 1);
  assert.deepEqual(holdReasonsForRow(rows[0]), []);
});

test("victims, witnesses and other officials in the release never count for the defendant", () => {
  assert.equal(foreignOfficeFor(P, "Juan Carlos Perez paid a bribe to a Mexican judge, Pedro Ruiz, to win release."), false);
  assert.equal(foreignOfficeFor(P, "A witness, former Guatemalan official Maria Lopez, testified that Juan Carlos Perez paid her."), false);
  assert.equal(foreignOfficeFor(P, "Juan Carlos Perez threatened a Honduran police officer during the robbery."), false);
  assert.ok(holdReasons({ name: P, sentence: "Juan Carlos Perez paid a bribe to a Mexican judge, Pedro Ruiz, to win release.", label: "Charged" }).includes("not stated to be a non-citizen"));
});

test("Mexican-American, U.S. offices and U.S.-citizen wording never count", () => {
  assert.equal(foreignOfficeFor(P, "Juan Carlos Perez, a Mexican-American police officer, was charged."), false);
  assert.equal(foreignOfficeFor(P, "Juan Carlos Perez, a U.S. citizen and former Mexican official, was charged."), false);
  assert.equal(foreignOfficeFor(P, "Juan Carlos Perez, a federal judge in Texas, was charged."), false);
  assert.equal(foreignOfficeFor(P, "Juan Carlos Perez, a police officer in New Mexico, was charged."), false);
  assert.equal(foreignOfficeFor(P, "Juan Carlos Perez, a police officer in Panama City, was charged."), false);
  assert.equal(foreignOfficeFor(P, "Juan Carlos Perez, a consular officer in Tijuana, Mexico, was charged."), false);
  assert.equal(foreignOfficeFor(P, "Juan Carlos Perez, an Indian tribal police officer, was charged."), false);
});
