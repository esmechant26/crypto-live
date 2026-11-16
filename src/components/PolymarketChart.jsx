import { useEffect, useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const WS_URL = "wss://ws-feed.exchange.coinbase.com";
const API_URL = "https://api.exchange.coinbase.com";
const MAX_LIVE_POINTS = 3000;

function formatPrice(value) {
  return Number(value).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function PolymarketChart({ startTime, endTime, duration }) {
  const [historicalData, setHistoricalData] = useState([]);
  const [liveData, setLiveData] = useState([]);
  const [latestPrice, setLatestPrice] = useState(null);
  const [lastTradeTime, setLastTradeTime] = useState(null);
  const [connection, setConnection] = useState("Connecting...");
  const [historyStatus, setHistoryStatus] = useState("Loading history...");
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 250);

    return () => clearInterval(interval);
  }, []);

  // Fetch completed one-minute candles from the start
  // of the current market round.
  useEffect(() => {
    const controller = new AbortController();

    async function loadHistory() {
      setHistoricalData([]);
      setHistoryStatus("Loading history...");

      const currentTime = Date.now();
      const completedMinute = Math.floor(currentTime / 60000) * 60000;

      if (completedMinute <= startTime) {
        setHistoryStatus("Collecting live trades");
        return;
      }

      const url = new URL(`${API_URL}/products/BTC-USD/candles`);

      url.searchParams.set("start", new Date(startTime).toISOString());
      url.searchParams.set("end", new Date(completedMinute).toISOString());
      url.searchParams.set("granularity", "60");

      try {
        const response = await fetch(url, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const candles = await response.json();

        const points = candles
          .map((candle) => ({
            // A candle's timestamp marks the start
            // of its one-minute interval.
            timestamp: candle[0] * 1000 + 60000,
            price: Number(candle[4]),
            source: "Historical 1m close",
          }))
          .filter((point) => Number.isFinite(point.price) && point.timestamp > startTime && point.timestamp <= completedMinute && point.timestamp < endTime)
          .sort((a, b) => a.timestamp - b.timestamp);

        if (!controller.signal.aborted) {
          setHistoricalData(points);
          setHistoryStatus(points.length ? "Historical candles loaded" : "No completed candles yet");
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error("Historical BTC fetch failed:", error);
          setHistoryStatus("Historical data unavailable");
        }
      }
    }

    loadHistory();

    return () => controller.abort();
  }, [startTime, endTime]);

  // Receive real-time BTC prices.
  useEffect(() => {
    let active = true;
    let socket;
    let retryTimer;
    let retryCount = 0;
    let pendingTrade = null;

    setLiveData([]);
    setLatestPrice(null);
    setLastTradeTime(null);
    setConnection("Connecting...");

    const flushInterval = setInterval(() => {
      if (!pendingTrade) return;

      const trade = pendingTrade;
      pendingTrade = null;

      setLiveData((previous) => [...previous, trade].slice(-MAX_LIVE_POINTS));

      setLatestPrice(trade.price);
      setLastTradeTime(trade.timestamp);
    }, 100);

    function connect() {
      if (!active) return;

      setConnection("Connecting...");
      socket = new WebSocket(WS_URL);

      socket.onopen = () => {
        if (!active) return;

        retryCount = 0;
        setConnection("Live");

        socket.send(
          JSON.stringify({
            type: "subscribe",
            product_ids: ["BTC-USD"],
            channels: ["ticker"],
          }),
        );
      };

      socket.onmessage = (event) => {
        if (!active) return;

        try {
          const message = JSON.parse(event.data);

          if (message.type !== "ticker" || message.product_id !== "BTC-USD") {
            return;
          }

          const price = Number(message.price);
          const timestamp = Date.parse(message.time);

          if (!Number.isFinite(price) || !Number.isFinite(timestamp) || timestamp < startTime || timestamp >= endTime) {
            return;
          }

          pendingTrade = {
            timestamp,
            price,
            source: "Live Coinbase trade",
          };
        } catch (error) {
          console.error("Invalid Coinbase message:", error);
        }
      };

      socket.onerror = () => {
        if (active) setConnection("Connection error");
      };

      socket.onclose = () => {
        if (!active) return;

        setConnection("Reconnecting...");

        const delay = Math.min(1000 * 2 ** retryCount, 30000);

        retryCount++;
        retryTimer = setTimeout(connect, delay);
      };
    }

    connect();

    return () => {
      active = false;
      clearInterval(flushInterval);
      clearTimeout(retryTimer);
      socket?.close();
    };
  }, [startTime, endTime]);

  const chartData = useMemo(() => {
    const liveStart = liveData.length ? Math.min(...liveData.map((point) => point.timestamp)) : Infinity;

    // Avoid showing historical candles that overlap
    // the live-trade portion of the chart.
    const history = historicalData.filter((point) => point.timestamp < liveStart);

    return [...history, ...liveData].sort((a, b) => a.timestamp - b.timestamp);
  }, [historicalData, liveData]);

  const chartEnd = Math.min(endTime, Math.max(startTime + 1000, now));

  const tradeAge = lastTradeTime == null ? null : Math.max(0, (now - lastTradeTime) / 1000);

  const displayConnection = connection === "Live" && tradeAge != null && tradeAge > 10 ? "Waiting for trades" : connection;

  return (
    <section className="polymarket-chart-section">
      <div className="polymarket-chart-header">
        <div>
          <h3>Live BTC Price</h3>
          <p>Coinbase Exchange · BTC/USD spot</p>
        </div>

        <span className="polymarket-chart-status">{displayConnection}</span>
      </div>

      <div className="polymarket-chart-price">
        <strong>{latestPrice == null ? "Waiting for BTC trades..." : formatPrice(latestPrice)}</strong>

        <span>{tradeAge == null ? "Waiting for a live trade" : `Last trade ${tradeAge.toFixed(1)}s ago`}</span>
      </div>

      <div className="polymarket-chart-container">
        {chartData.length === 0 ? (
          <div className="chart-empty">Waiting for BTC price data...</div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={chartData}>
              <XAxis
                dataKey="timestamp"
                type="number"
                scale="time"
                domain={[startTime, chartEnd]}
                tickFormatter={formatTime}
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                minTickGap={35}
                allowDataOverflow
              />

              <YAxis dataKey="price" type="number" domain={["auto", "auto"]} tickFormatter={(value) => `$${Number(value).toLocaleString()}`} tick={{ fill: "#94a3b8", fontSize: 11 }} width={90} />

              <Tooltip
                labelFormatter={formatTime}
                formatter={(value, name, item) => [formatPrice(value), item.payload.source]}
                contentStyle={{
                  background: "var(--background)",
                  border: "1px solid #29384f",
                  borderRadius: 8,
                }}
              />

              <Line type="linear" dataKey="price" stroke="#4ade80" strokeWidth={2} dot={chartData.length === 1} activeDot={{ r: 4 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="polymarket-chart-footer">
        <span>{duration === "5m" ? "5-minute market" : "15-minute market"}</span>

        <span>
          {formatTime(startTime)} – {formatTime(endTime)}
        </span>
      </div>

      <p className="polymarket-chart-note">
        {historyStatus}. Earlier prices use one-minute Coinbase candle closes; newer prices use live Coinbase ticker updates. This is not the official Polymarket settlement feed.
      </p>
    </section>
  );
}

export default PolymarketChart;
