import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { htmlBlocks, extractPeople, toRow, rowLabel } from "./parse.mjs";
import { nonCitizenStated, holdReasonsForRow } from "./guards.mjs";

// Krennic 2026-11-02: the two gaps held back on Oct 31 (real release text in scripts/fixtures).
const cuban = JSON.parse(readFileSync(new URL("./fixtures/mdfl-2026-10-29-cuban-smuggling-asylum-sentencing.json", import.meta.url), "utf8"));

describe("smuggling / conspiracy wording is never the person's own status", () => {
  it("MDFL Oct 29, 2026: 'conspired with others to operate an alien smuggling organization' and 'the travel of aliens' give no hit", () => {
    const names = extractPeople(htmlBlocks(cuban.body), { title: cuban.title }).map((h) => h.name);
    for (const n of ["Emanuel Martinez Gonzalez", "Marianny Lucia Lopez-Torres", "Miguel Martinez Vasconcelos", "Walbis Pozo-Dutel"]) assert.ok(!names.includes(n), n);
  });
  it("real status wording still gives a hit", () => {
    assert.deepEqual(extractPeople(["Juan Perez, 30, an illegal alien from Mexico, was charged with alien smuggling."]).map((h) => h.name), ["Juan Perez"]);
    assert.deepEqual(extractPeople(["ICE removed John Doe, 40, a previously deported criminal alien from Honduras."]).map((h) => h.name), ["John Doe"]);
    assert.deepEqual(extractPeople(["Maria Ruiz, 41, conspired to smuggle aliens into Texas."]).map((h) => h.name), []);
  });
  it("guard: object-of-smuggling 'aliens' is not stated status; the person's own 'alien' still is", () => {
    for (const s of ["Vega-Perez previously pleaded guilty to conspiracy to smuggle aliens for financial gain.", "He helped run an alien smuggling organization.", "She arranged the travel of aliens upon their arrival.", "The ASO encouraged or induced thousands of Cuban aliens to enter the U.S.", "He was paid to transport aliens from the border."]) assert.equal(nonCitizenStated(s), false, s);
    for (const s of ["Juan Perez, an illegal alien from Mexico, was charged with alien smuggling.", "Doe, an alien previously removed, transported aliens.", "Roe is a Mexican national who smuggled aliens."]) assert.equal(nonCitizenStated(s), true, s);
  });
  it("Martinez Gonzalez / Vega-Perez stay approved: guards only gate new rows, and their status is the 2025 release (statusSourceUrl)", () => {
    const feed = JSON.parse(readFileSync(new URL("../data/harvest.json", import.meta.url), "utf8"));
    for (const id of ["doj-20261029-emanuel-martinez-gonzalez", "doj-20261029-liannys-yaiselys-vega-perez"]) {
      const r = feed.find((x) => x.id === id);
      assert.equal(r.status, "approved", id);
      assert.match(r.text, /unlawfully residing in/);
      assert.match(r.statusSourceUrl, /twelve-people-charged/);
    }
  });
});

describe("co-defendants never take the headline's conviction stage", () => {
  const rel = (title, blocks) => ({ office: "TheJusticeDept", url: "https://www.justice.gov/usao-mdfl/pr/x", date: "2026-10-29", title, blocks });
  const multi = { name: "Jane Roe", sentence: "Doe worked with his codefendant, Jane Roe, a Cuban national, to arrange flights.", multi: true };
  const blocks = ["Twelve individuals were charged in a superseding indictment.", "John Doe was sentenced to two years in prison."];
  it("multi-person release, no stage word of her own: Charged, not the headline's Convicted", () => {
    assert.equal(rowLabel(multi, rel("Cuban Nationals Sentenced for Smuggling", blocks)), "Charged");
    assert.match(toRow(multi, rel("Cuban Nationals Sentenced for Smuggling", blocks)).crime, /^Charged: /);
    assert.equal(rowLabel(multi, rel("Cuban National Pleads Guilty to Smuggling", blocks)), "Charged");
    assert.equal(rowLabel(multi, rel("Two Convicted of Smuggling", blocks)), "Charged");
  });
  it("no charge or conviction wording anywhere: As posted (never higher)", () => {
    assert.equal(rowLabel(multi, rel("Cuban Nationals Sentenced", ["Doe and Roe ran a travel agency."])), "As posted");
  });
  it("own sentence wins; lower headline stages and single-person releases are unchanged", () => {
    assert.equal(rowLabel({ ...multi, sentence: "Jane Roe, a Cuban national, was sentenced to two years in prison." }, rel("Cuban Nationals Sentenced", blocks)), "Convicted");
    assert.equal(rowLabel({ ...multi, sentence: "Jane Roe, a Cuban national, was charged." }, rel("Cuban Nationals Sentenced", blocks)), "Charged");
    assert.equal(rowLabel(multi, rel("ICE Arrests Smuggling Ring", blocks)), "Arrested");
    assert.equal(rowLabel({ ...multi, multi: false }, rel("Cuban National Sentenced", blocks)), "Convicted");
  });
});
