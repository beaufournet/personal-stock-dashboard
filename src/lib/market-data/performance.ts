type PricePoint = {
  timestamp: number;
  close: number;
};

function findClosestPriceAtOrBefore(points: PricePoint[], targetTimestamp: number): number | null {
  let chosen: number | null = null;

  for (const point of points) {
    if (point.timestamp <= targetTimestamp) {
      chosen = point.close;
    } else {
      break;
    }
  }

  return chosen;
}

function calculatePercentChange(currentPrice: number | null, previousPrice: number | null): number | null {
  if (currentPrice === null || previousPrice === null || previousPrice === 0) {
    return null;
  }

  return ((currentPrice - previousPrice) / previousPrice) * 100;
}

export function calculatePerformanceSeries(
  currentPrice: number | null,
  timestamps: number[] | undefined,
  closes: Array<number | null> | undefined
) {
  if (!timestamps || !closes || timestamps.length !== closes.length) {
    return {
      performance1Month: null,
      performance3Months: null,
      performance12Months: null
    };
  }

  const points: PricePoint[] = timestamps
    .map((timestamp, index) => ({
      timestamp: timestamp * 1000,
      close: closes[index]
    }))
    .filter((point): point is PricePoint => point.close !== null);

  if (points.length === 0) {
    return {
      performance1Month: null,
      performance3Months: null,
      performance12Months: null
    };
  }

  const now = Date.now();
  const oneMonthAgo = now - 30 * 24 * 60 * 60 * 1000;
  const threeMonthsAgo = now - 91 * 24 * 60 * 60 * 1000;
  const twelveMonthsAgo = now - 365 * 24 * 60 * 60 * 1000;
  const current = currentPrice ?? points[points.length - 1].close;

  return {
    performance1Month: calculatePercentChange(current, findClosestPriceAtOrBefore(points, oneMonthAgo)),
    performance3Months: calculatePercentChange(current, findClosestPriceAtOrBefore(points, threeMonthsAgo)),
    performance12Months: calculatePercentChange(current, findClosestPriceAtOrBefore(points, twelveMonthsAgo))
  };
}
