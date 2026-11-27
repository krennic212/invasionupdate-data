// Krennic rule 2026-11-27: a source that lists dated removals without a total -> priorRemovals = number of distinct listed dates.
import { test } from "node:test";
import assert from "node:assert/strict";
import { priorFor, priorFromRelease, datedRemovalCount } from "./prior-arrests.mjs";

const row = (name, text) => ({ id: `t-${name}`, name, text, crime: "" });

test("full-date list is counted (EDLA Calix-Sarmiento wording)", () => {
  const t = "In addition, on or about August 28, 2026, CALIX-SARMIENTO, an alien, was found in the United States after having been deported and removed therefrom on or about August 27, 2013, February 11, 2014, and March 11, 2014, without the approval of the Attorney General.";
  const d = datedRemovalCount(t);
  assert.equal(d.n, 3);
  assert.match(d.quote, /August 27, 2013, February 11, 2014, and March 11, 2014/);
  assert.equal(priorFromRelease(t, "Lesli Joel Calix-Sarmiento").priorRemovals, 3);
});
test("year lists, semicolons and 'again in' are counted", () => {
  assert.equal(priorFor(row("Omar Ruiz", "He was removed in 2011, 2019, and 2023.")).priorRemovals, 3);
  assert.equal(priorFor(row("Carlos Altunar-Rueda", "Altunar-Rueda was deported from the United States in 2013 and again in 2019.")).priorRemovals, 2);
  assert.equal(datedRemovalCount("previously removed on October 17, 2013; April 12, 2013; September 6, 2012; January 12, 2005; and July 5, 2000").n, 5);
  assert.equal(datedRemovalCount("deported from the United States on June 7, 1995, and Sept. 8, 2007").n, 2);
});
test("a stated total wins over the dated list", () => {
  assert.equal(priorFor(row("Jon Doe", "Doe was removed twice, in 2010 and 2012, and once more in 2015.")).priorRemovals, 2);
});
test("not counted: one date, orders, voluntary returns, or entry dates", () => {
  assert.equal(datedRemovalCount("He was removed on May 5, 2010."), null);
  assert.equal(datedRemovalCount("A judge ordered him removed on May 5, 2010 and June 1, 2012."), null);
  assert.equal(datedRemovalCount("He was deported in 2014 and reentered in 2016."), null);
  assert.equal(priorFor(row("Jon Doe", "In 1999, on four separate occasions, he entered and was granted a voluntary return to Mexico.")).priorRemovals, null);
  assert.equal(priorFor(row("Jon Doe", "Doe was deported on September 30.")).priorRemovals, null);
});
test("duplicate dates count once", () => {
  assert.equal(datedRemovalCount("He was removed in 2010, 2010 and 2012.").n, 2);
});
