import { test } from "node:test";
import assert from "node:assert/strict";
import { extractOperation, operationRow } from "./operations.mjs";

test("extracts an arrest total and ignores a sentence count", () => {
  const found = extractOperation("Authorities arrested 82 illegal aliens during the three-day operation. He was convicted of two counts of assault.");
  assert.equal(found.total, 82);
  assert.match(found.sentence, /82 illegal aliens/);
});

test("extracts a 'were arrested' total", () => {
  const found = extractOperation("In total, 118 illegal aliens were arrested during the four-day operation.");
  assert.equal(found.total, 118);
});

test("ignores a small number and a years sentence", () => {
  assert.equal(extractOperation("He was sentenced to 22 years. ICE arrested 2 illegal aliens."), null);
});

test("builds a heads row for the unnamed remainder and skips a known release", () => {
  const rel = {
    url: "https://www.ice.gov/news/releases/ice-boston-arrests-82-illegal-aliens-during-3-day-operation-massachusetts",
    title: "ICE Boston arrests 82 illegal aliens during 3-day operation in Massachusetts",
    date: "2026-10-19",
    office: "ICEgov",
    blocks: ["Authorities arrested 82 illegal aliens during the three-day operation in southeastern Massachusetts."],
  };
  const row = operationRow(rel, 7, []);
  assert.equal(row.heads, 75);
  assert.equal(row.posted, 82);
  assert.equal(row.photo, "");
  assert.match(row.name, /operation/);
  assert.equal(operationRow(rel, 7, [row]), null);
});

test("catches a noncitizen count, a have-been count, and a named operation", () => {
  assert.equal(extractOperation("Officers arrested 13 noncitizens during the action.").total, 13);
  assert.equal(extractOperation("13 individuals have been arrested in the last week.").total, 13);
  const named = extractOperation("DHS announced Operation Southbound Takedown on October 26.");
  assert.equal(named.namedOnly, true);
  assert.equal(named.name, "Operation Southbound Takedown");
  assert.equal(named.total, 0);
  assert.equal(extractOperation("notifications via the Joint Intake Operation Center."), null);
  assert.equal(extractOperation("Joint Intake Operation Center."), null);
  const take = extractOperation("This case is part of Operation Take Back America. This case continues.");
  assert.equal(take.name, "Operation Take Back America");
  const glued = extractOperation("Operation Take Back America This case is part of Operation Take Back America, a nationwide initiative.");
  assert.equal(glued.name, "Operation Take Back America");
  const tios = extractOperation("Operation Los Tíos sends a clear message.");
  assert.equal(tios.name, "Operation Los Tíos");
  assert.equal(extractOperation("these cryptocurrency seizure matters are handled by the Global Investigative Operation Center and Field Offices."), null);
});
test("skips a release that names almost everyone", () => {
  const rel = {
    url: "https://www.ice.gov/news/releases/example",
    title: "ICE arrests 12",
    date: "2026-10-19",
    office: "ICEgov",
    blocks: ["ICE arrested 12 illegal aliens during the operation."],
  };
  assert.equal(operationRow(rel, 11, []), null);
});
