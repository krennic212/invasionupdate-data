// 2026-10-20 audit: USAO / DHS wording the hourly harvest used to miss. Each case is the release's own text.
import test from "node:test";
import assert from "node:assert/strict";
import { extractPeople, htmlBlocks, toRow, statusFrom } from "./parse.mjs";
import { holdReasons, nonCitizenStated, nonCitizenStatedFor } from "./guards.mjs";

const rel = (title, url = "https://www.justice.gov/usao-xx/pr/x") => ({ office: "TheJusticeDept", url, date: "2026-10-16", title });
const labelOf = (h, title) => { const r = toRow(h, rel(title)); return r.crime.slice(0, r.crime.indexOf(":")); };
const live = (h, blocks, title) => holdReasons({ name: h.name, sentence: h.sentence, title, releaseText: blocks.join(" "), label: labelOf(h, title) });

test("WDTX lead wording: 'Illegal alien from Mexico <Name> (aka <Name>) was ...'", () => {
  const blocks = [
    "Illegal alien from Mexico Julian Garcia-Soto was arrested near Carrizo Springs and charged with illegal re-entry. Garcia-Soto has been previously removed from the U.S. three times.",
    "Illegal alien from Mexico Jose Miguel Aguilar aka Miguel Angel Aguilar Bustillo was arrested near Comstock after just being removed from the U.S. on Sept. 11 through Harlingen. He now faces a charge of illegal re-entry.",
  ];
  const hits = extractPeople(blocks, { title: "Western District of Texas Files Nearly 500 Immigration Cases" });
  assert.deepEqual(hits.map((h) => h.name), ["Julian Garcia-Soto", "Jose Miguel Aguilar"]);
  assert.equal(hits[1].aka, "Miguel Angel Aguilar Bustillo");
  assert.deepEqual(hits.map((h) => h.origin), ["Mexico", "Mexico"]);
  assert.equal(labelOf(hits[0], "x"), "Charged");
  // "after just being removed" is past history, never the "Removed" stage; "He now faces a charge" = Charged.
  assert.match(hits[1].sentence, /He now faces a charge of illegal re-entry\.$/);
  assert.equal(labelOf(hits[1], "x"), "Charged");
  for (const h of hits) assert.deepEqual(live(h, blocks, "x"), []);
});

test("'identified as an illegal alien from Mexico' and surname-only status sentence", () => {
  const blocks = [
    "Gerardo Torres-Sanchez was found in the Travis County Jail and identified as an illegal alien from Mexico. Torres-Sanchez has been deported 11 times.",
    "In San Antonio, Melvin Acosta-Martinez was encountered at the Bexar County Jail after he was arrested for theft, according to a criminal complaint filed on Oct. 9. Acosta-Martinez is an illegal alien from Honduras whose criminal record includes a conviction for assaulting a federal officer.",
  ];
  const hits = extractPeople(blocks);
  assert.deepEqual(hits.map((h) => [h.name, h.origin]), [["Gerardo Torres-Sanchez", "Mexico"], ["Melvin Acosta-Martinez", "Honduras"]]);
  assert.match(hits[1].sentence, /^In San Antonio, Melvin Acosta-Martinez .* Acosta-Martinez is an illegal alien from Honduras/);
  for (const h of hits) assert.deepEqual(live(h, blocks, "x"), []);
});

