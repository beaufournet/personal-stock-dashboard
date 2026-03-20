import { CoverageNote, MarketStockMetrics } from "@/types/stocks";

export type ProviderResult = {
  provider: string;
  stocks: Record<string, MarketStockMetrics>;
  coverageNotes: CoverageNote[];
};

export interface MarketDataProvider {
  readonly name: string;
  fetchStocks(tickers: string[]): Promise<ProviderResult>;
}
