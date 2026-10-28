import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TAGS, tagsFor, applyTags, siblingsIndex, dateSpan, entryDates, adminWording } from "./tags.mjs";

const row = (o = {}) => ({ name: "Jane Roe", crime: "Charged: Jane Roe, an illegal alien from Mexico, was charged.", usa: "", entered: "Not stated", text: "", ...o });
const tags = (o) => tagsFor(row(o));

test("CHNV: the acronym, the four-country parole program, Biden's CHNV flights; CHNV implies Entered under Biden", () => {
  assert.deepEqual(tags({ text: "Jane Roe came in through the CHNV parole program." }), ["CHNV", "Entered under Biden"]);
  assert.deepEqual(tags({ text: "Jane Roe was paroled under the Cuba, Haiti, Nicaragua, and Venezuela parole process." }), ["CHNV", "Entered under Biden"]);
  assert.deepEqual(tags({ text: "Jane Roe flew in on one of former President Biden's CHNV mass parole migrant flights." }), ["CHNV", "Entered under Biden"]);
  assert.deepEqual(tags({ text: "Jane Roe is from Cuba. She lived in Haiti." }), []);
  assert.deepEqual(tags({ text: "Jane Roe was released on parole in 2010 after a robbery conviction." }), []);
});

test("DACA: only as the person's own status (current or former)", () => {
  assert.deepEqual(tags({ crime: "Removed. Convicted: robbery. Granted DACA in March 2015." }), ["DACA"]);
  assert.deepEqual(tags({ text: "Jane Roe, an illegal alien from Venezuela and DACA recipient, was arrested." }), ["DACA"]);
  assert.deepEqual(tags({ entered: "Visitor visa 1991; remained; DACA 2013 (NDGA / DOJ)" }), ["DACA"]);
  assert.deepEqual(tags({ text: "Jane Roe, a former DACA recipient, was charged." }), ["DACA"]);
  assert.deepEqual(tags({ text: "Jane Roe had Deferred Action for Childhood Arrivals status." }), ["DACA"]);
  // negatives: denial, application, policy talk, other kinds of deferred action
  assert.deepEqual(tags({ text: "Jane Roe applied for DACA but was denied." }), []);
  assert.deepEqual(tags({ text: "Jane Roe was denied DACA in 2016." }), []);
  assert.deepEqual(tags({ text: "The ruling on the DACA program came out the same week Jane Roe was charged." }), []);
  assert.deepEqual(tags({ entered: "B-2 overstay. Deferred action 2022 and 2025 as posted." }), []);
});

test("Entered under Biden: wording tied to entry / release, or an entry date Jan 20, 2021 - Jan 19, 2025", () => {
  assert.deepEqual(tags({ crime: "Pleaded guilty: Jane Roe, an illegal alien from Honduras released into the U.S. under the Biden administration, shot a man." }), ["Entered under Biden"]);
  assert.deepEqual(tags({ crime: "Arrested: Jane Roe was previously caught and released at the border in El Paso, TX by the Biden administration in May 2021." }), ["Entered under Biden"]);
  assert.deepEqual(tags({ entered: "Unlawfully entered the U.S. in August 2022; paroled by Border Patrol" }), ["Entered under Biden"]);
  assert.deepEqual(tags({ entered: "Crossed illegally Lukeville, AZ 12/21/2023; CBP released (DHS to Fox)" }), ["Entered under Biden"]);
  assert.deepEqual(tags({ text: "Jane Roe first entered the US illegally near Eagle Pass, Texas, in 2023." }), ["Entered under Biden"]);
  assert.deepEqual(tags({ entered: "Deported 8/4/2015; illegally re-entered 2023 (DHS / Breitbart)" }), ["Entered under Biden"]);
  // boundaries
  assert.deepEqual(tags({ entered: "Entered illegally on January 20, 2021" }), ["Entered under Biden"]);
  assert.deepEqual(tags({ entered: "Entered illegally on January 19, 2021" }), []);
  assert.deepEqual(tags({ entered: "Entered illegally on 1/19/2025" }), ["Entered under Biden"]);
  assert.deepEqual(tags({ entered: "Entered illegally on 1/20/2025" }), []);
  assert.deepEqual(tags({ entered: "Entered illegally in February 2021" }), ["Entered under Biden"]);
  assert.deepEqual(tags({ entered: "Entered illegally in December 2024" }), ["Entered under Biden"]);
  // straddling years / months, and no date
  assert.deepEqual(tags({ entered: "Entered illegally 2021 (ICE Buffalo)" }), []);
  assert.deepEqual(tags({ entered: "Entered illegally in 2025" }), []);
  assert.deepEqual(tags({ entered: "Entered illegally in January 2021" }), []);
  assert.deepEqual(tags({ entered: "Entered illegally in January 2025" }), []);
  assert.deepEqual(tags({ entered: "Not stated" }), []);
  assert.deepEqual(tags({ entered: "Illegally entered at an unknown date and location (as posted)" }), []);
});

