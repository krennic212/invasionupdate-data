import test from "node:test";
import assert from "node:assert/strict";
import { enteredFromText } from "./entered.mjs";

test("copies a stated entry date and does not invent", () => {
  assert.equal(enteredFromText("He entered the United States illegally in March 2005."), "Entered illegally March 2005, as posted.");
  assert.equal(enteredFromText("Illegal alien from Mexico convicted of murder."), "Not stated");
  assert.equal(enteredFromText("She entered a plea of guilty to wire fraud."), "Not stated");
});

test("LPR, visa, and prior removal stay in the source's words", () => {
  assert.equal(enteredFromText("He is a lawful permanent resident of the United States."), "LPR as posted. LPR is not illegally present.");
  assert.match(enteredFromText("B-2 visitor visa, Boston Logan, March 18, 2015."), /B-2 visitor visa/i);
  assert.equal(
    enteredFromText("An immigration judge ordered him removed on February 2, 2012."),
    "Previously removed February 2, 2012; reentry date not stated, as posted.",
  );
});

test("a removal date and a crime word are not an entry", () => {
  assert.equal(enteredFromText("Deported on October 27, 2026."), "Not stated");
  assert.equal(enteredFromText("He was charged with green card fraud."), "Not stated");
  assert.equal(
    enteredFromText("Ana entered the United States illegally in March 2005. Ben was arrested the next day.", "Ben"),
    "Not stated",
  );
  assert.match(
    enteredFromText("Ana entered the United States illegally in March 2005. Ben was arrested the next day.", "Ana"),
    /March 2005/,
  );
});
