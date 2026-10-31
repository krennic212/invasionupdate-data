import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { htmlBlocks, extractPeople, statusFrom, stripPriors } from "./parse.mjs";
import { atLarge, holdReasons } from "./guards.mjs";

// Krennic 2026-10-31: three rule fixes from the Oct 29-30 missed-cases check (real release text in scripts/fixtures).
const fx = (f) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8"));
const cuban = fx("mdfl-2026-10-29-cuban-smuggling-asylum-sentencing.json");
const geron = fx("sdoh-2026-10-29-geron-lopez-reentry.json");
const cubanText = htmlBlocks(cuban.body).join(" ");

describe("at-large guard is person-scoped", () => {
  it("co-defendants' 'are at large' no longer holds a sentenced defendant (MDFL Oct 29, 2026)", () => {
    const s = "Emanuel Martinez Gonzalez was sentenced to two years in prison. Martinez Gonzalez previously pleaded guilty to conspiracy to smuggle aliens for financial gain.";
    assert.equal(atLarge(s, cubanText, "Emanuel Martinez Gonzalez"), false);
    assert.equal(atLarge(s, cubanText, "Liannys Yaiselys Vega-Perez"), false);
  });
  it("the at-large people themselves stay held", () => {
    const s = "Martinez-Gonzalez worked with his paramour and codefendant, Marianny Lucia Lopez-Torres, to arrange the travel of aliens upon their arrival in the United States and accepted payments from those aliens as a part of the smuggling operation.";
    assert.equal(atLarge(s, cubanText, "Marianny Lucia Lopez-Torres"), true);
    assert.equal(atLarge("Frandy Aragon-Diaz was charged.", cubanText, "Frandy Aragon-Diaz"), true);
    assert.ok(holdReasons({ name: "Marianny Lucia Lopez-Torres", sentence: s, title: cuban.title, releaseText: cubanText, label: "Charged" }).includes("suspect described as still at large"));
  });
  it("fail-safe: pronoun / anonymous at-large wording, own sentence, and no name still hold", () => {
    assert.equal(atLarge("John Doe was charged with reentry.", "John Doe was charged with reentry. He remains at large.", "Richard Roe"), true);
    assert.equal(atLarge("Richard Roe fled and remains at large.", "", "Richard Roe"), true);
    assert.equal(atLarge("x", "Jane Smith is at large.", ""), true);
    assert.equal(atLarge("Richard Roe was sentenced.", "Richard Roe was sentenced. Roe's brother is still at large.", "Richard Roe"), true);
  });
});

describe("list of '<Name>, <age>,' items", () => {
  it("every name when the shared tail is a plural status", () => {
    const hits = extractPeople(["Juan Perez, 27, Jose Lopez, 31, and Maria Ruiz, 29, all Mexican nationals, were charged with illegal reentry after removal."]);
    assert.deepEqual(hits.map((h) => h.name), ["Juan Perez", "Jose Lopez", "Maria Ruiz"]);
    assert.deepEqual(hits.map((h) => h.origin), ["Mexico", "Mexico", "Mexico"]);
  });
  it("nobody new from a status-less list (the release's unnamed U.S. citizen stays a reason not to list the others)", () => {
    const names = extractPeople(htmlBlocks(cuban.body), { title: cuban.title }).map((h) => h.name);
    for (const n of ["Miguel Martinez Vasconcelos", "Layra Libertad Treto Santos", "Luis Emmanuel Escalona-Marrero", "Walbis Pozo-Dutel"]) assert.ok(!names.includes(n), n);
  });
  it("a singular tail or a verb tail adds nobody", () => {
    assert.deepEqual(extractPeople(["Juan Perez, 27, Jose Lopez, 31, and Maria Ruiz, 29, a Mexican national, was charged."]).map((h) => h.name), ["Maria Ruiz"]);
  });
});

describe("'after being convicted of' is prior record", () => {
  it("Geron-Lopez (usao-sdoh Oct 29, 2026) is Charged, not Convicted", () => {
    const s = htmlBlocks(geron.body).join(" ").match(/Fernando Geron-Lopez, 35, of Columbus, is charged[^.]*\./)[0];
    assert.equal(statusFrom(s, geron.title), "Charged");
    assert.match(stripPriors("reentered after having been convicted of an aggravated felony"), /prior-history/);
  });
  it("a real conviction still reads Convicted (never downgraded)", () => {
    assert.equal(statusFrom("Doe was convicted of illegal reentry after a two-day trial."), "Convicted");
    assert.equal(statusFrom("Doe was sentenced to 30 months for reentering after being convicted of a felony."), "Convicted");
  });
});
