import { looksLikeUtility, type CarolinaBoundary, type GeorgiaFiling, type LiveCheck, type PermitSearch } from "@/lib/permits";

/**
 * Server-side live permit check: the same two public sources as `scripts/ingest/permit_search.py`, narrowed to what was
 * filed since the saved check (Georgia EPD GEOS for Effingham and Chatham counties; SC DES coastal land-disturbance
 * boundaries around the Savannah River). Read-only; the result is shown, never written to the snapshot.
 */

const GEOS = "https://geos.epd.georgia.gov/GA/GEOS/Public/Client/GA_GEOS/Public/Pages/PublicApplicationList.aspx";
const FIELD = "ctl00$ctl00$SimpleMainContent$MainContent$ucApplicationSubmitList$";
const COUNTIES: Record<string, string> = { "51": "Effingham", "25": "Chatham" };
const SC_LAYER = "https://gis.des.sc.gov/gisserver/rest/services/OCRM/CZC_Layers/MapServer/0/query";
const SC_BBOX = "-81.5,31.9,-80.6,32.8";
const MAX_PAGES = 40; // 15 rows a page; the portal itself stops at 500 results
const UA = "Mozilla/5.0 (GridLock Atlas permit check)";

const decode = (s: string) =>
  s
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
const attr = (tag: string, name: string) => {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`, "i"));
  return m ? decode(m[1]) : undefined;
};
const text = (html: string) => decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

/** The ASP.NET form state a postback must echo: hidden and text inputs, plus each select's selected option. */
function formState(html: string): Record<string, string> {
  const d: Record<string, string> = {};
  for (const tag of html.match(/<input\b[^>]*>/gi) ?? []) {
    const name = attr(tag, "name");
    const type = (attr(tag, "type") ?? "text").toLowerCase();
    if (name && !["submit", "button", "image", "checkbox"].includes(type)) d[name] = attr(tag, "value") ?? "";
  }
  for (const sel of html.match(/<select\b[\s\S]*?<\/select>/gi) ?? []) {
    const name = attr(sel.slice(0, sel.indexOf(">") + 1), "name");
    if (!name) continue;
    const opt = sel.match(/<option\b[^>]*selected[^>]*>/i) ?? sel.match(/<option\b[^>]*>/i);
    d[name] = opt ? (attr(opt[0], "value") ?? "") : "";
  }
  return d;
}

function rows(html: string, county: string | undefined): GeorgiaFiling[] {
  const out: GeorgiaFiling[] = [];
  for (const tr of html.split(/<tr\b/i).slice(1)) {
    if (!tr.includes("btnEditRecord")) continue;
    const cells = [...tr.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => text(m[1]));
    const id = cells[2]?.match(/\b(\d{5,7}) - (.+?) App Type: ?(.*)$/);
    const date = cells.join(" ").match(/Submitted on: (\d\d)\/(\d\d)\/(\d{4})/);
    if (id) out.push({ submissionId: id[1], facility: cells[1], appType: id[3].trim(), submitted: date ? `${date[3]}-${date[1]}-${date[2]}` : null, county });
  }
  return out;
}

class Session {
  private cookies = new Map<string, string>();
  async request(url: string, body?: Record<string, string>): Promise<string> {
    const res = await fetch(url, {
      method: body ? "POST" : "GET",
      headers: {
        "User-Agent": UA,
        Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "),
        ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      },
      body: body ? new URLSearchParams(body).toString() : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(45_000),
    });
    for (const c of res.headers.getSetCookie()) {
      const [kv] = c.split(";");
      const i = kv.indexOf("=");
      if (i > 0) this.cookies.set(kv.slice(0, i).trim(), kv.slice(i + 1).trim());
    }
    if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
    return res.text();
  }
}

const mdy = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;

/** One GEOS NPDES search, newest first, over up to `pages` result pages. */
async function geosSearch(fields: Record<string, string>, county: string | undefined, pages: number): Promise<GeorgiaFiling[]> {
  const s = new Session();
  let html = await s.request(GEOS);
  html = await s.request(GEOS, { ...formState(html), ...fields, [FIELD + "ddlProgram"]: "1", [FIELD + "btnSearch"]: "Search" });
  const found = new Map<string, GeorgiaFiling>();
  for (let page = 1; page <= pages; page++) {
    for (const r of rows(html, county)) if (!found.has(r.submissionId)) found.set(r.submissionId, r);
    const next = decode(html).match(new RegExp(`__doPostBack\\('([^']+)','Page\\$${page + 1}'\\)`));
    if (!next) break;
    html = await s.request(GEOS, { ...formState(html), __EVENTTARGET: next[1], __EVENTARGUMENT: `Page$${page + 1}` });
  }
  return [...found.values()];
}

