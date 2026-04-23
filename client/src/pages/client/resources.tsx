import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "./layout";
import { ExternalLink, Pin, Search, X, Radio, AlertTriangle } from "lucide-react";

export interface ResourceRow {
  id: number;
  source: "IRS" | "MA_DOR";
  category: string;
  title: string;
  summary: string;
  url: string;
  pubDate: string | null;
  isPinned: boolean;
}

export interface NewsMeta {
  lastRefreshAt: string | null;
  ok: boolean;
  error: string | null;
}

export interface ResourcesResponse {
  resources: ResourceRow[];
  news?: NewsMeta;
}

export default function ClientResources() {
  const q = useQuery<ResourcesResponse>({ queryKey: ["/api/resources"] });
  return (
    <div className="p-8 max-w-6xl mx-auto">
      <PageHeader
        title="Official guidance"
        subtitle="Forms, publications, and updates from the IRS and Massachusetts Department of Revenue. Every link opens the official .gov source."
      />
      <LiveNewsPanel />
      <ResourcesBrowser resources={q.data?.resources || []} loading={q.isLoading} />
    </div>
  );
}

// -----------------------------------------------------------------------------
// Debounce hook — in-memory only (no storage).
function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// -----------------------------------------------------------------------------
// Multi-term AND matcher across title/summary/category/source.
function matchesAllTerms(row: ResourceRow, terms: string[]): boolean {
  if (!terms.length) return true;
  const hay = (
    row.title +
    " " +
    row.summary +
    " " +
    row.category +
    " " +
    (row.source === "MA_DOR" ? "MA DOR Massachusetts" : "IRS")
  ).toLowerCase();
  return terms.every((t) => hay.includes(t));
}

// -----------------------------------------------------------------------------
export function ResourcesBrowser({
  resources,
  loading,
  adminActions,
}: {
  resources: ResourceRow[];
  loading: boolean;
  adminActions?: (r: ResourceRow) => React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [source, setSource] = useState<"all" | "IRS" | "MA_DOR">("all");
  const [pinnedOnly, setPinnedOnly] = useState(false);

  // Exclude live-news items from the main browser — they belong in the news panel.
  const browsable = useMemo(() => resources.filter((r) => r.category !== "news"), [resources]);

  const debouncedQuery = useDebouncedValue(query, 200);

  const categories = useMemo(() => {
    const set = new Set<string>();
    browsable.forEach((r) => set.add(r.category));
    return Array.from(set).sort();
  }, [browsable]);

  const terms = useMemo(
    () => debouncedQuery.trim().toLowerCase().split(/\s+/).filter(Boolean),
    [debouncedQuery],
  );

  const filtered = useMemo(() => {
    return browsable.filter((r) => {
      if (category !== "all" && r.category !== category) return false;
      if (source !== "all" && r.source !== source) return false;
      if (pinnedOnly && !r.isPinned) return false;
      if (!matchesAllTerms(r, terms)) return false;
      return true;
    });
  }, [browsable, terms, category, source, pinnedOnly]);

  const pinned = filtered.filter((r) => r.isPinned);
  const byCat: Record<string, ResourceRow[]> = {};
  for (const r of filtered) {
    if (r.isPinned) continue;
    (byCat[r.category] ||= []).push(r);
  }
  const orderedCats = Object.keys(byCat).sort();

  const hasAnyFilter = !!query || category !== "all" || source !== "all" || pinnedOnly;

  function clearFilters() {
    setQuery("");
    setCategory("all");
    setSource("all");
    setPinnedOnly(false);
  }

  return (
    <>
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search title, summary, category…"
            className="pl-9 pr-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            data-testid="input-resource-search"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-2 w-6 h-6 rounded-sm flex items-center justify-center text-muted-foreground hover-elevate"
              aria-label="Clear search"
              data-testid="button-clear-search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <Select value={source} onValueChange={(v: any) => setSource(v)}>
          <SelectTrigger className="w-40" data-testid="select-resource-source">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            <SelectItem value="IRS">IRS</SelectItem>
            <SelectItem value="MA_DOR">MA DOR</SelectItem>
          </SelectContent>
        </Select>

        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-48" data-testid="select-resource-category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Switch
            checked={pinnedOnly}
            onCheckedChange={setPinnedOnly}
            data-testid="switch-pinned-only"
          />
          Pinned only
        </label>
      </div>

      {/* Result count */}
      <div className="flex items-center justify-between mb-4 text-xs text-muted-foreground">
        <span data-testid="text-resource-count">
          Showing <span className="font-medium text-foreground">{filtered.length}</span> of{" "}
          <span className="font-medium text-foreground">{browsable.length}</span> resources
        </span>
        {hasAnyFilter && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={clearFilters}
            data-testid="button-clear-filters"
          >
            Clear filters
          </Button>
        )}
      </div>

      {loading && <div className="text-sm text-muted-foreground">Loading…</div>}

      {!loading && browsable.length === 0 && (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            The resources feed hasn't been populated yet. Check back shortly.
          </CardContent>
        </Card>
      )}

      {!loading && browsable.length > 0 && filtered.length === 0 && (
        <Card>
          <CardContent className="p-10 text-center">
            <p className="text-sm text-muted-foreground mb-4">
              No resources match your filters.
            </p>
            <Button variant="outline" size="sm" onClick={clearFilters} data-testid="button-empty-clear">
              Clear filters
            </Button>
          </CardContent>
        </Card>
      )}

      {pinned.length > 0 && <Section title="Pinned" items={pinned} adminActions={adminActions} />}
      {orderedCats.map((cat) => (
        <Section
          key={cat}
          title={categoryLabel(cat)}
          items={byCat[cat]}
          adminActions={adminActions}
        />
      ))}
    </>
  );
}

