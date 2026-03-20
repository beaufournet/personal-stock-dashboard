import { buildCoverageNotes } from "@/lib/market-data/coverage-notes";
import { calculatePerformanceSeries } from "@/lib/market-data/performance";
import { MarketDataProvider, ProviderResult } from "@/lib/market-data/types";
import { MarketStockMetrics } from "@/types/stocks";

type YahooQuote = Record<string, unknown>;
type YahooSummary = Record<string, unknown>;

function getLastTwoNumbers(values: Array<number | null> | undefined): [number | null, number | null] {
  if (!values) {
    return [null, null];
  }

  const cleaned = values.filter((value): value is number => value !== null);
  if (cleaned.length === 0) {
    return [null, null];
  }

  if (cleaned.length === 1) {
    return [cleaned[0], null];
  }

  return [cleaned[cleaned.length - 1], cleaned[cleaned.length - 2]];
}

function getRawNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return value;
  }

  if (value && typeof value === "object" && "raw" in value) {
    const raw = (value as { raw?: unknown }).raw;
    return typeof raw === "number" ? raw : null;
  }

  return null;
}

function getRawDate(value: unknown): string | null {
  const timestamp = getRawNumber(value);

  if (timestamp === null) {
    return null;
  }

  return new Date(timestamp * 1000).toISOString();
}

function asPercent(value: number | null): number | null {
  if (value === null) {
    return null;
  }

  return value <= 1 ? value * 100 : value;
}

function getNestedValue(source: Record<string, unknown>, path: string[]): unknown {
  let current: unknown = source;

  for (const key of path) {
    if (Array.isArray(current)) {
      const index = Number(key);
      current = Number.isInteger(index) ? current[index] : undefined;
      continue;
    }

    if (!current || typeof current !== "object" || !(key in current)) {
      return null;
    }

    current = (current as Record<string, unknown>)[key];
  }

  return current;
}

function firstNumber(source: Record<string, unknown>, paths: string[][]): number | null {
  for (const path of paths) {
    const value = getRawNumber(getNestedValue(source, path));
    if (value !== null) {
      return value;
    }
  }

  return null;
}

function firstDate(source: Record<string, unknown>, paths: string[][]): string | null {
  for (const path of paths) {
    const value = getRawDate(getNestedValue(source, path));
    if (value !== null) {
      return value;
    }
  }

  return null;
}

async function fetchJson(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "personal-stock-dashboard/1.0"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return (await response.json()) as Record<string, unknown>;
}

export class YahooFinanceProvider implements MarketDataProvider {
  readonly name = "Yahoo Finance chart endpoint with optional summary enrichment";

