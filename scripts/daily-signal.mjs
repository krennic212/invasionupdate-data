/**
 * Daily Signal exclusive ICE-arrest lists.
 *
 * The site only shows official releases by default. These exclusives name the
 * person, the origin, and the charge the White House gave the Daily Signal, so
 * they are ingested as their own rows with the article as the source.
 *
 * Reads the public RSS feed (Cloudflare blocks the HTML), then the article body
 * via a reader. Only a person the article calls an illegal alien / noncitizen
 * and ties to an ICE or DHS arrest is kept.
 */
import { decode } from "./parse.mjs";

const FEEDS = [
  "https://www.dailysignal.com/feed/",
  "https://www.dailysignal.com/category/border-immigration-news/ice-news/feed/",
  "https://www.dailysignal.com/category/crime-news/illegal-alien-crime-news/feed/",
];

const TITLE_RE =
  /\b(?:ice|dhs|immigration)\b.{0,40}\b(?:arrest|nabs?|nabbed|deports?|removed)\b|\b(?:worst|meet the)\b.{0,40}\b(?:criminal aliens?|criminal illegal|illegal aliens?)\b|\bcriminal illegal aliens?\b.{0,40}\barrest/i;

const NAME =
  "[A-ZÁÉÍÓÚÑÜ][A-Za-zÁÉÍÓÚÑÜáéíóúñü'’\\-]+(?:\\s+(?:de|del|la|los|las|van|von|y|da|dos|di)\\s+[A-ZÁÉÍÓÚÑÜ][A-Za-zÁÉÍÓÚÑÜáéíóúñü'’\\-]+|\\s+[A-ZÁÉÍÓÚÑÜ][A-Za-zÁÉÍÓÚÑÜáéíóúñü'’\\-]+){1,4}";

const ALIEN =
  "illegal alien|criminal illegal alien|illegal immigrant|criminal illegal immigrant|non-?citizen";

const HEADING = new RegExp(`^#{1,3}\\s*\\d+\\.\\s*(${NAME})\\s*$`, "gm");
const IS_FROM = new RegExp(
  `(${NAME})\\s+is\\s+an?\\s+(?:${ALIEN})\\s+from\\s+([A-Z][A-Za-z]+(?:\\s+[A-Z][A-Za-z]+)?)\\b[^.]*\\b(?:arrested|taken into custody|detained)\\b[^.]*\\.`,
  "g",
);
const COMMA_FROM = new RegExp(
  `(${NAME}),\\s+an?\\s+(?:${ALIEN})\\s+from\\s+([A-Z][A-Za-z]+(?:\\s+[A-Z][A-Za-z]+)?)\\b[^.]*\\b(?:was\\s+)?(?:arrested|taken into custody|detained)\\b[^.]*\\.`,
  "g",
);
const ARRESTED_NAME = new RegExp(
  `\\b(?:ICE|Immigration and Customs Enforcement|DHS|immigration enforcement)\\b[^.]*\\barrested\\s+(${NAME}),\\s+an?\\s+(?:${ALIEN})\\s+from\\s+([A-Z][A-Za-z]+(?:\\s+[A-Z][A-Za-z]+)?)\\b[^.]*\\.`,
  "g",
);

const STATES = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA", Colorado: "CO",
  Connecticut: "CT", Delaware: "DE", Florida: "FL", Georgia: "GA", Hawaii: "HI", Idaho: "ID",
  Illinois: "IL", Indiana: "IN", Iowa: "IA", Kansas: "KS", Kentucky: "KY", Louisiana: "LA",
  Maine: "ME", Maryland: "MD", Massachusetts: "MA", Michigan: "MI", Minnesota: "MN",
  Mississippi: "MS", Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV",
  "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
  "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH", Oklahoma: "OK", Oregon: "OR",
  Pennsylvania: "PA", "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD",
  Tennessee: "TN", Texas: "TX", Utah: "UT", Vermont: "VT", Virginia: "VA", Washington: "WA",
  "West Virginia": "WV", Wisconsin: "WI", Wyoming: "WY",
};

