"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchMarketData } from "@/lib/api-client";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatPercent,
  formatRatio,
  parseTargetPrice
} from "@/lib/formatters";
import { CoverageNote, MarketDataResponse, MarketStockMetrics, StockAction, UserStockRow } from "@/types/stocks";

const STORAGE_KEY = "personal-stock-dashboard-rows";

type SortDirection = "asc" | "desc";
type SortKey =
  | "ticker"
  | "action"
  | "targetPrice"
  | "currentPrice"
  | "percentChangeFromYesterday"
  | "fiftyTwoWeekHigh"
  | "fiftyTwoWeekLow"
  | "trailingPe"
  | "forwardPe"
  | "evToEbitda"
  | "trailingDividendYield"
  | "forwardDividendYield"
  | "exDividendDate"
  | "shortInterestPctOfFloat"
  | "shortInterestPctOfTotalShares"
  | "nextEarningsDate"
  | "performance1Month"
  | "performance3Months"
  | "performance12Months";

type SortState = {
  key: SortKey;
  direction: SortDirection;
};

type ColumnDefinition = {
  key: SortKey;
  label: string;
};

const columns: ColumnDefinition[] = [
  { key: "ticker", label: "Ticker" },
  { key: "action", label: "Action" },
  { key: "targetPrice", label: "Target Price" },
  { key: "currentPrice", label: "Current Price" },
  { key: "percentChangeFromYesterday", label: "% Change From Yesterday" },
  { key: "fiftyTwoWeekHigh", label: "52 Week High" },
  { key: "fiftyTwoWeekLow", label: "52 Week Low" },
  { key: "trailingPe", label: "Trailing P/E" },
  { key: "forwardPe", label: "Forward P/E" },
  { key: "evToEbitda", label: "EV/EBITDA" },
  { key: "trailingDividendYield", label: "Trailing Dividend Yield" },
  { key: "forwardDividendYield", label: "Forward Dividend Yield" },
  { key: "exDividendDate", label: "Ex-Dividend Date" },
  { key: "shortInterestPctOfFloat", label: "Short Interest % of Float" },
  { key: "shortInterestPctOfTotalShares", label: "Short Interest % of Total Shares" },
  { key: "nextEarningsDate", label: "Next Earnings Date" },
  { key: "performance1Month", label: "Performance 1 Month" },
  { key: "performance3Months", label: "Performance 3 Months" },
  { key: "performance12Months", label: "Performance 12 Months" }
];

function createEmptyRow(): UserStockRow {
  return {
    id: crypto.randomUUID(),
    ticker: "",
    action: "Watch",
    targetPrice: ""
  };
}

function normalizeTicker(value: string): string {
  return value.trim().toUpperCase();
}

function isWithinTwoPercentOfBoundary(current: number | null, boundary: number | null): boolean {
  if (current === null || boundary === null || boundary === 0) {
    return false;
  }

  return Math.abs(current - boundary) / boundary <= 0.02;
}

function getHighlightClass(row: UserStockRow, metrics?: MarketStockMetrics): string {
  if (!metrics) {
    return "";
  }

  const targetPrice = parseTargetPrice(row.targetPrice);
  const currentPrice = metrics.currentPrice;

  if (row.action === "Buy" && targetPrice !== null && currentPrice !== null && currentPrice <= targetPrice) {
    return "row-highlight-buy";
  }

  if (row.action === "Sell" && targetPrice !== null && currentPrice !== null && currentPrice >= targetPrice) {
    return "row-highlight-sell";
  }

  if (
    isWithinTwoPercentOfBoundary(currentPrice, metrics.fiftyTwoWeekHigh) ||
    isWithinTwoPercentOfBoundary(currentPrice, metrics.fiftyTwoWeekLow)
  ) {
    return "row-highlight-range";
  }

  return "";
}

function compareValues(left: string | number | null, right: string | number | null, direction: SortDirection) {
  if (left === null && right === null) {
    return 0;
  }

  if (left === null) {
    return 1;
  }

  if (right === null) {
    return -1;
  }

  if (typeof left === "number" && typeof right === "number") {
    return direction === "asc" ? left - right : right - left;
  }

  return direction === "asc"
    ? String(left).localeCompare(String(right))
    : String(right).localeCompare(String(left));
}

