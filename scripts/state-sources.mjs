/**
 * State election-crime newsrooms (Krennic 2026-10-20: "add state sources to the hourly job"). Shared, identical file
 * in krennic212/fraudtracker-data and krennic212/invasionupdate-data (scripts/state-sources.mjs).
 *
 * Rules (never loosened):
 *  - official pages only: a release URL is kept only when its host + path is the office's own (STATE_SOURCES[].host/path);
 *  - voting / election releases only: ELECTION_CASE must match the release title or its opening, and a crime verb too;
 *    petition-signature-only cases are out (Krennic: Brass / Price / Herron, Kansas Andrews / Johnson);
 *  - named people only: each harvester still runs its own name parser and guards on the release text;
 *  - fail soft: a blocked, slow or changed page is logged and skipped; never throws, global time budget.
 *
 * Each source is a listing (RSS feed, HTML newsroom page, or Michigan.gov's own newsroom search JSON). Only items whose
 * listing title or URL slug has an election word are opened (at most PER_SOURCE per run).
 */

export const STATE_SOURCES = [
  { office: "FloridaAG", state: "FL", kind: "rss", url: "https://www.myfloridalegal.com/rss.xml", host: "myfloridalegal.com", path: "/newsrelease/" },
  { office: "FDLE", state: "FL", kind: "html", url: "https://www.fdle.state.fl.us/News", host: "fdle.state.fl.us", path: "/news/", link: /^\/news\/20\d{2}\/[a-z-]+\/[a-z0-9-]+$/i },
  { office: "TexasAG", state: "TX", kind: "html", url: "https://www.texasattorneygeneral.gov/news", host: "texasattorneygeneral.gov", path: "/news/releases/", link: /^\/news\/releases\/[a-z0-9-]+$/ },
  { office: "MichiganAG", state: "MI", kind: "sxa", url: "https://www.michigan.gov/ag/sxa/search/results/?s={62E9FB6A-7717-4EF1-832C-E5ECBB9BB2D9}&itemid={762D5C29-DD27-4FE6-B9FF-4883E753B8C9}&sig=&autoFireSearch=true&v={B7A22BE8-17FC-44A5-83BC-F54442A57941}&p=40&o=Article%20Date,Descending", host: "michigan.gov", path: "/ag/news/press-releases/" },
  { office: "NewHampshireDOJ", state: "NH", kind: "html", url: "https://www.doj.nh.gov/resources/press-releases", host: "doj.nh.gov", path: "/news-and-media/", link: /^\/news-and-media\/[a-z0-9-]{12,}$/ },
  { office: "NevadaAG", state: "NV", kind: "html", url: "https://ag.nv.gov/News/Press_Releases/", host: "ag.nv.gov", path: "/news/pr/", link: /^\/News\/PR\/20\d{2}\/[^"?#]+\/$/ },
  { office: "PennsylvaniaAG", state: "PA", kind: "rss", url: "https://www.attorneygeneral.gov/feed/", host: "attorneygeneral.gov", path: "/taking-action/" },
  { office: "KansasAG", state: "KS", kind: "rss", url: "https://www.ag.ks.gov/Home/Components/RssFeeds/RssFeed/View?ctID=5", host: "ag.ks.gov", path: "/home/components/news/news/" },
  { office: "GeorgiaAG", state: "GA", kind: "rss", url: "https://law.georgia.gov/rss.xml", host: "law.georgia.gov", path: "/press-releases/" },
  { office: "GeorgiaSOS", state: "GA", kind: "html", url: "https://sos.ga.gov/news", host: "sos.ga.gov", path: "/news/", link: /^\/news\/[a-z0-9-]{12,}$/ },
  { office: "NorthCarolinaAG", state: "NC", kind: "html", url: "https://ncdoj.gov/news/press-releases/", host: "ncdoj.gov", path: "/", link: /^\/[a-z0-9-]{20,}\/$/ },
  { office: "OhioAG", state: "OH", kind: "html", url: "https://www.ohioattorneygeneral.gov/Media/News-Releases", host: "ohioattorneygeneral.gov", path: "/media/news-releases/", link: /^\/Media\/News-Releases\/[A-Za-z]+-20\d{2}\/[^"?#]+$/ },
  { office: "OhioSOS", state: "OH", kind: "html", url: "https://www.ohiosos.gov/media-center/press-releases/", host: "ohiosos.gov", path: "/media-center/press-releases/", link: /^\/media-center\/press-releases\/20\d{2}\/[^"?#]+$/ },
  { office: "ArizonaAG", state: "AZ", kind: "rss", url: "https://www.azag.gov/rss.xml", host: "azag.gov", path: "/press-release/" },
  { office: "AlabamaAG", state: "AL", kind: "rss", url: "https://www.alabamaag.gov/feed/", host: "alabamaag.gov", path: "/" },
  { office: "VirginiaAG", state: "VA", kind: "html", url: "https://www.oag.state.va.us/media-center/news-releases", host: "oag.state.va.us", path: "/media-center/news-releases/", link: /^\/media-center\/news-releases\/\d+-[a-z0-9-]+$/ },
  { office: "LouisianaAG", state: "LA", kind: "html", url: "https://www.ag.state.la.us/News", host: "ag.state.la.us", path: "/article/", link: /^\/Article\/\d+$/ },
  { office: "MissouriAG", state: "MO", kind: "rss", url: "https://ago.mo.gov/feed/", host: "ago.mo.gov", path: "/" },
  { office: "TennesseeAG", state: "TN", kind: "html", url: "https://www.tn.gov/attorneygeneral/news.html", host: "tn.gov", path: "/attorneygeneral/news/", link: /^\/attorneygeneral\/news\/20\d{2}\/\d{1,2}\/\d{1,2}\/[a-z0-9-]+\.html$/ },
  { office: "IowaAG", state: "IA", kind: "rss", url: "https://www.iowaattorneygeneral.gov/newsroom/rss", host: "iowaattorneygeneral.gov", path: "/newsroom/" },
];
// Not added (2026-10-20): Wisconsin DOJ and Indiana AG newsrooms render their release lists in the browser (no links in
// the page, no feed), so there is nothing official to read without a browser.

/** Listing words that make an item worth opening (title or URL slug). */
export const ELECTION_HINT = /\bvot(?:e|ed|er|ers|ing)\b|vot(?:e|er|ing)-|\belect(?:ion|ions|oral)\b|election-|\bballots?\b|ballot-|\bregistrations?\b|\bpolls?\b|\babsentee\b|\bcanvass/i;
/** A release about an election crime (title or opening). */
export const ELECTION_CASE =
  /illegal(?:ly)? (?:vot|regist)|unlawful(?:ly)? (?:vot|regist)|wrongful(?:ly)? vot|voter fraud|election fraud|election crimes?|election[- ]law (?:violation|crime|charge)|vot(?:ed|ing) (?:twice|more than once|multiple times|in (?:two|both|more than one) states?|as an? (?:alien|non-?citizen))|double vot|ballot (?:harvest|fraud|tamper|stuff)|vote harvest|absentee ballot fraud|fraudulent(?:ly)? (?:voter )?regist|false (?:voter )?registration|falsified voter registration|voter registration (?:fraud|forms?)|voting by (?:an )?alien|non-?citizen vot|false (?:claim|statement)s? (?:of|to|about) (?:U\.S\. )?citizenship|falsely claim(?:ing|ed)? .{0,40}citizenship|disorderly election conduct|tampering with (?:a )?(?:ballot|election)|illegal voting|vote buying|buying votes/i;
const CRIME_VERB = /\b(?:charged|charges|indicted|indictment|arrested|arrests|pleaded|pled|pleads|sentenced|convicted|guilty|complaint)\b/i;
const PETITION_ONLY = /\bpetitions?\b/i;
const VOTE_ACT = /\b(?:voted|votes? (?:cast|twice)|cast (?:a |two |multiple )?ballots?|ballots? (?:cast|harvest)|registered to vote|voter registration|illegal(?:ly)? vot|unlawful(?:ly)? vot|wrongful(?:ly)? vot)\b/i;

export const PER_SOURCE = 6;

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—", shy: "" };
export function decodeEntities(s) {
  return String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => (n.toLowerCase() in ENT ? ENT[n.toLowerCase()] : m))
    .replace(/\u00ad/g, "");
}
const textOf = (html) => decodeEntities(String(html || "").replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

/** True when the URL is the office's own release page (exact host, https, path prefix). */
export function isSourceUrl(src, url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  const h = u.hostname.toLowerCase().replace(/^www\./, "");
  return h === src.host && u.pathname.toLowerCase().startsWith(src.path.toLowerCase());
}

/** Listing items {title, url, date?} from one source's listing text (RSS / HTML / Michigan search JSON). */
export function listItems(src, body) {
  const out = [];
  const seen = new Set();
  const push = (title, href, date = "") => {
    let url;
    try {
      url = new URL(decodeEntities(href).trim(), src.url).href.replace(/^http:\/\//i, "https://");
    } catch {
      return;
    }
    if (!isSourceUrl(src, url) || seen.has(url)) return;
    seen.add(url);
    out.push({ title: textOf(title), url, date });
  };
  if (src.kind === "rss") {
    for (const m of String(body).matchAll(/<item\b[\s\S]*?<\/item>/gi)) {
      const it = m[0];
      const link = (it.match(/<link>([\s\S]*?)<\/link>/i) || [])[1] || "";
      const title = (it.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || "";
      const pub = (it.match(/<pubDate>([\s\S]*?)<\/pubDate>/i) || [])[1] || "";
      const t = Date.parse(decodeEntities(pub).trim());
      push(decodeEntities(title), link, Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : "");
    }
  } else if (src.kind === "sxa") {
    let j;
    try {
      j = JSON.parse(body);
    } catch {
      return out;
    }
    for (const r of Array.isArray(j?.Results) ? j.Results : []) {
      const title = (String(r.Html || "").match(/content-title-link[^>]*>([\s\S]*?)<\/a>/i) || [])[1] || "";
      const d = textOf((String(r.Html || "").match(/upcoming-event-location">([\s\S]*?)<\/strong>/i) || [])[1] || "");
      const t = Date.parse(d);
      push(title, r.Url || "", Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : "");
    }
  } else {
    for (const m of String(body).matchAll(/<a\b[^>]*?href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      const rel = m[1].replace(/^https?:\/\/(?:www\.)?[^/]+/i, "");
      if (src.link && !src.link.test(rel)) continue;
      push(m[2], m[1]);
    }
  }
  return out;
}

/** Worth opening: an election word in the listing title or the URL slug. */
export function electionCandidate(item) {
  return ELECTION_HINT.test(item.title || "") || ELECTION_HINT.test(String(item.url || "").replace(/[-_/]/g, " "));
}

const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const DATE_WORDS = String.raw`(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2}),\s+(20\d{2})`;
const DATE_NUM = String.raw`(\d{1,2})\/(\d{1,2})\/(20\d{2})`;
function isoOf(m, numeric) {
  const [y, mo, d] = numeric ? [m[3], Number(m[1]), Number(m[2])] : [m[3], MON[m[1].slice(0, 3).toLowerCase()], Number(m[2])];
  if (!mo || mo > 12 || d < 1 || d > 31) return "";
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
/**
 * Release date YYYY-MM-DD: page metadata; else a labelled date ("Post Date: 11/05/2025", "Date: January 24, 2025",
 * "Release Date Sep 24, 2026"); else the listing's own date (RSS pubDate, newsroom search); else the first date on the
 * page (newsroom pages print the release date above the text: "May 07, 2025 | Press Release").
 */
export function releaseDate(html, text, fallback = "") {
  const meta =
    String(html).match(/(?:article:published_time|datePublished|dc\.date|og:published_time)["']?\s*(?:content=|:)\s*["'](\d{4}-\d{2}-\d{2})/i) ||
    String(html).match(/<time[^>]+datetime=["'](\d{4}-\d{2}-\d{2})/i);
  if (meta) return meta[1];
  const page = textOf(html) || String(text);
  const lab = page.match(new RegExp(String.raw`\b(?:Post Date|Release Date|Date|Released|Published)\s*:?\s*(?:` + DATE_WORDS + "|" + DATE_NUM + ")"));
  if (lab) return lab[1] ? isoOf(lab.slice(0, 4), false) : isoOf([lab[0], lab[4], lab[5], lab[6]], true);
  if (fallback) return fallback;
  const w = page.match(new RegExp(DATE_WORDS));
  const n = page.match(new RegExp(DATE_NUM));
  if (w && (!n || w.index <= n.index)) return isoOf(w, false);
  if (n) return isoOf(n, true);
  return "";
}

/** Release title and body paragraphs (verbatim text), main content only when the page marks it. */
export function readReleaseHtml(html) {
  const og = String(html).match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  const h1 = String(html).match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  // og:title is sometimes only the site name ("FDLE") or carries a " | site" tail ("... | News List | Attorney General").
  const clean = (t) => textOf(t).replace(/^FDLE\s+[–-]\s+/, "").replace(/\s+\|\s+.*$/, "").replace(/\s+[–-]\s+(?:PA Office of Attorney General|Office of the Attorney General)$/i, "").trim();
  const a = clean(og?.[1] || "");
  const b = clean(h1?.[1] || "");
  const title = a.length >= 15 ? a : b.length >= 15 ? b : a || b;
  const main = String(html).match(/<(main|article)\b[\s\S]*?<\/\1>/i)?.[0] || String(html);
  let blocks = [...main.matchAll(/<(p|li|h2|h3|h4|blockquote|div)\b[^>]*>((?:(?!<(?:div|p|li|ul|ol|table)\b)[\s\S])*?)<\/\1>/gi)].map((m) => textOf(m[2])).filter((b) => b.length > 0);
  // Newsroom chrome (menus are short <li> items) comes before the release: start at its first real paragraph (a
  // dateline "TOPEKA –" / "Concord, NH –" or 80+ characters with a sentence end), stop at the related-news footer.
  const prose = (b) => b.length >= 80 && /[.!?]["”’]?(?:\s|$)/.test(b);
  const dateline = (b) => prose(b) && /^(?:[A-Z]{3,}(?:[ .-][A-Z]{2,})*|[A-Z][a-z]+(?: [A-Z][a-z]+)*, (?:[A-Z]{2}|[A-Z][a-z]+\.?))\s*[–—-]+\s/.test(b);
  let start = blocks.findIndex(dateline);
  if (start < 0) start = blocks.findIndex(prose);
  if (start > 0) blocks = blocks.slice(start);
  const stop = blocks.findIndex((b) => /^(?:Related (?:News|Articles|Content)|Receive email updates|Recent News|More News|Share this|#{3,}\s*$|-{3,}\s*$)/i.test(b));
  if (stop > 0) blocks = blocks.slice(0, stop);
  return { title, blocks, text: blocks.join(" ") };
}

/** An election-crime release: election wording + a crime verb in the title or opening; not a petition-only case. */
export function isElectionCase(title, text) {
  const head = `${title} ${String(text).slice(0, 2500)}`;
  if (!ELECTION_CASE.test(head) || !CRIME_VERB.test(head)) return false;
  if (PETITION_ONLY.test(head) && !VOTE_ACT.test(head)) return false;
  return true;
}

/**
 * Read every source once. fetchText(url) -> string (throws on HTTP error). Returns releases
 * {office, state, url, date, title, blocks, text} that are election-crime releases, plus a log.
 * Fail soft: every error is recorded and skipped; stops opening pages when the time budget is spent.
 */
export async function readStateSources(fetchText, { sources = STATE_SOURCES, perSource = PER_SOURCE, budgetMs = 240000, since = "" } = {}) {
  const t0 = Date.now();
  const releases = [];
  const log = [];
  for (const src of sources) {
    if (Date.now() - t0 > budgetMs) {
      log.push(`${src.office}: skipped (time budget)`);
      continue;
    }
    let items;
    try {
      items = listItems(src, await fetchText(src.url));
    } catch (e) {
      log.push(`${src.office}: list ${String(e?.message || e).slice(0, 80)}`);
      continue;
    }
    const want = items.filter(electionCandidate).filter((i) => !since || !i.date || i.date >= since).slice(0, perSource);
    let kept = 0;
    for (const it of want) {
      if (Date.now() - t0 > budgetMs) break;
      try {
        const html = await fetchText(it.url);
        const { title, blocks, text } = readReleaseHtml(html);
        const t = title.length >= 15 ? title : it.title || title;
        if (!isElectionCase(t, text)) continue;
        const date = releaseDate(html, text, it.date);
        if (!date || (since && date < since)) continue;
        releases.push({ office: src.office, state: src.state, url: it.url, date, title: t, blocks, text });
        kept += 1;
      } catch (e) {
        log.push(`${src.office}: page ${String(e?.message || e).slice(0, 80)}`);
      }
    }
    log.push(`${src.office}: ${items.length} listed, ${want.length} opened, ${kept} election-crime`);
  }
  return { releases, log };
}

/* ---------- Named defendants in a state release ---------- */

const NT = "(?:[A-Z][a-z]*[A-Z]?[a-z]+(?:['’-][A-Z]?[a-z]+)?|[A-Z]\\.)";
const PART = `(?:${NT}|de|del|de la|la|van|von|da|dos)`;
const NAME = `(${NT}(?: ${PART}){1,4}?(?:,? (?:Jr|Sr)\\.|,? (?:II|III|IV))?)`;
const NOT_NAME = /\b(?:County|Township|Department|Office|State|City|Council|Court|Election|Elections|General|Attorney|District|Board|Unit|Police|Division|Commission|Republic|Party|University|Primary|Florida|Texas|Kansas|Michigan|Ohio|Georgia|Arizona|Nevada|Iowa|Missouri|Alabama|Virginia|Louisiana|Tennessee|Pennsylvania|Carolina|Hampshire|Wisconsin|Indiana)\b/;
const OFFICIAL_TITLE =
  /(?:Attorney General|Governor|Secretary(?: of State)?|Commissioner|Investigator|Agent|Prosecutor|Spokes(?:man|woman|person)|Director|Judge|Sheriff|Chief|Rep\.|Representative|Senator|District Attorney|Solicitor General|Superintendent|Officer|Detective|Trooper|Captain|Lieutenant|Sergeant|Clerk|Supervisor of Elections)\s+$/;

const tidy = (n) => String(n).replace(/,\s*(Jr|Sr)\./, " $1.").replace(/,\s*(II|III|IV)$/, " $1").replace(/\s+/g, " ").trim();

/**
 * The people a state release names as defendants, with the age and home place it prints. Only these forms count:
 * "Name, 39, of Oak Park" (a list entry), "arrested / charges against / the arrest of Name", "announces that Name, of
 * Hudson, has been arrested", "<office>, Name: 3 counts of ...", "The charged canvassers are: A, B, C", "Joshua and
 * Lisa Urovitch" after a charge verb. A name the release also prints right after an official's title, or that is a
 * place or agency word, is dropped. Officials quoted or credited ("said Attorney General ...") never match.
 */
export function stateDefendants({ title = "", blocks = [] } = {}) {
  const out = new Map();
  const all = blocks.join(" ");
  const add = (raw, extra = {}, sentence = "") => {
    const name = tidy(raw);
    if (name.split(" ").length < 2 || NOT_NAME.test(name)) return;
    // The full name, or its surname, printed right after an official's title ("Attorney General Paxton").
    for (const part of [name, name.replace(/ (?:Jr|Sr)\.$| (?:II|III|IV)$/, "").split(" ").pop()]) {
      const esc = part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      for (const m of all.matchAll(new RegExp(`\\b${esc}\\b`, "g"))) if (OFFICIAL_TITLE.test(all.slice(Math.max(0, m.index - 40), m.index))) return;
    }
    const prev = out.get(name);
    out.set(name, { name, ...(prev || {}), ...Object.fromEntries(Object.entries(extra).filter(([, v]) => v)), sentence: prev?.sentence || sentence });
  };
  const VERB = "(?:arrested|charged|indicted|charges against|charges filed against|indictment of|indictments of|arrest of|arrests of|charging|sentencing of|conviction of|convicted)";
  for (const b of blocks) {
    const s = b.replace(/\s+,/g, ",").replace(/\s*\(PDF\)/g, "");
    let m = s.match(new RegExp(`^${NAME},\\s*(\\d{1,3}),\\s+(?:of|from)\\s+([A-Z][A-Za-z .'’-]+?)(?=\\s*[(,]|\\s+(?:with|was|is|has)\\b|$)`));
    if (m) add(m[1], { age: m[2], place: m[3].trim() }, s);
    m = s.match(new RegExp(`^(?:[^:]{3,90},\\s+)?${NAME}:\\s+\\d+\\s+counts?\\b`));
    if (m) add(m[1], {}, s);
    for (const x of s.matchAll(new RegExp(`\\b${VERB}\\s+${NAME}(?:,\\s*(\\d{1,3}))?(?:,?\\s+(?:of|from)\\s+([A-Z][a-z]+(?: [A-Z][a-z]+){0,2}))?(?=[,.;:]|\\s+(?:of|in|for|on|with|who|and|after)\\b)`, "g")))
      add(x[1], { age: x[2], place: x[3] }, s);
    for (const x of s.matchAll(new RegExp(`\\b${VERB}\\s+([A-Z][a-z]+) and ${NAME}(?=\\s+(?:with|for|on|of|in)\\b|[,.(])`, "g"))) {
      const last = x[2].split(" ").slice(1).join(" ");
      add(`${x[1]} ${last}`, {}, s);
      add(x[2], {}, s);
    }
    for (const x of s.matchAll(new RegExp(`\\b(?:announce[sd]?|announcing) that ${NAME}(?:,\\s*(\\d{1,3}))?(?:,\\s+(?:of|from)\\s+([A-Z][a-z]+(?: [A-Z][a-z]+){0,2}))?(?:,\\s+[A-Z][a-z]+(?: [A-Z][a-z]+)?)?,?\\s+(?:has been|have been|was|were|is|pled|pleaded|plead)\\b`, "g")))
      add(x[1], { age: x[2], place: x[3] }, s);
    for (const x of s.matchAll(new RegExp(`\\bcharged\\b[^.]{0,120}?\\bas well as ${NAME},\\s+who\\b`, "g"))) add(x[1], {}, s);
    m = s.match(/\bThe (?:charged|accused|indicted) (?:canvassers|defendants|individuals|people|suspects) are:\s*([^.]+)/);
    if (m) for (const n of m[1].split(/,\s*|\s+and\s+/)) if (new RegExp(`^${NAME}$`).test(n.trim())) add(n.trim(), {}, s);
  }
  return [...out.values()];
}

/** The release's own stage word: title first, then the opening paragraph. */
export function stateStage(title, text) {
  for (const t of [String(title), String(text).slice(0, 600)]) {
    if (/\bsentenced\b/i.test(t)) return "Sentenced";
    if (/\bpl(?:ed|eaded?) guilty\b/i.test(t)) return "Pleaded guilty";
    if (/\b(?:convicted|found guilty)\b/i.test(t)) return "Convicted";
    if (/\bindict/i.test(t)) return "Charged";
    if (/\bcharg/i.test(t)) return "Charged";
    if (/\barrest/i.test(t)) return "Arrested";
  }
  return "";
}

export const BROWSER_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

/** The release's dateline city ("TOPEKA –", "Concord, NH –", "... 2025 MIAMI –"), title-cased, or "". */
export function datelineCity(blocks = []) {
  for (const b of blocks.slice(0, 3)) {
    const m = String(b).match(/(?:^|\b\d{4}\s+)([A-Z][A-Za-z.']*(?: [A-Z][A-Za-z.']*){0,2})(?:,\s*(?:[A-Z]{2}|[A-Z][a-z]+\.?))?\s*[–—-]+\s/);
    if (!m) continue;
    const city = m[1].toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
    if (/^(?:For|Immediate|Release|News|Press)$/i.test(city)) continue;
    return city;
  }
  return "";
}

/**
 * Map pin for a state-release defendant: the home town the release prints for that person, else the release's own
 * dateline (only when no home town is printed), looked up as "City, ST" in a {"City, ST": [lat, lon]} table. No match -> null (the row is not added).
 */
export function stateGeo(person, rel, table) {
  // A home town the release prints but the table lacks ("Rose Township") is not swapped for the dateline.
  for (const place of person?.place ? [person.place] : [datelineCity(rel?.blocks)]) {
    const key = place && `${String(place).replace(/\s+Township$/, "").trim()}, ${rel?.state}`;
    const hit = key && table[key];
    if (Array.isArray(hit) && Number.isFinite(hit[0])) return { city: key, lat: hit[0], lon: hit[1] };
  }
  return null;
}
