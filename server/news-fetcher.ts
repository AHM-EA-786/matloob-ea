// Live IRS & MA DOR news fetcher.
// Used by the resources endpoint to keep the "Latest News" panel fresh.
//
// Exports:
//   - fetchIrsNewsroom(): parses the IRS newsroom RSS feed.
//   - fetchMaDorNews(): parses the mass.gov DOR news HTML page.
//   - refreshLiveNews(): fetches both in parallel and upserts into the DB.
//   - lastRefreshAt(), lastRefreshStatus(): observability helpers.

import Parser from "rss-parser";
import { storage } from "./storage";
import type { InsertResource } from "@shared/schema";

export interface NormalizedNewsItem {
  source: "IRS" | "MA_DOR";
  category: "news";
  title: string;
  summary: string;
  url: string;
  pubDate: string | null;
}

const USER_AGENT = "Matloob-EA-Portal/1.1 (+https://matloobtaxandconsulting.com)";
const FETCH_TIMEOUT_MS = 12_000;

// ----- Feed URLs (tried in order; first non-empty wins) -----
const IRS_RSS_FEEDS = [
  "https://www.irs.gov/uac/newsroom-rss",
  "https://www.irs.gov/rss-feeds/tax-news",
  "https://www.irs.gov/rss-feeds/news-and-announcements-for-tax-professionals",
];

const MA_DOR_NEWS_URL = "https://www.mass.gov/orgs/massachusetts-department-of-revenue/news";

// ----- State -----
let _lastRefreshAt: Date | null = null;
let _lastRefreshOk = false;
let _lastRefreshError: string | null = null;
let _inFlight: Promise<void> | null = null;

export function lastRefreshAt(): Date | null {
  return _lastRefreshAt;
}
export function lastRefreshStatus(): { ok: boolean; error: string | null; at: Date | null } {
  return { ok: _lastRefreshOk, error: _lastRefreshError, at: _lastRefreshAt };
}

// ----- Helpers -----
function truncate(s: string, max = 400): string {
  const clean = s.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1).trimEnd() + "…";
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function toIsoDate(input: string | Date | undefined | null): string | null {
  if (!input) return null;
  try {
    const d = input instanceof Date ? input : new Date(input);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url: string, opts: RequestInit = {}, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...opts,
      signal: ctrl.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/rss+xml, application/xml, text/xml, text/html;q=0.8",
        ...(opts.headers as any),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

// ----- IRS newsroom RSS -----
export async function fetchIrsNewsroom(): Promise<NormalizedNewsItem[]> {
  const parser = new Parser({ timeout: FETCH_TIMEOUT_MS, headers: { "User-Agent": USER_AGENT } });
  const out: NormalizedNewsItem[] = [];
  const seen = new Set<string>();
  for (const feedUrl of IRS_RSS_FEEDS) {
    try {
      // Prefer fetching ourselves so we can set UA + timeout cleanly.
      const res = await fetchWithTimeout(feedUrl);
      if (!res.ok) continue;
      const xml = await res.text();
      const feed = await parser.parseString(xml);
      for (const item of feed.items || []) {
        const url = item.link || "";
        if (!url || seen.has(url)) continue;
        const title = (item.title || "").trim();
        if (!title) continue;
        const rawSummary = (item.contentSnippet || item.content || (item as any).summary || "") as string;
        const summary = truncate(stripHtml(rawSummary), 400) || title;
        out.push({
          source: "IRS",
          category: "news",
          title,
          summary,
          url,
          pubDate: toIsoDate(item.isoDate || item.pubDate),
        });
        seen.add(url);
      }
    } catch (err) {
      // keep trying other feeds
      continue;
    }
    if (out.length >= 10) break; // one working feed is enough
  }
  return out;
}

// ----- MA DOR news (HTML) -----
// The page lists news-release cards. We pull <a> tags under the news list.
export async function fetchMaDorNews(): Promise<NormalizedNewsItem[]> {
  const out: NormalizedNewsItem[] = [];
  try {
    const res = await fetchWithTimeout(MA_DOR_NEWS_URL);
    if (!res.ok) return out;
    const html = await res.text();

    // Strategy: find anchors to /news/ and /info-details/ pages inside mass.gov,
    // with a human-readable inner text. Dedup by URL.
    const anchorRe = /<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    const seen = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = anchorRe.exec(html)) !== null) {
      let href = m[1];
      const inner = stripHtml(m[2]);
      if (!inner || inner.length < 8 || inner.length > 200) continue;
      if (!/^(\/news\/|\/info-details\/|\/press-release\/|https?:\/\/www\.mass\.gov\/(news|info-details|press-release)\/)/i.test(href))
        continue;
      if (href.startsWith("/")) href = "https://www.mass.gov" + href;
      if (seen.has(href)) continue;
      // Skip obvious navigation-chrome links
      if (/^(search|filter|subscribe|view all|see all|back to top|skip to main)/i.test(inner)) continue;

      out.push({
        source: "MA_DOR",
        category: "news",
        title: truncate(inner, 200),
        summary: truncate(inner, 400),
        url: href,
        pubDate: null, // page-level dates are hard to pin to each link reliably
      });
      seen.add(href);
      if (out.length >= 15) break;
    }
  } catch {
    // swallow — caller handles failure
  }
  return out;
}

// ----- Refresh: fetch both, upsert -----
export async function refreshLiveNews(): Promise<{ inserted: number; total: number }> {
  // Coalesce concurrent calls
  if (_inFlight) {
    await _inFlight;
    return { inserted: 0, total: 0 };
  }
  const run = (async () => {
    const [irs, ma] = await Promise.allSettled([fetchIrsNewsroom(), fetchMaDorNews()]);
    const items: NormalizedNewsItem[] = [];
    if (irs.status === "fulfilled") items.push(...irs.value);
    if (ma.status === "fulfilled") items.push(...ma.value);

    // Require at least one source to succeed, otherwise mark failure.
    const irsOk = irs.status === "fulfilled" && irs.value.length > 0;
    const maOk = ma.status === "fulfilled" && ma.value.length > 0;

    let inserted = 0;
    for (const it of items) {
      try {
        const row: InsertResource & { addedAt: Date } = {
          source: it.source,
          category: it.category,
          title: it.title,
          summary: it.summary,
          url: it.url,
          pubDate: it.pubDate,
          isPinned: false,
          lastCheckedAt: new Date(),
          addedAt: new Date(),
        };
        await storage.upsertResource(row);
        inserted += 1;
      } catch {
        // individual item failure doesn't abort batch
      }
    }

    _lastRefreshAt = new Date();
    if (irsOk || maOk) {
      _lastRefreshOk = true;
      _lastRefreshError = null;
    } else {
      _lastRefreshOk = false;
      _lastRefreshError =
        irs.status === "rejected" ? String((irs as any).reason?.message || irs.reason) : "No items returned";
    }
    return { inserted, total: items.length };
  })();
  _inFlight = run.then(
    () => {
      _inFlight = null;
    },
    () => {
      _inFlight = null;
    },
  );
  return await run;
}

// Background-trigger helper — fire-and-forget; caller doesn't await.
const STALE_MS = 15 * 60 * 1000; // 15 minutes
export function maybeRefreshLiveNewsAsync(): void {
  const last = _lastRefreshAt?.getTime() ?? 0;
  if (Date.now() - last < STALE_MS) return;
  refreshLiveNews().catch((err) => {
    _lastRefreshAt = new Date();
    _lastRefreshOk = false;
    _lastRefreshError = String(err?.message || err);
    console.warn("[news-fetcher] refresh failed:", _lastRefreshError);
  });
}
