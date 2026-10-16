import test from "node:test";
import assert from "node:assert/strict";
import { holdReasons, holdReasonsForRow, isMinor, stageOk, atLarge, nonCitizenStated } from "./guards.mjs";
import { statusFrom, extractPeople } from "./parse.mjs";
import { approveRows } from "./approve.mjs";

const clean = { name: "Ian Clive Burton", sentence: "Ian Clive Burton, a criminal illegal alien from Jamaica, convicted for murder in Monmouth County, New Jersey.", title: "Worst of the worst: ICE arrests murderers", label: "Convicted" };

test("a clean official row has no hold reasons (auto-approve allowed)", () => {
  assert.deepEqual(holdReasons(clean), []);
});

test("minor / juvenile: held pending", () => {
  assert.ok(isMinor("Juan Perez", "Juan Perez, 16, a Mexican national, was charged with robbery."));
  assert.ok(isMinor("Juan Perez", "Juan Perez, a juvenile from Honduras, was arrested."));
  assert.ok(isMinor("Juan Perez", "Juan Perez, a Honduran national who entered as an unaccompanied alien child, was charged."));
  assert.ok(holdReasons({ ...clean, sentence: "Ian Clive Burton, 17, a criminal illegal alien from Jamaica, convicted for theft." }).includes("possible minor / juvenile"));
  // an adult convicted of a crime against a child is not a minor
  assert.equal(isMinor("Gonzalo Sanchez", "Gonzalo Sanchez, 41, a criminal illegal alien from Mexico, convicted for sexual assault on a child in Chicago, Illinois."), false);
});

test("stage is never escalated: charged / indicted / arrested is never labeled Convicted or Sentenced", () => {
  const cases = [
    ["John Doe, 34, a Mexican national, was charged with illegal reentry.", "Mexican national charged with illegal reentry"],
    ["John Doe, 34, a citizen of Honduras, was indicted by a federal grand jury on fentanyl charges.", "Honduran national indicted"],
    ["John Doe, an illegal alien from Kenya, arrested by ICE in Lincoln, Nebraska.", "ICE arrests illegal alien"],
    ["John Doe, a Mexican national with a prior conviction for assault, was charged with illegal reentry.", "Man charged"],
    ["John Doe, a criminal illegal alien from Mexico who was previously convicted of DUI, was arrested by ICE.", "ICE arrests"],
    ["John Doe, a Mexican national, traveled into Canada.", "Mexican national indicted, will be sentenced later"],
  ];
  for (const [sentence, title] of cases) {
    const label = statusFrom(sentence, title);
    assert.notEqual(label, "Convicted", `${sentence} -> ${label}`);
    assert.doesNotMatch(label, /sentenced/i);
    assert.equal(stageOk(label, sentence, title), true);
  }
  // the guard itself rejects an escalated label
  assert.equal(stageOk("Convicted", cases[0][0], cases[0][1]), false);
  assert.equal(stageOk("Convicted", cases[2][0], cases[2][1]), false);
  assert.equal(stageOk("Removed", cases[2][0], "ICE deports illegal alien"), false);
  assert.ok(holdReasons({ name: "John Doe", sentence: cases[1][0], title: cases[1][1], label: "Convicted" })[0].startsWith("stage"));
  // a real conviction / guilty plea in the source still reads Convicted
  assert.equal(statusFrom("John Doe, a Mexican national, pleaded guilty today to illegal reentry.", "Mexican national pleads guilty"), "Convicted");
});

test("suspects still at large: held pending", () => {
  assert.ok(atLarge("John Doe, an illegal alien from Mexico, remains at large."));
  assert.ok(atLarge("ERO identified both suspects: A B and C D, both illegal aliens from the Dominican Republic.", "Both suspects remaining at-large."));
  assert.equal(atLarge(clean.sentence, "ICE arrested him Tuesday."), false);
  assert.ok(holdReasons({ ...clean, releaseText: "the suspect remains at large" }).includes("suspect described as still at large"));
  // investigative "whereabouts" after an arrest is not at-large
  assert.equal(atLarge(
    "On October 7, HSI arrested Victor Soseia Hachipan, an illegal alien from Micronesia, during a targeted enforcement operation in Keizer, Oregon.",
    "HSI issued an administrative subpoena requesting information that could lead to Hachipan\'s whereabouts. HSI finally arrested this illegal alien."
  ), false);
  assert.ok(atLarge("John Doe, an illegal alien from Mexico, whereabouts are unknown."));
});

test("not stated to be a non-citizen: held pending", () => {
  assert.equal(nonCitizenStated("Oleg Korniev, 42, a dual citizen of Ukraine and Russia, pleaded guilty today."), false);
  assert.equal(nonCitizenStated("Richard Molina-Ovalle, 36, of Worcester, was charged."), false);
  assert.equal(nonCitizenStated("Axon Solomon Mejia Ortega, 35, Mexican citizen unlawfully present in the United States."), true);
  assert.ok(holdReasons({ name: "Richard Molina-Ovalle", sentence: "Richard Molina-Ovalle, 36, of Worcester, was charged.", label: "Charged" }).includes("not stated to be a non-citizen"));
});