function categoryLabel(cat: string): string {
  const map: Record<string, string> = {
    publications: "Publications",
    forms: "Forms & Instructions",
    guidance: "Guidance & Regulations",
    news: "News",
  };
  return map[cat] || cat.charAt(0).toUpperCase() + cat.slice(1);
}

function SourceBadge({ source }: { source: "IRS" | "MA_DOR" }) {
  if (source === "IRS") {
    return (
      <Badge
        className="flex-none text-[10px] uppercase tracking-wider bg-[hsl(219_45%_19%)] text-white hover:bg-[hsl(219_45%_19%)] border-transparent"
      >
        IRS
      </Badge>
    );
  }
  return (
    <Badge
      className="flex-none text-[10px] uppercase tracking-wider bg-[hsl(42_90%_40%)] text-white hover:bg-[hsl(42_90%_40%)] border-transparent"
    >
      MA DOR
    </Badge>
  );
}

function Section({
  title,
  items,
  adminActions,
}: {
  title: string;
  items: ResourceRow[];
  adminActions?: (r: ResourceRow) => React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <h2 className="font-serif text-xl text-primary mb-3">{title}</h2>
      <div className="grid md:grid-cols-2 gap-3">
        {items.map((r) => (
          <div
            key={r.id}
            className="group relative block p-4 bg-card border border-border rounded-md hover-elevate"
            data-testid={`card-resource-${r.id}`}
          >
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="flex items-center gap-2 min-w-0">
                <SourceBadge source={r.source} />
                {r.isPinned && <Pin className="w-3 h-3 text-[hsl(42_90%_40%)]" />}
              </div>
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline flex-none"
                data-testid={`link-open-${r.id}`}
                aria-label={`Open ${r.title}`}
              >
                Open <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <a
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium leading-snug mb-1 block hover:underline"
              data-testid={`link-title-${r.id}`}
            >
              {r.title}
            </a>
            <div className="text-xs text-muted-foreground line-clamp-2">{r.summary}</div>
            <div className="text-[11px] text-muted-foreground mt-2">
              {categoryLabel(r.category)}
              {r.pubDate ? ` · ${r.pubDate}` : ""}
            </div>
            {adminActions && <div className="mt-2">{adminActions(r)}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}

// -----------------------------------------------------------------------------
// Live news panel: auto-refreshing feed of the latest IRS + MA DOR news.
interface NewsResponse {
  news: ResourceRow[];
  lastRefreshAt: string | null;
  ok: boolean;
  error: string | null;
}

export function LiveNewsPanel() {
  const q = useQuery<NewsResponse>({
    queryKey: ["/api/resources/news"],
    // Refetch every 5 minutes; stale immediately so an interval refetch always runs.
    refetchInterval: 5 * 60 * 1000,
    refetchIntervalInBackground: false,
    staleTime: 60 * 1000,
  });

  // Re-render every minute so "2m ago" ticks forward without a network call.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  const items = q.data?.news || [];
  const top = items.slice(0, 10);
  const lastRefresh = q.data?.lastRefreshAt || q.dataUpdatedAt;
  const isOffline = q.data ? q.data.ok === false : q.isError;

  const relLast =
    lastRefresh != null
      ? typeof lastRefresh === "string"
        ? relativeTime(new Date(lastRefresh))
        : relativeTime(new Date(lastRefresh))
      : "never";

  return (
    <section className="mb-8" data-testid="section-live-news">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="relative flex w-2 h-2">
            <span
              className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${
                isOffline ? "bg-muted" : "bg-[hsl(42_90%_40%)] animate-ping"
              }`}
            />
            <span
              className={`relative inline-flex rounded-full h-2 w-2 ${
                isOffline ? "bg-muted-foreground" : "bg-[hsl(42_90%_40%)]"
              }`}
            />
          </span>
          <h2 className="font-serif text-xl text-primary">Live IRS &amp; MA DOR news</h2>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {isOffline && (
            <span
              className="inline-flex items-center gap-1 text-[hsl(42_90%_40%)]"
              data-testid="text-news-offline"
              title={q.data?.error || "Could not reach upstream feed"}
            >
              <AlertTriangle className="w-3 h-3" /> showing cached
            </span>
          )}
          <span data-testid="text-news-updated">
            <Radio className="w-3 h-3 inline -mt-0.5 mr-1" />
            Last updated: {relLast}
          </span>
        </div>
      </div>

      <Card>
        <CardContent className="p-0 divide-y divide-border">
          {q.isLoading && top.length === 0 && (
            <div className="p-5 text-sm text-muted-foreground">Loading latest releases…</div>
          )}
          {!q.isLoading && top.length === 0 && (
            <div className="p-5 text-sm text-muted-foreground" data-testid="text-news-empty">
              No recent news releases yet. The feed refreshes every 15 minutes.
            </div>
          )}
          {top.map((n) => (
            <a
              key={n.id}
              href={n.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-3 p-4 hover-elevate"
              data-testid={`link-news-${n.id}`}
            >
              <div className="flex-none pt-0.5">
                <SourceBadge source={n.source} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium leading-snug mb-0.5 group-hover:underline truncate">
                  {n.title}
                </div>
                {n.summary && n.summary !== n.title && (
                  <div className="text-xs text-muted-foreground line-clamp-1">{n.summary}</div>
                )}
              </div>
              <div className="flex-none text-[11px] text-muted-foreground whitespace-nowrap pt-0.5">
                {n.pubDate ? relativeTime(new Date(n.pubDate)) : ""}
                <ExternalLink className="w-3 h-3 inline ml-2 -mt-0.5" />
              </div>
            </a>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}

function relativeTime(d: Date): string {
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 0) return "just now";
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}
