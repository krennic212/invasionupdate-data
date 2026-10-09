/**
 * Country of origin, only from wording tied to ONE named person (pure, no network).
 *
 *   countryFor("Ronald Zacarias-Gregorio", "ICE Seattle arrested illegal alien Ronald Zacarias-Gregorio, 36, of Guatemala.")  -> "Guatemala"
 *
 * Accepted (the wording must sit right next to the name, in the same clause):
 *  - after the name: "<Name>, 36, of Guatemala" / "<Name>, a criminal illegal alien from Mexico" /
 *    "<Name>, a 22-year-old illegal alien from Honduras" / "<Name>, 64, a lawful permanent resident from Cuba" /
 *    "<Name>, 45, a Mexican national" / "<Name>, a citizen of Honduras"
 *  - before the name: "Honduran national <Name>" / "A Chinese national, <Name>" / "illegal alien from Mexico, <Name>"
 * Only real country names (COUNTRIES) count, so "of Seattle" / "from Modesto" never become a country.
 * Anything else (removal destination, a co-defendant's country, "wanted in Ecuador") -> "".
 */
export const DEMONYMS = {
  Mexican: "Mexico", Guatemalan: "Guatemala", Honduran: "Honduras", Salvadoran: "El Salvador", Salvadorian: "El Salvador",
  Venezuelan: "Venezuela", Colombian: "Colombia", Cuban: "Cuba", Haitian: "Haiti", Dominican: "Dominican Republic",
  Ecuadorian: "Ecuador", Ecuadoran: "Ecuador", Nicaraguan: "Nicaragua", Peruvian: "Peru", Brazilian: "Brazil", Chinese: "China",
  Indian: "India", Jamaican: "Jamaica", Nigerian: "Nigeria", Russian: "Russia", Ukrainian: "Ukraine",
  Afghan: "Afghanistan", Pakistani: "Pakistan", Vietnamese: "Vietnam", Filipino: "Philippines", Canadian: "Canada",
  Chilean: "Chile", Argentine: "Argentina", Argentinian: "Argentina", Bolivian: "Bolivia", Uzbek: "Uzbekistan", Albanian: "Albania",
  Romanian: "Romania", Somali: "Somalia", Sudanese: "Sudan", Iranian: "Iran", Iraqi: "Iraq", Syrian: "Syria",
  Egyptian: "Egypt", Ghanaian: "Ghana", Kenyan: "Kenya", Liberian: "Liberia", Cameroonian: "Cameroon",
  Bangladeshi: "Bangladesh", Korean: "South Korea", "South Korean": "South Korea", Turkish: "Turkey", Belizean: "Belize", Panamanian: "Panama",
  "Costa Rican": "Costa Rica", Trinidadian: "Trinidad and Tobago", Guyanese: "Guyana", Senegalese: "Senegal", Mauritanian: "Mauritania",
  Ugandan: "Uganda", Italian: "Italy", Bahamian: "Bahamas", Paraguayan: "Paraguay", Uruguayan: "Uruguay",
  Ethiopian: "Ethiopia", Eritrean: "Eritrea", Congolese: "Congo", Angolan: "Angola", Moroccan: "Morocco", Algerian: "Algeria",
  Tunisian: "Tunisia", Libyan: "Libya", Jordanian: "Jordan", Lebanese: "Lebanon", Yemeni: "Yemen", Saudi: "Saudi Arabia",
  Israeli: "Israel", Palestinian: "Palestine", Nepali: "Nepal", Nepalese: "Nepal", "Sri Lankan": "Sri Lanka", Burmese: "Burma",
  Thai: "Thailand", Cambodian: "Cambodia", Laotian: "Laos", Indonesian: "Indonesia", Malaysian: "Malaysia", Japanese: "Japan",
  Taiwanese: "Taiwan", Mongolian: "Mongolia", Kazakh: "Kazakhstan", Tajik: "Tajikistan", Kyrgyz: "Kyrgyzstan", Georgian: "Georgia",
  Armenian: "Armenia", Azerbaijani: "Azerbaijan", Belarusian: "Belarus", Moldovan: "Moldova", Polish: "Poland", Czech: "Czech Republic",
  Slovak: "Slovakia", Hungarian: "Hungary", Bulgarian: "Bulgaria", Serbian: "Serbia", Croatian: "Croatia", Bosnian: "Bosnia and Herzegovina",
  Kosovar: "Kosovo", Macedonian: "North Macedonia", Greek: "Greece", German: "Germany", French: "France", Spanish: "Spain",
  Portuguese: "Portugal", British: "United Kingdom", Irish: "Ireland", Dutch: "Netherlands", Belgian: "Belgium", Swiss: "Switzerland",
  Austrian: "Austria", Swedish: "Sweden", Norwegian: "Norway", Danish: "Denmark", Finnish: "Finland", Lithuanian: "Lithuania",
  Latvian: "Latvia", Estonian: "Estonia", Australian: "Australia", "New Zealander": "New Zealand", Fijian: "Fiji", Tongan: "Tonga",
  Samoan: "Samoa", Micronesian: "Micronesia", Marshallese: "Marshall Islands", Palauan: "Palau", Barbadian: "Barbados", Bajan: "Barbados",
  Grenadian: "Grenada", Antiguan: "Antigua and Barbuda", Kittitian: "Saint Kitts and Nevis", Lucian: "Saint Lucia", Vincentian: "Saint Vincent and the Grenadines",
  Surinamese: "Suriname", Gambian: "Gambia", Guinean: "Guinea", Ivorian: "Ivory Coast", Malian: "Mali", Burkinabe: "Burkina Faso",
  Nigerien: "Niger", Chadian: "Chad", Togolese: "Togo", Beninese: "Benin", "Sierra Leonean": "Sierra Leone", Rwandan: "Rwanda",
  Burundian: "Burundi", Tanzanian: "Tanzania", Zambian: "Zambia", Zimbabwean: "Zimbabwe", Malawian: "Malawi", Mozambican: "Mozambique",
  "South African": "South Africa", Namibian: "Namibia", Botswanan: "Botswana", Cape: "", Kuwaiti: "Kuwait", Qatari: "Qatar", Emirati: "United Arab Emirates",
  Omani: "Oman", Bahraini: "Bahrain", Turkmen: "Turkmenistan", "North Korean": "North Korea",
};
const EXTRA = ["El Salvador", "Dominican Republic", "Trinidad and Tobago", "Costa Rica", "South Korea", "North Korea", "Cape Verde",
  "Central African Republic", "Democratic Republic of the Congo", "Republic of the Congo", "Bahamas", "Burma", "Myanmar", "Ivory Coast",
  "Cote d'Ivoire", "Hong Kong", "St. Lucia", "St. Kitts and Nevis", "Guinea-Bissau", "Equatorial Guinea", "Timor-Leste", "Brunei", "Singapore",
  "Bhutan", "Maldives", "Iceland", "Luxembourg", "Malta", "Cyprus", "Slovenia", "Montenegro", "Andorra", "Monaco", "Liechtenstein",
  "Djibouti", "Somaliland", "South Sudan", "Gabon", "Lesotho", "Eswatini", "Swaziland", "Madagascar", "Mauritius", "Comoros", "Seychelles",
  "Dominica", "Haiti", "Korea", "Vanuatu", "Kiribati", "Tuvalu", "Nauru", "Solomon Islands", "Papua New Guinea", "Puerto Rico"];
