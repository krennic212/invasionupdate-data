import test from "node:test";
import assert from "node:assert/strict";
import { nameKeysOf } from "./rules.mjs";

test("nameKeysOf: name plus a.k.a. (accents folded), so an alias is never added twice", () => {
  const row = { name: "Verónica Bullene", aka: "Verónica Hernández Martínez" };
  assert.deepEqual(nameKeysOf(row), ["veronica bullene", "veronica hernandez martinez"]);
  assert.ok(nameKeysOf({ name: "Veronica Hernandez Martinez" }).some((k) => nameKeysOf(row).includes(k)));
});

test("nameKeysOf: array aka and missing aka", () => {
  assert.deepEqual(nameKeysOf({ name: "A B", aka: ["C D", ""] }), ["a b", "c d"]);
  assert.deepEqual(nameKeysOf({ name: "A B" }), ["a b"]);
});
