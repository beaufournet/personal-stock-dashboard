import { buildCoverageNotes } from "@/lib/market-data/coverage-notes";
import { MarketDataProvider, ProviderResult } from "@/lib/market-data/types";
import { MarketStockMetrics } from "@/types/stocks";

type FinnhubEarningsEntry = {
  date?: string;
  hour?: string;
  symbol?: string;
};

function createEmptyMetrics(ticker: string, error: string | null = null): MarketStockMetrics {
  return {
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
    missingFields: ["nextEarningsDate"],
    error
  };
}

function buildDateRange() {
  const today = new Date();
  const from = today.toISOString().slice(0, 10);
  const toDate = new Date(today);
  toDate.setDate(toDate.getDate() + 180);
  const to = toDate.toISOString().slice(0, 10);

  return { from, to };
}

export class FinnhubEarningsProvider implements MarketDataProvider {
  readonly name = "Finnhub earnings calendar";

  async fetchStocks(tickers: string[]): Promise<ProviderResult> {
    const apiKey = process.env.FINNHUB_API_KEY;
    const uniqueTickers = [...new Set(tickers.map((ticker) => ticker.trim().toUpperCase()).filter(Boolean))];
    const stocks: Record<string, MarketStockMetrics> = {};

    if (!apiKey) {
      for (const ticker of uniqueTickers) {
        stocks[ticker] = createEmptyMetrics(ticker);
      }

      return {
        provider: `${this.name} (disabled: missing FINNHUB_API_KEY)`,
        stocks,
        coverageNotes: buildCoverageNotes(["nextEarningsDate"])
      };
    }

    const { from, to } = buildDateRange();

    await Promise.all(
      uniqueTickers.map(async (ticker) => {
        try {
          const url = new URL("https://finnhub.io/api/v1/calendar/earnings");
          url.searchParams.set("symbol", ticker);
          url.searchParams.set("from", from);
          url.searchParams.set("to", to);
          url.searchParams.set("token", apiKey);

          const response = await fetch(url.toString(), {
            headers: {
              "User-Agent": "personal-stock-dashboard/1.0"
            },
            cache: "no-store"
          });

          if (!response.ok) {
            throw new Error(`Request failed with status ${response.status}`);
          }

          const payload = (await response.json()) as { earningsCalendar?: FinnhubEarningsEntry[] };
          const firstUpcoming = (payload.earningsCalendar ?? []).find(
            (entry) => entry.symbol?.toUpperCase() === ticker && entry.date
          );

          const metrics = createEmptyMetrics(ticker);
          metrics.nextEarningsDate = firstUpcoming?.date ? new Date(firstUpcoming.date).toISOString() : null;
          metrics.missingFields = metrics.nextEarningsDate === null ? ["nextEarningsDate"] : [];
          stocks[ticker] = metrics;
        } catch (error) {
          stocks[ticker] = createEmptyMetrics(
            ticker,
            error instanceof Error ? error.message : "Unknown Finnhub error"
          );
        }
      })
    );

    const allMissingFields = Object.values(stocks).flatMap((stock) => stock.missingFields);

    return {
      provider: this.name,
      stocks,
      coverageNotes: buildCoverageNotes(allMissingFields)
    };
  }
}