/** Every NPDES filing in one county submitted between two dates (all result pages). */
function georgiaCounty(code: string, from: string, to: string): Promise<GeorgiaFiling[]> {
  return geosSearch({ [FIELD + "ddlSiteCounty"]: code, [FIELD + "txtStartDate"]: mdy(from), [FIELD + "txtEndDate"]: mdy(to) }, COUNTIES[code], MAX_PAGES);
}

/** SC DES boundaries in the Savannah River box matching `where`, newest first. */
async function carolinaBoundaries(where: string): Promise<CarolinaBoundary[]> {
  const q = new URLSearchParams({
    where,
    geometry: SC_BBOX,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "OBJECTID,DB_PROJECT,DB_DATE,POLY_AREA",
    returnGeometry: "false",
    f: "json",
  });
  const res = await fetch(`${SC_LAYER}?${q}`, { headers: { "User-Agent": UA }, cache: "no-store", signal: AbortSignal.timeout(45_000) });
  if (!res.ok) throw new Error(`gis.des.sc.gov answered ${res.status}`);
  const j = (await res.json()) as { error?: { message: string }; features?: { attributes: { OBJECTID: number; DB_PROJECT: string | null; DB_DATE: number | null; POLY_AREA: number | null } }[] };
  if (j.error) throw new Error(`SC DES: ${j.error.message}`);
  return (j.features ?? [])
    .map(({ attributes: a }) => ({
      objectId: a.OBJECTID,
      project: (a.DB_PROJECT ?? "").trim(),
      boundaryFiled: a.DB_DATE ? new Date(a.DB_DATE).toISOString().slice(0, 10) : null,
      acres: Math.round((a.POLY_AREA ?? 0) * 10) / 10,
    }))
    .sort((x, y) => (y.boundaryFiled ?? "").localeCompare(x.boundaryFiled ?? ""));
}

const NAME_PAGES = 3; // the newest 45 Georgia filings for a name
const NAME_ROWS = 40;

/** Filings of any kind whose facility (GA, statewide) or project (SC, Savannah River box) name contains `query`. */
export async function searchByName(query: string): Promise<PermitSearch> {
  const [georgia, southCarolina] = await Promise.all([
    geosSearch({ [FIELD + "txtFacilityName"]: query }, undefined, NAME_PAGES),
    carolinaBoundaries(`UPPER(DB_PROJECT) LIKE '%${query.toUpperCase().replace(/'/g, "''")}%'`),
  ]);
  return { query, checkedAt: new Date().toISOString(), georgia: georgia.slice(0, NAME_ROWS), southCarolina: southCarolina.slice(0, NAME_ROWS) };
}

/** Filings since `since` (YYYY-MM-DD, inclusive) that look like utility work. */
export async function checkSince(since: string): Promise<LiveCheck> {
  const today = new Date().toISOString().slice(0, 10);
  const [ga, scAll] = await Promise.all([
    Promise.all(Object.keys(COUNTIES).map(async (code) => ({ county: COUNTIES[code], rows: await georgiaCounty(code, since, today) }))),
    carolinaBoundaries(`DB_DATE >= DATE '${since}'`),
  ]);
  const sc = { total: scAll.length, utility: scAll.filter((b) => looksLikeUtility(b.project)) };
  return {
    checkedAt: new Date().toISOString(),
    since,
    georgia: {
      searches: ga.map((g) => ({ county: g.county, results: g.rows.length })),
      newFilings: ga.flatMap((g) => g.rows).filter((r) => looksLikeUtility(r.facility)),
    },
    southCarolina: { boundariesSince: sc.total, newBoundaries: sc.utility },
  };
}