function getSortValue(row: UserStockRow, metrics: MarketStockMetrics | undefined, sortKey: SortKey) {
  if (sortKey === "ticker") {
    return normalizeTicker(row.ticker);
  }

  if (sortKey === "action") {
    return row.action;
  }

  if (sortKey === "targetPrice") {
    return parseTargetPrice(row.targetPrice);
  }

  return metrics?.[sortKey] ?? null;
}

export function StockDashboard() {
  const [rows, setRows] = useState<UserStockRow[]>([]);
  const [marketData, setMarketData] = useState<Record<string, MarketStockMetrics>>({});
  const [coverageNotes, setCoverageNotes] = useState<CoverageNote[]>([]);
  const [providerName, setProviderName] = useState("Loading...");
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLoadedRows, setHasLoadedRows] = useState(false);
  const [sortState, setSortState] = useState<SortState>({
    key: "ticker",
    direction: "asc"
  });

  useEffect(() => {
    // Local storage keeps personal watchlist rows in the browser only.
    const savedRows = window.localStorage.getItem(STORAGE_KEY);
    if (!savedRows) {
      setRows([createEmptyRow()]);
      setHasLoadedRows(true);
      return;
    }

    try {
      const parsed = JSON.parse(savedRows) as UserStockRow[];
      setRows(parsed.length > 0 ? parsed : [createEmptyRow()]);
    } catch {
      setRows([createEmptyRow()]);
    } finally {
      setHasLoadedRows(true);
    }
  }, []);

  useEffect(() => {
    if (!hasLoadedRows) {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  }, [hasLoadedRows, rows]);

  useEffect(() => {
    let isCancelled = false;

    async function loadData() {
      const tickers = rows.map((row) => normalizeTicker(row.ticker)).filter(Boolean);
      if (tickers.length === 0) {
        setMarketData({});
        setCoverageNotes([]);
        setProviderName("Yahoo Finance (unofficial public endpoints)");
        setRefreshedAt(null);
        return;
      }

      setLoading(true);

      try {
        const response: MarketDataResponse = await fetchMarketData(tickers);
        if (isCancelled) {
          return;
        }

        setMarketData(response.stocks);
        setCoverageNotes(response.coverageNotes);
        setProviderName(response.provider);
        setRefreshedAt(response.refreshedAt);
        setError(null);
      } catch (loadError) {
        if (isCancelled) {
          return;
        }

        setError(loadError instanceof Error ? loadError.message : "Unable to refresh market data.");
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    loadData();
    const intervalId = window.setInterval(loadData, 60_000);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [rows]);

  const sortedRows = useMemo(() => {
    const copy = [...rows];

    copy.sort((leftRow, rightRow) => {
      const leftTicker = normalizeTicker(leftRow.ticker);
      const rightTicker = normalizeTicker(rightRow.ticker);
      const leftMetrics = marketData[leftTicker];
      const rightMetrics = marketData[rightTicker];

      return compareValues(
        getSortValue(leftRow, leftMetrics, sortState.key),
        getSortValue(rightRow, rightMetrics, sortState.key),
        sortState.direction
      );
    });

    return copy;
  }, [marketData, rows, sortState]);

  function updateTicker(id: string, value: string) {
    setRows((currentRows) =>
      currentRows.map((row) => (row.id === id ? { ...row, ticker: value.toUpperCase() } : row))
    );
  }

  function updateAction(id: string, value: StockAction) {
    setRows((currentRows) =>
      currentRows.map((row) => (row.id === id ? { ...row, action: value } : row))
    );
  }

  function updateTargetPrice(id: string, value: string) {
    setRows((currentRows) =>
      currentRows.map((row) => (row.id === id ? { ...row, targetPrice: value } : row))
    );
  }

  function addRow() {
    setRows((currentRows) => [...currentRows, createEmptyRow()]);
  }

  function removeRow(id: string) {
    setRows((currentRows) => {
      const nextRows = currentRows.filter((row) => row.id !== id);
      return nextRows.length > 0 ? nextRows : [createEmptyRow()];
    });
  }

  function handleSort(column: SortKey) {
    setSortState((current) => {
      if (current.key === column) {
        return {
          key: column,
          direction: current.direction === "asc" ? "desc" : "asc"
        };
      }

      return {
        key: column,
        direction: "asc"
      };
    });
  }

  function renderSortIndicator(column: SortKey) {
    if (sortState.key !== column) {
      return "+/-";
    }

    return sortState.direction === "asc" ? "ASC" : "DESC";
  }

  return (
    <main className="page-shell">
      <section className="hero-card">
        <div>
          <p className="eyebrow">Personal-First Dashboard</p>
          <h1>Track your tickers, targets, and market context in one table.</h1>
          <p className="hero-copy">
            Rows are saved in your browser. Market data refreshes every 60 seconds through a server route that can
            move to Vercel later without changing the UI.
          </p>
        </div>

        <div className="hero-meta">
          <div className="meta-pill">
            <span>Provider</span>
            <strong>{providerName}</strong>
          </div>
          <div className="meta-pill">
            <span>Last Refresh</span>
            <strong>{formatDateTime(refreshedAt)}</strong>
          </div>
          <button className="primary-button" onClick={addRow} type="button">
            Add Row
          </button>
        </div>
      </section>

      {error ? <p className="status-banner error-banner">{error}</p> : null}
      {loading ? <p className="status-banner">Refreshing market data...</p> : null}

      <section className="table-card">
        <div className="table-scroll">
          <table className="stock-table">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.key}>
                    <button className="sort-button" onClick={() => handleSort(column.key)} type="button">
                      <span>{column.label}</span>
                      <span>{renderSortIndicator(column.key)}</span>
                    </button>
                  </th>
                ))}
                <th>Remove</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => {
                const metrics = marketData[normalizeTicker(row.ticker)];
                const highlightClass = getHighlightClass(row, metrics);

                return (
                  <tr key={row.id} className={highlightClass}>
                    <td className="sticky-ticker-cell">
                      <input
                        aria-label="Ticker"
                        className="table-input"
                        value={row.ticker}
                        onChange={(event) => updateTicker(row.id, event.target.value)}
                        placeholder="AAPL"
                      />
                    </td>
                    <td>
                      <select
                        aria-label="Action"
                        className="table-select"
                        value={row.action}
                        onChange={(event) => updateAction(row.id, event.target.value as StockAction)}
                      >
                        <option value="Watch">Watch</option>
                        <option value="Buy">Buy</option>
                        <option value="Sell">Sell</option>
                      </select>
                    </td>
                    <td>
                      <input
                        aria-label="Target Price"
                        className="table-input"
                        inputMode="decimal"
                        value={row.targetPrice}
                        onChange={(event) => updateTargetPrice(row.id, event.target.value)}
                        placeholder="185"
                      />
                    </td>
                    <td>{formatCurrency(metrics?.currentPrice ?? null)}</td>
                    <td>{formatPercent(metrics?.percentChangeFromYesterday ?? null)}</td>
                    <td>{formatCurrency(metrics?.fiftyTwoWeekHigh ?? null)}</td>
                    <td>{formatCurrency(metrics?.fiftyTwoWeekLow ?? null)}</td>
                    <td>{formatRatio(metrics?.trailingPe ?? null)}</td>
                    <td>{formatRatio(metrics?.forwardPe ?? null)}</td>
                    <td>{formatRatio(metrics?.evToEbitda ?? null)}</td>
                    <td>{formatPercent(metrics?.trailingDividendYield ?? null)}</td>
                    <td>{formatPercent(metrics?.forwardDividendYield ?? null)}</td>
                    <td>{formatDate(metrics?.exDividendDate ?? null)}</td>
                    <td>{formatPercent(metrics?.shortInterestPctOfFloat ?? null)}</td>
                    <td>{formatPercent(metrics?.shortInterestPctOfTotalShares ?? null)}</td>
                    <td>{formatDate(metrics?.nextEarningsDate ?? null)}</td>
                    <td>{formatPercent(metrics?.performance1Month ?? null)}</td>
                    <td>{formatPercent(metrics?.performance3Months ?? null)}</td>
                    <td>{formatPercent(metrics?.performance12Months ?? null)}</td>
                    <td>
                      <button className="danger-button" onClick={() => removeRow(row.id)} type="button">
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="notes-grid">
        <article className="info-card">
          <h2>Highlight Rules</h2>
          <p>Rows highlight amber when price is within 2% of the 52-week high or low.</p>
          <p>Rows highlight green for buy targets and red for sell targets when the current price crosses the target.</p>
        </article>

        <article className="info-card">
          <h2>Data Coverage Notes</h2>
          {coverageNotes.length === 0 ? (
            <p>No missing-field warnings from the current refresh.</p>
          ) : (
            coverageNotes.map((note) => (
              <div key={note.field} className="coverage-note">
                <strong>{note.field}</strong>
                <p>{note.reason}</p>
                <p>Alternative source: {note.alternativeSource}</p>
              </div>
            ))
          )}
        </article>
      </section>
    </main>
  );
}
