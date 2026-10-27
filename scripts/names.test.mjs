import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cleanPersonName, suspiciousName } from "./names.mjs";
import { extractPeople, sentences } from "./parse.mjs";
import { holdReasons } from "./guards.mjs";
import { peopleFromArticle, truncatedSurname } from "./daily-signal.mjs";

test("names: trailing month / date words are cut", () => {
  assert.equal(cleanPersonName("Pantaleon Chacon Madrid Oct"), "Pantaleon Chacon Madrid");
  assert.equal(cleanPersonName("Pantaleon Chacon Madrid Oct."), "Pantaleon Chacon Madrid");
  assert.equal(cleanPersonName("Jane Doe Oct. 21"), "Jane Doe");
  assert.equal(cleanPersonName("John Doe Jun. 3"), "John Doe");
  assert.equal(cleanPersonName("Juan Perez Monday"), "Juan Perez");
  // Real names that look like months are kept.
  for (const n of ["Theresa May", "Li Jun", "Jan Kowalski", "Maria June", "Nguyen Thi Thu"]) assert.equal(cleanPersonName(n), n);
});

test("names: place text joined by a period is split off; hyphenated surnames stay whole", () => {
  assert.equal(cleanPersonName("Nevada.Mario Garcia"), "Mario Garcia");
  assert.equal(cleanPersonName("Sidney Pino-Becquer"), "Sidney Pino-Becquer");
  assert.equal(cleanPersonName("Juan Carlos Plascencia-Torres"), "Juan Carlos Plascencia-Torres");
  assert.equal(cleanPersonName("A.J. Smith"), "A.J. Smith");
});

test("names: suspicious names are flagged", () => {
  assert.ok(suspiciousName("Pantaleon Chacon Madrid Oct").some((r) => /month/.test(r)));
  assert.ok(suspiciousName("Nevada.Mario Garcia").some((r) => /period/.test(r)));
  assert.ok(suspiciousName("Castillo-Torres").includes("single word"));
  assert.ok(suspiciousName("ICE ARRESTED").some((r) => /all-caps/.test(r)));
  assert.ok(suspiciousName("BREAKING ALIEN").some((r) => /all-caps/.test(r)));
  for (const n of ["Mario Garcia", "LESLI JOEL CALIX-SARMIENTO", "Sidney Pino-Becquer", "Theresa May", "A.J. Smith", "Verónica Hernández Martínez"]) {
    assert.deepEqual(suspiciousName(n), [], n);
  }
});

test("names: a suspicious name holds the row (guards)", () => {
  const sentence = "Mario Garcia, a criminal illegal alien from Guatemala, convicted for theft in Las Vegas, Nevada.";
  assert.deepEqual(holdReasons({ name: "Mario Garcia", sentence, label: "Convicted" }), []);
  assert.ok(holdReasons({ name: "Nevada.Mario Garcia", sentence, label: "Convicted" }).some((r) => r.startsWith("suspicious name")));
  assert.ok(holdReasons({ name: "Pantaleon Chacon Madrid Oct", sentence: "ICE arrested criminal illegal alien Pantaleon Chacon Madrid Oct. 21 in Aberdeen, Idaho.", label: "Arrested" }).some((r) => r.startsWith("suspicious name")));
});

test("parser: 'Nevada.Mario Garcia' (no space after the period) is a sentence break, not a name", () => {
  const block = "Jane Roe, a criminal illegal alien from Peru, convicted for theft in Reno, Nevada.Mario Garcia, a criminal illegal alien from Guatemala, convicted for 12 COUNTS of sexual assault in Las Vegas, Nevada.";
  assert.equal(sentences(block).length, 2);
  const people = extractPeople([block]);
  assert.deepEqual(people.map((p) => p.name), ["Jane Roe", "Mario Garcia"]);
  assert.equal(people[1].sentence, "Mario Garcia, a criminal illegal alien from Guatemala, convicted for 12 COUNTS of sexual assault in Las Vegas, Nevada.");
  assert.equal(people[1].city, "Las Vegas, NV");
  // DHS Oct 26, 2026 printed the paragraph twice with no space: still one person.
  const twice = "Mario Garcia, a criminal illegal alien from Guatemala, convicted for 12 COUNTS of sexual assault of minors under 14 years old in Las Vegas, Nevada.Mario Garcia, a criminal illegal alien from Guatemala, convicted for 12 COUNTS of sexual assault of minors under 14 years old in Las Vegas, Nevada.";
  assert.deepEqual(extractPeople([twice]).map((p) => p.name), ["Mario Garcia"]);
  // "St.Louis" / "U.S." are not breaks.
  assert.equal(sentences("He lived in St.Louis and the U.S. Attorney charged him.").length, 1);
});

test("parser: a date after an ICE name is not part of the name", () => {
  const post = "🚨CAUGHT🚨ICE Salt Lake City arrested criminal illegal alien Pantaleon Chacon Madrid Oct. 21 in Aberdeen, Idaho. He is wanted by the Government of Guatemala.";
  const [p] = extractPeople([post]);
  assert.equal(p.name, "Pantaleon Chacon Madrid");
  assert.equal(p.city, "Aberdeen, ID");
});

test("daily signal: a body sentence that cuts the hyphenated surname short takes the heading's full name (aka = body spelling)", () => {
  const body = `
## 2. Sidney Pino-Becquer
Sidney Pino-Becque, an illegal alien from Cuba, was arrested by immigration enforcement agents on Oct. 1.
His criminal history includes convictions for child endangerment.
`;
  const people = peopleFromArticle(body, { title: "Meet the Worst Criminal Aliens Arrested in Iowa" });
  assert.equal(people.length, 1);
  assert.equal(people[0].name, "Sidney Pino-Becquer");
  assert.equal(people[0].aka, "Sidney Pino-Becque");
  assert.match(people[0].sentence, /^Sidney Pino-Becque, an illegal alien from Cuba/); // charge text verbatim
  assert.ok(truncatedSurname("Sidney Pino-Becque", "Sidney Pino-Becquer"));
  assert.ok(!truncatedSurname("Sidney Pino", "Sidney Pino-Becquer"));
  assert.ok(!truncatedSurname("Maria Lopez", "Mario Lopez"));
});

test("feed: no live row has a suspicious name (a row with an approvalNote is a recorded decision)", () => {
  const feed = JSON.parse(readFileSync(new URL("../data/harvest.json", import.meta.url), "utf8"));
  const bad = feed.filter((r) => r.status === "approved" && !r.approvalNote && suspiciousName(r.name).length).map((r) => `${r.name}: ${suspiciousName(r.name).join("; ")}`);
  assert.deepEqual(bad, []);
});