  async fetchStocks(tickers: string[]): Promise<ProviderResult> {
    const uniqueTickers = [...new Set(tickers.map((ticker) => ticker.trim().toUpperCase()).filter(Boolean))];
    const stocks: Record<string, MarketStockMetrics> = {};
    const coverageFieldSet = new Set<string>();

    await Promise.all(
      uniqueTickers.map(async (ticker) => {
        try {
          const chartPayload = await fetchJson(
            `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
              ticker
            )}?range=1y&interval=1d&includePrePost=false&events=div%2Csplits`
          );

          const [quotePayloadResult, summaryPayloadResult] = await Promise.allSettled([
            fetchJson(
              `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(ticker)}`
            ),
            fetchJson(
              `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(
                ticker
              )}?modules=price,summaryDetail,defaultKeyStatistics,calendarEvents,financialData`
            )
          ]);

          const quotePayload =
            quotePayloadResult.status === "fulfilled" ? quotePayloadResult.value : ({} as YahooQuote);
          const summaryPayload =
            summaryPayloadResult.status === "fulfilled" ? summaryPayloadResult.value : ({} as YahooSummary);

          const quoteResult = ((((quotePayload.quoteResponse as YahooQuote | undefined)?.result ??
            []) as unknown[])?.[0] ?? {}) as YahooQuote;
          const summaryResult = ((((summaryPayload.quoteSummary as YahooSummary | undefined)?.result ??
            []) as unknown[])?.[0] ?? {}) as YahooSummary;
          const chartResult = ((((chartPayload.chart as YahooSummary | undefined)?.result ??
            []) as unknown[])?.[0] ?? {}) as YahooSummary;
          const chartMeta = (chartResult.meta as YahooSummary | undefined) ?? {};

          const currentPrice =
            getRawNumber(chartMeta.regularMarketPrice) ??
            getRawNumber(quoteResult.regularMarketPrice) ??
            firstNumber(summaryResult, [
              ["financialData", "currentPrice"],
              ["price", "regularMarketPrice"]
            ]);
          const chartPreviousClose = getRawNumber(chartMeta.chartPreviousClose);

          const shortInterest = firstNumber(summaryResult, [["defaultKeyStatistics", "sharesShort"]]);
          const sharesOutstanding = firstNumber(summaryResult, [["defaultKeyStatistics", "sharesOutstanding"]]);
          const adjCloseSeries = (((chartResult.indicators as YahooSummary | undefined)?.adjclose as unknown[])?.[0] as
            | { adjclose?: Array<number | null> }
            | undefined)?.adjclose;
          const closeSeries = (((chartResult.indicators as YahooSummary | undefined)?.quote as unknown[])?.[0] as
            | { close?: Array<number | null> }
            | undefined)?.close;
          const performance = calculatePerformanceSeries(
            currentPrice,
            (chartResult.timestamp as number[] | undefined) ?? undefined,
            adjCloseSeries ?? closeSeries
          );
          const [latestClose, previousClose] = getLastTwoNumbers(adjCloseSeries ?? closeSeries);
          const effectiveCurrentPrice = currentPrice ?? latestClose;

          const metrics: MarketStockMetrics = {
            ticker,
            currentPrice: effectiveCurrentPrice,
            percentChangeFromYesterday:
              previousClose !== null && effectiveCurrentPrice !== null && previousClose !== 0
                ? ((effectiveCurrentPrice - previousClose) / previousClose) * 100
                : chartPreviousClose !== null && effectiveCurrentPrice !== null && chartPreviousClose !== 0
                  ? ((effectiveCurrentPrice - chartPreviousClose) / chartPreviousClose) * 100
                  : getRawNumber(quoteResult.regularMarketChangePercent),
            fiftyTwoWeekHigh:
              getRawNumber(chartMeta.fiftyTwoWeekHigh) ??
              getRawNumber(quoteResult.fiftyTwoWeekHigh) ??
              firstNumber(summaryResult, [["summaryDetail", "fiftyTwoWeekHigh"]]),
            fiftyTwoWeekLow:
              getRawNumber(chartMeta.fiftyTwoWeekLow) ??
              getRawNumber(quoteResult.fiftyTwoWeekLow) ??
              firstNumber(summaryResult, [["summaryDetail", "fiftyTwoWeekLow"]]),
            trailingPe:
              getRawNumber(quoteResult.trailingPE) ??
              firstNumber(summaryResult, [
                ["summaryDetail", "trailingPE"],
                ["defaultKeyStatistics", "trailingPE"]
              ]),
            forwardPe:
              getRawNumber(quoteResult.forwardPE) ??
              firstNumber(summaryResult, [
                ["summaryDetail", "forwardPE"],
                ["defaultKeyStatistics", "forwardPE"]
              ]),
            evToEbitda: firstNumber(summaryResult, [["defaultKeyStatistics", "enterpriseToEbitda"]]),
            trailingDividendYield: asPercent(
              firstNumber(summaryResult, [["summaryDetail", "trailingAnnualDividendYield"]])
            ),
            forwardDividendYield: asPercent(
              getRawNumber(quoteResult.dividendYield) ??
                firstNumber(summaryResult, [["summaryDetail", "dividendYield"]])
            ),
            exDividendDate: firstDate(summaryResult, [["summaryDetail", "exDividendDate"]]),
            shortInterestPctOfFloat:
              getRawNumber(quoteResult.shortPercentOfFloat) ??
              firstNumber(summaryResult, [["defaultKeyStatistics", "shortPercentOfFloat"]]),
            shortInterestPctOfTotalShares:
              shortInterest !== null && sharesOutstanding !== null && sharesOutstanding > 0
                ? (shortInterest / sharesOutstanding) * 100
                : null,
            nextEarningsDate: firstDate(summaryResult, [
              ["calendarEvents", "earnings", "earningsDate", "0"],
              ["calendarEvents", "earnings", "earningsDate", "1"]
            ]),
            performance1Month: performance.performance1Month,
            performance3Months: performance.performance3Months,
            performance12Months: performance.performance12Months,
            missingFields: [],
            error: null
          };

          metrics.missingFields = Object.entries(metrics)
            .filter(([key, value]) => !["ticker", "missingFields", "error"].includes(key) && value === null)
            .map(([key]) => key);

          metrics.missingFields.forEach((field) => coverageFieldSet.add(field));
          stocks[ticker] = metrics;
        } catch (error) {
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
              "trailingDividendYield",
              "exDividendDate",
              "shortInterestPctOfFloat",
              "shortInterestPctOfTotalShares",
              "nextEarningsDate",
              "evToEbitda",
              "performance1Month",
              "performance3Months",
              "performance12Months"
            ],
            error: error instanceof Error ? error.message : "Unknown market data error"
          };

          stocks[ticker].missingFields.forEach((field) => coverageFieldSet.add(field));
        }
      })
    );

    return {
      provider: this.name,
      stocks,
      coverageNotes: buildCoverageNotes([...coverageFieldSet])
    };
  }
}
