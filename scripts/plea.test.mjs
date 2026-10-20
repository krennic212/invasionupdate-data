// 2026-10-20 (10:09 AM CDT) Krennic: a guilty plea is "Pleaded guilty", not "Convicted". Never an upgrade.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extractPeople, toRow, statusFrom, releaseLabel } from "./parse.mjs";
import { stageOk, holdReasonsForRow } from "./guards.mjs";
import { stageOf } from "./severity.mjs";

const AHMAD = "PHILADELPHIA – United States Attorney David Metcalf announced that Jamil Ahmad, 50, of Philadelphia, Pennsylvania, entered a plea of guilty today before U.S. Magistrate Judge Craig M. Straw to one count of voting by an alien. At the time of that election, Ahmad was a citizen of Pakistan and a lawful permanent resident of the United States.";

test("guilty-plea release -> Pleaded guilty", () => {
  const [h] = extractPeople([AHMAD]);
  const row = toRow(h, { office: "TheJusticeDept", url: "https://www.justice.gov/usao-edpa/pr/philadelphia-man-pleads-guilty-illegally-voting-alien-2024-election", date: "2026-10-14", title: "Philadelphia Man Pleads Guilty to Illegally Voting as an Alien in 2024 Election" });
  assert.match(row.crime, /^Pleaded guilty: /);
  assert.deepEqual(holdReasonsForRow({ ...row, status: "approved" }), []);
});

test("plea wording variants", () => {
  for (const s of ["Jane Roe, a Mexican national, pleaded guilty to illegal reentry.", "Jane Roe, a Mexican national, pled guilty to illegal reentry.", "Jane Roe, a citizen of Honduras, entered a guilty plea to wire fraud."]) {
    assert.equal(statusFrom(s, ""), "Pleaded guilty", s);
  }
});

test("sentenced / convicted / found guilty stay Convicted, even with a plea", () => {
  assert.equal(statusFrom("Jane Roe, a Mexican national, pleaded guilty in May and was sentenced today to 4 years.", ""), "Convicted");
  assert.equal(statusFrom("Jane Roe, a Mexican national, was found guilty by a jury.", ""), "Convicted");
  assert.equal(statusFrom("Jane Roe, a Mexican national, was convicted of fraud.", ""), "Convicted");
});

test("a future plea is not a stage (never upgrades Charged)", () => {
  assert.equal(releaseLabel("Jane Roe, a Mexican national, was charged by information and is expected to plead guilty.", "Woman charged"), "Charged");
  assert.equal(statusFrom("Jane Roe, a Mexican national, was charged and will enter a guilty plea next month.", ""), "Charged");
});

test("guard: Pleaded guilty needs plea / conviction wording", () => {
  assert.equal(stageOk("Pleaded guilty", "Jane Roe, a Mexican national, was charged with illegal reentry.", "Woman charged"), false);
  assert.equal(stageOk("Pleaded guilty", "Jane Roe, a Mexican national, pleaded guilty to illegal reentry.", ""), true);
});

test("severity still scores a guilty plea at the conviction stage (unchanged)", () => {
  assert.equal(stageOf({ crime: "Pleaded guilty: Jane Roe pleaded guilty." }), "convicted");
});

// Checked against each release / official post on 2026-10-20: plea only, no sentence yet.
const RELABELED = ["doj-20261014-jamil-ahmad", "doj-20261019-gaye-tyndale-simpson", "doj-20261015-celstino-patishtan", "x-2110095656564244908-fredy-rolando-rivera-gonzalez", "x-2108301525097550278-juan-carlos-paxtor-chay", "x-2107516840700195194-binghui-liu", "doj-20261008-oleg-korniev"];
// Release says sentenced / convicted, so these stay Convicted.
const STAY = ["dhs-20260623-felix-jeronimo-rojas", "doj-20261019-yoirlan-tome-rojas", "x-2110862085991117154-javier-marrero-pando"];

test("live feed: plea-only rows read Pleaded guilty; sentenced rows stay Convicted", () => {
  const feed = JSON.parse(readFileSync(new URL("../data/harvest.json", import.meta.url), "utf8"));
  const byId = new Map(feed.map((r) => [r.id, r]));
  for (const id of RELABELED) assert.match(byId.get(id).crime, /^Pleaded guilty: /, id);
  for (const id of STAY) assert.match(byId.get(id).crime, /^Convicted: /, id);
  assert.match(feed.find((r) => r.name === "Lara Gonzalez").crime, /^Convicted: /, "Lara Gonzalez: pleaded guilty and was sentenced");
  // A row Krennic approved by id over a stage hold carries the release wording in approvalNote (Samuel James Hall: "also
  // entered a plea in May ... admitted to illegally voting"); the guard itself is unchanged and still holds it on intake.
  for (const r of feed.filter((r) => /^Pleaded guilty: /.test(r.crime) && !/guard held "stage:/.test(r.approvalNote || ""))) assert.deepEqual(holdReasonsForRow(r).filter((x) => x.startsWith("stage")), [], r.name);
});

test("Samuel James Hall: stage hold stays on intake; approved by id with the release's plea wording", () => {
  const feed = JSON.parse(readFileSync(new URL("../data/harvest.json", import.meta.url), "utf8"));
  const r = feed.find((x) => x.id === "doj-20260730-samuel-james-hall");
  assert.ok(r && r.status === "approved");
  assert.match(r.crime, /^Pleaded guilty: .*entered a plea/);
  assert.ok(holdReasonsForRow(r).some((x) => x.startsWith("stage")));
  assert.match(r.approvalNote, /admitted to illegally voting/);
});
