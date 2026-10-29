// 2026-10-29 (Krennic approved): OPA "Justice Department Charges 18 More in North Carolina with Illegally Voting in 2024
// Election" (DOJ API; real text in fixtures/opa-2026-10-29-nc-18-illegal-voting.json, plus the usao-wdnc copy). The harvester
// found 8 of 18: the 9 EDNC names say "a native of <Country>[, citizen of <Country>,] and (a) lawful permanent resident"
// (rule I), Carter is "a native of Barbados and a lawful permanent resident", Dupont is "Dupont, 57,a French national"
// (OPA) / "Dupont,57, a French national" (usao-wdnc), and Agah / Stanley ("residing in Charlotte", no state) were held as
// "voting row with no city" because the OPA URL has no usao- district (now: the "Western District of North Carolina"
// heading they are listed under). Stanley's origin was cut to "St. Kitts".
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { htmlBlocks, extractPeople, toRow, placeFromDistrict } from "./parse.mjs";
import { holdReasons } from "./guards.mjs";

const load = (f) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8"));
const opa = load("opa-2026-10-29-nc-18-illegal-voting.json");
const wdnc = load("wdnc-2026-10-29-nc-18-illegal-voting.json");
const relOf = (r) => ({ office: "TheJusticeDept", url: r.url, date: "2026-10-29", title: r.title, blocks: htmlBlocks(r.body) });

const EXPECT = {
  "Selvin Porfidio Gonzalez Escobar": ["Guatemala", "Robeson County, NC"],
  "Amerigo Di Nolfi": ["United Kingdom", "New Hanover County, NC"],
  "Elizabeth Margaret Crudup": ["Kenya", "Harnett County, NC"],
  "Gregory Eugene Wade": ["Bermuda", "Wake County, NC"],
  "Jacqueline Yvonne Papandreou Brown": ["United Kingdom", "Duplin County, NC"],
  "Karl Anthony Wilkins": ["Jamaica", "Wake County, NC"],
  "Patricia Elena Valencia Cardona": ["Colombia", "Harnett County, NC"],
  "Richard John Reid": ["United Kingdom", "New Hanover County, NC"],
  "Taso Gretes": ["Canada", "New Hanover County, NC"],
  "Adrianus Marinus Van Der Staak": ["Netherlands", "Seagrove, NC"],
  "Saida Adali Hirachete Olivarez": ["Mexico", "Reidsville, NC"],
  "Juan Florencio Ramos": ["Cuba", "Salisbury, NC"],
  "Phillip Alexander Carter": ["Barbados", "Winston-Salem, NC"],
  "Yamila Avalos": ["Argentina", "Concord, NC"],
  "Michael Agah": ["Nigeria", "Charlotte, NC"],
  "Luis Alberto DeJesus": ["Dominican Republic", "Conover, NC"],
  "Serge Christian Dupont": ["France", "Charlotte, NC"],
  "Edread Ray Stanley": ["St. Kitts and Nevis", "Charlotte, NC"],
};

test("OPA NC roundup: all 18 defendants, and only them (no quoted official)", () => {
  const rel = relOf(opa);
  const hits = extractPeople(rel.blocks, { title: rel.title });
  assert.deepEqual(hits.map((h) => h.name).sort(), Object.keys(EXPECT).sort());
  for (const n of ["McCotter", "Boyle", "Bishop", "Ferguson", "Davis", "Zito"]) assert.ok(!hits.some((h) => h.name.includes(n)), n);
});

test("OPA NC roundup: Charged voting rows, origin + place as the release states, every guard passes", () => {
  const rel = relOf(opa);
  for (const hit of extractPeople(rel.blocks, { title: rel.title })) {
    const row = toRow(hit, rel);
    assert.deepEqual([row.origin, row.city], EXPECT[hit.name], hit.name);
    assert.equal(row.voting, true, hit.name);
    assert.match(row.crime, /^Charged: /, hit.name);
    assert.ok(row.crime.includes(hit.name), hit.name);
    assert.ok(rel.blocks.join(" ").replace(/\s+/g, " ").includes(hit.sentence.split(" ").slice(0, 12).join(" ")), `${hit.name} verbatim`);
    assert.equal(row.photo, "");
    assert.ok(row.lat != null || row.city === "Duplin County, NC", hit.name); // Duplin is geocoded by geo.mjs
    const label = row.crime.slice(0, row.crime.indexOf(":"));
    assert.deepEqual(holdReasons({ name: hit.name, sentence: hit.sentence, title: rel.title, releaseText: rel.blocks.join(" "), label }), [], hit.name);
  }
});

test("rule I: where the next sentence says they voted wins over where they live now", () => {
  const rel = relOf(opa);
  const hits = extractPeople(rel.blocks, { title: rel.title });
  const di = hits.find((h) => h.name === "Amerigo Di Nolfi");
  assert.ok(di.sentence.endsWith("voted in the 2024 general election in New Hanover County, North Carolina."));
  assert.ok(di.sentence.includes("now residing in Hampden County, Massachusetts"));
  const wil = hits.find((h) => h.name === "Karl Anthony Wilkins");
  assert.equal(wil.city, "Wake County, NC");
});

test("usao-wdnc copy: 'Dupont,57,' spacing still names Dupont", () => {
  const rel = relOf(wdnc);
  const names = extractPeople(rel.blocks, { title: rel.title }).map((h) => h.name);
  for (const n of ["Michael Agah", "Luis Alberto DeJesus", "Serge Christian Dupont", "Edread Ray Stanley"]) assert.ok(names.includes(n), n);
});

test("rule I needs the permanent-resident words: 'a native of X and a resident of Y' is not a hit", () => {
  const s = "Jane Q Example, 40, a native of Canada and a resident of Wake County, North Carolina, is charged with one count of voting.";
  assert.deepEqual(extractPeople([s]).map((h) => h.name), []);
});

test("section heading state is used only under a District heading, never as a city of its own", () => {
  assert.equal(placeFromDistrict("Jane Example, residing in Charlotte, is charged.", "https://www.justice.gov/opa/pr/x", "NC"), "Charlotte, NC");
  assert.equal(placeFromDistrict("Jane Example, residing in Charlotte, is charged.", "https://www.justice.gov/opa/pr/x"), "");
  const blocks = ["A list of people who are not under a heading at all in this release text.", "Michael Example, 74, a Nigerian national and lawful permanent resident residing in Charlotte, is charged with voting by an alien."];
  const [h] = extractPeople(blocks);
  assert.equal(h.sectionState, undefined);
});
