import test from "node:test";
import assert from "node:assert/strict";
import { extractPeople, htmlBlocks, statusFrom, toRow, sentences } from "./parse.mjs";

const DHS = `<p>Yesterday’s arrests include:</p><article><img src="x.png"></article>
<p>Ian Clive Burton, a&nbsp;criminal illegal alien from&nbsp;Jamaica, convicted for&nbsp;<strong>murder, assault on a law enforcement officer, resisting arrest,&nbsp;</strong>and&nbsp;<strong>possession of&nbsp;a&nbsp;firearm</strong>&nbsp;in Monmouth County, New Jersey.</p>
<p>“Yesterday, the brave patriots of ICE arrested murderers,” said Homeland Security Secretary Markwayne Mullin.</p>`;

test("DHS list paragraph: name, origin, city, verbatim label", () => {
  const [h, ...rest] = extractPeople(htmlBlocks(DHS));
  assert.equal(rest.length, 0, "officials quoted in the release are not rows");
  assert.equal(h.name, "Ian Clive Burton");
  assert.equal(h.origin, "Jamaica");
  assert.equal(h.city, "Monmouth County, NJ");
  assert.equal(
    h.sentence,
    "Ian Clive Burton, a criminal illegal alien from Jamaica, convicted for murder, assault on a law enforcement officer, resisting arrest, and possession of a firearm in Monmouth County, New Jersey.",
  );
});

test("DOJ wording is kept word for word, including 'illegal alien'", () => {
  const s = "Pauline Lewis, 65, of Dawsonville, Georgia, a suspected illegal alien from Antigua and Barbuda, was arrested on a criminal complaint charging her with voting as a non-citizen in a federal election.";
  const [h] = extractPeople([s]);
  assert.equal(h.name, "Pauline Lewis");
  assert.equal(h.origin, "Antigua and Barbuda");
  const row = toRow(h, { office: "TheJusticeDept", url: "https://www.justice.gov/usao-ndga/pr/three-aliens-charged-voting-federal-elections", date: "2026-09-19", title: "Three aliens charged" });
  assert.ok(row.crime.endsWith(s), "charge label is the source sentence verbatim");
  assert.match(row.crime, /suspected illegal alien/);
  assert.equal(row.voting, true);
  assert.equal(row.photo, "");
  assert.equal(row.when, "19 Sep 2026");
  assert.equal(row.sourceUrl, "https://www.justice.gov/usao-ndga/pr/three-aliens-charged-voting-federal-elections");
});

test("no non-citizen wording on the page = no row (status is never invented)", () => {
  const hits = extractPeople([
    "John Smith, 45, of Dallas, Texas, was sentenced to 10 years in prison for wire fraud.",
    "ICE officers arrested Magdalena Gomez-Garcia, Elias Gomez-Garcia and Eulalia Ordonez-Carmelo, all of whom had final orders of removal.",
  ]);
  assert.equal(hits.length, 0);
});

test("co-defendants on one release are separate people", () => {
  const hits = extractPeople([
    "Juan Perez, 30, a Mexican national, and Maria Lopez, 28, a citizen of Honduras, were charged with alien smuggling.",
  ]);
  assert.deepEqual(hits.map((h) => h.name), ["Juan Perez", "Maria Lopez"]);
  assert.deepEqual(hits.map((h) => h.origin), ["Mexico", "Honduras"]);
});

test("country names: 'the Dominican Republic', 'Honduras and MS-13'", () => {
  const [a] = extractPeople(["Samuel Romero-Landestoy, a criminal illegal alien from the Dominican Republic, convicted for burglary in Shirley, Massachusetts."]);
  const [b] = extractPeople(["Manuel Barahona-Rivera, a criminal illegal alien from Honduras and MS-13 gang member, was deported on September 30."]);
  assert.equal(a.origin, "Dominican Republic");
  assert.equal(b.origin, "Honduras");
});

