import { buildCoverageNotes } from "@/lib/market-data/coverage-notes";
import { FinvizScraperProvider } from "@/lib/market-data/providers/finviz-scraper";
import { FinnhubEarningsProvider } from "@/lib/market-data/providers/finnhub-earnings";
import { YahooFinanceProvider } from "@/lib/market-data/providers/yahoo-finance";
import { ProviderResult } from "@/lib/market-data/types";
import { MarketStockMetrics } from "@/types/stocks";

const primaryProvider = new YahooFinanceProvider();
const fallbackProvider = new FinvizScraperProvider();
const earningsProvider = new FinnhubEarningsProvider();

function mergeStockMetrics(primary: MarketStockMetrics | undefined, fallback: MarketStockMetrics | undefined, ticker: string): MarketStockMetrics {
  const merged: MarketStockMetrics = {
    ticker,
    currentPrice: primary?.currentPrice ?? fallback?.currentPrice ?? null,
    percentChangeFromYesterday: primary?.percentChangeFromYesterday ?? fallback?.percentChangeFromYesterday ?? null,
    fiftyTwoWeekHigh: primary?.fiftyTwoWeekHigh ?? fallback?.fiftyTwoWeekHigh ?? null,
    fiftyTwoWeekLow: primary?.fiftyTwoWeekLow ?? fallback?.fiftyTwoWeekLow ?? null,
    trailingPe: primary?.trailingPe ?? fallback?.trailingPe ?? null,
    forwardPe: primary?.forwardPe ?? fallback?.forwardPe ?? null,
    evToEbitda: primary?.evToEbitda ?? fallback?.evToEbitda ?? null,
    trailingDividendYield: primary?.trailingDividendYield ?? fallback?.trailingDividendYield ?? null,
    forwardDividendYield: primary?.forwardDividendYield ?? fallback?.forwardDividendYield ?? null,
    exDividendDate: primary?.exDividendDate ?? fallback?.exDividendDate ?? null,
    shortInterestPctOfFloat: primary?.shortInterestPctOfFloat ?? fallback?.shortInterestPctOfFloat ?? null,
    shortInterestPctOfTotalShares:
      primary?.shortInterestPctOfTotalShares ?? fallback?.shortInterestPctOfTotalShares ?? null,
    nextEarningsDate: primary?.nextEarningsDate ?? fallback?.nextEarningsDate ?? null,
    performance1Month: primary?.performance1Month ?? fallback?.performance1Month ?? null,
    performance3Months: primary?.performance3Months ?? fallback?.performance3Months ?? null,
    performance12Months: primary?.performance12Months ?? fallback?.performance12Months ?? null,
    missingFields: [],
    error: primary?.error ?? fallback?.error ?? null
  };

  merged.missingFields = Object.entries(merged)
    .filter(([key, value]) => !["ticker", "missingFields", "error"].includes(key) && value === null)
    .map(([key]) => key);

  return merged;
}

export async function getMarketDataForTickers(tickers: string[]): Promise<ProviderResult> {
  const [primaryResult, fallbackResult] = await Promise.all([
    primaryProvider.fetchStocks(tickers),
    fallbackProvider.fetchStocks(tickers)
  ]);
  const earningsResult = await earningsProvider.fetchStocks(tickers);

  const allTickers = [
    ...new Set([
      ...Object.keys(primaryResult.stocks),
      ...Object.keys(fallbackResult.stocks),
      ...Object.keys(earningsResult.stocks)
    ])
  ];
  const stocks = Object.fromEntries(
    allTickers.map((ticker) => [
      ticker,
      mergeStockMetrics(
        mergeStockMetrics(primaryResult.stocks[ticker], fallbackResult.stocks[ticker], ticker),
        earningsResult.stocks[ticker],
        ticker
      )
    ])
  );

  const allMissingFields = Object.values(stocks).flatMap((stock) => stock.missingFields);

  return {
    provider: `${primaryResult.provider} + ${fallbackResult.provider} + ${earningsResult.provider}`,
    stocks,
    coverageNotes: buildCoverageNotes(allMissingFields)
  };
}
