import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { priorFor, priorFromRelease, applyPrior, PRIOR_KEYS } from "./prior-arrests.mjs";

const row = (name, text, extra = {}) => ({ id: `t-${name}`, name, text, crime: "", ...extra });
const arrests = (name, text, sib = []) => {
  const p = priorFor(row(name, text), sib);
  return [p.priorArrests, p.priorArrestsPlus];
};

// ---- real phrasings from saved releases -------------------------------------------------------------
test("stated total: 'with six arrests'", () => {
  assert.deepEqual(arrests("Antonio Camacho-Gutierrez", "Those arrested during the operation include the following: Antonio Camacho-Gutierrez, 53, a criminal illegal alien from Mexico with six arrests, including firearms-related, alcohol-related, battery and public disturbance allegations."), [6, false]);
});
test("floor: 'more than 30 prior arrests'", () => {
  assert.deepEqual(arrests("Abdul Jalloh", "In February, Abdul Jalloh, an illegal alien from Sierra Leone with more than 30 prior arrests, was charged with murder after fatally stabbing a man at a bus stop."), [30, true]);
});
test("'arrested FOUR TIMES for DUI' is a floor (count is for that offense)", () => {
  assert.deepEqual(arrests("Vicente Torres-Vasquez", "Torres-Vasquez had previously been arrested FOUR TIMES for driving under the influence, being convicted on three of the four counts."), [4, true]);
});
test("'THREE prior arrests for DUI, as well as arrests for ...' is a floor", () => {
  assert.deepEqual(arrests("Kevin Perez Pablo", "Kevin Perez Pablo His criminal history includes THREE prior arrests for driving under the influence, as well as arrests for TWO counts of child endangerment and driving without a license."), [3, true]);
});
test("'has a prior arrest for ...' is one", () => {
  assert.deepEqual(arrests("Luis Alfrando Digueros Quintanilla", "Digueros Quintanilla has a prior arrest for felony sexual assault of a child out of Dallas County."), [1, false]);
  assert.deepEqual(arrests("Jose Almendares Suazo", "Almendares Suazo has a prior conviction for assault causing bodily injury, as well as a prior arrest for assault involving family violence."), [1, false]);
});
test("'includes a prior arrest' is a floor of one", () => {
  assert.deepEqual(arrests("Delon Jaundoo", "His criminal history includes a prior arrest for third-degree assault."), [1, true]);
});
test("number words and digits: 'arrested twice', 'five prior arrests', '38 arrests'", () => {
  assert.deepEqual(arrests("Jon Doe", "Jon Doe, an illegal alien from Peru, has been arrested twice in Queens."), [2, false]);
  assert.deepEqual(arrests("Jon Doe", "Jon Doe, an illegal alien from Peru, has five prior arrests."), [5, false]);
  assert.deepEqual(arrests("Jon Doe", "Jon Doe, an illegal alien from Peru, racked up 38 arrests since 2025."), [38, false]);
  assert.deepEqual(arrests("Jon Doe", "Jon Doe was arrested by the NYPD 7 times this year."), [7, false]);
});
test("DHS Maldanado release (Nov 24): 5 + 2 occasions arrested, 7 releases kept apart", () => {
  const p = priorFromRelease(
    "Alex Alender Florentino-Maldanado, a violent criminal illegal alien from Honduras who has been charged in the brutal murder and sexual assault of a 62-year-old woman. He was previously released from jail seven times by New York sanctuary politicians. On five occasions in 2026, the NYPD arrested Florentino-Maldanado on a variety of charges and sanctuary politicians RELEASED him from jail despite ICE lodging a detainer for him all five times. Two more times in November 2026, the NYPD arrested Florentino-Maldanado and then released him before ICE could even lodge a detainer.",
    "Alex Alender Florentino-Maldanado",
  );
  assert.equal(p.priorArrests, 7);
  assert.equal(p.priorArrestsPlus, true);
  assert.equal(p.priorReleases, 7);
  assert.match(p.priorArrestsQuote, /five occasions in 2026/);
});
test("released N times: Fox / NY Post phrasing is priorReleases, never arrests", () => {
  const a = priorFor(row("Alexander Florentino-Maldonado", "Alexander Florentino-Maldonado, a Honduran national, was released from custody seven times in 2026."));
  assert.equal(a.priorReleases, 7);
  assert.equal(a.priorArrests, null);
  const b = priorFor(row("Jon Doe", "New York let him go seven times before the killing, Jon Doe."));
  assert.equal(b.priorReleases, 7);
  assert.equal(priorFor(row("Jon Doe", "Jon Doe, an illegal alien, was released seven times by the city.")).priorReleases, 7);
  assert.equal(priorFor(row("Jon Doe", "Jon Doe was released from jail twice.")).priorReleases, null); // "twice" only counts after released him/her
  assert.equal(priorFor(row("Jon Doe", "NYC released him twice.")).priorReleases, 2);
  assert.equal(priorFor(row("Jon Doe", "Officials let him go 7 times.")).priorReleases, 7);
});
test("removals and convictions as stated", () => {
  const p = priorFor(row("Ronaldo Barbosa Ortiz", "He has since been deported FOUR times, in 2014, 2016 and 2017. He has two prior convictions for illegal re-entry."));
  assert.equal(p.priorRemovals, 4);
  assert.equal(p.priorConvictions, 2);
  assert.equal(priorFor(row("Jose Cedillos Umana", "Jose Cedillos Umana, a twice-deported violent criminal alien")).priorRemovals, 2);
  assert.equal(priorFor(row("Gerardo Torres-Sanchez", "Torres-Sanchez has been deported 11 times and has five convictions for illegal re-entry.")).priorConvictions, 5);
});

