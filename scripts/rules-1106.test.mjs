// Krennic 2026-11-06 (Tech chat): "Fix everything in the rules so less are missed in the future."
import test from "node:test";
import assert from "node:assert/strict";
import { extractPeople } from "./parse.mjs";
import { holdReasons, nonCitizenStated } from "./guards.mjs";
import { upgradeStage } from "./stage-upgrade.mjs";

const names = (blocks) => extractPeople(blocks, { title: "" }).map((h) => h.name);
const holds = (blocks, label = "Charged") => extractPeople(blocks, { title: "" }).map((h) => holdReasons({ name: h.name, sentence: h.sentence, title: "", releaseText: blocks.join(" "), label }));

test("name formats: 'age 45', '(pictured)', status lead, no-age demonym lead, illegal-alien lead, native of", () => {
  assert.deepEqual(names(["DALLAS – Juan Carlos Perez-Lopez, age 45, a Mexican national, was sentenced today to 46 months for illegal reentry."]), ["Juan Carlos Perez-Lopez"]);
  assert.deepEqual(names(["Juan Carlos Perez-Lopez (pictured), 45, a Mexican national, was sentenced today for illegal reentry."]), ["Juan Carlos Perez-Lopez"]);
  assert.deepEqual(names(["Honduran citizen Carlos Alberto Mejia-Rivas, 29, was sentenced today to 10 years for drug trafficking."]), ["Carlos Alberto Mejia-Rivas"]);
  assert.deepEqual(names(["Guatemalan national Carlos Alberto Mejia-Rivas was sentenced today to 10 years for illegal reentry."]), ["Carlos Alberto Mejia-Rivas"]);
  assert.deepEqual(names(["Illegal alien Carlos Alberto Mejia-Rivas was sentenced today for illegal reentry after deportation."]), ["Carlos Alberto Mejia-Rivas"]);
  assert.deepEqual(names(["Maria Elena Gomez-Ruiz, 41, a native of Mexico illegally present in the United States, was charged with fraud."]), ["Maria Elena Gomez-Ruiz"]);
  // Status in the earlier sentence, name with age in the next.
  assert.deepEqual(names(["HOUSTON – A Mexican national illegally present in the United States was sentenced today for possessing a firearm.", "Jose Luis Martinez-Garza, 33, pleaded guilty in June."]), ["Jose Luis Martinez-Garza"]);
});

test("name formats never pass a U.S. citizen or an American", () => {
  assert.deepEqual(names(["American citizen John Robert Doe, 45, was sentenced for smuggling aliens."]).length, 0);
  // "a native of Texas" is not a format hit; "native of Mexico" with no status words is not either.
  assert.deepEqual(names(["John Robert Doe, 45, a native of Texas, was sentenced for smuggling aliens."]), []);
  assert.deepEqual(names(["Maria Elena Gomez-Ruiz, 41, a native of Mexico, was charged with fraud."]), []);
  // "both natives and citizens of Honduras" still reads the citizenship (no shadowing by "native").
  assert.ok(names(["BUFFALO – Arlen Saul Castillo, 29, and Jonathan Esteban Osario Lopez, 32, both natives and citizens of Honduras, pleaded guilty to illegal re-entry."]).includes("Jonathan Esteban Osario Lopez"));
});

test("a U.S.-citizen VICTIM does not cancel the defendant's own status; own U.S. citizenship still blocks", () => {
  assert.equal(nonCitizenStated("Sukhdev Singh, an illegal alien from India, was arrested after a crash that left a U.S. citizen hospitalized."), true);
  assert.equal(nonCitizenStated("He is an illegal alien from Mexico who raped a 14-year-old U.S. citizen girl."), true);
  assert.equal(nonCitizenStated("Juan Perez, 45, a U.S. citizen, was sentenced for smuggling illegal aliens."), false);
  assert.equal(nonCitizenStated("Several smugglers were arrested, including U.S. citizen Ernesto Covarrubias and illegal aliens from Mexico."), false);
});

test("'on the loose' holds like 'at large'", () => {
  const h = holds(["Carlos Alberto Mejia-Rivas, 29, an illegal alien from Honduras, was charged with murder and remains on the loose."]);
  assert.ok(h[0].includes("suspect described as still at large"));
});

test("Charged -> Convicted from a later official release (same name, same state, forward only)", () => {
  const prev = { name: "Jose Luis Martinez-Garza", city: "Houston, TX", status: "approved", when: "1 Mar 2026", sourceUrl: "https://www.justice.gov/usao-sdtx/pr/a", crime: "Charged: Jose Luis Martinez-Garza, 33, a Mexican national, was charged with illegal reentry.", text: "DOJ Mar 1, 2026, as posted: ...", voting: false };
  const existing = [prev];
  const rel = { office: "TheJusticeDept", url: "https://www.justice.gov/usao-sdtx/pr/b", date: "2026-11-01", title: "Mexican National Sentenced for Illegal Reentry", blocks: ["HOUSTON – Jose Luis Martinez-Garza, 33, a Mexican national, was sentenced today to 46 months in federal prison for illegal reentry."] };
  const [hit] = extractPeople(rel.blocks, { title: rel.title });
  assert.match(upgradeStage(existing, hit, rel) || "", /Charged -> Convicted/);
  assert.match(prev.crime, /^Convicted: HOUSTON – Jose Luis Martinez-Garza, 33, a Mexican national, was sentenced today/);
  assert.equal(prev.stageSourceUrl, rel.url);
  assert.equal(prev.stageFrom, "Charged");
  assert.equal(prev.sourceUrl, "https://www.justice.gov/usao-sdtx/pr/a");
  // Never backward, never twice.
  assert.equal(upgradeStage(existing, hit, rel), null);
  // Other state: not the same person.
  const other = [{ ...prev, city: "Boston, MA", crime: "Charged: x" }];
  assert.equal(upgradeStage(other, hit, rel), null);
  // A held (pending) row is not touched.
  const pend = [{ ...prev, status: "pending", crime: "Charged: x" }];
  assert.equal(upgradeStage(pend, hit, rel), null);
});

test("stage upgrade needs the new release's own status wording (guards still run)", () => {
  const prev = { name: "Jose Luis Martinez-Garza", city: "Houston, TX", status: "approved", when: "1 Mar 2026", sourceUrl: "https://www.justice.gov/usao-sdtx/pr/a", crime: "Charged: ...", text: "", voting: false };
  const rel = { office: "TheJusticeDept", url: "https://www.justice.gov/usao-sdtx/pr/c", date: "2026-11-01", title: "Man Sentenced", blocks: ["HOUSTON – Jose Luis Martinez-Garza, 33, a Mexican national, was sentenced today and remains on the loose after escaping."] };
  const [hit] = extractPeople(rel.blocks, { title: rel.title });
  assert.equal(upgradeStage([prev], hit, rel), null);
  assert.equal(prev.crime, "Charged: ...");
});