test("status comes from the source's verbs", () => {
  assert.equal(statusFrom("X, a criminal illegal alien from Mexico, was deported on October 2."), "Removed");
  assert.equal(statusFrom("X, an illegal alien from Mexico, convicted for burglary."), "Convicted");
  assert.equal(statusFrom("X, an illegal alien from Kenya, arrested by ICE in Lincoln, Nebraska."), "Charged");
  assert.equal(statusFrom("X, a Mexican national, in ICE custody pending removal, convicted of DUI."), "Convicted");
});

test("sentence split keeps U.S. and state abbreviations together", () => {
  assert.equal(sentences("He entered the U.S. illegally in 2019. He was removed.").length, 2);
  assert.equal(sentences("KNOXVILLE, Tenn. — ICE arrested him. Done.").length, 2);
});

test("'X and Y, both illegal aliens from ...' gives two rows with the origin", () => {
  const hits = extractPeople(["ERO New York City has since identified both suspects: Dangelo Rafael Jean Caraballo and Sneider Mejia Bautista, both illegal aliens from the Dominican Republic."]);
  assert.deepEqual(hits.map((h) => [h.name, h.origin]).sort(), [["Dangelo Rafael Jean Caraballo", "Dominican Republic"], ["Sneider Mejia Bautista", "Dominican Republic"]]);
});

test("'previously removed' is not status Removed", () => {
  assert.equal(statusFrom("Jose Almendares Suazo, 30, a criminal illegal alien from Honduras who had been previously removed from the U.S.", "ICE arrests 121 during summer enforcement initiative"), "Charged");
  assert.equal(statusFrom("Luis Q, 23, Guatemalan citizen and previously removed noncitizen.", "ICE arrests 121"), "Charged");
});

test("demonym inside the description sets origin", () => {
  const [h] = extractPeople(["Diego Gomez Hernandez, 22, a Mexican criminal illegal alien."]);
  assert.equal(h.origin, "Mexico");
});

test("release title fills in status when the naming sentence has no verb", () => {
  assert.equal(statusFrom("On October 4, Lara Gonzalez, a Mexican national, traveled into Canada.", "Mexican National Pleads Guilty to Eluding Immigration Inspection"), "Convicted");
});

import { cityFrom, latLonFor } from "./parse.mjs";

test("cityFrom: AP-style state abbreviation (Marlborough, Mass.)", () => {
  assert.equal(
    cityFrom("On Oct. 2, ICE Boston arrested Maycon Eleazar De Jesus Barrios, a criminal illegal alien from Guatemala, during targeted operations in Marlborough, Mass. His criminal history includes arrest for assault and battery on a family/household member."),
    "Marlborough, MA",
  );
  assert.equal(cityFrom("He was arrested in Tampa, Fla."), "Tampa, FL");
  assert.equal(cityFrom("arrested in Albany, N.Y., on Monday"), "Albany, NY");
  assert.equal(cityFrom("convicted in San Jose, Calif., of robbery"), "San Jose, CA");
});

test("cityFrom: two-letter postal code (Yazoo City, MS), but never MS-13", () => {
  assert.equal(
    cityFrom("ERO New Orleans arrested Byron Arevalo-Pacheco, a criminal illegal alien from Guatemala, in Yazoo City, MS."),
    "Yazoo City, MS",
  );
  assert.equal(cityFrom("an illegal alien from El Salvador and member of Los Angeles, MS-13"), "");
  assert.equal(cityFrom("arrested in Lynn, MA on Oct 7"), "Lynn, MA");
});

test("cityFrom: full state names still work", () => {
  assert.equal(cityFrom("convicted for murder in Monmouth County, New Jersey."), "Monmouth County, NJ");
  assert.equal(cityFrom("arrested in St. Louis, Missouri"), "St. Louis, MO");
});