test("falsely claiming U.S. citizenship does not cancel foreign-citizen wording", () => {
  const sentence = "the U.S. Attorney's Office convicted Denis Joseph Bouchard, 70, a Canadian citizen, for falsely claiming to be a United States citizen when he voted.";
  assert.equal(nonCitizenStated(sentence), true);
  assert.deepEqual(holdReasons({ name: "Denis Joseph Bouchard", sentence, title: "EDNC Unveils Ten Federal Indictments", label: "Convicted" }), []);
  assert.equal(nonCitizenStated("Efrain Antonio Avalos, a United States citizen, was arrested and charged with Transportation of Illegal Aliens."), false);
});

test("existing rows are re-checked from their own fields", () => {
  const row = { name: "Dennis Nyagesuka", crime: "Charged: Dennis Nyagesuka, an illegal alien from Kenya, arrested by ICE in Lincoln, Nebraska.", usa: "DHS release Oct 5, 2026: DHS highlights worst illegal aliens arrested", text: "" };
  assert.deepEqual(holdReasonsForRow(row), []);
  assert.ok(holdReasonsForRow({ ...row, crime: row.crime.replace("Charged", "Convicted") })[0].startsWith("stage"));
});

test("approve 'all' skips guard-held rows; naming the id approves and clears the hold", () => {
  const rows = [{ id: "a", status: "pending" }, { id: "m", status: "pending", holdReason: "possible minor / juvenile" }];
  const all = approveRows(rows, "all").rows;
  assert.deepEqual(all.map((r) => r.status), ["approved", "pending"]);
  const byId = approveRows(rows, "m").rows[1];
  assert.equal(byId.status, "approved");
  assert.equal("holdReason" in byId, false);
});

test("extractor never yields a person without non-citizen wording in the sentence", () => {
  const hits = extractPeople(["Richard Molina-Ovalle, 36, of Worcester and Jose Molina-Ovalle, 27, a Dominican national unlawfully residing in Worcester, were charged in an indictment."]);
  assert.deepEqual(hits.map((h) => h.name), ["Jose Molina-Ovalle"]);
});

test("a place name is held as 'not a person' (every writer, incl. X picks and pending intake)", () => {
  const sentence = "“In Syracuse, New York, ICE has arrested illegal aliens with criminal histories that include sexual exploitation of a minor, cocaine possession, driving under the influence, and burglary.";
  const title = "DHS Highlights Worst Illegal Aliens Arrested in Syracuse, New York | Homeland Security";
  assert.ok(holdReasons({ name: "New York", sentence, title, label: "As posted" }).some((r) => r.startsWith("not a person")));
  assert.ok(holdReasons({ name: "Syracuse", sentence, title, label: "As posted" }).some((r) => r.startsWith("not a person")));
  assert.ok(holdReasons({ name: "Monmouth County", sentence, title: "", label: "As posted" }).some((r) => r.startsWith("not a person")));
  assert.equal(holdReasons({ name: "Said Ibrahim", sentence: "Said Ibrahim, an illegal alien from Somalia, whose criminal history includes cruelty toward a child.", title, label: "As posted" }).length, 0);
});

import { denaturalizedStated } from "./guards.mjs";
import { rowsForPost } from "./x-scan.mjs";
test("denaturalized (citizenship revoked) counts like a stated non-citizen (Krennic 2026-10-16)", () => {
  const head = "CHILD SEX ABUSER’S CITIZENSHIP REVOKED AFTER NATURALIZATION FRAUD CONVICTION";
  const sentence = "Cyril Domaquik Clemens, a Liberian native, was convicted of three counts of indecent liberties with a child.";
  assert.equal(denaturalizedStated(head), true);
  assert.equal(denaturalizedStated("John Doe was denaturalized on Monday."), true);
  assert.equal(denaturalizedStated("A judge revoked his citizenship."), true);
  assert.ok(!holdReasons({ name: "Cyril Domaquik Clemens", sentence, releaseText: `${head} ${sentence}`, label: "Convicted" }).includes("not stated to be a non-citizen"));
  // Proceedings only: still a U.S. citizen -> still held.
  for (const t of ["FACES DENATURALIZATION PROCEEDINGS", "DOJ has initiated proceedings to revoke Javier Marrero-Pando’s citizenship", "he could be denaturalized", "DOJ seeks to revoke his citizenship"]) {
    assert.equal(denaturalizedStated(t), false, t);
  }
  const rows = rowsForPost({ id: "1", username: "ICEgov", created_at: "2026-10-05T15:00:00Z", text: `${head}\n\n${sentence}`, referenced: [], media: [] }, [{ name: "Cyril Domaquik Clemens", sentence }]);
  const r = rows.find((x) => x.row.name === "Cyril Domaquik Clemens");
  assert.ok(r, JSON.stringify(rows.map((x) => x.row.name)));
  { assert.equal(r.row.kind, "denaturalized"); assert.ok(!/non-citizen/.test(r.row.holdReason || "")); }
});

test("at-large arrest / targeted enforcement jargon is not 'at large' (Krennic 2026-10-16)", () => {
  for (const t of ["We arrested him in an at-large targeted enforcement action in Bronx.", "ICE Chicago made an at-large arrest of him.", "during an at-large operation", "in at-large enforcement"]) assert.equal(atLarge("He was charged.", t), false, t);
  for (const t of ["He remains at large.", "The suspect is at large.", "He remains a fugitive.", "He is still being sought.", "Do not attempt to apprehend any subject."]) assert.equal(atLarge("He was charged.", t), true, t);
  assert.equal(atLarge("He was charged.", "ICE made an at-large arrest of one man; his co-defendant remains at large."), true);
});
