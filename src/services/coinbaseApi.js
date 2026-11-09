const BASE_URL = "https://api.exchange.coinbase.com";

// Fetch historical Coinbase candles.
// Each candle contains a closing price for a time bucket.
export async function fetchHistoricalPrices(symbol, timeRange, signal) {
  const end = Date.now();

  const duration = timeRange === "24h" ? 86400000 : 3600000;

  // 5-minute candles for 24h, 1-minute for 1h.
  const granularity = timeRange === "24h" ? 300 : 60;

  const start = end - duration;

  const params = new URLSearchParams({
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
    granularity: String(granularity),
  });

  const url = `${BASE_URL}/products/${symbol}-USD/candles?${params}`;

  const response = await fetch(url, { signal });

  if (!response.ok) {
    throw new Error(`Historical data request failed: ${response.status}`);
  }

  const candles = await response.json();

  if (!Array.isArray(candles)) {
    throw new Error("Unexpected historical data format");
  }

  // Coinbase Exchange returns:
  // [time, low, high, open, close, volume]
  return candles
    .map((candle) => ({
      timestamp: Number(candle[0]) * 1000,
      price: Number(candle[4]),
    }))
    .filter((point) => Number.isFinite(point.timestamp) && Number.isFinite(point.price))
    .sort((a, b) => a.timestamp - b.timestamp);
}
