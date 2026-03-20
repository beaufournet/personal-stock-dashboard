export type StockAction = "Buy" | "Sell" | "Watch";

export type UserStockRow = {
  id: string;
  ticker: string;
  action: StockAction;
  targetPrice: string;
};

export type MarketStockMetrics = {
  ticker: string;
  currentPrice: number | null;
  percentChangeFromYesterday: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  trailingPe: number | null;
  forwardPe: number | null;
  evToEbitda: number | null;
  trailingDividendYield: number | null;
  forwardDividendYield: number | null;
  exDividendDate: string | null;
  shortInterestPctOfFloat: number | null;
  shortInterestPctOfTotalShares: number | null;
  nextEarningsDate: string | null;
  performance1Month: number | null;
  performance3Months: number | null;
  performance12Months: number | null;
  missingFields: string[];
  error: string | null;
};

export type CoverageNote = {
  field: string;
  reason: string;
  alternativeSource: string;
};

export type MarketDataResponse = {
  provider: string;
  refreshedAt: string;
  stocks: Record<string, MarketStockMetrics>;
  coverageNotes: CoverageNote[];
};
