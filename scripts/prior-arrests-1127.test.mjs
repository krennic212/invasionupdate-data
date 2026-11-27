// Extractor fixes 2026-11-27 (Bill's list): "on N occasions", "a prior arrest", "arrested twice-deported", "U.S." / "Nov." quotes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { priorFor, priorFromRelease, sentences } from "./prior-arrests.mjs";

const row = (name, text) => ({ id: `t-${name}`, name, text, crime: "" });

test("'arrested on N occasions' is a count", () => {
  assert.equal(priorFor(row("Jon Doe", "Jon Doe has been arrested on five occasions in New Jersey.")).priorArrests, 5);
  assert.equal(priorFor(row("Jon Doe", "Local police arrested him on 3 separate occasions for assault.")).priorArrests, 3);
  const p = priorFromRelease("ICE arrested Maria Lopez-Diaz Oct. 2. The NYPD arrested Lopez-Diaz on two prior occasions.", "Maria Lopez-Diaz");
  assert.equal(p.priorArrests, 2);
  assert.match(p.priorArrestsQuote, /on two prior occasions/);
});
test("'released ... on two occasions' stays a release, not an arrest", () => {
  const p = priorFor(row("Jon Doe", "The jail released Doe on two separate occasions."));
  assert.equal(p.priorArrests, null);
  assert.equal(p.priorReleases, 2);
});
test("'a prior arrest' is not counted as 1", () => {
  assert.equal(priorFor(row("Jon Doe", "Jon Doe has a prior arrest for DUI.")).priorArrests, null);
  assert.equal(priorFor(row("Jon Doe", "He had a previous arrest for theft.")).priorArrests, null);
});
test("'arrested twice-deported' is a removal count, not 2 arrests", () => {
  const p = priorFor(row("Juan Perez", "ICE arrested twice-deported Juan Perez, a criminal illegal alien from Mexico."));
  assert.equal(p.priorArrests, null);
  assert.equal(p.priorRemovals, 2);
  const q = priorFor(row("Juan Perez", "Officers arrested Juan Perez twice deported, in Dallas."));
  assert.equal(q.priorArrests, null);
  assert.equal(priorFor(row("Juan Perez", "Juan Perez was arrested twice in Dallas.")).priorArrests, 2);
});
test("sentences do not split after 'U.S.' or 'Nov.' so quotes stay whole", () => {
  assert.equal(sentences("He entered the U.S. Border Patrol arrested Figueroa three times between Nov. 2015 and Feb. 2019.").length, 1);
  const p = priorFromRelease("ICE arrested Moises Figueroa-Bonilla May 27. The U.S. Border Patrol later arrested Figueroa three times between Nov. 2015 and Feb. 2019.", "Moises Figueroa-Bonilla");
  assert.equal(p.priorArrests, 3);
  assert.match(p.priorArrestsQuote, /U\.S\. Border Patrol/);
  assert.equal(sentences("He was arrested. She was not.").length, 2);
});
test("'removed from the United States on three occasions' is a removal count", () => {
  const p = priorFor(row("Jon Doe", "Jon Doe was removed from the United States on three occasions, most recently in 2021."));
  assert.equal(p.priorRemovals, 3);
  assert.equal(p.priorArrests, null);
});
test("'a twice previously removed' and 'a three-time previously removed' are removal counts", () => {
  assert.equal(priorFor(row("Marcos Contreras-Lopez", "Marcos Contreras-Lopez, a twice previously removed criminal illegal alien from Mexico, was arrested in June.")).priorRemovals, 2);
  assert.equal(priorFor(row("Marcel Jordan Lopes Da Silva", "Meet Marcel Jordan Lopes Da Silva, a three-time previously removed criminal illegal alien from Brazil.")).priorRemovals, 3);
});
