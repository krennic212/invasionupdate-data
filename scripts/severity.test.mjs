import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TABLE, scoreRow, withSeverity, withSeverityAll, buildHighlights, stageOf, inWindow, writeSeverityFiles } from "./severity.mjs";

const P = Object.fromEntries(Object.entries(TABLE.crimes).map(([k, v]) => [k, v.points]));
const L = Object.fromEntries(Object.entries(TABLE.crimes).map(([k, v]) => [k, v.label]));
const W = TABLE.stage;
const conv = (crime, extra = {}) => ({ name: "Test Person", crime: `Convicted: ${crime}`, text: "", usa: "", when: "8 Oct 2026", status: "approved", ...extra });
const chg = (crime, extra = {}) => ({ ...conv(crime, extra), crime: `Charged: ${crime}` });
const score = (r) => scoreRow(r).severity;

test("points table has the locked values (edit severity-points.json, not code)", () => {
  assert.deepEqual(P, {
    murder: 95, childSex: 92, rape: 90, terrorism: 90, officer: 88, attemptedMurder: 85, materialSupport: 85,
    kidnapping: 82, childViolence: 80, animalSex: 75, robberyAssault: 70, alienSmuggling: 65, fraud: 60,
    weapons: 55, drugs: 50, assault: 40, theft: 35, dui: 25, immigration: 5,
  });
  assert.deepEqual(W, { convicted: 1, notConvicted: 0.9 });
  assert.equal(TABLE.extraCountBonus, 0.1);
  assert.equal(TABLE.extraCountBonusCap, 0.3);
});

test("classification: one crime each", () => {
  const cases = [
    ["Juan Rodriguez, convicted of murder in Kingston, New York.", "murder"],
    ["convicted of vehicular homicide in Atlanta, Georgia.", "murder"],
    ["convicted for first-degree sexual assault in Lincoln, Nebraska.", "rape"],
    ["convicted of rape.", "rape"],
    ["convicted of third-degree sexual abuse of a minor in Montgomery County, Maryland.", "childSex"],
    ["convicted of two counts of lewd or lascivious acts upon child.", "childSex"],
    ["convicted for possession of child pornography.", "childSex"],
    ["convicted of attempted murder.", "attemptedMurder"],
    ["convicted of kidnapping.", "kidnapping"],
    ["Her criminal history includes child abuse.", "childViolence"],
    ["convicted of aggravated robbery.", "robberyAssault"],
    ["convicted of unlawful possession of handguns.", "weapons"],
    ["convicted of conspiracy to distribute methamphetamine.", "drugs"],
    ["convicted for burglary in Bonneville County, Idaho.", "theft"],
    ["convicted of DUI.", "dui"],
    ["charged with voting by an alien in a federal election.", "fraud"],
    ["sentenced for illegally reentering the United States after deportation.", "immigration"],
  ];
  for (const [text, key] of cases) {
    const s = scoreRow(conv(text));
    assert.deepEqual(s.severityCrimes, [L[key]], text);
    assert.equal(s.severityReason, L[key], text);
    assert.equal(s.severity, Math.round(P[key] * (/two counts/.test(text) ? 1.1 : 1)), text);
  }
});

test("classification: stabbing / shooting / assaulting an officer", () => {
  const stab = scoreRow(chg("Two illegal aliens stabbed an NYPD officer in the Bronx."));
  assert.equal(stab.severityReason, L.officer);
  assert.ok(stab.severityCrimes.includes(L.attemptedMurder));
  assert.equal(stab.severity, Math.round((P.officer + P.attemptedMurder) * W.notConvicted));
  assert.equal(scoreRow(conv("sentenced in connection with the shooting of an off-duty U.S. Customs and Border Protection (“CBP”) Officer in Manhattan.")).severityReason, L.officer);
  const burton = scoreRow(conv("convicted for murder, assault on a law enforcement officer, resisting arrest, and possession of a firearm."));
  assert.deepEqual(burton.severityCrimes, [L.murder, L.officer, L.weapons]);
  assert.equal(burton.severity, P.murder + P.officer + P.weapons);
  // "evading a peace officer" is not an attack; "deputies and ICE officers arrested him" is not either.
  assert.ok(!scoreRow(conv("convictions include evading a peace officer.")).severityCrimes.includes(L.officer));
  assert.ok(!scoreRow(chg("Sheriff deputies and ICE officers arrested him after he attempted to sexually abuse a 14-year-old child.")).severityCrimes.includes(L.officer));
});

