import { buildCoverageNotes } from "@/lib/market-data/coverage-notes";
import { MarketDataProvider, ProviderResult } from "@/lib/market-data/types";
import { MarketStockMetrics } from "@/types/stocks";

const FINVIZ_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const FINVIZ_CONCURRENCY = 2;

type CachedEntry = {
  fetchedAt: number;
  metrics: MarketStockMetrics;
};

const finvizCache = new Map<string, CachedEntry>();

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNumber(value: string): number | null {
  const normalized = value.replace(/,/g, "").trim();

  if (!normalized || normalized === "-") {
    return null;
  }

  const match = normalized.match(/^(-?\d+(?:\.\d+)?)([KMBT])?$/i);
  if (!match) {
    const direct = Number(normalized);
    return Number.isFinite(direct) ? direct : null;
  }

  const base = Number(match[1]);
  const suffix = match[2]?.toUpperCase();
  const multiplier =
    suffix === "K" ? 1_000 : suffix === "M" ? 1_000_000 : suffix === "B" ? 1_000_000_000 : suffix === "T" ? 1_000_000_000_000 : 1;

  return base * multiplier;
}

function parsePercent(value: string): number | null {
  const match = value.match(/(-?\d+(?:\.\d+)?)%/);
  return match ? Number(match[1]) : null;
}

function parseDateWithCurrentYear(value: string): string | null {
  const cleaned = value.replace(/\b(BMO|AMC)\b/gi, "").trim();
  if (!cleaned || cleaned === "-") {
    return null;
  }

  const withYear = /\d{4}/.test(cleaned) ? cleaned : `${cleaned} ${new Date().getFullYear()}`;
  const parsed = new Date(withYear);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function parseNextEarningsDate(value: string): string | null {
  const parsed = parseDateWithCurrentYear(value);
  if (!parsed) {
    return null;
  }

  return new Date(parsed).getTime() >= Date.now() ? parsed : null;
}

function extractSnapshotMap(html: string): Record<string, string> {
  const cellMatches = [...html.matchAll(/<td class="snapshot-td2[^"]*"[^>]*>([\s\S]*?)<\/td>/g)];
  const pairs: Record<string, string> = {};

  for (let index = 0; index < cellMatches.length - 1; index += 2) {
    const label = stripHtml(cellMatches[index][1]);
    const value = stripHtml(cellMatches[index + 1][1]);

    if (label) {
      pairs[label] = value;
    }
  }

  return pairs;
}

function isFresh(entry: CachedEntry | undefined): boolean {
  return Boolean(entry && Date.now() - entry.fetchedAt < FINVIZ_CACHE_TTL_MS);
}

async function mapWithConcurrency<TItem>(
  items: string[],
  concurrency: number,
  worker: (item: string) => Promise<TItem>
): Promise<TItem[]> {
  const results = new Array<TItem>(items.length);
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await worker(items[currentIndex]);
      }
    })
  );

  return results;
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: "https://finviz.com/",
      "User-Agent": "Mozilla/5.0"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return response.text();
}

export class FinvizScraperProvider implements MarketDataProvider {
  readonly name = "Finviz HTML fallback";

  async fetchStocks(tickers: string[]): Promise<ProviderResult> {
    const uniqueTickers = [...new Set(tickers.map((ticker) => ticker.trim().toUpperCase()).filter(Boolean))];
    const stocks: Record<string, MarketStockMetrics> = {};
    const coverageFieldSet = new Set<string>();

    await mapWithConcurrency(uniqueTickers, FINVIZ_CONCURRENCY, async (ticker) => {
      const staleCacheEntry = finvizCache.get(ticker);
      if (staleCacheEntry && isFresh(staleCacheEntry)) {
        stocks[ticker] = staleCacheEntry.metrics;
        staleCacheEntry.metrics.missingFields.forEach((field) => coverageFieldSet.add(field));
        return;
      }

      try {
        const html = await fetchHtml(`https://finviz.com/quote.ashx?t=${encodeURIComponent(ticker)}&p=d`);
        const snapshot = extractSnapshotMap(html);
        const shortFloatPct = parsePercent(snapshot["Short Float"] ?? "");
        const sharesFloat = parseNumber(snapshot["Shs Float"] ?? "");
        const sharesOutstanding = parseNumber(snapshot["Shs Outstand"] ?? "");
        const trailingDividendYield = parsePercent(snapshot["Dividend TTM"] ?? "");
        const forwardDividendYield = parsePercent(snapshot["Dividend Est."] ?? "");
        const nextEarningsDate = parseNextEarningsDate(snapshot["Earnings"] ?? "");

        const metrics: MarketStockMetrics = {
          ticker,
          currentPrice: null,
          percentChangeFromYesterday: null,
          fiftyTwoWeekHigh: null,
          fiftyTwoWeekLow: null,
          trailingPe: parseNumber(snapshot["P/E"] ?? ""),
          forwardPe: parseNumber(snapshot["Forward P/E"] ?? ""),
          evToEbitda: parseNumber(snapshot["EV/EBITDA"] ?? ""),
          trailingDividendYield,
          forwardDividendYield,
          exDividendDate: parseDateWithCurrentYear(snapshot["Dividend Ex-Date"] ?? ""),
          shortInterestPctOfFloat: shortFloatPct,
          shortInterestPctOfTotalShares:
            shortFloatPct !== null && sharesFloat !== null && sharesOutstanding !== null && sharesOutstanding > 0
              ? shortFloatPct * (sharesFloat / sharesOutstanding)
              : null,
          nextEarningsDate,
          performance1Month: null,
          performance3Months: null,
          performance12Months: parsePercent(snapshot["Perf Year"] ?? ""),
          missingFields: [],
          error: null
        };

        metrics.missingFields = Object.entries(metrics)
          .filter(([key, value]) => !["ticker", "missingFields", "error"].includes(key) && value === null)
          .map(([key]) => key);

        finvizCache.set(ticker, {
          fetchedAt: Date.now(),
          metrics
        });

        metrics.missingFields.forEach((field) => coverageFieldSet.add(field));
        stocks[ticker] = metrics;
      } catch (error) {
        if (staleCacheEntry) {
          stocks[ticker] = staleCacheEntry.metrics;
          staleCacheEntry.metrics.missingFields.forEach((field) => coverageFieldSet.add(field));
          return;
        }

        stocks[ticker] = {
          ticker,
          currentPrice: null,
          percentChangeFromYesterday: null,
          fiftyTwoWeekHigh: null,
          fiftyTwoWeekLow: null,
          trailingPe: null,
          forwardPe: null,
          evToEbitda: null,
          trailingDividendYield: null,
          forwardDividendYield: null,
          exDividendDate: null,
          shortInterestPctOfFloat: null,
          shortInterestPctOfTotalShares: null,
          nextEarningsDate: null,
          performance1Month: null,
          performance3Months: null,
          performance12Months: null,
          missingFields: [
            "trailingPe",
            "forwardPe",
            "evToEbitda",
            "trailingDividendYield",
            "forwardDividendYield",
            "exDividendDate",
            "shortInterestPctOfFloat",
            "shortInterestPctOfTotalShares",
            "nextEarningsDate",
            "performance12Months"
          ],
          error: error instanceof Error ? error.message : "Unknown fallback provider error"
        };

        stocks[ticker].missingFields.forEach((field) => coverageFieldSet.add(field));
      }
    });

    return {
      provider: this.name,
      stocks,
      coverageNotes: buildCoverageNotes([...coverageFieldSet])
    };
  }
}
