import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pruneReviewOfLive, nameKeysOf } from "./rules.mjs";

test("review: a person live in the feed is taken out of review.json (name + aka keys)", () => {
  const harvest = [
    { id: "doj-1", name: "Moises Anwar Arellano-Alba", status: "approved" },
    { id: "doj-2", name: "Julieta Engelstad", aka: "Julieta Englestad", status: "approved" },
    { id: "doj-3", name: "Held Person", status: "pending" },
  ];
  const review = [
    { id: "x1", name: "Moises Anwar Arellano‑Alba" },
    { id: "x2", name: "Julieta Englestad" },
    { id: "x3", name: "Held Person" },
    { id: "x4", name: "Someone Else" },
    { id: "x5", name: "Moises Anwar Arellano-Alba", approvalNote: "Krennic kept held" },
  ];
  const { review: out, removed, kept } = pruneReviewOfLive(harvest, review);
  assert.deepEqual(removed.map((r) => r.id), ["x1", "x2"]);
  assert.deepEqual(out.map((r) => r.id), ["x3", "x4", "x5"]);
  assert.deepEqual(kept.map((r) => r.id), ["x5"]);
});

test("review: data/review.json lists no one who is live (except rows with an approvalNote)", () => {
  const feed = JSON.parse(readFileSync(new URL("../data/harvest.json", import.meta.url), "utf8"));
  const review = JSON.parse(readFileSync(new URL("../data/review.json", import.meta.url), "utf8"));
  const { removed } = pruneReviewOfLive(feed, review);
  assert.deepEqual(removed, [], "run node scripts/dedupe.mjs data/harvest.json data/review.json");
  assert.ok(feed.length && nameKeysOf(feed[0]).length);
});

test("meta: npm test re-stamps harvest-meta.json first (pretest)", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.match(pkg.scripts.pretest, /write-meta\.mjs/);
  assert.match(pkg.scripts.harvest, /write-meta\.mjs/);
});
