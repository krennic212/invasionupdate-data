// Multi-defendant DOJ voting roundups: every named non-citizen defendant is found (Krennic 2026-10-20). The OPA
// roundups lead each case with the nationality ("Pakistani national Jamil Ahmad, 50, ..."), which no pattern read, so
// the Oct 5, 2026 roundup gave 0 of 16 and Oct 12 gave 1. Guards are unchanged: each hit still needs its own status words.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extractPeople, htmlBlocks, decode, toRow } from "./parse.mjs";
import { holdReasons } from "./guards.mjs";
import { isShortFormOf, nameKey } from "./rules.mjs";

const fx = JSON.parse(readFileSync(new URL("./fixtures/opa-voting-roundups-2026.json", import.meta.url), "utf8"));
const rel = (k) => fx.find((r) => r.url.includes(k));
const people = (r) => extractPeople(htmlBlocks(r.body), { title: decode(r.title) });

test("Oct 5, 2026 OPA roundup (16 aliens): all 16, each with its own country", () => {
  const hits = people(rel("involving-16-aliens-election-crimes"));
  assert.equal(hits.length, 16);
  const by = Object.fromEntries(hits.map((h) => [h.name, h]));
  assert.equal(by["Andrea Catanese"].origin, "Italy");
  assert.equal(by["Pedro Pablo Ruiz"].origin, "Cuba");
  assert.equal(by["Paul Kras"].origin, "Germany");
  for (const h of hits) assert.match(h.sentence, new RegExp(h.name), h.name);
});

test("Oct 12, 2026 OPA roundup: every defendant whose status is stated; never the naturalized citizen", () => {
  const names = people(rel("involving-16-individuals-election-crimes")).map((h) => h.name);
  for (const n of ["Hacina Saadi", "Jamil Ahmad", "Nighat Jamil", "Paulo Silva", "Silvia Delgado Phelps", "Staciann Pollion Davis", "Stanley Walton", "Cary Ann Patterson", "Arshed Zuberi", "Eliza M. Moss", "Dawid Nalepa", "Sandra Madeline Watson"]) assert.ok(names.includes(n), n);
  assert.ok(!names.includes("Lizabeth Almonte Rosa"), "a naturalized U.S. citizen is not on this feed");
  assert.ok(!names.includes("Patrick Perea"), "no status stated");
});

test("Sept 18, 2026 OPA roundup: all 16 incl. Arellano-Alba (U+2011 hyphen) and 'Nigerian national, Helen Sayen Adams, 67,'", () => {
  const names = people(rel("16-individuals-illegal-voting")).map((h) => h.name);
  assert.equal(names.length, 16);
  for (const n of ["Moises Anwar Arellano-Alba", "Helen Sayen Adams", "Celestin Katubadi", "Monica Carzoli", "Julieta Englestad"]) assert.ok(names.includes(n), n);
});

test("the nationality-lead pattern needs sentence start + age; guards still run on each hit", () => {
  assert.deepEqual(people({ title: "x", body: "<p>The Mexican national Consulate said Juan Perez was present.</p>" }).map((h) => h.name), []);
  const r = rel("involving-16-aliens-election-crimes");
  for (const h of people(r)) {
    const row = toRow(h, { office: "TheJusticeDept", url: r.url, date: "2026-10-05", title: decode(r.title) });
    const label = row.crime.slice(0, row.crime.indexOf(":"));
    assert.deepEqual(holdReasons({ name: h.name, sentence: h.sentence, title: decode(r.title), releaseText: "", label }).filter((x) => !/citizen/.test(x)), [], h.name);
  }
});

test("a roundup's short form of a listed name is the same person", () => {
  assert.ok(isShortFormOf(nameKey("Avila Gomez"), nameKey("Fredy Avila Gomez")));
  assert.ok(isShortFormOf(nameKey("Monica Carzoli"), nameKey("Monica Ivette Carzoli Carillo")));
  assert.ok(isShortFormOf(nameKey("Paulo Silva"), nameKey("Paulo Jorge Silva")));
  assert.ok(!isShortFormOf(nameKey("Gomez"), nameKey("Fredy Avila Gomez")));
  assert.ok(!isShortFormOf(nameKey("Maria Gomez"), nameKey("Fredy Avila Gomez")));
});
