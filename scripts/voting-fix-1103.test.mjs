// Krennic 2026-11-03 approved fixes: status-first and "Name (75)," name reader, stated non-citizen wording,
// stolen-identity victim citizenship, and voting rows with no city shown (pinned to a named state, else no pin).
import test from "node:test";
import assert from "node:assert/strict";
import { extractPeople } from "./parse.mjs";
import { nonCitizenStated, nonCitizenStatedFor, holdReasonsForRow } from "./guards.mjs";
import { rowsFromRelease } from "./harvest.mjs";
import { stateInSentence, placeVotingByState } from "./voting-state.mjs";

const people = (text, title = "") => extractPeople([text], { title });

test("status before the name: A native and citizen of the Philippines, NAME, 45,", () => {
  const p = people("TULSA, Okla. – A native and citizen of the Philippines, Maria Elenor Lopez Rios, 45, and a lawful permanent resident of the United States, has been charged with voting by an alien.");
  const hit = p.find((x) => x.name === "Maria Elenor Lopez Rios");
  assert.ok(hit, JSON.stringify(p));
  assert.equal(hit.origin, "Philippines");
});

test("Name (75), a Canadian national", () => {
  const p = people("Christiane Vinette Young (75), a Canadian national illegally present in the United States, was charged with voting by an alien.");
  const hit = p.find((x) => x.name === "Christiane Vinette Young");
  assert.ok(hit, JSON.stringify(p));
  assert.equal(hit.origin, "Canada");
});

test("status-first pattern does not read a place or a non-name", () => {
  assert.equal(people("A citizen of Mexico, who was not named, 45, was charged.").length, 0);
});

test("no United States citizenship / not a citizen of the United States count as stated status", () => {
  assert.equal(nonCitizenStated("Kimberly Price, with no United States citizenship, voted in the 2024 election."), true);
  assert.equal(nonCitizenStated("He has no U.S. citizenship and voted."), true);
  assert.equal(nonCitizenStated("Doe is not a citizen of the United States and voted in 2020."), true);
});

test("U.S. citizen as the stolen identity's victim does not block; own U.S. citizenship still does", () => {
  const s = "Gregory Allan Porter, a Canadian citizen, assumed the identity of “Tony Wayne Ortiz,” an American citizen, and voted.";
  assert.equal(nonCitizenStated(s), true);
  assert.equal(nonCitizenStatedFor("Gregory Allan Porter", s), true);
  assert.equal(nonCitizenStated("Fernandez Guzman is a Dominican national that stole the identity of a U.S. citizen to obtain SNAP."), true);
  assert.equal(nonCitizenStated("John Doe, a U.S. citizen, used the identity of a U.S. citizen."), false);
  assert.equal(nonCitizenStated("Jane Roe, a United States citizen, was charged."), false);
});

test("stateInSentence: one named state only", () => {
  assert.equal(stateInSentence("according to the Minnesota Secretary of State, voted in person"), "Minnesota");
  assert.equal(stateInSentence("voted in 2022 and 2024 in Missouri"), "Missouri");
  assert.equal(stateInSentence("an illegal alien from Mexico who voted"), "");
  assert.equal(stateInSentence("with no legal basis to remain in the United States"), "");
  assert.equal(stateInSentence("voted in Texas and Ohio"), "");
});

test("placeVotingByState pins to the state or leaves no pin; never touches a real city", () => {
  const a = placeVotingByState({ city: "Not stated", crime: "Arrested: X, a citizen of Somalia, according to the Minnesota Secretary of State, voted." });
  assert.equal(a.city, "Minnesota");
  assert.ok(Number.isFinite(a.lat) && Number.isFinite(a.lon));
  const b = placeVotingByState({ city: "Not stated", crime: "Arrested: Mai Tran, a criminal illegal alien from Vietnam who illegally voted in the 2024 election." });
  assert.equal(b.city, "Not stated");
  assert.equal(b.lat, null);
  const c = placeVotingByState({ city: "Syracuse, NY", lat: 1, lon: 2, crime: "Charged: in Ohio" });
  assert.equal(c.city, "Syracuse, NY");
});

test("ICE roundup voting row with no city is shown, not held for no city", () => {
  const rel = {
    office: "ICEgov",
    url: "https://www.ice.gov/news/releases/test-voter-roundup",
    date: "2026-11-02",
    title: "ICE arrests illegal aliens who voted",
    blocks: ["Jose Diaz Guandique, a citizen of El Salvador, is an illegal alien who voted in the 2024 election and was apprehended in October."],
  };
  const { rows } = rowsFromRelease(rel, { have: new Set(), uniqueId: (id) => id });
  const r = rows.find((x) => x.name === "Jose Diaz Guandique");
  assert.ok(r, JSON.stringify(rows));
  assert.ok(!/no city/.test(r.holdReason || ""), r.holdReason);
  assert.equal(r.city, "Not stated");
});

test("guards still apply: a U.S. citizen voting row stays held", () => {
  const r = { name: "Jane Roe", crime: "Charged: Jane Roe, a United States citizen, voted twice in the 2024 election.", voting: true, city: "Not stated", origin: "", status: "pending" };
  assert.ok(holdReasonsForRow(r).length > 0);
});
