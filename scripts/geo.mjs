#!/usr/bin/env node
/**
 * Map points for rows (Krennic 2026-10-27).
 *
 * Why rows in big cities had no point: lat/lon was only set when a row was first written. Rows seeded or placed before
 * their city was in scripts/city-geo.json, rows whose city was filled in later by hand, and places written as
 * "Chicago, Illinois" instead of the table's "Chicago, IL" were never looked up again. This step re-checks every row
 * with a stated place on every run:
 *   1. city-geo.json (exact, case-insensitive, or normalized "City, ST": parse.mjs cityGeoKey);
 *   2. a bare state name ("Idaho") -> the state's center, as for USAO district rows (parse.mjs geoForPlace);
 *   3. else the free OpenStreetMap Nominatim geocoder (no key; real User-Agent; at most 1 request per second), US only,
 *      and only a result in the SAME state and of a place / county type. Each hit is saved to city-geo.json (the cache);
 *      each miss to city-geo-misses.json (not asked again for 30 days).
 * Never guesses: a row with no stated place ("Not stated") stays off the map, and the city text is never changed.
 *
 *   node scripts/geo.mjs [data/harvest.json] [--offline]      (GEOCODE=0 = offline too)
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cityGeoKey, normalizePlace, rememberCityGeo, STATES, STATE_CENTER } from "./parse.mjs";

const GEO_FILE = new URL("./city-geo.json", import.meta.url);
const MISS_FILE = new URL("./city-geo-misses.json", import.meta.url);
export const USER_AGENT = "invasionupdate-data/1.0 (map points for a public data feed; https://github.com/krennic212/invasionupdate-data)";
const MISS_TTL_MS = 30 * 86400000;
const NO_PLACE = /^(?:not stated|unknown|n\/a|none|)$/i;
const STATE_NAME_OF = Object.fromEntries(Object.entries(STATES).map(([n, c]) => [c, n]));

const round = (x) => Math.round(Number(x) * 10000) / 10000;

/** Local answer for a place, or null: { lat, lon, key, how: "table" | "state" }. */
export function localGeo(city, table) {
  const c = String(city || "").trim();
  if (NO_PLACE.test(c)) return null;
  const key = cityGeoKey(c, table);
  if (key) return { lat: table[key][0], lon: table[key][1], key, how: "table" };
  const st = STATES[Object.keys(STATES).find((k) => k.toLowerCase() === c.toLowerCase())];
  if (st && STATE_CENTER[st]) return { lat: STATE_CENTER[st][0], lon: STATE_CENTER[st][1], key: c, how: "state" };
  return null;
}

/** "Anne Arundel, MD" -> { place: "Anne Arundel", st: "MD", stateName: "Maryland", county: false }; null when no state. */
export function splitPlace(city) {
  const n = normalizePlace(city);
  const m = n.match(/^(.+),\s*([A-Z]{2})$/);
  if (!m || !STATE_NAME_OF[m[2]]) return null;
  return { key: n, place: m[1].trim(), st: m[2], stateName: STATE_NAME_OF[m[2]], county: /\b(?:County|Parish|Borough)$/i.test(m[1]) };
}

const PLACE_TYPES = new Set(["city", "town", "village", "hamlet", "municipality", "suburb", "borough", "quarter", "neighbourhood", "city_district", "locality", "census-designated place", "county"]);

/** Nominatim lookups for one place, in order: as written (city or county), then as a county name when no city by that name exists. */
export function nominatimQueries(p) {
  const base = { state: p.stateName, country: "United States", format: "jsonv2", addressdetails: "1", limit: "3", countrycodes: "us" };
  if (p.county) return [{ ...base, county: p.place }];
  return [{ ...base, city: p.place }, { ...base, county: `${p.place} County` }];
}

/** Pick the first result in the right state and of a place / county type; null if none qualifies. */
const fold = (x) => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/^(?:city|town|village|township|borough) of\s+/, "").replace(/\bsaint\b/g, "st").replace(/\bst\.?(?=\s)/g, "st").replace(/\bfort\b/g, "ft").replace(/\bft\.?(?=\s)/g, "ft").replace(/[^a-z0-9]+/g, " ").trim();

