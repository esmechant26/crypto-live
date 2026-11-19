import { useEffect, useState } from "react";
import { fetchCurrentMarket, getCurrentMarketSlug, fetchPriceToBeat } from "../services/polymarketApi";
import { subscribeChainlinkTwap } from "../services/chainlinkApi";
import { subscribeMarketPrices } from "../services/polymarketSocket";
import ChainlinkChart from "../components/ChainlinkChart";

const DURATIONS = [
  { label: "5 min", value: "5m" },
  { label: "15 min", value: "15m" },
];

const GREEN = "var(--green)";
const RED = "var(--red)";
const MUTED = "var(--muted)";

const FIVE_MINUTES = 5 * 60 * 1000;

function money(value) {
  if (!Number.isFinite(value)) return "—";

  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function changeText(value) {
  if (!Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : "-"}${money(Math.abs(value))}`;
}

function cents(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}¢` : "—";
}

function countdown(ms) {
  const total = Math.ceil(Math.max(0, ms) / 1000);

  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function getChange(history, seconds) {
  if (history.length < 2) return null;

  const latest = history.at(-1);
  const target = latest.timestamp - seconds * 1000;

  const earlier = [...history].reverse().find((point) => point.timestamp <= target);

  if (!earlier || target - earlier.timestamp > 2000) {
    return null;
  }

  return latest.price - earlier.price;
}

const panel = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  padding: "12px 16px",
};

const labelStyle = {
  color: MUTED,
  fontSize: 12,
  margin: 0,
};

const numberStyle = {
  fontSize: "clamp(19px, 2.2vw, 28px)",
  fontWeight: 700,
  margin: "5px 0 0",
  fontVariantNumeric: "tabular-nums",
};

export default function PolymarketPage() {
  const [duration, setDuration] = useState("5m");
  const [now, setNow] = useState(Date.now());

  const [market, setMarket] = useState(null);
  const [marketError, setMarketError] = useState(null);

  const [chainlink, setChainlink] = useState(null);
  const [chainlinkStatus, setChainlinkStatus] = useState("connecting");

  const [history, setHistory] = useState([]);
  const [spotHistory, setSpotHistory] = useState([]);

  // Coinbase BTC spot trades, separate from the Chainlink settlement feed.
  useEffect(() => {
    let socket;
    let retry;
    let closed = false;

    function connect() {
      socket = new WebSocket("wss://ws-feed.exchange.coinbase.com");
      socket.onopen = () => {
        socket.send(
          JSON.stringify({
            type: "subscribe",
            product_ids: ["BTC-USD"],
            channels: ["ticker"],
          }),
        );
      };
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type !== "ticker" || message.product_id !== "BTC-USD") return;
          const price = Number(message.price);
          const timestamp = Date.now();
          if (!Number.isFinite(price) || price <= 0) return;
          setSpotHistory((previous) => [...previous.filter((point) => point.timestamp >= timestamp - 15000), { price, timestamp }].slice(-300));
        } catch {
          // Ignore malformed messages.
        }
      };
      socket.onclose = () => {
        if (!closed) retry = setTimeout(connect, 2000);
      };
    }

    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      socket?.close();
    };
  }, []);

  const [quotes, setQuotes] = useState({});
  const [bookStatus, setBookStatus] = useState("waiting");

  const [targetData, setTargetData] = useState(null);
  const [targetStatus, setTargetStatus] = useState("loading");

  // Stores exact Chainlink boundary observations.
  // Keys are Unix timestamps in milliseconds.

  const [boundaryTargets, setBoundaryTargets] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("cryptoLiveBoundaryTargets") || "{}");
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("cryptoLiveBoundaryTargets", JSON.stringify(boundaryTargets));
    } catch {
      // Storage unavailable; live capture still works.
    }
  }, [boundaryTargets]);

  const round = getCurrentMarketSlug(duration, now);
  const currentSlug = round.slug;

  const isCurrentMarket = market?.slug === currentSlug;

  // Keep the dashboard clock updated.
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 250);

    return () => clearInterval(timer);
  }, []);

  // Subscribe to Chainlink only once.
  useEffect(() => {
    return subscribeChainlinkTwap((update) => {
      setChainlink(update);

      if (!Number.isFinite(update.price) || !Number.isFinite(update.timestamp)) {
        return;
      }

      // Capture exact five-minute boundaries.
      // Every fifteen-minute boundary is also
      // a five-minute boundary.
      if (update.timestamp % FIVE_MINUTES === 0) {
        const boundaryTimestamp = update.timestamp;

        setBoundaryTargets((previous) => {
          if (previous[boundaryTimestamp] !== undefined) {
            return previous;
          }

          // Keep only recent boundaries.
          const cutoff = boundaryTimestamp - 60 * 60 * 1000;

          const recent = Object.fromEntries(Object.entries(previous).filter(([timestamp]) => Number(timestamp) >= cutoff));

          return {
            ...recent,
            [boundaryTimestamp]: update.price,
          };
        });
      }
    }, setChainlinkStatus);
  }, []);

  // Keep observations across round changes so the rolling chart
  // does not restart every 5 or 15 minutes.
  // Collect TWAP60 history continuously.
  useEffect(() => {
    if (!chainlink || !Number.isFinite(chainlink.price) || !Number.isFinite(chainlink.timestamp)) {
      return;
    }

    setHistory((previous) => {
      const valid = previous.filter((point) => point.timestamp >= chainlink.timestamp - 60 * 60 * 1000);

      if (valid.some((point) => point.timestamp === chainlink.timestamp)) {
        return previous;
      }

      return [
        ...valid,
        {
          timestamp: chainlink.timestamp,
          price: chainlink.price,
        },
      ]
        .sort((a, b) => a.timestamp - b.timestamp)
        .slice(-2000);
    });
  }, [chainlink]);

  // Discover the current Polymarket market.
  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    setMarket(null);
    setMarketError(null);

    async function load() {
      try {
        const result = await fetchCurrentMarket(duration, controller.signal);

        if (!active) return;

        setMarket((previous) => {
          if (previous?.slug === result.slug && previous?.upTokenId === result.upTokenId && previous?.downTokenId === result.downTokenId && previous?.priceToBeat === result.priceToBeat) {
            return previous;
          }

          return result;
        });

        setMarketError(null);
      } catch (error) {
        if (!active || controller.signal.aborted) {
          return;
        }

        setMarketError(error.message);
      }
    }

    load();

    const retry = setInterval(load, 10000);

    return () => {
      active = false;
      controller.abort();
      clearInterval(retry);
    };
  }, [duration, currentSlug]);

  const upTokenId = isCurrentMarket ? market.upTokenId : null;

  const downTokenId = isCurrentMarket ? market.downTokenId : null;

  // Live Polymarket order-book prices.
  useEffect(() => {
    setQuotes({});
    setBookStatus("waiting");

    if (!upTokenId || !downTokenId) return;

    return subscribeMarketPrices(
      { upTokenId, downTokenId },
      ({ side, price, receivedAt }) => {
        setQuotes((previous) => ({
          ...previous,
          [side]: {
            price,
            receivedAt,
            changedAt: previous[side]?.price === price ? previous[side].changedAt : receivedAt,
          },
        }));
      },
      (status) => {
        setBookStatus(status);

        if (status === "reconnecting" || status === "error") {
          setQuotes({});
        }
      },
    );
  }, [upTokenId, downTokenId]);

  // API fallback when this browser missed the exact opening observation.
  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    setTargetData(null);
    setTargetStatus("loading");

    async function loadTarget() {
      try {
        const result = await fetchPriceToBeat(duration, controller.signal);

        if (!active) return;

        if (result?.slug === currentSlug) {
          setTargetData(result);
          setTargetStatus("ready");
        } else {
          setTargetData(null);
          setTargetStatus("unavailable");
        }
      } catch (error) {
        if (!active || controller.signal.aborted) {
          return;
        }

        console.error("Price to Beat:", error);
        setTargetStatus("unavailable");
      }
    }

    loadTarget();

    const interval = setInterval(loadTarget, 10000);

    return () => {
      active = false;
      controller.abort();
      clearInterval(interval);
    };
  }, [duration, currentSlug]);

  // Current Chainlink freshness.
  const chainlinkAge = chainlink ? now - chainlink.timestamp : Infinity;

  const chainlinkFresh =
    chainlinkStatus === "live" &&
    chainlink &&
    Number.isFinite(chainlink.price) &&
    chainlinkAge >= 0 &&
    chainlinkAge <= 10000 &&
    now - chainlink.receivedAt <= 10000 &&
    chainlink.timestamp >= round.startTime &&
    chainlink.timestamp < round.endTime;

  const livePrice = chainlinkFresh ? chainlink.price : null;

  // Exact opening observation for the selected round.
  const storedBoundary = Number(boundaryTargets[round.startTime]);
  const boundaryPriceToBeat = Number.isFinite(storedBoundary) && storedBoundary > 0 ? storedBoundary : null;

  // Prefer the observed Chainlink boundary price.
  // Fall back to Gamma only when available.
  const gammaPriceToBeat =
    targetData?.slug === currentSlug && Number.isFinite(targetData.price) ? targetData.price : isCurrentMarket && Number.isFinite(market.priceToBeat) ? market.priceToBeat : null;

  const priceToBeat = boundaryPriceToBeat ?? gammaPriceToBeat;

  const targetLabel =
    boundaryPriceToBeat !== null
      ? "Chainlink opening reference"
      : priceToBeat == null
        ? targetStatus === "loading"
          ? "Loading target..."
          : "Target unavailable"
        : targetData?.source === "previous-close"
          ? "Previous close · provisional"
          : "Opening reference";

  // Only show fresh order-book quotes.
  function freshAsk(side) {
    const quote = quotes[side];

    if (bookStatus !== "live" || !quote || !Number.isFinite(quote.price) || now - quote.receivedAt > 15000) {
      return null;
    }

    return quote.price;
  }

  const upAsk = freshAsk("up");
  const downAsk = freshAsk("down");

  // Conservative, read-only signal. A stale quote or missing target
  // must never be presented as a betting opportunity.
  const recentSpot = spotHistory.filter((point) => now - point.timestamp <= 6000);
  const spotLatest = recentSpot.at(-1);
  const spotEarlier = recentSpot[0];
  const spotMove = spotLatest && spotEarlier ? spotLatest.price - spotEarlier.price : null;
  const quotesFresh = ["up", "down"].every((side) => Number.isFinite(quotes[side]?.price) && now - quotes[side].receivedAt < 3000 && Number.isFinite(quotes[side].changedAt));
  const hasLagData =
    chainlinkFresh &&
    Number.isFinite(priceToBeat) &&
    bookStatus === "live" &&
    quotesFresh &&
    spotLatest &&
    now - spotLatest.timestamp < 3000 &&
    recentSpot.length >= 2 &&
    spotLatest.timestamp - spotEarlier.timestamp >= 4000 &&
    round.endTime - now > 20000;

  const staticSide = spotMove > 0 ? "up" : "down";
  const lagDetected = hasLagData && Math.abs(spotMove) >= 20 && now - quotes[staticSide].changedAt >= 3000;
  const lagLabel = !hasLagData ? "Insufficient Data" : lagDetected ? "Possible Lag" : "Normal";
  const lagClass = !hasLagData ? "insufficient" : lagDetected ? "lag" : "normal";
  const feedLabel = chainlinkFresh ? "LIVE" : chainlinkStatus === "connecting" ? "CONNECTING" : "STALE";

  const movement = [
    {
      label: "5s",
      value: chainlinkFresh ? getChange(history, 5) : null,
    },
    {
      label: "15s",
      value: chainlinkFresh ? getChange(history, 15) : null,
    },
    {
      label: "30s",
      value: chainlinkFresh ? getChange(history, 30) : null,
    },
  ];

  return (
    <main
      className="dashboard"
      style={{
        paddingTop: 12,
        paddingBottom: 12,
      }}
    >
      <section
        className="featured"
        style={{
          padding: "16px 20px",
        }}
      >
        {/* Compact header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 12,
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: 24,
              }}
            >
              Crypto Live
            </h1>

            <p
              style={{
                margin: "3px 0 0",
                color: MUTED,
                fontSize: 12,
              }}
            >
              BTC / USD · Polymarket Monitor
            </p>
          </div>

          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
            }}
          >
            {DURATIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setDuration(option.value)}
                style={{
                  padding: "7px 13px",
                  borderRadius: 7,
                  border: "1px solid var(--border)",
                  background: duration === option.value ? "var(--accent)" : "var(--surface)",
                  color: duration === option.value ? "#ffffff" : "var(--text)",
                  cursor: "pointer",
                }}
              >
                {option.label}
              </button>
            ))}

            <span className={`live-indicator ${chainlinkFresh ? "is-live" : "is-inactive"}`} role="status" aria-label={`Chainlink feed: ${feedLabel.toLowerCase()}`}>
              <span className="live-dot" aria-hidden="true" />
              {feedLabel}
            </span>
          </div>
        </div>

        {/* Main numbers */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 10,
            marginBottom: 10,
          }}
        >
          <div style={panel}>
            <p style={labelStyle}>Chainlink TWAP60</p>

            <p style={numberStyle}>{money(livePrice)}</p>

            <small style={{ color: MUTED }}>{chainlinkFresh ? `${(chainlinkAge / 1000).toFixed(1)}s old` : chainlinkStatus}</small>
          </div>

          <div style={panel}>
            <p style={labelStyle}>Price to Beat</p>

            <p style={numberStyle}>{money(priceToBeat)}</p>

            <small style={{ color: MUTED }}>{targetLabel}</small>
          </div>

          <div style={panel}>
            <p style={labelStyle}>Time Left</p>

            <p style={numberStyle}>{countdown(round.endTime - now)}</p>

            <small style={{ color: MUTED }}>{duration} round</small>
          </div>
        </div>

        {/* Compact price movement */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 10,
            marginBottom: 12,
          }}
        >
          {movement.map(({ label, value }) => (
            <div
              key={label}
              style={{
                ...panel,
                padding: "9px 14px",
              }}
            >
              <span style={labelStyle}>{label} change</span>

              <strong
                style={{
                  display: "block",
                  marginTop: 3,
                  fontSize: 19,
                  color: value == null ? "var(--text)" : value >= 0 ? GREEN : RED,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {changeText(value)}
              </strong>
            </div>
          ))}
        </div>

        {/* Simple lag indicator: informational, not a bet recommendation. */}
        <div style={{ ...panel, marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <span style={{ ...labelStyle, fontSize: 13 }}>Polymarket Lag</span>
          <strong className={`lag-status ${lagClass}`}>{lagLabel}</strong>
        </div>

        {/* Main chart */}
        <div
          style={{
            ...panel,
            padding: "12px 14px",
            marginBottom: 10,
          }}
        >
          <ChainlinkChart history={history} now={now} />
        </div>

        {/* Polymarket asks */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 10,
          }}
        >
          {[
            {
              side: "up",
              label: "UP",
              value: upAsk,
              color: GREEN,
            },
            {
              side: "down",
              label: "DOWN",
              value: downAsk,
              color: RED,
            },
          ].map(({ side, label, value, color }) => (
            <div
              key={side}
              style={{
                ...panel,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div>
                <p style={labelStyle}>{label} · Best ask</p>

                <p
                  style={{
                    ...numberStyle,
                    color,
                    fontSize: 25,
                  }}
                >
                  {cents(value)}
                </p>
              </div>

              <small
                style={{
                  color: MUTED,
                }}
              >
                {value == null ? "Waiting" : `${(Math.max(0, now - quotes[side].receivedAt) / 1000).toFixed(1)}s ago`}
              </small>
            </div>
          ))}
        </div>

        {/* Minimal footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 8,
            marginTop: 10,
            fontSize: 11,
            color: MUTED,
          }}
        >
          <span>
            Chainlink: {chainlinkStatus}
            {" · "}
            Order book: {bookStatus}
          </span>

          {isCurrentMarket && (
            <a
              href={market.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: "var(--accent)",
              }}
            >
              View on Polymarket ↗
            </a>
          )}
        </div>

        {marketError && (
          <p
            style={{
              color: "var(--status-warning, #a46b18)",
              fontSize: 12,
              marginTop: 6,
            }}
          >
            {marketError}
          </p>
        )}
      </section>
    </main>
  );
}
