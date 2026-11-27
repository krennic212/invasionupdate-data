import test from "node:test";
import assert from "node:assert/strict";
import { orderFor, orderDateIn, isoOf, fillOrder, orderProblems } from "./removal-order.mjs";

test("isoOf keeps the stated precision", () => {
  assert.equal(isoOf("February 3, 2020"), "2020-02-03");
  assert.equal(isoOf("Oct. 14, 2014"), "2014-10-14");
  assert.equal(isoOf("March 2019"), "2019-03");
  assert.equal(isoOf("2018"), "2018");
  assert.equal(isoOf("Smarch 2019"), null);
});

test("order dates in the common official phrasings", () => {
  assert.equal(orderDateIn("On April 1, ICE lodged a detainer and shared that he was issued a final order of removal on February 3, 2020.").date, "2020-02-03");
  assert.equal(orderDateIn("He has a 2018 final removal order and was previously deported from the U.S. three times!").date, "2018");
  assert.equal(orderDateIn("He has previously been deported THREE times, in 2014, 2015, and 2017, after a DOJ Immigration Judge issued Carrasco-Polanco a final order of removal on October 14, 2014.").date, "2014-10-14");
  assert.equal(orderDateIn("An immigration judge ordered him removed to Mexico in March 2019.").date, "2019-03");
  assert.equal(orderDateIn("In 2016, an immigration judge ordered him deported.").date, "2016");
  assert.equal(orderDateIn("This criminal illegal alien was issued a final order of removal by an immigration judge in 2018 and removed on March 9, 2018.").date, "2018");
});

test("no date, or a date for another event, gives null", () => {
  assert.equal(orderDateIn("He has a final order of removal and remains in ICE custody."), null);
  assert.equal(orderDateIn("He was removed in 2019 and re-entered the U.S. a third time."), null);
  assert.equal(orderDateIn("He was ordered removed and was then arrested in 2021."), null);
});

test("only this person's sentences are read on a multi-person release", () => {
  const rel = "Juan Uno, a citizen of Mexico, was issued a final order of removal on May 5, 2015. Pedro Dos, a citizen of Honduras, was arrested.";
  assert.equal(orderFor(rel, "Pedro Dos", ["Juan Uno"]), null);
  assert.equal(orderFor(rel, "Juan Uno", ["Pedro Dos"]).date, "2015-05-05");
});

test("fillOrder never overwrites and skips approvalNote rows", () => {
  const f = { date: "2018", quote: "a 2018 final removal order" };
  const a = { name: "A", orderedRemovedDate: "2017", orderedRemovedQuote: "q", orderedRemovedSource: "https://x.com/ICEgov/status/1" };
  assert.equal(fillOrder(a, f, "https://x.com/ICEgov/status/2"), false);
  assert.equal(a.orderedRemovedDate, "2017");
  assert.equal(fillOrder({ name: "B", approvalNote: "Krennic" }, f, "https://x.com/ICEgov/status/2"), false);
  const c = { name: "C" };
  assert.equal(fillOrder(c, f, "https://x.com/ICEgov/status/2"), true);
  assert.deepEqual(orderProblems(c), []);
});

test("validate rules for the optional fields", () => {
  assert.deepEqual(orderProblems({ name: "none" }), []);
  assert.deepEqual(orderProblems({ name: "n", orderedRemovedDate: null, orderedRemovedQuote: null, orderedRemovedSource: null }), []);
  assert.equal(orderProblems({ name: "bad", orderedRemovedDate: "May 2019", orderedRemovedQuote: "q", orderedRemovedSource: "https://a" }).length, 1);
  assert.equal(orderProblems({ name: "noq", orderedRemovedDate: "2019", orderedRemovedSource: "https://a" }).length, 1);
  assert.equal(orderProblems({ name: "nosrc", orderedRemovedDate: "2019", orderedRemovedQuote: "q" }).length, 1);
});
