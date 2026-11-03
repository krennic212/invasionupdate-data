import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { htmlBlocks, extractPeople, releaseLabel, toRow, decode } from "./parse.mjs";
import { holdReasons, holdReasonsForRow, stageOk } from "./guards.mjs";
import { xOnlyRow, sameCaseAs, resolveXReview, pairCounts } from "./x-review.mjs";
import { pruneReviewOfLive } from "./rules.mjs";

// Krennic 2026-11-03: the three rule fixes from the Nov 2 missed-cases check (real release / row text in scripts/fixtures).
const fx = (f) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8"));
const pairs = fx("same-name-x-review-2026-11-02.json");
const byName = (n) => pairs.find((p) => p.official.name === n);

describe("an official row replaces a same-name X-only review row only when clearly the same person", () => {
  it("X-only means every source link is an x.com post", () => {
    assert.equal(xOnlyRow(byName("Jasveer Singh").x), true);
    assert.equal(xOnlyRow(byName("Jasveer Singh").official), false);
    assert.equal(xOnlyRow({ sourceUrl: "https://x.com/ICEgov/status/1 · https://www.ice.gov/news/releases/x" }), false);
  });
  it("Jasveer Singh (same 300-pound cocaine semi-truck case) and Jose Rodriguez-Gomez (same convictions) are the same person", () => {
    for (const n of ["Jasveer Singh", "Jose Rodriguez-Gomez"]) assert.equal(sameCaseAs(byName(n).official, byName(n).x).decision, "same", n);
  });
  it("Pedro Gutierrez: Guatemala (ICE Alabama, Nov 2026) vs Mexico (ERO Los Angeles, Apr 2025) is a different man", () => {
    assert.equal(sameCaseAs(byName("Pedro Gutierrez").official, byName("Pedro Gutierrez").x).decision, "different");
  });
  it("a common name with only common crime wording is never merged (unsure: keep both)", () => {
    const a = { name: "Jose Garcia", origin: "Mexico", sourceUrl: "https://www.ice.gov/news/releases/a", crime: "Arrested: Jose Garcia, a criminal illegal alien from Mexico convicted of possession of a controlled substance and assault." };
    const b = { name: "Jose Garcia", origin: "Mexico", sourceUrl: "https://x.com/ICEgov/status/123", crime: "Arrested: illegal alien from Mexico with convictions for possession of a controlled substance and assault." };
    assert.equal(sameCaseAs(a, b).decision, "unsure");
    assert.equal(sameCaseAs({ ...a, origin: "" }, b).decision, "unsure");
  });
  it("an X row that links the official release is the same case", () => {
    const off = byName("Pedro Gutierrez").official;
    assert.equal(sameCaseAs(off, { ...byName("Pedro Gutierrez").x, origin: "Guatemala", text: `See ${off.sourceUrl}` }).decision, "same");
  });
  it("resolveXReview drops the clear matches, keeps and flags the rest; prune keeps the flagged row", () => {
    const review = pairs.map((p) => p.x);
    const official = pairs.map((p) => ({ ...p.official, status: "approved" }));
    const res = resolveXReview(official, review, official);
    assert.deepEqual(res.replaced.map((r) => r.name).sort(), ["Jasveer Singh", "Jose Rodriguez-Gomez"]);
    assert.deepEqual(res.keptBoth.map((r) => r.name), ["Pedro Gutierrez"]);
    assert.deepEqual(res.review.map((r) => r.name), ["Pedro Gutierrez"]);
    assert.equal(res.review[0].sameNameAs[0].id, "ice-20261102-pedro-gutierrez");
    const pruned = pruneReviewOfLive(official, res.review);
    assert.equal(pruned.review.length, 1);
    assert.equal(pruned.removed.length, 0);
    assert.ok(pairCounts(official).size > 0);
  });
});