export function acceptResult(results, p, wantCounty) {
  const want = fold(wantCounty && !p.county ? `${p.place} County` : p.place);
  for (const r of Array.isArray(results) ? results : []) {
    // Same name as the stated place (no fuzzy match to a different town).
    if (fold(r?.name) !== want) continue;
    const state = r?.address?.state || "";
    if (state.toLowerCase() !== p.stateName.toLowerCase()) continue;
    const type = String(r?.addresstype || r?.type || "").toLowerCase();
    if (wantCounty ? type !== "county" : !PLACE_TYPES.has(type) || type === "county") continue;
    const lat = round(r.lat);
    const lon = round(r.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    return { lat, lon, type, display: r.display_name || "" };
  }
  return null;
}

/** Geocoder with a 1 request / second limit. fetchJson(url) -> parsed JSON (injectable for tests). */
export function makeGeocoder({ fetchJson = defaultFetchJson, minGapMs = 1100, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  let last = 0;
  let calls = 0;
  async function get(params) {
    const wait = last + minGapMs - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    calls += 1;
    return fetchJson(`https://nominatim.openstreetmap.org/search?${new URLSearchParams(params)}`);
  }
  async function geocode(city) {
    const p = splitPlace(city);
    if (!p) return { miss: "no US state in the place text" };
    for (const q of nominatimQueries(p)) {
      const hit = acceptResult(await get(q), p, Boolean(q.county));
      if (hit) return { ...hit, key: p.key, viaCounty: Boolean(q.county) && !p.county };
    }
    return { miss: "geocoder found no place by that name in that state" };
  }
  return { geocode, calls: () => calls };
}

async function defaultFetchJson(url) {
  const res = await fetch(url, { headers: { "user-agent": USER_AGENT, accept: "application/json" }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`geocoder ${res.status}`);
  return res.json();
}

/**
 * Fill lat/lon on rows that have a stated place but no point. Returns { rows, table, misses, report }.
 * Rows without a stated place are never touched. Only lat / lon change.
 */
export async function fillGeo(rows, { table, misses = {}, geocoder = null, now = Date.now() } = {}) {
  const out = [];
  const report = { checked: 0, fromTable: [], fromState: [], fromGeocoder: [], stillMissing: [], noPlace: 0 };
  const newKeys = {};
  for (const r of rows) {
    if (!r || typeof r !== "object" || (r.lat != null && r.lon != null)) { out.push(r); continue; }
    const city = String(r.city || "").trim();
    if (NO_PLACE.test(city)) { report.noPlace += 1; out.push(r); continue; }
    report.checked += 1;
    let hit = localGeo(city, table);
    if (hit) (hit.how === "state" ? report.fromState : report.fromTable).push({ id: r.id, name: r.name, city });
    if (!hit) {
      const p = splitPlace(city);
      const key = p?.key || city;
      const m = misses[key];
      if (!p) {
        report.stillMissing.push({ id: r.id, name: r.name, city, reason: "place has no US state (cannot look it up without guessing)" });
      } else if (m && now - Date.parse(m.at) < MISS_TTL_MS) {
        report.stillMissing.push({ id: r.id, name: r.name, city, reason: `${m.reason} (cached ${m.at.slice(0, 10)})` });
      } else if (!geocoder) {
        report.stillMissing.push({ id: r.id, name: r.name, city, reason: "not in city-geo.json; geocoder off" });
      } else {
        let g;
        try {
          g = await geocoder.geocode(city);
        } catch (e) {
          g = { miss: `geocoder error: ${String(e?.message || e)}`, transient: true };
        }
        if (g.miss) {
          if (!g.transient) misses[key] = { at: new Date(now).toISOString(), reason: g.miss };
          report.stillMissing.push({ id: r.id, name: r.name, city, reason: g.miss });
        } else {
          table[key] = [g.lat, g.lon];
          newKeys[key] = [g.lat, g.lon];
          rememberCityGeo(key, g.lat, g.lon);
          delete misses[key];
          hit = { lat: g.lat, lon: g.lon, key, how: "geocoder" };
          report.fromGeocoder.push({ id: r.id, name: r.name, city, key, type: g.type, display: g.display });
        }
      }
    }
    out.push(hit ? { ...r, lat: hit.lat, lon: hit.lon } : r);
  }
  return { rows: out, table, misses, newKeys, report };
}

/** city-geo.json is one sorted line (same shape as the app's table). */
export function serializeTable(table) {
  const sorted = Object.fromEntries(Object.keys(table).sort().map((k) => [k, table[k]]));
  return JSON.stringify(sorted); // no trailing newline, as committed
}

/** Run on a rows file; writes rows / city-geo.json / city-geo-misses.json only when they change. */
export async function fillGeoFile(file = "data/harvest.json", { offline = false } = {}) {
  const before = readFileSync(file, "utf8");
  const rows = JSON.parse(before);
  const geoText = readFileSync(GEO_FILE, "utf8");
  const table = JSON.parse(geoText);
  const missText = existsSync(MISS_FILE) ? readFileSync(MISS_FILE, "utf8") : "{}\n";
  const misses = JSON.parse(missText);
  const geocoder = offline || process.env.GEOCODE === "0" ? null : makeGeocoder();
  const res = await fillGeo(rows, { table, misses, geocoder });
  const after = `${JSON.stringify(res.rows, null, 2)}\n`;
  if (after !== before) writeFileSync(file, after);
  const geoAfter = serializeTable(res.table);
  if (Object.keys(res.newKeys).length && geoAfter !== geoText) writeFileSync(GEO_FILE, geoAfter);
  const missAfter = `${JSON.stringify(Object.fromEntries(Object.keys(res.misses).sort().map((k) => [k, res.misses[k]])), null, 2)}\n`;
  if (missAfter !== missText) writeFileSync(MISS_FILE, missAfter);
  return { ...res.report, geocoderCalls: geocoder ? geocoder.calls() : 0, newCityGeo: res.newKeys, changed: after !== before };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const offline = args.includes("--offline");
  const file = args.find((a) => !a.startsWith("--")) || "data/harvest.json";
  const r = await fillGeoFile(file, { offline });
  console.log(JSON.stringify({
    file, checked: r.checked, fromTable: r.fromTable.length, fromState: r.fromState.length, fromGeocoder: r.fromGeocoder.length,
    geocoderCalls: r.geocoderCalls, newCityGeo: r.newCityGeo, stillMissing: r.stillMissing, noPlace: r.noPlace, changed: r.changed,
  }, null, 2));
}
