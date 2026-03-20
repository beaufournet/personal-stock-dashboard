import { NextRequest, NextResponse } from "next/server";
import { getMarketDataForTickers } from "@/lib/market-data/service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const tickersParam = request.nextUrl.searchParams.get("tickers") ?? "";
  const tickers = tickersParam
    .split(",")
    .map((ticker) => ticker.trim().toUpperCase())
    .filter(Boolean);

  if (tickers.length === 0) {
    return NextResponse.json({
      provider: "No provider called",
      refreshedAt: new Date().toISOString(),
      stocks: {},
      coverageNotes: []
    });
  }

  try {
    // The browser only talks to this route. The route talks to providers.
    const result = await getMarketDataForTickers(tickers);

    return NextResponse.json({
      provider: result.provider,
      refreshedAt: new Date().toISOString(),
      stocks: result.stocks,
      coverageNotes: result.coverageNotes
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
