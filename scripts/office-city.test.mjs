import { test } from "node:test";
import assert from "node:assert/strict";
import { cityForOffice, fillCity } from "./office-city.mjs";

test("field office maps to its city", () => {
  assert.equal(cityForOffice("EROPhiladelphia"), "Philadelphia, PA");
  assert.equal(cityForOffice("@EROBoston"), "Boston, MA");
  assert.equal(cityForOffice("ERO__Phoenix"), "Phoenix, AZ");
  assert.equal(cityForOffice("EroHarlingen"), "Harlingen, TX");
});

test("national accounts do not get a city", () => {
  assert.equal(cityForOffice("ICEgov"), "");
  assert.equal(cityForOffice("DHSgov"), "");
  assert.equal(cityForOffice("TheJusticeDept"), "");
  assert.equal(cityForOffice("NYP"), "");
  assert.equal(cityForOffice("HSI_HQ"), "");
});

test("fills only an empty city", () => {
  assert.equal(fillCity({ city: "Not stated", office: "EROPhiladelphia" }).city, "Philadelphia, PA");
  assert.equal(fillCity({ city: "", office: "EROMiami" }).city, "Miami, FL");
  assert.equal(fillCity({ city: "Waltham, MA", office: "EROBoston" }).city, "Waltham, MA");
  assert.equal(fillCity({ city: "Not stated", office: "ICEgov" }).city, "Not stated");
});
