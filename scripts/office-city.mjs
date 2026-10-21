/**
 * City for a location-based office when the release names no place.
 * National accounts (ICEgov, DHSgov, TheJusticeDept, HSI_HQ, CBP, news) are not mapped.
 */
export const OFFICE_CITY = {
  EROBoston: "Boston, MA",
  EROBuffalo: "Buffalo, NY",
  EROPhiladelphia: "Philadelphia, PA",
  ERONewYork: "New York, NY",
  ERONewark: "Newark, NJ",
  EROBaltimore: "Baltimore, MD",
  EROWashington: "Washington, DC",
  EROAtlanta: "Atlanta, GA",
  EROMiami: "Miami, FL",
  ERONewOrleans: "New Orleans, LA",
  EROHouston: "Houston, TX",
  ERODallas: "Dallas, TX",
  EROElPaso: "El Paso, TX",
  EroHarlingen: "Harlingen, TX",
  EROHarlingen: "Harlingen, TX",
  EROSanAntonio: "San Antonio, TX",
  EROChicago: "Chicago, IL",
  ERODetroit: "Detroit, MI",
  EROStPaul: "St. Paul, MN",
  EROKansasCity: "Kansas City, MO",
  ERODenver: "Denver, CO",
  EROSaltLakeCity: "Salt Lake City, UT",
  EROPhoenix: "Phoenix, AZ",
  ERO__Phoenix: "Phoenix, AZ",
  EROLosAngeles: "Los Angeles, CA",
  EROSanFrancisco: "San Francisco, CA",
  EROSanDiego: "San Diego, CA",
  EROSeattle: "Seattle, WA",
  EROPortland: "Portland, OR",
};

const NO_CITY = /^(not stated|unknown|n\/a|none)?$/i;

/** City for a field office, or "" for a national account or an unknown office. */
export function cityForOffice(office) {
  const key = String(office || "").replace(/^@/, "");
  return OFFICE_CITY[key] || OFFICE_CITY[key.replace(/_/g, "")] || "";
}

/** Fill an empty city from a location-based office. Leaves a stated city alone. */
export function fillCity(row) {
  if (!row || typeof row !== "object") return row;
  if (!NO_CITY.test(String(row.city || "").trim())) return row;
  const city = cityForOffice(row.office);
  if (!city) return row;
  return { ...row, city };
}