test("plain assault, battery and strangulation are not aggravated assault", () => {
  assert.equal(score(conv("convicted of assault.")), P.assault);
  assert.equal(score(conv("convicted of battery.")), P.assault);
  assert.equal(score(conv("convicted of assault and battery.")), P.assault);
  assert.equal(score(conv("convicted of strangulation.")), P.assault);
  assert.equal(score(conv("convicted of aggravated assault.")), P.robberyAssault);
  assert.equal(score(conv("convicted of aggravated battery.")), P.robberyAssault);
  assert.equal(score(conv("convicted of domestic violence.")), P.robberyAssault);
  assert.ok(P.assault < P.robberyAssault);
});

test("crimes that used to score 0", () => {
  const plot = scoreRow(chg("the alleged ringleader of the failed terrorist plot against UFC Freedom 250 at the White House."));
  assert.equal(plot.severityReason, L.terrorism);
  assert.equal(plot.severity, Math.round(P.terrorism * W.notConvicted));
  const support = scoreRow(chg("providing material support to the Gulf Cartel, a designated foreign terrorist organization."));
  assert.deepEqual(support.severityCrimes, [L.materialSupport]);
  assert.equal(support.severity, Math.round(P.materialSupport * W.notConvicted));
  assert.equal(score(conv("convicted of smuggling illegal aliens for profit.")), P.alienSmuggling);
  assert.equal(score(conv("convicted of alien smuggling.")), P.alienSmuggling);
  assert.equal(score(conv("convicted of smuggling goods from the United States.")), 0);
  const animal = scoreRow(conv("convicted for sexual abuse of an animal and distribution of Schedule I drugs."));
  assert.deepEqual(animal.severityCrimes, [L.animalSex, L.drugs]);
  assert.equal(animal.severity, P.animalSex + P.drugs);
  const entice = scoreRow(conv("convicted for money laundering and conspiracy to persuade, induce, entice, and coerce one or more individuals."));
  assert.ok(entice.severityCrimes.includes(L.childSex));
  assert.ok(entice.severityCrimes.includes(L.fraud));
});

test("immigration-only row is 5 points and ranks below every violent row", () => {
  const reentry = score(conv("pleaded guilty to illegal reentry after deportation."));
  assert.equal(reentry, 5);
  const dui = score(conv("convicted of DUI."));
  for (const t of ["murder", "rape", "sexual abuse of a minor", "aggravated assault", "kidnapping", "assault"]) {
    assert.ok(score(chg(`charged with ${t}.`)) > dui, t);
    assert.ok(score(chg(`charged with ${t}.`)) > reentry, t);
  }
});

test("additive: distinct crimes are summed", () => {
  assert.ok(score(conv("convicted of murder and DUI.")) > score(conv("convicted of murder.")));
  assert.equal(score(conv("convicted of murder and DUI.")), P.murder + P.dui);
  const both = score(conv("convicted of rape and possession of child pornography."));
  assert.equal(both, P.rape + P.childSex);
  assert.ok(both > score(conv("convicted of rape.")));
  assert.ok(both > score(conv("convicted of possession of child pornography.")));
  const s = scoreRow(conv("convicted of homicide, aggravated assault with a gun, and robbery."));
  assert.deepEqual(s.severityCrimes, [L.murder, L.robberyAssault]); // assault + robbery are one tier; "with a gun" is part of the assault
  assert.equal(s.severity, P.murder + P.robberyAssault);
});

test("same crime twice is not double-counted; explicit extra counts add 10% each, capped at 30%", () => {
  assert.equal(score(conv("convicted of rape. The rape happened in 2019; a second rape report followed.")), P.rape);
  assert.equal(score(conv("convicted of rape and sexual assault.")), P.rape);
  assert.equal(score(conv("convicted of two counts of rape.")), Math.round(P.rape * 1.1));
  assert.equal(score(conv("convicted of three counts of rape.")), Math.round(P.rape * 1.2));
  assert.equal(score(conv("convicted of FOUR counts of illegal re-entry.")), Math.round(P.immigration * 1.3));
  assert.equal(score(conv("convicted of 12 counts of rape.")), Math.round(P.rape * 1.3));
  assert.equal(score(chg("He has two separate pending DUI charges.")), Math.round(P.dui * W.notConvicted * 1.1));
});

test("a rape of a child is one child sex crime, not child sex + rape", () => {
  assert.deepEqual(scoreRow(conv("convicted of rape of a child and indecent assault and battery on a victim-while-under-14.")).severityCrimes, [L.childSex]);
  assert.deepEqual(scoreRow(chg("charged with statutory rape and sexual exploitation of a minor. He lied to a 15-year-old girl so that he could sexually assault her.")).severityCrimes, [L.childSex]);
  assert.deepEqual(scoreRow(conv("convicted for sexual abuse of an animal.")).severityCrimes, [L.animalSex]);
});

