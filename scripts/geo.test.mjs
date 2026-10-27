import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizePlace, cityGeoKey, latLonFor } from "./parse.mjs";
import { localGeo, splitPlace, acceptResult, fillGeo, makeGeocoder, nominatimQueries, serializeTable } from "./geo.mjs";

const table = { "Chicago, IL": [41.86, -87.65], "Washington, D.C.": [38.91, -77.04] };

test("geo: place spellings normalize to the table key (the Chicago bug)", () => {
  assert.equal(normalizePlace("Chicago, Illinois"), "Chicago, IL");
  assert.equal(normalizePlace("Chicago, Ill."), "Chicago, IL");
  assert.equal(normalizePlace("chicago, il"), "chicago, IL");
  assert.equal(normalizePlace("Not stated"), "");
  assert.equal(cityGeoKey("Chicago, Illinois", table), "Chicago, IL");
  assert.equal(cityGeoKey("CHICAGO, IL", table), "Chicago, IL");
  assert.equal(cityGeoKey("Washington, D.C.", table), "Washington, D.C.");
  assert.deepEqual(latLonFor("Chicago, Illinois"), latLonFor("Chicago, IL"));
  assert.notEqual(latLonFor("Chicago, IL").lat, null);
});

test("geo: a bare state is its center; no stated place stays off the map", () => {
  assert.equal(localGeo("Idaho", table).how, "state");
  assert.equal(localGeo("Not stated", table), null);
  assert.equal(localGeo("", table), null);
});

test("geo: fillGeo fills from the table, never touches rows without a place or with a point", async () => {
  const rows = [
    { id: "a", city: "Chicago, Illinois", lat: null, lon: null },
    { id: "b", city: "Not stated", lat: null, lon: null },
    { id: "c", city: "Chicago, IL", lat: 1, lon: 2 },
    { id: "d", city: "Somewhere", lat: null, lon: null },
  ];
  const { rows: out, report } = await fillGeo(rows, { table: { ...table }, geocoder: null });
  assert.deepEqual([out[0].lat, out[0].lon], [41.86, -87.65]);
  assert.equal(out[1].lat, null);
  assert.deepEqual([out[2].lat, out[2].lon], [1, 2]);
  assert.equal(out[3].lat, null);
  assert.equal(report.noPlace, 1);
  assert.equal(report.stillMissing.find((m) => m.id === "d").reason.includes("no US state"), true);
});

test("geo: geocoder fallback caches a same-state, same-name hit and records misses", async () => {
  const asked = [];
  const fetchJson = async (url) => {
    asked.push(url);
    const q = new URL(url).searchParams;
    if (q.get("city") === "Aberdeen" && q.get("state") === "Idaho") {
      return [
        { name: "Aberdeen", lat: "46.98", lon: "-123.8", addresstype: "city", address: { state: "Washington" } },
        { name: "Aberdeen", lat: "42.9445915", lon: "-112.838322", addresstype: "city", address: { state: "Idaho" }, display_name: "Aberdeen, Bingham County, Idaho" },
      ];
    }
    if (q.get("county") === "Buena Vista County") return [{ name: "Buena Vista County", lat: "42.7445814", lon: "-95.1127525", addresstype: "county", address: { state: "Iowa" } }];
    return [];
  };
  const slept = [];
  const geocoder = makeGeocoder({ fetchJson, minGapMs: 1000, sleep: async (ms) => { slept.push(ms); } });
  const t = { ...table };
  const misses = {};
  const rows = [
    { id: "p", city: "Aberdeen, ID", lat: null, lon: null },
    { id: "q", city: "Buena Vista County, IA", lat: null, lon: null },
    { id: "r", city: "Nowhereville, TX", lat: null, lon: null },
    { id: "s", city: "Aberdeen, ID", lat: null, lon: null },
  ];
  const res = await fillGeo(rows, { table: t, misses, geocoder, now: Date.parse("2026-10-27T15:00:00Z") });
  assert.deepEqual([res.rows[0].lat, res.rows[0].lon], [42.9446, -112.8383]);
  assert.deepEqual(t["Aberdeen, ID"], [42.9446, -112.8383]);
  assert.deepEqual(t["Buena Vista County, IA"], [42.7446, -95.1128]);
  assert.equal(res.rows[2].lat, null);
  assert.ok(misses["Nowhereville, TX"]);
  // The 2nd Aberdeen row comes from the cache (no new request): 1 + 1 + 2 requests.
  assert.equal(geocoder.calls(), 4);
  assert.deepEqual([res.rows[3].lat, res.rows[3].lon], [42.9446, -112.8383]);
  assert.ok(asked.every((u) => u.startsWith("https://nominatim.openstreetmap.org/search?")));
  // At most one request per second.
  assert.ok(slept.length >= 2);
  // A cached miss is not asked again.
  const again = await fillGeo([{ id: "r", city: "Nowhereville, TX", lat: null, lon: null }], { table: t, misses, geocoder, now: Date.parse("2026-10-28T15:00:00Z") });
  assert.equal(geocoder.calls(), 4);
  assert.match(again.report.stillMissing[0].reason, /cached/);
});

test("geo: results in another state or with another name are rejected", () => {
  const p = splitPlace("Albany, NY");
  assert.equal(acceptResult([{ name: "Albany", lat: "42.6", lon: "-73.7", addresstype: "city", address: { state: "Georgia" } }], p, false), null);
  assert.equal(acceptResult([{ name: "Albany Park", lat: "42.6", lon: "-73.7", addresstype: "suburb", address: { state: "New York" } }], p, false), null);
  assert.ok(acceptResult([{ name: "City of Albany", lat: "42.65", lon: "-73.75", addresstype: "city", address: { state: "New York" } }], p, false));
  assert.equal(nominatimQueries(splitPlace("Cumberland County, NC")).length, 1);
});

test("geo: city-geo.json stays one sorted line", () => {
  const text = readFileSync(new URL("./city-geo.json", import.meta.url), "utf8");
  assert.equal(serializeTable(JSON.parse(text)), text);
});
