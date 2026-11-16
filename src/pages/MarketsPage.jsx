import { useEffect, useRef, useState } from "react";
import PriceChart from "../components/PriceChart";
import { fetchHistoricalPrices } from "../services/coinbaseApi";
import "../App.css";

const COINS = [
  { symbol: "BTC", name: "Bitcoin" },
  { symbol: "ETH", name: "Ethereum" },
  { symbol: "SOL", name: "Solana" },
  { symbol: "DOGE", name: "Dogecoin" },
];

const HISTORY_LIMIT = 60 * 60 * 1000;
const UPDATE_INTERVAL = 100;

const MUTED = "var(--muted)";
const GREEN = "var(--green)";

const panel = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  padding: "12px 16px",
};

function formatPrice(price) {
  if (!Number.isFinite(price)) return "—";

  return price.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

export default function MarketsPage() {
  const [prices, setPrices] = useState({});
  const [selectedCoin, setSelectedCoin] = useState("BTC");
  const [status, setStatus] = useState("Connecting...");
  const [timeRange, setTimeRange] = useState("1m");

  const [priceHistory, setPriceHistory] = useState({
    BTC: [],
    ETH: [],
    SOL: [],
    DOGE: [],
  });

  const [historicalPrices, setHistoricalPrices] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(null);

  const [now, setNow] = useState(Date.now());

  const pendingTrades = useRef([]);

  // Batch incoming trades every 100ms.
  useEffect(() => {
    const interval = setInterval(() => {
      const currentTime = Date.now();
      const cutoff = currentTime - HISTORY_LIMIT;
      const incoming = pendingTrades.current.splice(0);

      setNow(currentTime);

      setPriceHistory((previous) => {
        const updated = {};
        let changed = incoming.length > 0;

        for (const symbol of Object.keys(previous)) {
          const points = previous[symbol].filter((point) => point.timestamp >= cutoff);

          if (points.length !== previous[symbol].length) {
            changed = true;
          }

          updated[symbol] = points;
        }

        if (!changed) return previous;

        for (const trade of incoming) {
          if (updated[trade.symbol]) {
            updated[trade.symbol].push({
              timestamp: trade.timestamp,
              price: trade.price,
            });
          }
        }

        return updated;
      });
    }, UPDATE_INTERVAL);

    return () => clearInterval(interval);
  }, []);

  // Coinbase live prices.
  useEffect(() => {
    let active = true;
    let socket;
    let retryTimer;
    let retryCount = 0;

    const products = COINS.map((coin) => `${coin.symbol}-USD`);

    async function fetchInitialPrices() {
      const results = await Promise.allSettled(
        COINS.map(async ({ symbol }) => {
          const response = await fetch(`https://api.exchange.coinbase.com/products/${symbol}-USD/ticker`);

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          const data = await response.json();
          const price = Number(data.price);

          if (!Number.isFinite(price)) {
            throw new Error("Invalid price");
          }

          return { symbol, price };
        }),
      );

      if (!active) return;

      setPrices((previous) => {
        const updated = { ...previous };

        for (const result of results) {
          if (result.status === "fulfilled") {
            const { symbol, price } = result.value;

            if (updated[symbol] == null) {
              updated[symbol] = price;
            }
          }
        }

        return updated;
      });
    }

    function connect() {
      if (!active) return;

      setStatus("Connecting...");

      socket = new WebSocket("wss://ws-feed.exchange.coinbase.com");

      socket.onopen = () => {
        retryCount = 0;
        setStatus("Live");

        socket.send(
          JSON.stringify({
            type: "subscribe",
            product_ids: products,
            channels: ["ticker"],
          }),
        );
      };

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          if (message.type === "error") {
            console.error("Coinbase feed error:", message);
            setStatus("Feed error");
            return;
          }

          if (message.type !== "ticker") return;

          const symbol = message.product_id?.split("-")[0];
          const price = Number(message.price);

          if (!COINS.some((coin) => coin.symbol === symbol) || !Number.isFinite(price)) {
            return;
          }

          setPrices((previous) => ({
            ...previous,
            [symbol]: price,
          }));

          const timestamp = Date.parse(message.time);

          pendingTrades.current.push({
            symbol,
            price,
            timestamp: Number.isFinite(timestamp) ? timestamp : Date.now(),
          });
        } catch (error) {
          console.error("Invalid Coinbase message:", error);
        }
      };

      socket.onerror = () => {
        setStatus("Connection error");
      };

      socket.onclose = () => {
        if (!active) return;

        setStatus("Reconnecting...");

        const delay = Math.min(1000 * 2 ** retryCount, 30000);

        retryCount++;
        retryTimer = setTimeout(connect, delay);
      };
    }

    fetchInitialPrices().catch((error) => {
      console.error("Initial price fetch failed:", error);
    });

    connect();

    return () => {
      active = false;
      clearTimeout(retryTimer);
      socket?.close();
    };
  }, []);

  // Historical prices for selected coin.
  useEffect(() => {
    const controller = new AbortController();

    async function loadHistory() {
      setHistoryLoading(true);
      setHistoryError(null);
      setHistoricalPrices([]);

      try {
        const data = await fetchHistoricalPrices(selectedCoin, "24h", controller.signal);

        if (!controller.signal.aborted) {
          setHistoricalPrices(data);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setHistoryError(error.message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setHistoryLoading(false);
        }
      }
    }

    loadHistory();

    return () => controller.abort();
  }, [selectedCoin]);

  return (
    <main
      className="dashboard"
      style={{
        paddingTop: 12,
        paddingBottom: 12,
      }}
    >
      <section className="featured" style={{ padding: "16px 20px" }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            marginBottom: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 24 }}>Crypto Live</h1>
            <p
              style={{
                color: MUTED,
                fontSize: 12,
                margin: "3px 0 0",
              }}
            >
              Coinbase Exchange · Live Markets
            </p>
          </div>

          <span className={`live-indicator ${status === "Live" ? "is-live" : ""}`}>
            <span className="live-dot" />
            {status === "Live" ? "LIVE" : status}
          </span>
        </div>

        {/* Four compact market cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 10,
            marginBottom: 10,
          }}
        >
          {COINS.map((coin) => {
            const selected = selectedCoin === coin.symbol;

            return (
              <button
                key={coin.symbol}
                type="button"
                onClick={() => setSelectedCoin(coin.symbol)}
                style={{
                  ...panel,
                  textAlign: "left",
                  cursor: "pointer",
                  minWidth: 0,
                  border: selected ? "1px solid var(--accent)" : panel.border,
                  background: selected ? "var(--surface-raised)" : "var(--surface)",
                  color: "var(--text)",
                }}
              >
                <div
                  style={{
                    color: MUTED,
                    fontSize: 12,
                    marginBottom: 5,
                  }}
                >
                  {coin.symbol} / USD
                </div>

                <div
                  style={{
                    fontSize: "clamp(13px, 1.6vw, 23px)",
                    fontWeight: 700,
                    fontVariantNumeric: "tabular-nums",
                    overflowWrap: "anywhere",
                  }}
                >
                  {formatPrice(prices[coin.symbol])}
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected coin and chart */}
        <div
          style={{
            ...panel,
            padding: "12px 14px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 8,
              marginBottom: 8,
            }}
          >
            <div>
              <p
                style={{
                  margin: 0,
                  color: MUTED,
                  fontSize: 12,
                }}
              >
                {selectedCoin} / USD
              </p>

              <h2
                style={{
                  margin: "3px 0 0",
                  fontSize: 26,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {formatPrice(prices[selectedCoin])}
              </h2>
            </div>

            <span
              style={{
                color: MUTED,
                fontSize: 12,
              }}
            >
              Live price chart
            </span>
          </div>

          <PriceChart
            history={priceHistory[selectedCoin] || []}
            historicalPrices={historicalPrices}
            historyLoading={historyLoading}
            historyError={historyError}
            selectedCoin={selectedCoin}
            timeRange={timeRange}
            onTimeRangeChange={setTimeRange}
            now={now}
          />
        </div>
      </section>
    </main>
  );
}
