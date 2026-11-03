// Krennic 2026-11-03 12:29 PM CT: "If he wasn't convicted for voting but he was convicted for something else, don't list him as voting."
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stageCrimeOf, cutVotingClauses, applyStageCrime } from "./stage-crime.mjs";
import { rowsFromRelease } from "./harvest.mjs";
import { holdReasonsForRow } from "./guards.mjs";

const DLR = "Julio De La Rosa, a criminal illegal alien from Mexico with a final order of removal who illegally voted in the 2020 election. De La Rosa has been convicted of strangulation, assault, violation of a court order and a probation violation.";
const NB = "Gerardo Nieves-Borja, a criminal illegal alien from Mexico who illegally voted in the 2024 election. Nieves-Borja has been charged with DUI.";

test("stage for another crime -> other; stage for the vote -> voting", () => {
  assert.equal(stageCrimeOf("Convicted", DLR).kind, "other");
  assert.equal(stageCrimeOf("Charged", NB).kind, "other");
  assert.equal(stageCrimeOf("Pleaded guilty", "Maksim Sergeevich Shakirov, 29, a citizen of Uzbekistan, pleaded guilty in federal court to one count of voting by an alien.").kind, "voting");
  assert.equal(stageCrimeOf("Charged", "Darwin Jonathan Rivera Flores, 30, of Winnetka, is charged with two felonies: false claim to U.S. citizenship and fraudulent voter registration.").kind, "voting");
  assert.equal(stageCrimeOf("Charged", "Jesus Javier Jurado Garcia, 25, an illegal alien from Mexico, was charged on Sept. 2, with illegally voting as an alien in the November 2022 election.").kind, "voting");
  assert.equal(stageCrimeOf("Arrested", DLR).kind, "none");
});

test("fraud-family or generic stage wording is unclear (held); a headline that puts the stage on the vote is voting", () => {
  const s = "An illegal alien from Mexico was sentenced yesterday to two years and nine months in prison for aggravated identity theft and making false statements in a passport application. Jose Maria Hernandez Bautista then used that fraudulent voter registration to vote in the 2016 and 2020 federal elections.";
  assert.equal(stageCrimeOf("Sentenced", s).kind, "unclear");
  assert.equal(stageCrimeOf("Sentenced", s, "Illegal alien from Mexico sentenced to over two years in prison after using a stolen identity to vote in U.S. elections").kind, "voting");
  assert.equal(stageCrimeOf("Charged", "Doe has been charged with federal crimes. Doe illegally voted in 2024.").kind, "unclear");
});

test("cutVotingClauses keeps the rest verbatim", () => {
  assert.equal(cutVotingClauses(NB), "Gerardo Nieves-Borja, a criminal illegal alien from Mexico […]. Nieves-Borja has been charged with DUI.");
  assert.match(cutVotingClauses(DLR), /^Julio De La Rosa, a criminal illegal alien from Mexico with a final order of removal \[…\]\. De La Rosa has been convicted of strangulation/);
  assert.equal(cutVotingClauses("For example, Martinez illegally registered to vote, and repeatedly voted in U.S. presidential elections, despite being unlawfully present in the United States."), "For example […], despite being unlawfully present in the United States.");
});

test("applyStageCrime untags voting and the row still passes Eagle's guards", () => {
  const r = { name: "Julio De La Rosa", crime: `Convicted: ${DLR}`, text: `ICE Oct 30, 2026, as posted: ${DLR}`, voting: true, origin: "Mexico", city: "Not stated", usa: "ICE release Oct 30, 2026: ICE continues to arrest dozens of illegal aliens in nationwide crackdown on voter fraud" };
  assert.deepEqual(applyStageCrime(r), { changed: true, hold: "" });
  assert.equal(r.voting, false);
  assert.ok(!/voted/.test(r.crime) && !/voted/.test(r.text));
  assert.match(r.crime, /^Convicted: .*convicted of strangulation/);
  assert.deepEqual(holdReasonsForRow(r), []);
});

test("harvester: ICE roundup entry convicted of another crime is listed, not as a voter", () => {
  const rel = { office: "ICEgov", url: "https://www.ice.gov/news/releases/test-roundup-stage", date: "2026-10-30", title: "ICE continues to arrest dozens of illegal aliens in nationwide crackdown on voter fraud", blocks: [DLR] };
  const { rows } = rowsFromRelease(rel, { have: new Set(), uniqueId: (id) => id });
  const r = rows.find((x) => x.name === "Julio De La Rosa");
  assert.ok(r, JSON.stringify(rows));
  assert.equal(r.voting, false);
  assert.match(r.crime, /^Convicted: .*\[…\].*strangulation/);
  for (const x of rows) if (x.voting) assert.notEqual(stageCrimeOf(x.crime.split(":")[0], x.crime).kind, "other");
});

test("live feed: no voting row whose stage is for another crime; the three fixed rows", () => {
  const feed = JSON.parse(readFileSync(new URL("../data/harvest.json", import.meta.url), "utf8"));
  for (const r of feed.filter((x) => x.voting && x.status === "approved")) {
    const i = r.crime.indexOf(":");
    assert.notEqual(stageCrimeOf(r.crime.slice(0, i), r.crime.slice(i + 1), String(r.usa || "").replace(/^[^:]*:\s*/, "")).kind, "other", r.name);
  }
  const by = (id) => feed.find((r) => r.id === id);
  for (const id of ["ice-20261030-julio-de-la-rosa", "ice-20261030-gerardo-nieves-borja", "doj-20250627-juan-arturo-martinez"]) {
    assert.equal(by(id).voting, false, id);
    assert.ok(!/illegally voted|registered to vote/.test(by(id).crime), id);
  }
  assert.equal(by("doj-20260709-jose-maria-hernandez-bautista").voting, true);
});