export const COUNTRIES = new Set([...Object.values(DEMONYMS).filter(Boolean), ...EXTRA].filter((c) => c !== "Puerto Rico"));

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const alt = (list) => [...list].sort((a, b) => b.length - a.length).map(esc).join("|");
const C = `(${alt(COUNTRIES)})`;
const D = `(${alt(Object.keys(DEMONYMS).filter((k) => DEMONYMS[k]))})`;
const END = "(?![A-Za-z'’-]|\\s+City\\b)";
const TYPE = "(?:illegal\\s+)?(?:alien|national|citizen|native|noncitizen|non-citizen|resident|offender|immigrant)s?";

// After the name (tail starts right after the name).
const AFTER = [
  // ", 36, of Guatemala" / ", of Mexico," / " Jr. of Brazil," (age optional; nothing else in between)
  new RegExp(`^\\s*(?:,\\s+)?(?:\\d{1,3},\\s+)?(?:of|from)\\s+(?:the\\s+)?${C}${END}`),
  // ", a criminal illegal alien from Mexico" / ", 64, a lawful permanent resident from Cuba" / ", a citizen of Honduras"
  new RegExp(`^\\s*,\\s+(?:\\d{1,3},\\s+)?(?:an?\\s+)?(?:\\d{1,3}-year-old\\s+)?(?:[A-Za-z-]+\\s+){0,4}?${TYPE}\\s+(?:from|of)\\s+(?:the\\s+)?${C}${END}`),
  // ", an illegal alien and Tren de Aragua terrorist group member from Venezuela" (ICE wording; the country still sits in the person's own clause)
  new RegExp(`^\\s*,\\s+(?:\\d{1,3},\\s+)?(?:an?\\s+)?(?:criminal\\s+)?illegal\\s+alien\\s+and\\s+(?:[A-Za-z'’-]+\\s+){1,6}?(?:member|affiliate|associate)\\s+(?:from|of)\\s+(?:the\\s+)?${C}${END}`),
  // ", 45, a Mexican national" / ", a Honduran citizen"
  new RegExp(`^\\s*,\\s+(?:\\d{1,3},\\s+)?(?:an?\\s+)?(?:\\d{1,3}-year-old\\s+)?(?:[a-z-]+\\s+){0,3}?${D}\\s+(?:national|citizen|native)${END}`),
];
// Before the name (head ends right before the name).
const BEFORE = [
  // "Honduran national <Name>" / "A Chinese national, <Name>"
  new RegExp(`(?:^|[\\s(:])(?:an?\\s+|the\\s+)?(?:[a-z-]+\\s+){0,2}?${D}\\s+(?:national|citizen|native)s?,?\\s*$`, "i"),
  // "criminal illegal alien from Mexico, <Name>"
  new RegExp(`${TYPE}\\s+(?:from|of)\\s+(?:the\\s+)?${C},?\\s*$`),
];

const toCountry = (v) => DEMONYMS[v] || DEMONYMS[Object.keys(DEMONYMS).find((k) => k.toLowerCase() === String(v).toLowerCase())] || v;
const normC = (c) => (c === "Korea" ? "South Korea" : c === "Myanmar" ? "Burma" : c.replace(/^St\. /, "Saint "));

/** Country stated for this one person, or "". */
export function countryFor(name, text) {
  const n = String(name || "").trim();
  const t = String(text || "").replace(/\s+/g, " ");
  if (!n || !t) return "";
  const found = new Set();
  let i = -1;
  while ((i = t.indexOf(n, i + 1)) >= 0) {
    const tail = t.slice(i + n.length, i + n.length + 200);
    for (const re of AFTER) { const m = tail.match(re); if (m) { found.add(normC(toCountry(m[1]))); break; } }
    const head = t.slice(Math.max(0, i - 120), i);
    for (const re of BEFORE) {
      const m = head.match(re);
      if (m) { found.add(normC(toCountry(m[1]))); break; }
    }
  }
  return found.size === 1 ? [...found][0] : "";
}