test("single-case USAO releases: status and name in neighbouring sentences", () => {
  const me = ["BANGOR, Maine: A Brazilian national was sentenced today in U.S. District Court in Bangor for reentering the United States after a prior removal.",
    "U.S. District Judge John A. Woodcock, Jr. sentenced Jose Carlos Ferreria, 50, to time served (59 days). Ferreira pleaded guilty on September 4, 2026."];
  const [f] = extractPeople(me, { title: "Illegal Alien from Brazil Sentenced" });
  assert.equal(f.name, "Jose Carlos Ferreria");
  assert.equal(f.origin, "Brazil");
  assert.equal(labelOf(f, "x"), "Convicted");
  const fl = ["Fort Myers, Florida – Jose Toribio Canales (44, El Salvador) has been sentenced by U.S. District Judge Sheri Polster Chappell to eight years and four months in federal prison for illegal reentry after deportation. Toribio Canales pleaded guilty on July 2, 2026.",
    "According to court documents, Toribio Canales is a citizen of El Salvador. He was convicted in 2006 of lewd or lascivious battery."];
  const [t] = extractPeople(fl);
  assert.equal(t.name, "Jose Toribio Canales");
  assert.equal(t.origin, "El Salvador");
  const la = ["On October 13, 2026, the United States Attorney’s Office for the Western District of Louisiana charged Manuel De Jesus Arce Cruz , 42, of Mexico, by criminal complaint with Possession with Intent to Distribute Cocaine.",
    "Investigators saw Arce Cruz, an illegal alien, depart his residence by car with a work bag."];
  const [a] = extractPeople(htmlBlocks(la.map((x) => `<p>${x}</p>`).join("")));
  assert.equal(a.name, "Manuel De Jesus Arce Cruz", "stray space before the comma is tolerated");
  assert.equal(labelOf(a, "x"), "Charged");
  const pa = ["PHILADELPHIA – United States Attorney David Metcalf announced that Mory Kante, 21, a French national illegally in the U.S., who has been residing in Wilmington, Delaware, was sentenced today to 13 years in prison."];
  assert.equal(extractPeople(pa)[0].name, "Mory Kante");
  for (const [b, h] of [[me, f], [fl, t], [la, a], [pa, extractPeople(pa)[0]]]) assert.deepEqual(live(h, b, "x"), []);
});

test("green-card holder wording: 'A Lebanese man with a Legal Permanent Resident Card ...' + named next sentence", () => {
  const b = ["A Lebanese man with a Legal Permanent Resident Card was arrested in Fort Hancock and charged with alien smuggling. A criminal complaint alleges that Abdallah Mohamad Alhussni was working as a rideshare driver."];
  const [h] = extractPeople(b);
  assert.equal(h.name, "Abdallah Mohamad Alhussni");
  assert.equal(h.origin, "Lebanon");
  assert.match(h.sentence, /Legal Permanent Resident Card/);
  assert.equal(labelOf(h, "x"), "Charged");
  assert.ok(nonCitizenStated("a lawful permanent resident, has been charged"));
  assert.ok(nonCitizenStated("a green card holder from Peru"));
  assert.deepEqual(live(h, b, "x"), []);
});

test("Arizona weekly roundup case paragraphs", () => {
  const b = [
    "United States v. Calixtro-Rodriguez et al. Jesus Manuel Calixtro-Rodriguez and Julio Cesar Ramos-Mendez were charged by criminal complaint on Oct. 13, 2026, with Conspiracy to Transport an Illegal Alien for Profit. The driver, later identified as Calixtro-Rodriguez, performed a u-turn. BPAs were able to apprehend Calixtro-Rodriguez and three passengers, including Ramos-Mendez, who were determined to be citizens of Mexico, unlawfully present in the United States.",
    "United States v. Christopher Paul Lopez. On Oct. 9, 2026, Christopher Paul Lopez was charged by criminal complaint with Transportation of an Illegal Alien. BPAs responded to the scene and determined that the driver was a citizen of Mexico, unlawfully present in the United States.",
    "United States v. Jose Avendano-Soto. On Oct. 13, 2026, Jose Avendano-Soto was charged by criminal complaint with Transportation of an Illegal Alien. BPAs determined four were citizens of Guatemala and that one was a citizen of Mexico, and that all were unlawfully present in the United States. BPAs also learned that one of them, Avendano-Soto, was serving as the group’s foot guide into the United States.",
  ];
  const hits = extractPeople(b, { title: "District of Arizona Charges 279 Individuals for Immigration-Related Criminal Conduct this Week" });
  assert.deepEqual(hits.map((h) => h.name), ["Jesus Manuel Calixtro-Rodriguez", "Julio Cesar Ramos-Mendez", "Jose Avendano-Soto"]);
  assert.ok(!hits.some((h) => /Lopez/.test(h.name)), "the U.S.-side driver's passenger with no status wording is not a row");
  assert.equal(hits[2].origin, "", "mixed Guatemala / Mexico group: no country is guessed");
  for (const h of hits) assert.equal(labelOf(h, "x"), "Charged");
});

