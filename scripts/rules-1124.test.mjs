import test from "node:test";
import assert from "node:assert/strict";
import { nationalRemovedStated, holdReasons } from "./guards.mjs";

const JAIRO = "ICE Buffalo arrested 33-year-old Honduran national Jairo Recarte-Bazquez on Oct. 30. Recarte-Basquez was convicted of first-degree sexual abuse in Suffolk County Court. ICE removed him from the U.S. on Nov. 16.";

test("Krennic 2026-11-24 t70u: '<Nationality> national' + removed counts as non-citizen wording", () => {
  assert.equal(nationalRemovedStated(JAIRO), true);
  assert.equal(nationalRemovedStated("Juan Perez, a Mexican national, was previously removed from the United States in 2019."), true);
  assert.equal(nationalRemovedStated("A Guatemalan national who was removed in 2015 was charged."), true);
  const reasons = holdReasons({ name: "Jairo Recarte-Bazquez", sentence: JAIRO, label: "Removed" });
  assert.ok(!reasons.includes("not stated to be a non-citizen"), reasons.join("; "));
});

test("forward-looking removal and the citizen override do not count", () => {
  assert.equal(nationalRemovedStated("The Honduran national will be removed after his sentence."), false);
  assert.equal(nationalRemovedStated("The Honduran national is pending removal."), false);
  assert.equal(nationalRemovedStated("The Honduran national faces removal proceedings."), false);
  assert.equal(nationalRemovedStated("A Honduran national and naturalized citizen, he was removed from office."), false);
  assert.equal(nationalRemovedStated("The Mexican national, a dual national, was removed."), false);
  assert.equal(nationalRemovedStated("John Smith was removed from the United States."), false, "needs the nationality");
  assert.equal(nationalRemovedStated("The American national was removed."), false);
});
