// 2026-10-20 (9:46 AM CDT) Krennic: voting rows get a state from the USAO district when the sentence names no "City, ST".
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extractPeople, toRow, placeFromDistrict, stateFromUsao, VOTING } from "./parse.mjs";

const feed = JSON.parse(readFileSync(new URL("../data/harvest.json", import.meta.url), "utf8"));
const CDCA = { office: "TheJusticeDept", url: "https://www.justice.gov/usao-cdca/pr/11-foreign-nationals-arrested-california-federal-charges-alleging-they-illegally", date: "2026-10-19", title: "11 Foreign Nationals Arrested in California" };

test("USAO district -> state code", () => {
  assert.equal(stateFromUsao("https://www.justice.gov/usao-ndtx/pr/x"), "TX");
  assert.equal(stateFromUsao("https://www.justice.gov/usao-mn/pr/x"), "MN");
  assert.equal(stateFromUsao("https://www.justice.gov/usao-dc/pr/x"), "DC");
  assert.equal(stateFromUsao("https://www.justice.gov/opa/pr/x"), "");
  assert.equal(stateFromUsao("https://www.dhs.gov/news/x"), "");
});

test("locality the release gives + district state", () => {
  assert.equal(placeFromDistrict("Butleng Taing, 43, a Cambodian national living in Long Beach, fraudulently registered to vote", CDCA.url), "Long Beach, CA");
  assert.equal(placeFromDistrict("Muhammad Khan, 50, a Pakistani national and Anaheim resident, submitted a provisional ballot", CDCA.url), "Anaheim, CA");
  assert.equal(placeFromDistrict("Sanata Coulibaly, 64, of Hudson County voted", "https://www.justice.gov/usao-nj/pr/x"), "Hudson County, NJ");
  assert.equal(placeFromDistrict("Paul Kras, 78, a German national, voted illegally as an alien.", "https://www.justice.gov/usao-mn/pr/x"), "Minnesota");
  assert.equal(placeFromDistrict("Someone voted.", "https://www.dhs.gov/news/x"), "");
});

test("a new voting row from a USAO release is never 'Not stated'", () => {
  const s = "Paul Kras, 78, a German national, on one count of voting by alien.";
  const [h] = extractPeople([s]);
  assert.ok(h, "person found");
  const row = toRow(h, { ...CDCA, url: "https://www.justice.gov/usao-mn/pr/federal-grand-jury-indicts-ten-foreign-nationals-voter-fraud-minnesota-elections" });
  assert.equal(row.voting, true);
  assert.equal(row.city, "Minnesota");
  assert.equal(row.lat, 46.7296);
  assert.equal(row.lon, -94.6859);
});

test("an 'in X, ST' place in the sentence still wins", () => {
  const s = "Pauline Lewis, 65, of Dawsonville, Georgia, a suspected illegal alien from Antigua and Barbuda, was arrested on a criminal complaint charging her with voting as a non-citizen in a federal election.";
  const [h] = extractPeople([s]);
  assert.equal(toRow(h, { ...CDCA, url: "https://www.justice.gov/usao-ndga/pr/x" }).city, "Dawsonville, GA");
});

test("voting wording: provisional ballot, false claim of citizenship in order to vote, when he voted", () => {
  assert.ok(VOTING.test("submitted a provisional ballot in 2020"));
  assert.ok(VOTING.test("charged on one count of making a false claim of citizenship in order to vote"));
  assert.ok(VOTING.test("for falsely claiming to be a United States citizen when he voted"));
  assert.ok(!VOTING.test("convicted of wire fraud and money laundering"));
});

test("live feed: every voting row has a place, no voter listed twice", () => {
  const norm = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
  const seen = new Set();
  for (const r of feed.filter((r) => r.voting && r.status === "approved")) {
    assert.notEqual(r.city, "Not stated", r.name);
    const k = norm(r.name);
    assert.ok(!seen.has(k), `duplicate voter ${r.name}`);
    seen.add(k);
  }
});
