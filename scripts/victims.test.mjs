import test from "node:test";
import assert from "node:assert/strict";
import { scrubText, scrubVictimNames, victimNamesIn } from "./victims.mjs";
import { dedupeRows } from "./dedupe.mjs";
import { rowsForPost, normalizePosts } from "./x-scan.mjs";

const bou = {
  name: "Bou Khathavong",
  crime: "Removed. role in the 1994 murder of Philadelphia high school student Eddie Polec. Illegal alien from Laos.",
  usa: "Removed. role in the 1994 murder of Philadelphia high school student Eddie Polec",
  text: "Sept. 2: ICE Philadelphia removed Bou Khathavong to Laos after years of legal proceedings. He was arrested Nov. 11, 1994, for his role in the murder of 16-year-old Eddie Polec.",
};

test("Bou Khathavong: Eddie Polec is replaced, the defendant is kept", () => {
  const { row, names } = scrubVictimNames(bou);
  assert.deepEqual(names, ["Eddie Polec"]);
  assert.equal(row.text, "Sept. 2: ICE Philadelphia removed Bou Khathavong to Laos after years of legal proceedings. He was arrested Nov. 11, 1994, for his role in the murder of a 16-year-old victim.");
  assert.equal(row.crime, "Removed. role in the 1994 murder of the victim. Illegal alien from Laos.");
  assert.equal(row.usa, "Removed. role in the 1994 murder of the victim");
  assert.equal(row.name, "Bou Khathavong");
  for (const f of ["crime", "usa", "text"]) assert.ok(!/Polec|Eddie/.test(row[f]));
  assert.deepEqual(victimNamesIn(row), []);
});

test("crime-of patterns with age, descriptor, hyphenated and three-part names", () => {
  assert.equal(scrubText("pending first-degree murder of girlfriend Lesbia Mileth Ramirez-Guerra.").text, "pending first-degree murder of the victim.");
  assert.equal(scrubText("vehicular homicide in the death of Minnesota mom Victoria Eileen Harwell.").text, "vehicular homicide in the death of the victim.");
  assert.equal(scrubText("convicted of the rape of a 12-year-old Jane Roe in 2019").text, "convicted of the rape of a 12-year-old victim in 2019");
  assert.equal(scrubText("the killing of John Dorsey, a husband and father. Dorsey was 40.").text, "the killing of the victim, a husband and father. The victim was 40.");
  assert.equal(scrubText("the SilverLeaf shooting of Joseph Manfredi. He fatally shot Manfredi.").text, "the SilverLeaf shooting of the victim. He fatally shot the victim.");
});

test("victim, Name, / victim Name", () => {
  assert.equal(scrubText("The victim, Maria Lopez, was found in Houston.").text, "The victim was found in Houston.");
  assert.equal(scrubText("He shot victim Carlos Ruiz twice.").text, "He shot the victim twice.");
});

test("conservative: places, unnamed victims and the defendant are not touched", () => {
  for (const s of [
    "convicted of continuous sexual abuse of a child in Santa Clara, California.",
    "foreign fugitive wanted for rape of a child in Ecuador.",
    "assault of a federal officer in Los Angeles",
    "victim while under 14, unnamed",
    "victims in a 100 mph DUI crash on the 405 in Seal Beach",
    "murder of United States Border Patrol agents",
    "sexual assault of a victim less than 13 years old in Cook County, Illinois",
  ]) assert.equal(scrubText(s).text, s, s);
  const row = { name: "John Doe Smith", crime: "Charged: the murder of John Doe Smith's partner" };
  assert.equal(scrubVictimNames({ ...row, crime: "Charged: victim John Doe Smith" }).row.crime, "Charged: victim John Doe Smith");
});

test("shared normalize step (dedupe) scrubs every writer's rows", () => {
  const { rows } = dedupeRows([bou, { ...bou, name: "Other", sourceUrl: "https://x.com/ICEgov/status/1" }]);
  for (const r of rows) assert.ok(!/Eddie Polec/.test(JSON.stringify(r)));
});

test("X scan rows are scrubbed when written", () => {
  const post = {
    id: "2108000000000000099",
    username: "ICEgov",
    created_at: "2026-10-08T15:00:00.000Z",
    text: "ICE arrested Juan Carlos Perez, an illegal alien from Mexico charged with the murder of 19-year-old Ana Maria Soto.",
  };
  const [p] = normalizePosts([post]);
  const out = rowsForPost(p);
  assert.ok(out.length >= 1);
  for (const { row } of out) {
    assert.equal(row.name, "Juan Carlos Perez");
    assert.ok(!/Ana Maria Soto/.test(JSON.stringify(row)), JSON.stringify(row));
    assert.match(row.crime, /murder of a 19-year-old victim/);
  }
});