function decodeText(s) {
  return decode(String(s || ""))
    .replace(/&#8217;|&#8216;/g, "'")
    .replace(/&#8220;|&#8221;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/** State named in the headline ("Arrested in Iowa"), or "". Never invent a city. */
export function placeFromTitle(title) {
  const t = decodeText(title);
  const names = Object.keys(STATES).sort((a, b) => b.length - a.length);
  for (const name of names) {
    if (new RegExp(`\\bin\\s+${name}\\b`).test(t)) return name;
  }
  return "";
}

/**
 * People a Daily Signal exclusive names as illegal aliens arrested by ICE/DHS.
 * Returns { name, origin, sentence, city }.
 */
export function peopleFromArticle(text, { title = "" } = {}) {
  const body = decodeText(text);
  const city = placeFromTitle(title);
  const found = [];
  const seen = new Set();

  function add(name, origin, sentence) {
    const n = String(name || "").replace(/\s+/g, " ").trim();
    if (!n || n.split(" ").length < 2 || n.split(" ").length > 5 || seen.has(n.toLowerCase())) return;
    seen.add(n.toLowerCase());
    const crime = crimeAfter(body, n);
    const naming = sentenceFor(body, n) || sentence;
    found.push({
      name: n,
      origin: String(origin || originFor(naming) || "").trim(),
      sentence: [naming, crime].filter(Boolean).join(" ").replace(/\s+/g, " ").trim(),
      city,
    });
  }

  // Numbered headings are the canonical name: "## 1. Amilcar Perz-Morfin".
  const heading = new RegExp(`^#{0,3}\\s*\\d+\\.\\s*(${NAME})\\s*$`, "gm");
  let m;
  while ((m = heading.exec(body))) add(m[1], "", "");

  for (const re of [IS_FROM, COMMA_FROM, ARRESTED_NAME]) {
    re.lastIndex = 0;
    const flat = body.replace(/^#{0,3}\s*\d+\.\s+.*$/gm, " ").replace(/\n/g, " ");
    while ((m = re.exec(flat))) add(m[1], m[2], m[0]);
  }
  return found.filter((p) => /\b(?:arrested|detained|taken into custody)\b/i.test(p.sentence));
}

function sentenceFor(body, name) {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const lines = body.split("\n").map((l) => l.trim()).filter((l) => new RegExp(esc).test(l) && !/^\d+\./.test(l) && !/^#/.test(l));
  return lines.find((l) => /\b(?:arrested|detained|taken into custody|illegal alien)\b/i.test(l)) || lines[0] || "";
}

function originFor(sentence) {
  const m = String(sentence || "").match(/\bfrom\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)?)\b/);
  return m ? m[1] : "";
}

function crimeAfter(body, name) {
  const i = body.toLowerCase().indexOf(name.toLowerCase());
  if (i < 0) return "";
  const rest = body.slice(i);
  const m = rest.match(/[Hh](?:is|er) criminal history includes[^.]*\./);
  return m ? m[0] : "";
}

function rssItems(xml) {
  const out = [];
  for (const raw of String(xml || "").split("<item>").slice(1)) {
    const title = decodeText((raw.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/s) || [])[1] || "");
    const link = ((raw.match(/<link>(.*?)<\/link>/s) || [])[1] || "").trim();
    const date = ((raw.match(/<pubDate>(.*?)<\/pubDate>/s) || [])[1] || "").trim();
    if (title && link.startsWith("https://www.dailysignal.com/")) out.push({ title, link, date });
  }
  return out;
}

async function readFeed(fetchText, url) {
  try {
    return rssItems(await fetchText(url, "application/rss+xml,application/xml,text/xml,*/*"));
  } catch {
    return [];
  }
}

async function readArticle(fetchText, url) {
  // Cloudflare blocks the HTML. The reader returns the article text.
  const reader = `https://r.jina.ai/${url}`;
  const text = await fetchText(reader, "text/plain,*/*");
  return text;
}

/**
 * Recent Daily Signal exclusives that name ICE-arrested aliens.
 * Returns [{ title, url, date, people }].
 */
export async function dailySignalReleases(fetchText, { sinceMs = 0 } = {}) {
  const seen = new Set();
  const items = [];
  for (const feed of FEEDS) {
    for (const item of await readFeed(fetchText, feed)) {
      if (seen.has(item.link) || !TITLE_RE.test(`${item.title} ${item.link}`)) continue;
      const t = item.date ? Date.parse(item.date) : NaN;
      if (sinceMs && Number.isFinite(t) && t < sinceMs) continue;
      seen.add(item.link);
      items.push(item);
    }
  }
  const out = [];
  for (const item of items) {
    let text = "";
    try {
      text = await readArticle(fetchText, item.link);
    } catch {
      continue;
    }
    const people = peopleFromArticle(text, { title: item.title });
    if (!people.length) continue;
    out.push({ title: item.title, url: item.link, date: item.date, office: "DailySignal", people });
  }
  return out;
}