test("Entered under Obama: wording tied to entry / release, or an entry date Jan 20, 2009 - Jan 19, 2017", () => {
  assert.deepEqual(tags({ entered: "Illegally entered through California in December 2015 while under 18; released by the Obama administration (as posted)" }), ["Entered under Obama"]);
  assert.deepEqual(tags({ text: "ICE lodged detainers for two Obama-released illegal alien brothers." }), ["Entered under Obama"]);
  assert.deepEqual(tags({ text: "Jane Roe came to the United States in or around 2014 on an immigrant visa." }), ["Entered under Obama"]);
  assert.deepEqual(tags({ entered: "B-2 visitor visa entry Boston Logan March 18, 2015; later overstay." }), ["Entered under Obama"]);
  assert.deepEqual(tags({ usa: "Entered on a student visa in 2012 and remained after it expired in December 2013." }), ["Entered under Obama"]);
  // boundaries
  assert.deepEqual(tags({ entered: "Entered illegally on Jan. 20, 2009" }), ["Entered under Obama"]);
  assert.deepEqual(tags({ entered: "Entered illegally on Jan. 19, 2009" }), []);
  assert.deepEqual(tags({ entered: "Entered illegally on Jan. 19, 2017" }), ["Entered under Obama"]);
  assert.deepEqual(tags({ entered: "Entered illegally on Jan. 20, 2017" }), []);
  assert.deepEqual(tags({ entered: "Entered illegally in 2009 in New Mexico" }), []);
  assert.deepEqual(tags({ text: "Jane Roe arrived legally in 2017, but should have left in 2018." }), []);
  assert.deepEqual(tags({ entered: "Illegal entry in 2009" }), []);
  assert.deepEqual(tags({ entered: "Illegal entry in 2010" }), ["Entered under Obama"]);
});

test("Gang, MS-13, and TdA only when the source names that gang", () => {
  assert.deepEqual(tags({ text: "Jane Roe, a Tango Corpito gang member, was arrested." }), ["Gang"]);
  assert.deepEqual(tags({ text: "Jane Roe is an MS-13 gang member." }), ["Gang", "MS-13"]);
  assert.deepEqual(tags({ text: "Jane Roe belongs to Tren de Aragua." }), ["Gang", "TdA"]);
  assert.deepEqual(tags({ text: "Jane Roe was charged with robbery." }), []);
});