// ---- never guess ----------------------------------------------------------------------------------
test("no number, no count (ambiguous wording stays null)", () => {
  for (const t of [
    "He has multiple DUI arrests.",
    "His criminal history includes arrests for assault and battery, and disorderly conduct.",
    "Ortiz is a registered sex offender and has previous arrests for DUI and lewd or lascivious acts with a child under 14.",
    "Criminal history includes an arrest for rape in Little Rock, Arkansas.",
    "Oscar Solorzano-Garcia, a criminal illegal alien from Honduras with a lengthy arrest record, was charged with attempted murder.",
    "He was previously arrested for manslaughter in Buffalo, New York.",
    "He has been arrested multiple times for drug trafficking.",
  ]) assert.equal(priorFor(row("Ortiz", t)).priorArrests, null, t);
});
test("operation totals and unrelated numbers are not prior arrests", () => {
  assert.equal(priorFor(row("Jose Santeliz-Cabrera", "Operation Lone Star Mission results in over 4,000 arrests, all with immigration violations, including Jose Santeliz-Cabrera, a criminal illegal alien from Honduras.")).priorArrests, null);
  assert.equal(priorFor(row("Jon Doe", "The operation led to 12 arrests, including Jon Doe, an illegal alien from Peru.")).priorArrests, null);
  assert.equal(priorFor(row("Jon Doe", "Jon Doe was convicted on three counts and sentenced to five years of supervised release.")).priorArrests, null);
  assert.equal(priorFor(row("Jon Doe", "Jon Doe has no prior arrests.")).priorArrests, null);
  assert.equal(priorFor(row("Jon Doe", "Jon Doe was released on bond in 2021 and again in 2023.")).priorReleases, null);
});
test("approximate counts ('nearly 40 arrests') are not guessed", () => {
  assert.equal(priorFor(row("Jon Doe", "Jon Doe, with nearly 40 arrests, was charged with murder.")).priorArrests, null);
});
test("'deported on October 27' and 'removed from the U.S. in 2012' are not counts", () => {
  const p = priorFor(row("Jon Doe", "Jon Doe was deported on October 27, 2026. He was ordered removed from the U.S. in 2012."));
  assert.equal(p.priorRemovals, null);
});

// ---- the count must belong to this person ----------------------------------------------------------
test("a release naming two people: the other person's count is not copied", () => {
  const text = "Ana Gomez, an illegal alien from Peru, was arrested Nov. 3. Luis Perez, an illegal alien from Chile with six arrests, was arrested the same day.";
  assert.equal(priorFor(row("Ana Gomez", text), ["Luis Perez"]).priorArrests, null);
  assert.equal(priorFor(row("Luis Perez", text), ["Ana Gomez"]).priorArrests, 6);
});
test("a sentence naming both people is skipped", () => {
  const text = "Ana Gomez and Luis Perez, illegal aliens with five arrests each, were arrested.";
  assert.equal(priorFor(row("Ana Gomez", text), ["Luis Perez"]).priorArrests, null);
});
test("whole release: a victim or an official with a count is never read as the person", () => {
  const rel = "Jon Doe, an illegal alien from Peru, was charged with robbery. The victim, who had 3 prior arrests, was treated at a hospital. The sheriff said he has 20 arrests this year. Doe is a registered offender.";
  assert.equal(priorFromRelease(rel, "Jon Doe").priorArrests, null);
  assert.equal(priorFromRelease("Jon Doe, an illegal alien from Peru, was charged. He has five prior arrests.", "Jon Doe").priorArrests, 5);
});

// ---- data only ---------------------------------------------------------------------------------------
test("applyPrior touches only the six prior fields, never overwrites, never adds or removes rows", () => {
  const rows = [
    { id: "a", name: "Jon Doe", status: "pending", holdReason: "x", text: "Jon Doe has five prior arrests.", crime: "Charged: robbery", tags: ["t"] },
    { id: "b", name: "Al Roe", status: "approved", text: "Al Roe has two prior arrests.", priorArrests: 9, priorArrestsPlus: true, priorArrestsQuote: "q", priorReleases: null, priorConvictions: null, priorRemovals: null },
  ];
  const before = JSON.parse(JSON.stringify(rows));
  applyPrior(rows);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].priorArrests, 5);
  assert.equal(rows[1].priorArrests, 9); // release-read value kept
  for (let i = 0; i < 2; i++) for (const k of Object.keys(before[i])) assert.deepEqual(rows[i][k], before[i][k] ?? rows[i][k]);
  for (const k of ["status", "holdReason", "crime", "tags", "text"]) assert.deepEqual(rows[0][k], before[0][k]);
  assert.equal(applyPrior(rows), 0); // idempotent
});

test("every live feed row carries the six fields; counts are whole numbers with a quote", () => {
  const rows = JSON.parse(readFileSync(new URL("../data/harvest.json", import.meta.url), "utf8"));
  for (const r of rows) {
    for (const k of PRIOR_KEYS) assert.ok(k in r, `${r.name}: ${k}`);
    if (r.priorArrests != null) { assert.ok(Number.isInteger(r.priorArrests) && r.priorArrests >= 1, r.name); assert.ok(r.priorArrestsQuote, r.name); }
    else assert.equal(r.priorArrestsQuote, null, r.name);
  }
});
