import { CoverageNote } from "@/types/stocks";

export const FIELD_NOTE_LIBRARY: Record<string, CoverageNote> = {
  trailingDividendYield: {
    field: "Trailing Dividend Yield",
    reason:
      "The primary Yahoo Finance endpoint often omits trailing dividend yield for non-dividend stocks, ETFs, or symbols with incomplete payout history.",
    alternativeSource: "Alpha Vantage, Finnhub, or Financial Modeling Prep dividend endpoints"
  },
  exDividendDate: {
    field: "Ex-Dividend Date",
    reason:
      "The primary Yahoo Finance endpoint does not always publish ex-dividend dates for every symbol or asset type.",
    alternativeSource: "Polygon.io reference data, Finnhub dividends, or Nasdaq corporate actions data"
  },
  shortInterestPctOfFloat: {
    field: "Short Interest % of Float",
    reason:
      "Short interest updates arrive less frequently than price data, and the free endpoint can be blank for some symbols.",
    alternativeSource: "Finnhub short interest, Financial Modeling Prep, or exchange/market data vendors"
  },
  shortInterestPctOfTotalShares: {
    field: "Short Interest % of Total Shares",
    reason:
      "This app calculates the value from short interest and shares outstanding, so it becomes unavailable when either input is missing from the source.",
    alternativeSource: "Financial Modeling Prep, Polygon.io fundamentals, or direct exchange short-interest files"
  },
  nextEarningsDate: {
    field: "Next Earnings Date",
    reason:
      "Yahoo Finance sometimes has no upcoming earnings calendar entry yet, especially for ETFs, ADRs, or companies without a confirmed date.",
    alternativeSource: "Finnhub earnings calendar, Financial Modeling Prep earnings calendar, or company IR pages"
  },
  evToEbitda: {
    field: "EV/EBITDA",
    reason:
      "Enterprise-value multiples may be unavailable when EBITDA or enterprise value is not published for the symbol.",
    alternativeSource: "Financial Modeling Prep fundamentals, Alpha Vantage fundamentals, or SEC-derived data providers"
  },
  performance1Month: {
    field: "Performance 1 Month",
    reason:
      "Performance is calculated from 1-year chart history. If historical prices are incomplete, the app cannot compute the return.",
    alternativeSource: "Polygon.io aggregates, Alpha Vantage daily adjusted prices, or Tiingo end-of-day history"
  },
  performance3Months: {
    field: "Performance 3 Months",
    reason:
      "Performance is calculated from 1-year chart history. If historical prices are incomplete, the app cannot compute the return.",
    alternativeSource: "Polygon.io aggregates, Alpha Vantage daily adjusted prices, or Tiingo end-of-day history"
  },
  performance12Months: {
    field: "Performance 12 Months",
    reason:
      "Performance is calculated from 1-year chart history. Newly listed companies or incomplete chart history can leave the metric blank.",
    alternativeSource: "Polygon.io aggregates, Alpha Vantage daily adjusted prices, or Tiingo end-of-day history"
  }
};

export function buildCoverageNotes(missingFields: string[]): CoverageNote[] {
  const seen = new Set<string>();

  return missingFields.flatMap((field) => {
    if (seen.has(field)) {
      return [];
    }

    seen.add(field);
    return [
      FIELD_NOTE_LIBRARY[field] ?? {
        field,
        reason:
          "The primary Yahoo Finance response did not include this field for the current symbol or asset type.",
        alternativeSource: "Alpha Vantage, Finnhub, Polygon.io, or Financial Modeling Prep"
      }
    ];
  });
}