test("cityFrom: NYC boroughs and New York City -> New York, NY", () => {
  assert.equal(cityFrom("NYPD arrested him in Manhattan, NY for assault"), "New York, NY");
  assert.equal(cityFrom("arrested in the Bronx for robbery"), "New York, NY");
  assert.equal(cityFrom("raped a corpse on a subway car in Brooklyn"), "New York, NY");
  assert.equal(cityFrom("arrested in New York City"), "New York, NY");
  assert.equal(cityFrom("sentenced in Queens Criminal Court"), "");
});

test("cityFrom: no guessing (origin, no place, agency names)", () => {
  assert.equal(cityFrom("Salvador Parra Lopez, an illegal alien from Mexico, convicted of aiding and abetting."), "");
  assert.equal(cityFrom("an illegal alien from Juarez, Mexico"), "");
  assert.equal(cityFrom("ICE Boston arrested John Doe."), "");
  assert.equal(cityFrom("sentenced by the U.S. District Court in Boston"), "");
});

test("latLonFor: city table lookup, nulls when not in the table", () => {
  assert.deepEqual(latLonFor("Marlborough, MA"), { lat: latLonFor("marlborough, ma").lat, lon: latLonFor("marlborough, ma").lon });
  assert.equal(typeof latLonFor("Lynn, MA").lat, "number");
  assert.deepEqual(latLonFor("Not stated"), { lat: null, lon: null });
  assert.deepEqual(latLonFor("Nowhere, ZZ"), { lat: null, lon: null });
});

test("toRow fills lat/lon from the city it read", () => {
  const [h] = extractPeople(htmlBlocks("<p>ICE Boston arrested Maycon Eleazar De Jesus Barrios, a criminal illegal alien from Guatemala, during targeted operations in Marlborough, Mass.</p>"));
  assert.equal(h.city, "Marlborough, MA");
  const row = toRow(h, { office: "ICEgov", date: "2026-10-09", title: "t", url: "https://www.ice.gov/news/x" });
  assert.equal(row.city, "Marlborough, MA");
  assert.equal(typeof row.lat, "number");
  assert.equal(typeof row.lon, "number");
});

// --- Place names are never people (DHS "Worst Illegal Aliens Arrested in Syracuse, New York", Oct 9 2026) ---
import { isPlaceName, titlePlaces, HISTORY } from "./parse.mjs";

const SYR_TITLE = "DHS Highlights Worst Illegal Aliens Arrested in Syracuse, New York | Homeland Security";
const SYR = `<h1>DHS Highlights Worst Illegal Aliens Arrested in Syracuse, New York</h1>
<p>“In Syracuse, New York, ICE has arrested illegal aliens with criminal histories that include sexual exploitation of a minor, cocaine possession, driving under the influence, and burglary.</p>
<ul>
<li>Norberto Machada-Rodriguez, an illegal alien from Cuba, whose criminal history includes sexual assault and cocaine possession.</li>
<li>Said Ibrahim, an illegal alien from Somalia, whose criminal history includes cruelty toward a child.</li>
<li>Haikham Phimasone, an illegal alien from Laos, whose criminal history includes assault, driving under the influence of liquor, and dangerous drugs.</li>
<li>Hsa Mu Na, an illegal alien from Burma, whose criminal history includes sexual exploitation of a minor – material – transport and sex offense.</li>
<li>Mohammed Al Nassar, an illegal alien from Iraq, whose criminal history includes burglary.</li>
</ul>`;

test("Syracuse release: 'New York' from 'In Syracuse, New York, ICE has arrested illegal aliens' is not a person", () => {
  const names = extractPeople(htmlBlocks(SYR), { title: SYR_TITLE }).map((h) => h.name);
  assert.ok(!names.includes("New York"), names.join(", "));
  assert.ok(!names.some((n) => /syracuse|new york/i.test(n)));
  assert.deepEqual(names, ["Norberto Machada-Rodriguez", "Said Ibrahim", "Haikham Phimasone", "Hsa Mu Na", "Mohammed Al Nassar"]);
  // even without the title, the body sentence alone never yields a place "person"
  assert.deepEqual(extractPeople(["“In Syracuse, New York, ICE has arrested illegal aliens with criminal histories that include sexual exploitation of a minor, cocaine possession, driving under the influence, and burglary."]), []);
});

