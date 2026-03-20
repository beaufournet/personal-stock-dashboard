import { MarketDataResponse } from "@/types/stocks";

export async function fetchMarketData(tickers: string[]): Promise<MarketDataResponse> {
  const params = new URLSearchParams({
    tickers: tickers.join(",")
  });

  const response = await fetch(`/api/market?${params.toString()}`, {
    method: "GET",
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("Unable to load market data.");
  }

  return (await response.json()) as MarketDataResponse;
}