test("negatives: dates of other events, other administrations' actions, other people in the same post", () => {
  // removal / order / conviction / plea / vote dates are not entry dates
  assert.deepEqual(tags({ entered: "Illegally entered through Texas in March 2006; illegally re-entered after 2009, 2016, and 2024 removals (as posted)" }), []);
  assert.deepEqual(tags({ crime: "Convicted: illegal reentry, March 2015." }), []);
  assert.deepEqual(tags({ text: "Jane Roe was convicted of illegal entry in 2015." }), []);
  assert.deepEqual(tags({ text: "Jane Roe also entered a plea in May to unlawfully voting. She admitted to illegally voting in the 2024 federal election." }), []);
  assert.deepEqual(tags({ text: "Jane Roe, a lawful permanent resident since March 16, 2021, is charged." }), []);
  assert.deepEqual(tags({ text: "Jane Roe entered the U.S. illegally multiple times since 2022." }), []);
  assert.deepEqual(tags({ entered: "Illegally entered and was deported three times in 2015" }), []);
  // Obama named, but not for an entry or release
  assert.deepEqual(tags({ crime: "Charged: Jane Roe was previously ignored by the Obama administration when ICE had the opportunity to take her into custody in Georgia in 2015." }), []);
  assert.deepEqual(tags({ text: "Jane Roe was deported under Obama and re-entered in 2019." }), []);
  // the foreign field / reviewer notes are not read
  assert.deepEqual(tags({ foreign: "Admitted massacre in 2012.", approvalNote: "entered in 2022 per Krennic" }), []);
  // two people in one post: the Biden sentence is about the other person
  const post = "They include JANE ROE, a Mauritanian illegal alien who entered the country illegally as a gotaway. ICE arrested her in Cleveland. Also arrested was JOHN DOE, a Haitian illegal alien who was caught and released at the border in El Paso, TX by the Biden administration in May 2021. He is in ICE custody.";
  const rows = [
    { name: "JANE ROE", crime: "As posted: They include JANE ROE, a Mauritanian illegal alien.", usa: "", entered: "Not stated", text: post, sourceUrl: "https://x.com/a/status/1" },
    { name: "JOHN DOE", crime: "Arrested: Also arrested was JOHN DOE.", usa: "", entered: "Not stated", text: post, sourceUrl: "https://x.com/a/status/1" },
  ];
  applyTags(rows);
  assert.deepEqual(rows[0].tags, []);
  assert.deepEqual(rows[1].tags, ["Entered under Biden"]);
});

test("helpers: date spans and entry-date extraction", () => {
  assert.deepEqual(dateSpan("2015"), [Date.UTC(2015, 0, 1), Date.UTC(2015, 11, 31)]);
  assert.deepEqual(dateSpan("Feb 2021"), [Date.UTC(2021, 1, 1), Date.UTC(2021, 1, 28)]);
  assert.deepEqual(dateSpan("Nov. 24, 2023"), [Date.UTC(2023, 10, 24), Date.UTC(2023, 10, 24)]);
  assert.deepEqual(entryDates("He flew into the US on 11/24/2023 via Fort Lauderdale"), ["11/24/2023"]);
  assert.equal(adminWording("released by the Biden administration", "Biden"), true);
  assert.equal(adminWording("deported by the Biden administration", "Biden"), false);
});

test("tag order is fixed and only known tags are used", () => {
  assert.deepEqual(TAGS, ["CHNV", "DACA", "Entered under Biden", "Entered under Obama", "Gang", "MS-13", "TdA"]);
  assert.deepEqual(tags({ crime: "Charged: Jane Roe, a DACA recipient, came in through CHNV parole." }), ["CHNV", "DACA", "Entered under Biden"]);
});

test("every live and review row carries exactly the tags tagsFor() gives (run node scripts/tags.mjs after edits)", () => {
  const feed = JSON.parse(readFileSync("data/harvest.json", "utf8"));
  const review = JSON.parse(readFileSync("data/review.json", "utf8"));
  const others = siblingsIndex([...feed, ...review]);
  for (const r of [...feed, ...review]) {
    assert.ok(Array.isArray(r.tags), `${r.name}: no tags array`);
    assert.deepEqual(r.tags, tagsFor(r, others(r)), r.name);
  }
});

test("known live rows keep their tags", () => {
  const feed = JSON.parse(readFileSync("data/harvest.json", "utf8"));
  const by = (n) => feed.find((r) => r.name === n)?.tags;
  assert.deepEqual(by("Mary Angelica Landeros-Quen"), ["DACA"]);
  assert.deepEqual(by("Analiea Milliscent Eccles"), ["DACA"]);
  assert.deepEqual(by("Maxime Pharilien"), ["Entered under Biden"]);
  assert.deepEqual(by("Fatoumata Niang"), []);
  assert.deepEqual(by("Jacinto Gonzalez-Perez"), ["Entered under Obama"]);
  assert.deepEqual(by("Uriel Santiago Perez"), []);
});
