// Krennic 2026-11-17: "U.S. citizen" / naturalized wording only blocks the person it is attached to, not everyone in the sentence.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { citizenWordingAbout, holdReasons, holdReasonsForRow, nonCitizenStated, nonCitizenStatedFor } from "./guards.mjs";

const CHERNYSHOV =
  "Stanislav Chernyshov, 30, a Russian national illegally residing in the United States, and his brother Vladislav Chernyshov, 35, a naturalized U.S. citizen, were arrested in Florida for allegedly operating Dark Web vendor “BarbaraWhite,” which sold counterfeit oxycodone M30 pills laced with highly potent nitazenes, synthetic opioids that can equal or surpass fentanyl’s potency.";

test("Chernyshov-style: a brother's 'naturalized U.S. citizen' does not hold the defendant", () => {
  assert.equal(citizenWordingAbout("Stanislav Chernyshov", CHERNYSHOV), false);
  assert.equal(citizenWordingAbout("Vladislav Chernyshov", CHERNYSHOV), true);
  assert.equal(nonCitizenStatedFor("Stanislav Chernyshov", CHERNYSHOV), true);
  assert.equal(nonCitizenStatedFor("Vladislav Chernyshov", CHERNYSHOV), false);
  assert.deepEqual(
    holdReasons({ name: "Stanislav Chernyshov", sentence: CHERNYSHOV, label: "Arrested" }).filter((x) => /non-citizen/.test(x)),
    [],
  );
  assert.ok(
    holdReasons({ name: "Vladislav Chernyshov", sentence: CHERNYSHOV, label: "Arrested" }).includes("not stated to be a non-citizen"),
  );
});

test("an unnamed 'his brother, a U.S. citizen' clause still does not hold the defendant", () => {
  const s =
    "Stanislav Chernyshov, 30, a Russian national illegally residing in the United States, and his brother, a naturalized U.S. citizen, were arrested in Florida.";
  assert.equal(nonCitizenStatedFor("Stanislav Chernyshov", s), true);
  assert.ok(!holdReasons({ name: "Stanislav Chernyshov", sentence: s, label: "Arrested" }).includes("not stated to be a non-citizen"));
});

test("a release that calls the defendant himself a U.S. citizen still holds him", () => {
  const avalos = "Efrain Antonio Avalos, a United States citizen, was arrested and charged with Transportation of Illegal Aliens.";
  assert.equal(nonCitizenStated(avalos), false);
  assert.equal(nonCitizenStatedFor("Efrain Antonio Avalos", avalos), false);
  assert.ok(holdReasons({ name: "Efrain Antonio Avalos", sentence: avalos, label: "Charged" }).includes("not stated to be a non-citizen"));
  assert.equal(nonCitizenStatedFor("John Doe", "John Doe, a U.S. citizen, was convicted of assault."), false);
  assert.equal(nonCitizenStatedFor("Juan Perez", "Juan Perez, 45, a U.S. citizen, was sentenced for smuggling illegal aliens."), false);
  assert.equal(citizenWordingAbout("Juan Carlos Perez", "Juan Carlos Perez, a U.S. citizen and former Mexican official, was charged."), true);
});

test("the live Chernyshov row now passes the guard on its own wording", () => {
  const feed = JSON.parse(readFileSync(new URL("../data/harvest.json", import.meta.url), "utf8"));
  const row = feed.find((r) => r.id === "doj-20261112-stanislav-chernyshov");
  assert.ok(row, "Stanislav Chernyshov is on the feed");
  assert.deepEqual(
    holdReasonsForRow(row).filter((x) => /non-citizen/.test(x)),
    [],
  );
});

test("place names do not steal attachment; 'not a United States citizen' still blocks the defendant", () => {
  const watson =
    "An indictment was returned by a grand jury in Louisville, Kentucky, charging a Canadian Citizen living in Louisville, Kentucky, with illegal voting by an alien in a federal election. According to the indictment, Sandra Madeline Watson, 59, on or about November 5, 2024, in Jefferson County, Kentucky, knowing she was not a United States citizen, voted in an election held for the purpose of electing a candidate for the office of the President.";
  assert.equal(nonCitizenStatedFor("Sandra Madeline Watson", watson), false);
  const kaur = "Amandeep Kaur, 30, an Indian national living in Rancho Palos Verdes and who is seeking to become a U.S. citizen, fraudulently registered to vote in December 2022 and voted in the November 2024 U.S. election.";
  assert.equal(nonCitizenStatedFor("Amandeep Kaur", kaur), false);
});

test("a co-defendant 'U.S. citizen' in the same sentence does not hold a named foreign national (Villanueva Javier)", () => {
  const s = "Last week, HSI San Juan arrested Modestina Villanueva Javier, a Dominican national and Erick Martinez Aulet, a U.S. citizen.";
  assert.equal(nonCitizenStatedFor("Modestina Villanueva Javier", s), true);
  assert.equal(nonCitizenStatedFor("Erick Martinez Aulet", s), false);
  assert.ok(!holdReasons({ name: "Modestina Villanueva Javier", sentence: s, label: "Arrested" }).includes("not stated to be a non-citizen"));
});

test("a later 'not a United States citizen' sentence still blocks the defendant (Sara Luma)", () => {
  const s = "Brad Schimel, First Assistant United States Attorney for the Eastern District of Wisconsin, announced that on September 30, 2026, Sara Luma, age 30, was charged with Unlawfully Voting as a Non-Citizen, contrary to Title 18, United States Code, Section 611. The criminal complaint alleges that Luma was born in North Macedonia and is a citizen of that country. She is not a United States citizen.";
  assert.equal(nonCitizenStatedFor("Sara Luma", s), false);
});
