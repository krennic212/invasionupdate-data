// 2026-10-28 (Krennic approved): USAO-NV "Two Aliens From Sudan and Afghanistan Charged for Illegal Voting" named nobody to
// the parser: each defendant is "<Name>, from <Country> and a lawful permanent resident, voted ..." and the charge is a
// later sentence ("Yousif and Safi are each charged with one count of voting by an alien."). Real release text (DOJ API).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { htmlBlocks, extractPeople, toRow } from "./parse.mjs";
import { holdReasons } from "./guards.mjs";

const rel0 = JSON.parse(readFileSync(new URL("./fixtures/usao-nv-2026-10-28-two-aliens-illegal-voting.json", import.meta.url), "utf8"));
const blocks = htmlBlocks(rel0.body);
const rel = { office: "TheJusticeDept", url: rel0.url, date: "2026-10-28", title: rel0.title, blocks };

test("USAO-NV: both named defendants, and only them (no quoted official)", () => {
  const hits = extractPeople(blocks, { title: rel.title });
  assert.deepEqual(hits.map((h) => h.name), ["Moneir Elzobier Ali Yousif", "Khalida Safi"]);
  assert.deepEqual(hits.map((h) => h.origin), ["Sudan", "Afghanistan"]);
  for (const n of ["Sigal Chattah", "Erin Burke", "Christopher S. Delzotto"]) assert.ok(!hits.some((h) => h.name.includes(n.split(" ").pop())), n);
});

test("USAO-NV: rows are Charged voting rows with the release's own sentences, guards pass", () => {
  for (const hit of extractPeople(blocks, { title: rel.title })) {
    const row = toRow(hit, rel);
    assert.equal(row.voting, true, hit.name);
    assert.match(row.crime, /^Charged: /);
    assert.ok(row.crime.includes("a lawful permanent resident, voted in an election"), hit.name);
    assert.ok(row.crime.endsWith("Yousif and Safi are each charged with one count of voting by an alien."), hit.name);
    assert.equal(row.city, "Nevada");
    assert.equal(row.photo, "");
    const label = row.crime.slice(0, row.crime.indexOf(":"));
    assert.deepEqual(holdReasons({ name: hit.name, sentence: hit.sentence, title: rel.title, releaseText: blocks.join(" "), label }), [], hit.name);
  }
});

test("from-status wording needs non-citizen words: a plain 'from <Country> and' resident is not a hit", () => {
  const s = "According to the criminal information, on or about October 29, 2024, Jane Q Example, from Canada and a resident of Reno, voted in an election. Example is charged with one count of voting.";
  assert.deepEqual(extractPeople([s]).map((h) => h.name), []);
});

test("from-status wording: an illegal alien variant is still caught", () => {
  const s = "On or about November 5, 2024, Juan Example Perez, from Mexico and an illegal alien, voted in an election in Nevada. Perez is charged with one count of voting by an alien.";
  const [h] = extractPeople([s]);
  assert.equal(h?.name, "Juan Example Perez");
  assert.equal(h.origin, "Mexico");
});

test("a defendant who shares a quoted official's surname is still a defendant (Desjon Antione Lang Burke style)", () => {
  const b = [
    "On or about November 5, 2024, Desjon Antione Lang Burke, from Jamaica and a lawful permanent resident, voted in an election. Burke is charged with one count of voting by an alien.",
    "“We will hold voters accountable,” said Erin Burke, Special Agent in Charge for HSI Los Angeles.",
  ];
  assert.deepEqual(extractPeople(b).map((h) => h.name), ["Desjon Antione Lang Burke"]);
});