test("stage weighting: convicted full, charged / arrested / as posted 90%, never upgraded", () => {
  assert.equal(score(conv("murder.")), 95);
  assert.equal(score(chg("murder.")), Math.round(95 * 0.9));
  assert.equal(score({ ...conv(""), crime: "Arrested: ICE arrested him; his criminal history includes murder." }), Math.round(95 * 0.9));
  assert.equal(score({ ...conv(""), crime: "As posted: wanted for murder." }), Math.round(95 * 0.9));
  assert.equal(stageOf({ crime: "Removed: ICE deported Phai You, a Cambodian citizen convicted of second-degree murder." }), "convicted");
  assert.equal(stageOf({ crime: "Removed. Convicted: robbery with a firearm in Florida." }), "convicted");
  assert.equal(stageOf({ crime: "Removed: her criminal history includes child abuse." }), "notConvicted");
  assert.equal(stageOf({ crime: "Charged (not convicted): voting by an alien in a federal election." }), "notConvicted");
  assert.equal(stageOf({ crime: "Charged: convicted rapist charged again with rape." }), "notConvicted");
  // within a tier, a conviction ranks above a charge
  assert.ok(score(conv("rape.")) > score(chg("rape.")));
});

test("release headline is used only when the row names no crime and the release is about 1-2 people", () => {
  const row = { ...conv(""), crime: "As posted: ICE has since identified both suspects.", usa: "DHS release Oct 6, 2026: DHS Issues Statement After Two Illegal Aliens Stab Off-Duty NYPD Detective | Homeland Security" };
  const two = withSeverityAll([{ ...row, sourceUrl: "https://www.dhs.gov/x" }, { ...row, name: "B", sourceUrl: "https://www.dhs.gov/x" }]);
  assert.equal(two[0].severityReason, L.officer);
  assert.ok(two[0].severityCrimes.includes(L.attemptedMurder));
  assert.equal(two[0].severity, Math.round((P.officer + P.attemptedMurder) * 0.9));
  const roundup = withSeverityAll([1, 2, 3].map((i) => ({ ...row, name: `P${i}`, crime: "Removed: MS-13 gang member, deported.", usa: "DHS release: murderers and thieves deported", sourceUrl: "https://www.dhs.gov/y" })));
  assert.equal(roundup[0].severity, 0);
  assert.equal(roundup[0].severityReason, "");
  assert.deepEqual(roundup[0].severityCrimes, []);
});

test("charge wording, stage and every other field are untouched; fields sit right after `when`", () => {
  const row = { name: "A B", city: "X", crime: "Convicted: convicted of rape and DUI.", text: "t", usa: "u", id: "a", when: "8 Oct 2026", photo: "", lat: null, lon: null, status: "approved" };
  const before = JSON.parse(JSON.stringify(row));
  const out = withSeverity(row);
  assert.deepEqual(row, before); // input not mutated
  for (const k of Object.keys(row)) assert.deepEqual(out[k], row[k], k);
  const keys = Object.keys(out);
  assert.deepEqual(keys.slice(keys.indexOf("when"), keys.indexOf("when") + 4), ["when", "severity", "severityReason", "severityCrimes"]);
  assert.deepEqual(out.severityCrimes, [L.rape, L.dui]);
  // idempotent: re-running gives the same row, no duplicated keys
  assert.deepEqual(withSeverity(out), out);
});

test("the real feed: crime/text/usa/stage untouched for every row after scoring", () => {
  const rows = JSON.parse(readFileSync(new URL("../data/harvest.json", import.meta.url), "utf8"));
  const out = withSeverityAll(rows);
  assert.equal(out.length, rows.length);
  out.forEach((r, i) => {
    for (const k of ["name", "crime", "text", "usa", "when", "status", "id", "sourceUrl", "photo"]) assert.deepEqual(r[k], rows[i][k]);
    assert.ok(Number.isInteger(r.severity) && r.severity >= 0);
    assert.ok(Array.isArray(r.severityCrimes));
    assert.equal(r.severityReason, r.severityCrimes[0] || "");
  });
});

test("7-day window matches the app's 7d filter (UTC midnight of `when` >= now - 7 days)", () => {
  const now = Date.parse("2026-10-09T15:56:00Z");
  assert.ok(inWindow({ when: "9 Oct 2026" }, now));
  assert.ok(inWindow({ when: "3 Oct 2026" }, now));
  assert.ok(!inWindow({ when: "2 Oct 2026" }, now));
  assert.ok(!inWindow({ when: "23 Jun 2026" }, now));
  assert.ok(!inWindow({ when: "" }, now));
});