test("isPlaceName: states, city-geo cities, 'City, State', County, headline 'in <Place>'", () => {
  for (const p of ["New York", "Syracuse, New York", "Syracuse", "Texas", "North Carolina", "San Antonio", "St. Louis", "Monmouth County", "Kansas City", "New York City", "Brooklyn", "Lincoln, NE"]) {
    assert.equal(isPlaceName(p), true, p);
  }
  for (const n of ["Norberto Machada-Rodriguez", "Hsa Mu Na", "Mohammed Al Nassar", "Ian Clive Burton", "Said Ibrahim"]) assert.equal(isPlaceName(n), false, n);
  assert.deepEqual(titlePlaces(SYR_TITLE), ["syracuse, new york", "syracuse", "new york"]);
  assert.equal(isPlaceName("Lake Placid", { title: "ICE arrests 12 in Lake Placid" }), true);
});

test("single-word and place names are rejected by the extractor", () => {
  assert.deepEqual(extractPeople(["Arrested in Texas, Houston, a Mexican national, was charged with fraud."]).map((h) => h.name), []);
  assert.deepEqual(extractPeople(["ICE arrested, in Ohio, Monmouth County, an illegal alien from Mexico."]).map((h) => h.name), []);
});

// --- Past record is not a charge ---
test("'criminal history includes' / 'prior convictions for' is never labeled Charged (As posted)", () => {
  const title = SYR_TITLE;
  for (const s of [
    "Norberto Machada-Rodriguez, an illegal alien from Cuba, whose criminal history includes sexual assault and cocaine possession.",
    "Hsa Mu Na, an illegal alien from Burma, whose criminal history includes sexual exploitation of a minor – material – transport and sex offense.",
    "Mohammed Al Nassar, an illegal alien from Iraq, whose criminal history includes burglary.",
    "In January, ICE arrested Gerardo Miguel-Mora, an illegal alien from Mexico, after he had been released by New York sanctuary politicians despite having a criminal history that includes arrests for strangulation, rape, sexual assault, burglary, grand larceny, and drug possession.",
    "John Doe, a Mexican national with prior convictions for assault and burglary, was arrested by ICE.",
    "John Doe, an illegal alien from Honduras, has prior arrests for DUI.",
    "Jose Almendares Suazo, 30, a criminal illegal alien from Honduras who had been previously removed from the U.S. Almendares Suazo has a prior conviction for assault causing bodily injury, as well as a prior arrest for assault involving family violence.",
  ]) {
    assert.ok(HISTORY.test(s), s);
    assert.equal(statusFrom(s, title), "As posted", s);
    assert.equal(statusFrom(s, "ICE arrests 121; man convicted"), "As posted", `title never sets it: ${s}`);
  }
  // Convicted / Removed only when the text outside the history clause says so
  assert.equal(statusFrom("On October 1, Jose Luis Mata-Cedillo, an illegal alien from Mexico, was sentenced to 20 years in prison after he had previously been convicted for cocaine trafficking.", "t"), "Convicted");
  assert.equal(statusFrom("John Doe, an illegal alien from Mexico, whose criminal history includes convictions for robbery.", "t"), "As posted");
  assert.equal(statusFrom("ICE arrested Jane Roe and deported her home to the Dominican Republic. Her criminal history includes child abuse.", ""), "Removed");
});

test("toRow: Syracuse rows read 'As posted:' with the sentence verbatim", () => {
  const rel = { office: "DHSgov", url: "https://www.dhs.gov/news/2026/10/09/dhs-highlights-worst-illegal-aliens-arrested-syracuse-new-york", date: "2026-10-09", title: SYR_TITLE };
  for (const h of extractPeople(htmlBlocks(SYR), { title: SYR_TITLE })) {
    const row = toRow(h, rel);
    assert.equal(row.crime, `As posted: ${h.sentence}`);
    assert.match(row.crime, /criminal history includes/);
  }
});
