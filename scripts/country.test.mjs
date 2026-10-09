import test from "node:test";
import assert from "node:assert/strict";
import { countryFor } from "./country.mjs";
import { extractPeople } from "./parse.mjs";
import { scan, normalizePosts } from "./x-scan.mjs";

test("country: wording tied to the person fills the country", () => {
  assert.equal(countryFor("Ronald Zacarias-Gregorio", "ICE Seattle arrested illegal alien Ronald Zacarias-Gregorio, 36, of Guatemala."), "Guatemala");
  assert.equal(countryFor("David Ramos-Granados", "Arizona families are safer following the arrest of David Ramos-Granados, a criminal illegal alien from Mexico convicted of felony indecent exposure."), "Mexico");
  assert.equal(countryFor("John Doe", "John Doe, 45, a Mexican national, was charged with fraud."), "Mexico");
  assert.equal(countryFor("Juan Perez Lara", "Honduran national Juan Perez Lara, 30, pleaded guilty."), "Honduras");
  assert.equal(countryFor("Binghui Liu", "A Chinese national, Binghui Liu, pled guilty to money laundering."), "China");
  assert.equal(countryFor("Jerson Diaz-Diaz", "Jerson Diaz-Diaz, a 22-year-old illegal alien from Honduras, was arrested."), "Honduras");
  assert.equal(countryFor("Andre’s Garcia", "Andre’s Garcia, 64, a lawful permanent resident from Cuba, was arrested today."), "Cuba");
  assert.equal(countryFor("Zinzun Bautista", "ERO arrested and deported criminal illegal alien from Mexico, Zinzun Bautista."), "Mexico");
  assert.equal(countryFor("Mario Cesar Dos Santos Jr.", "Thanks to DHS, Mario Cesar Dos Santos Jr. of Brazil, faces decades in prison."), "Brazil");
  assert.equal(countryFor("Jae Lee", "ICE arrested Jae Lee, an illegal alien offender from South Korea, in Hagerstown, Maryland."), "South Korea");
  assert.equal(countryFor("Jose Omar Sanchez Castro", "ICE placed a detainer on Jose Omar Sanchez Castro, a criminal illegal alien from El Salvador."), "El Salvador");
});

test("country: not stated, a US place, a removal destination or someone else's country stays empty", () => {
  assert.equal(countryFor("John Doe", "ICE arrested John Doe, 30, of Seattle, for robbery."), "");
  assert.equal(countryFor("John Doe", "ICE arrested John Doe from Mexico City for robbery."), "");
  assert.equal(countryFor("Damil Emilia Mercedes-Silven", "ICE arrested Damil Emilia Mercedes-Silven upon her release and deported her home to the Dominican Republic."), "");
  assert.equal(countryFor("Luis Alfonso Garcia-Jimenez", "ICE arrests criminal illegal alien charged with felony sex crimes in Virginia. Luis Alfonso Garcia-Jimenez is a suspected sexual predator."), "");
  // co-defendant: the country belongs to the first person only
  const s = "ICE arrested Pedro Gomez Ruiz, 30, of Mexico, and Mario Lopez Diaz, 41, for robbery.";
  assert.equal(countryFor("Pedro Gomez Ruiz", s), "Mexico");
  assert.equal(countryFor("Mario Lopez Diaz", s), "");
  assert.equal(countryFor("Carlos Mendez", "Carlos Mendez, wanted in Ecuador for murder, was arrested."), "");
  // two different countries for one name -> unsure -> empty
  assert.equal(countryFor("Ana Ruiz", "Ana Ruiz, of Mexico, was arrested. Records show Ana Ruiz, a citizen of Peru, used an alias."), "");
});

test("extractor: ICE wording 'arrested illegal alien <Name>, <age>, of <Country>' finds the person with country", () => {
  assert.deepEqual(
    extractPeople(["ICE Seattle arrested illegal alien Ronald Zacarias-Gregorio, 36, of Guatemala. Was arrested in Marysville, WA, for mfr/deliver of amphetamine/meth."]).map((p) => [p.name, p.origin]),
    [["Ronald Zacarias-Gregorio", "Guatemala"]],
  );
  assert.deepEqual(extractPeople(["🚨ICE Los Angeles arrested criminal illegal alien Tung Huy Nguyen, 52, of Vietnam, Sep. 29."]).map((p) => [p.name, p.origin]), [["Tung Huy Nguyen", "Vietnam"]]);
  assert.deepEqual(extractPeople(["ICE San Francisco arrested criminal alien Tommy Ernesto Alas-Pocasangre, 30, of El Salvador, in Roseville. He has convictions for conspiracy."]).map((p) => [p.name, p.origin]), [["Tommy Ernesto Alas-Pocasangre", "El Salvador"]]);
  assert.deepEqual(extractPeople(["ERO Boston arrested illegal alien Pedro Gomez Ruiz in Lowell for robbery."]).map((p) => [p.name, p.origin]), [["Pedro Gomez Ruiz", ""]]);
  // a place right after "alien" is never a person
  assert.deepEqual(extractPeople(["ICE arrested illegal alien New York residents last week in a sweep of several neighborhoods."]).map((p) => p.name), []);
});

test("x-scan: the @EROSeattle post goes live by itself with country Guatemala (no hand pick)", () => {
  const posts = normalizePosts([{ id: "2108663800823971854", username: "EROSeattle", created_at: "2026-10-09T21:10:00Z",
    text: "ICE Seattle arrested illegal alien Ronald Zacarias-Gregorio, 36, of Guatemala. Was arrested in Marysville, WA, for mfr/deliver of amphetamine/meth. Will remain in ICE custody pending immigration proceedings." }]);
  const { live } = scan(posts, { existing: [] });
  assert.deepEqual(live.map((r) => [r.name, r.origin, r.status]), [["Ronald Zacarias-Gregorio", "Guatemala", "approved"]]);
  assert.match(live[0].crime, /^Arrested: ICE Seattle arrested illegal alien Ronald Zacarias-Gregorio, 36, of Guatemala\./);
});