test("highlights: approved, last 7 days, severity > 0, severity desc then newest, top 25", () => {
  const now = Date.parse("2026-10-09T15:56:00Z");
  const rows = withSeverityAll([
    conv("convicted of DUI.", { name: "Dui Newest", id: "d", when: "9 Oct 2026" }),
    conv("convicted of murder.", { name: "Murder Old", id: "m1", when: "4 Oct 2026" }),
    conv("convicted of murder.", { name: "Murder New", id: "m2", when: "8 Oct 2026" }),
    conv("convicted of murder and rape.", { name: "Murder Rape", id: "mr", when: "5 Oct 2026" }),
    chg("charged with murder.", { name: "Murder Charged", id: "mc", when: "9 Oct 2026" }),
    conv("convicted of murder.", { name: "Too Old", id: "old", when: "1 Oct 2026" }),
    conv("convicted of murder.", { name: "Pending", id: "p", when: "9 Oct 2026", status: "pending" }),
    conv("illegal reentry.", { name: "Reentry", id: "r", when: "9 Oct 2026" }),
    conv("traveled into Canada.", { name: "Nothing", id: "n", when: "9 Oct 2026" }),
  ]);
  const hl = buildHighlights(rows, { now });
  assert.deepEqual(hl.rows.map((r) => r.id), ["mr", "m2", "m1", "mc", "d", "r"]);
  assert.equal(hl.rows[0].severity, P.murder + P.rape);
  assert.equal(hl.rows[0].severityReason, L.murder);
  assert.deepEqual(Object.keys(hl.rows[0]), ["id", "name", "when", "severity", "severityReason", "severityCrimes"]);
  assert.equal(hl.windowDays, 7);
  assert.equal(hl.asOf, "2026-10-09");
  const many = withSeverityAll(Array.from({ length: 40 }, (_, i) => conv("convicted of murder.", { name: `P${i}`, id: `p${i}` })));
  assert.equal(buildHighlights(many, { now }).rows.length, 25);
  assert.equal(buildHighlights(many, { now }).total, 40);
});

test("writeSeverityFiles writes both files and is idempotent", () => {
  const dir = mkdtempSync(join(tmpdir(), "sev-"));
  const h = join(dir, "harvest.json");
  const hl = join(dir, "highlights.json");
  writeFileSync(h, JSON.stringify([conv("convicted of murder.", { id: "a", when: "8 Oct 2026" })]));
  const now = Date.parse("2026-10-09T15:56:00Z");
  writeSeverityFiles(h, hl, now);
  const once = readFileSync(h, "utf8");
  writeSeverityFiles(h, hl, now);
  assert.equal(readFileSync(h, "utf8"), once);
  assert.equal(JSON.parse(once)[0].severity, 95);
  assert.equal(JSON.parse(readFileSync(hl, "utf8")).rows[0].id, "a");
});

test("'As posted' rows (criminal history includes ...) use the 90% non-conviction weight", async () => {
  const { scoreRow, stageOf, TABLE } = await import("./severity.mjs");
  const row = { crime: "As posted: Mohammed Al Nassar, an illegal alien from Iraq, whose criminal history includes burglary.", text: "", usa: "" };
  assert.equal(stageOf(row), "notConvicted");
  assert.equal(TABLE.stage.notConvicted, 0.9);
  assert.equal(scoreRow(row).severity, Math.round(TABLE.crimes.theft.points * 0.9));
});

test("NY sex-offense wording: 'less than N years', 'course of sexual conduct', 'intercourse ... without consent'", () => {
  const s = (crime) => scoreRow({ crime, text: "", usa: "" });
  // child under 13 / less than 11: child sex crime (counted once, not also as rape)
  assert.deepEqual(s("Convicted: Germis Arquimides Santos Santos, an illegal alien from El Salvador, convicted of attempted course of sexual conduct in the second degree: actor over 17, two or more acts on a child under 13.").severityCrimes, ["Child sex crime"]);
  assert.deepEqual(s("Convicted: Angel Agusto De Leon, an illegal alien from Belize, was convicted of act in manner injure child less than 17 and sexual abuse 1st: sexual contact with individual less than 11 years old.").severityCrimes, ["Child sex crime"]);
  assert.deepEqual(s("Convicted: Wilson Omar Santos Paz, an illegal alien from Honduras, has convictions for indecent assault on a person less than 13 years of age, unlawful contact with a minor sexual offenses, as well as felony illegal reentry.").severityCrimes, ["Child sex crime", "Illegal entry / reentry"]);
  // non-consensual intercourse = rape / sexual assault
  const r = s("Convicted: Jefferson Avimael Mendoza-Sifuentes, an illegal alien from Guatemala, was convicted of sexual misconduct - having intercourse with another without consent.");
  assert.deepEqual(r.severityCrimes, ["Rape / sexual assault"]);
  assert.equal(r.severity, TABLE.crimes.rape.points);
  // "less than N" without years is not a child (e.g. amounts)
  assert.deepEqual(s("Convicted: X Y was convicted of theft of less than 5 grams of gold.").severityCrimes, ["Burglary / theft"]);
});