test("DHS deportation-flight list: intro + '<Name>, whose criminal history ...' items", () => {
  const html = `<p>All of the illegal aliens on the deportation flights were from Mexico.</p><p>Among the illegal aliens who were deported are:</p><p>Image</p>
<p>Jaime Velasquez Orozco, whose criminal history includes convictions for battery in California. He entered the United States illegally at an unknown date and location.</p><p>Image</p>
<p>Filiberto Preciado-Gamboa, an 18th Street gang member whose criminal history includes a conviction for battery on spouse in California.</p><p># # #</p><p>Media Contacts and other page text that is not a list item</p><p>Somebody Else, whose name follows the list but is not in it.</p>`;
  const blocks = htmlBlocks(html);
  const title = "Secretary Mullin Oversees Deportation Flights Out of Arizona";
  const hits = extractPeople(blocks, { title });
  assert.deepEqual(hits.map((h) => h.name), ["Jaime Velasquez Orozco", "Filiberto Preciado-Gamboa"]);
  for (const h of hits) {
    assert.equal(h.origin, "Mexico");
    assert.equal(labelOf(h, title), "Removed");
    assert.deepEqual(live(h, blocks, title), []);
  }
});

test("multi-defendant ';' sentence: co-defendant's 'U.S. citizen' does not hold a 'Brazilian national'", () => {
  const s = "Gabriel Cezar Menezes, 29, a Brazilian national, was sentenced to 94 months; Omar Aliperti De Mello Correa, 34, a U.S. citizen, was sentenced to 30 months; Leandro De Avila Goncalves, 43, a Brazilian national, was sentenced to 24 months; and Joao Andrade De Mello, 29, and Tadeu Sebastiane Rabelo Alves Barbosa, 30, both Brazilian nationals, were each sentenced to 12 months and one day.";
  const hits = extractPeople([s]);
  assert.deepEqual(hits.map((h) => h.name).sort(), ["Gabriel Cezar Menezes", "Joao Andrade De Mello", "Leandro De Avila Goncalves", "Tadeu Sebastiane Rabelo Alves Barbosa"]);
  for (const h of hits) assert.deepEqual(live(h, [s], "Brazilian Man Sentenced"), [], h.name);
  assert.equal(nonCitizenStatedFor("Omar Aliperti De Mello Correa", s), false, "the U.S. citizen is still never labelled a non-citizen");
  assert.equal(nonCitizenStatedFor("Gabriel Cezar Menezes", s), true);
  // Own clause still wins: a person whose own clause says naturalized is held.
  assert.equal(nonCitizenStatedFor("John Doe", "Jane Roe, a Mexican national, was sentenced; John Doe, a naturalized U.S. citizen born in Mexico, was sentenced."), false);
});

test("linked hits never take the headline's stage; 'as a removed alien' is not the Removed stage", () => {
  const b = ["Co-conspirator Wenjie Xu was driving the minivan, which contained five passengers. Agents subsequently determined that Xu was a Chinese national who was present in the United States illegally."];
  const [h] = extractPeople(b, { title: "Tonawanda Restaurant Owner Pleads Guilty" });
  assert.equal(h.name, "Wenjie Xu");
  assert.equal(labelOf(h, "Tonawanda Restaurant Owner Pleads Guilty"), "As posted");
  assert.equal(statusFrom("YUNIOR BENAVIDES, 50, a citizen of the Dominican Republic, was sentenced today to 21 months of imprisonment for illegally reentering the U.S. as a removed alien."), "Convicted");
});

test("still no row without the release's own non-citizen wording", () => {
  const hits = extractPeople([
    "A Nashua man was sentenced today for bank robbery. John Smith, 45, was sentenced to 5 years.",
    "Gerardo Torres-Sanchez was found in the Travis County Jail. Torres-Sanchez has been charged with theft.",
    "Among the defendants who were sentenced are:",
    "Mary Jones, whose fraud scheme stole $2 million.",
  ]);
  assert.deepEqual(hits, []);
});

test("'was convicted in 2023 ... He's now charged' reads Charged, not Convicted", () => {
  const b = ["Illegal alien from Mexico Raul Reyes-Hernandez aka Aurelio Reyes-Hernandez was found in the Washington County Jail in Brenham. Reyes-Hernandez was convicted in 2023 for alien smuggling and money laundering. He’s now charged with illegal re-entry."];
  const [h] = extractPeople(b);
  assert.equal(h.aka, "Aurelio Reyes-Hernandez");
  assert.equal(labelOf(h, "Files Nearly 500 Immigration Cases"), "Charged");
  assert.equal(statusFrom("He was sentenced in 2024 to 5 years."), "Convicted", "no 'now charged': unchanged");
});