describe("D. Or. list entries: 'Name — Arrested <date>. Convicted in <year> of ... Citizen of <Country>.'", () => {
  const r = fx("dor-2026-10-30-14-violent-criminal-illegal-aliens.json");
  const blocks = htmlBlocks(r.body);
  const hits = extractPeople(blocks, { title: decode(r.title) });
  const rel = { office: "TheJusticeDept", url: r.url, date: r.date, title: decode(r.title), blocks };
  it("every entry with its own 'Citizen of' gives a row; the entry without one (Joya-Santana) gives none", () => {
    assert.equal(hits.length, 13);
    assert.ok(!hits.some((h) => /Joya/.test(h.name)));
    assert.ok(hits.some((h) => h.name === "Jose Rodriguez-Gomez" && h.origin === "Mexico"));
  });
  it("label is the entry's own lead verb (Arrested), never the record's Convicted; guards pass", () => {
    for (const h of hits) {
      const row = toRow(h, rel);
      assert.match(row.crime, /^Arrested: /, h.name);
      assert.deepEqual(holdReasons({ name: h.name, sentence: h.sentence, title: rel.title, releaseText: blocks.join(" "), label: "Arrested" }), [], h.name);
    }
  });
  it("a ';' record clause no longer hides the entry's closing 'Citizen of Mexico.' (Carbajal Sierra)", () => {
    const row = { name: "Rosalio Carbajal Sierra", crime: "Arrested: Rosalio Carbajal Sierra — Arrested Sept. 9, 2026. Convicted in 1996 of third-degree sexual abuse; convicted again in 2018 of first-degree sexual abuse. Citizen of Mexico.", usa: "", text: "" };
    assert.deepEqual(holdReasonsForRow(row), []);
    assert.deepEqual(holdReasonsForRow({ ...row, crime: row.crime.replace("Citizen of Mexico.", "Citizen of the United States. He is a U.S. citizen.") }).filter((x) => /non-citizen/.test(x)), ["not stated to be a non-citizen"]);
  });
});

describe("'jury found <Name> guilty' is a conviction", () => {
  const s = htmlBlocks(fx("mdfl-2026-10-30-holly-jury-verdict.json").body)[0];
  it("MDFL Oct 30, 2026 Holly: Convicted, and the stage guard accepts it", () => {
    assert.equal(releaseLabel(s, ""), "Convicted");
    assert.equal(stageOk("Convicted", s, ""), true);
  });
  it("'not guilty' and no jury / court subject never count", () => {
    assert.notEqual(releaseLabel("A federal jury found John Doe, a Mexican national, not guilty of voting by an alien.", ""), "Convicted");
    assert.equal(stageOk("Convicted", "Prosecutors found John Doe, a Mexican national, guilty of nothing yet; he was charged.", ""), false);
  });
});

describe("one-word names only in a clearly structured list entry", () => {
  const r = fx("opa-2026-11-02-63-individuals-election.json");
  const blocks = htmlBlocks(r.body);
  it("OPA Nov 2, 2026: 'Indonesian national Widarto, 56, a lawful permanent resident, has been charged ...' -> Widarto", () => {
    const h = extractPeople(blocks, { title: decode(r.title) }).find((x) => x.name === "Widarto");
    assert.ok(h && h.mononym);
    assert.match(h.sentence, /Widarto allegedly voted/);
    assert.deepEqual(holdReasons({ name: h.name, sentence: h.sentence, title: decode(r.title), releaseText: blocks.join(" "), label: "Charged", mononym: true }), []);
  });
  it("a lone entry, or no repeat of the name in the next sentence, gives no one-word name; the guard still holds unflagged single words", () => {
    assert.deepEqual(extractPeople(["Indonesian national Widarto, 56, a lawful permanent resident, has been charged with voting by an alien. Widarto allegedly voted in 2024."]).map((h) => h.name), []);
    const list = blocks.filter((b) => /national [A-Z][\w-]+(?: [A-Z][\w-]+)+, \d+,/.test(b)).slice(0, 4);
    assert.ok(!extractPeople([...list, "Indonesian national Widarto, 56, a lawful permanent resident, has been charged with voting by an alien. He allegedly voted."]).some((h) => h.name === "Widarto"));
    assert.ok(holdReasons({ name: "Widarto", sentence: "Widarto, an alien, was charged.", label: "Charged" }).some((x) => /single word/.test(x)));
  });
});
