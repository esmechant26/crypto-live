import { useEffect, useMemo, useRef, useState } from "react";

const TIME_RANGES = [
  { label: "1s", milliseconds: 1000 },
  { label: "5s", milliseconds: 5000 },
  { label: "15s", milliseconds: 15000 },
  { label: "1m", milliseconds: 60000 },
  { label: "5m", milliseconds: 300000 },
  { label: "15m", milliseconds: 900000 },
  { label: "1h", milliseconds: 3600000 },
  { label: "24h", milliseconds: 86400000 },
];

const MIN_RANGE = 1000;
const MAX_RANGE = 86400000;

const WIDTH = 1000;
const HEIGHT = 240;

const LEFT = 12;
const RIGHT = 110;
const TOP = 18;
const BOTTOM = 30;

// Shared theme: values come from App.css.
const THEME = {
  text: "var(--text, #f0e8d8)",
  muted: "var(--muted, #a9a396)",
  surface: "var(--surface, #25231d)",
  background: "var(--background, #141310)",
  border: "var(--border, #48443b)",
  grid: "var(--border, #48443b)",
  positive: "var(--positive, #78b77a)",
  negative: "var(--negative, #e07b75)",
};

const MUTED = THEME.muted;
const GREEN = THEME.positive;
const RED = THEME.negative;

function formatDuration(ms) {
  if (ms < 60000) {
    return `${Number((ms / 1000).toFixed(1))}s`;
  }

  if (ms < 3600000) {
    return `${Number((ms / 60000).toFixed(1))}m`;
  }

  return `${Number((ms / 3600000).toFixed(1))}h`;
}

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatPrice(price) {
  if (!Number.isFinite(price)) return "—";

  return price.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

function compactPrice(price) {
  if (!Number.isFinite(price)) return "—";

  return `$${price.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function PriceChart({
  history = [],
  historicalPrices = [],
  historyLoading = false,
  historyError = null,
  selectedCoin = "BTC",
  timeRange = "1m",
  onTimeRangeChange = () => {},
  now = Date.now(),
}) {
  const [windowSize, setWindowSize] = useState(null);
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const [displayTime, setDisplayTime] = useState(Date.now());

  const svgRef = useRef(null);

  const preset = TIME_RANGES.find((range) => range.label === timeRange) ?? TIME_RANGES[3];

  const duration = windowSize ?? preset.milliseconds;

  // Reset zoom when changing coins or presets.
  useEffect(() => {
    setWindowSize(null);
    setHoveredPoint(null);
  }, [timeRange, selectedCoin]);

  // Smoothly advance the chart between price updates.
  useEffect(() => {
    let frame;
    let previousFrame = 0;

    function animate(time) {
      // 30 FPS is sufficient for smooth scrolling.
      if (time - previousFrame >= 33) {
        setDisplayTime(Date.now());
        previousFrame = time;
      }

      frame = requestAnimationFrame(animate);
    }

    frame = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(frame);
  }, []);

  // Combine historical Coinbase prices and live trades.
  const allData = useMemo(() => {
    const points = [...historicalPrices, ...history].filter((point) => Number.isFinite(point.timestamp) && Number.isFinite(point.price)).sort((a, b) => a.timestamp - b.timestamp);

    return points.filter((point, index) => index === 0 || point.timestamp !== points[index - 1].timestamp);
  }, [historicalPrices, history]);

  const end = Math.max(displayTime, Number.isFinite(now) ? now : 0);
  const start = end - duration;

  // Include one point immediately before the window
  // to keep the line connected at its left edge.
  const visibleData = useMemo(() => {
    if (!allData.length) return [];

    const inside = allData.filter((point) => point.timestamp >= start && point.timestamp <= end);

    const previous = [...allData].reverse().find((point) => point.timestamp < start);

    if (previous) {
      inside.unshift(previous);
    }

    return inside;
  }, [allData, start, end]);

  const pointsInWindow = visibleData.filter((point) => point.timestamp >= start && point.timestamp <= end);

  const latest = pointsInWindow.at(-1) ?? null;
  const previous = pointsInWindow.at(-2) ?? null;

  const lineColor = latest && previous && latest.price < previous.price ? RED : GREEN;

  const chartWidth = WIDTH - LEFT - RIGHT;
  const chartHeight = HEIGHT - TOP - BOTTOM;

  const prices = pointsInWindow.map((point) => point.price);

  const minPrice = prices.length ? Math.min(...prices) : 0;

  const maxPrice = prices.length ? Math.max(...prices) : 1;

  const spread = maxPrice - minPrice;
  const padding = Math.max(spread * 0.2, (latest?.price ?? 1) * 0.00002, 0.000001);

  const low = minPrice - padding;
  const high = maxPrice + padding;
  const priceRange = high - low || 1;

  function x(timestamp) {
    return LEFT + ((timestamp - start) / duration) * chartWidth;
  }

  function y(price) {
    return TOP + ((high - price) / priceRange) * chartHeight;
  }

  const path = visibleData
    .filter((point) => point.timestamp <= end && point.timestamp >= start)
    .map((point, index) => `${index === 0 ? "M" : "L"}${x(point.timestamp).toFixed(2)},${y(point.price).toFixed(2)}`)
    .join(" ");

  const latestX = latest ? x(latest.timestamp) : null;
  const latestY = latest ? y(latest.price) : null;

  const gridPrices = Array.from({ length: 5 }, (_, index) => low + ((high - low) * index) / 4);

  const gridTimes = Array.from({ length: 5 }, (_, index) => start + (duration * index) / 4);

  function zoomIn() {
    setWindowSize(Math.max(MIN_RANGE, duration / 2));
  }

  function zoomOut() {
    setWindowSize(Math.min(MAX_RANGE, duration * 2));
  }

  function handleMouseMove(event) {
    if (!svgRef.current || !pointsInWindow.length) {
      return;
    }

    const bounds = svgRef.current.getBoundingClientRect();

    const mouseX = ((event.clientX - bounds.left) / bounds.width) * WIDTH;

    const targetTimestamp = start + ((mouseX - LEFT) / chartWidth) * duration;

    let nearest = pointsInWindow[0];
    let distance = Math.abs(nearest.timestamp - targetTimestamp);

    for (const point of pointsInWindow) {
      const currentDistance = Math.abs(point.timestamp - targetTimestamp);

      if (currentDistance < distance) {
        nearest = point;
        distance = currentDistance;
      }
    }

    setHoveredPoint(nearest);
  }

  const hoverVisible = hoveredPoint && hoveredPoint.timestamp >= start && hoveredPoint.timestamp <= end;

  return (
    <section
      style={{
        width: "100%",
        minWidth: 0,
      }}
    >
      {/* Compact chart controls */}
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
          <strong
            style={{
              fontSize: 13,
              color: THEME.text,
              letterSpacing: "normal",
            }}
          >
            {selectedCoin} Price Chart
          </strong>

          <span
            style={{
              color: MUTED,
              fontSize: 11,
              marginLeft: 10,
            }}
          >
            {formatDuration(duration)} · Live
          </span>
        </div>

        <select
          value={timeRange}
          onChange={(event) => onTimeRangeChange(event.target.value)}
          aria-label="Chart time range"
          style={{
            background: THEME.surface,
            border: `1px solid ${THEME.border}`,
            borderRadius: 6,
            color: THEME.text,
            padding: "5px 8px",
            fontSize: 12,
          }}
        >
          {TIME_RANGES.map((range) => (
            <option key={range.label} value={range.label}>
              {range.label}
            </option>
          ))}
        </select>
      </div>

      {historyLoading && allData.length === 0 ? (
        <div
          style={{
            height: 240,
            display: "grid",
            placeItems: "center",
            color: MUTED,
          }}
        >
          Loading historical prices...
        </div>
      ) : historyError && allData.length === 0 ? (
        <div
          role="alert"
          style={{
            height: 240,
            display: "grid",
            placeItems: "center",
            color: RED,
          }}
        >
          Could not load history: {historyError}
        </div>
      ) : pointsInWindow.length === 0 ? (
        <div
          style={{
            height: 240,
            display: "grid",
            placeItems: "center",
            color: MUTED,
          }}
        >
          Waiting for price data in this window...
        </div>
      ) : (
        <div
          style={{
            position: "relative",
            width: "100%",
          }}
        >
          <svg
            ref={svgRef}
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            preserveAspectRatio="xMidYMid meet"
            style={{
              width: "100%",
              height: "auto",
              display: "block",
              overflow: "hidden",
            }}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoveredPoint(null)}
          >
            {/* Horizontal grid */}
            {gridPrices.map((price, index) => {
              const gridY = y(price);

              return (
                <g key={`price-${index}`}>
                  <line x1={LEFT} y1={gridY} x2={WIDTH - RIGHT} y2={gridY} stroke={THEME.grid} strokeWidth="1" strokeDasharray="3 5" />

                  <text x={WIDTH - RIGHT + 10} y={gridY + 4} fill={MUTED} fontSize="11">
                    {compactPrice(price)}
                  </text>
                </g>
              );
            })}

            {/* Vertical grid */}
            {gridTimes.map((time, index) => {
              const gridX = x(time);

              return (
                <g key={`time-${index}`}>
                  <line x1={gridX} y1={TOP} x2={gridX} y2={HEIGHT - BOTTOM} stroke={THEME.grid} strokeWidth="1" strokeDasharray="3 5" />

                  <text x={gridX} y={HEIGHT - 8} fill={MUTED} fontSize="11" textAnchor={index === 0 ? "start" : index === 4 ? "end" : "middle"}>
                    {formatTime(time)}
                  </text>
                </g>
              );
            })}

            {/* Price line */}
            <path d={path} fill="none" stroke={lineColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />

            {/* Latest price guide */}
            {latest && (
              <>
                <line x1={LEFT} y1={latestY} x2={WIDTH - RIGHT} y2={latestY} stroke={lineColor} strokeWidth="1" strokeDasharray="4 5" opacity="0.5" />

                <circle cx={latestX} cy={latestY} r="4" fill={lineColor} />

                <rect x={WIDTH - RIGHT + 4} y={latestY - 12} width={RIGHT - 8} height="24" rx="5" fill={lineColor} />

                <text x={WIDTH - RIGHT + RIGHT / 2} y={latestY + 4} fill={THEME.background} fontSize="12" fontWeight="700" textAnchor="middle">
                  {compactPrice(latest.price)}
                </text>
              </>
            )}

            {/* Hover crosshair */}
            {hoverVisible && (
              <>
                <line x1={x(hoveredPoint.timestamp)} y1={TOP} x2={x(hoveredPoint.timestamp)} y2={HEIGHT - BOTTOM} stroke={THEME.muted} strokeDasharray="4 4" opacity="0.6" />

                <circle cx={x(hoveredPoint.timestamp)} cy={y(hoveredPoint.price)} r="5" fill={THEME.text} stroke={lineColor} strokeWidth="2" />
              </>
            )}
          </svg>

          {hoverVisible && (
            <div
              style={{
                position: "absolute",
                top: 8,
                left: 12,
                pointerEvents: "none",
                background: THEME.background,
                border: `1px solid ${THEME.border}`,
                borderRadius: 6,
                padding: "7px 10px",
                color: THEME.text,
                fontSize: 12,
                zIndex: 2,
              }}
            >
              <div>{formatTime(hoveredPoint.timestamp)}</div>
              <strong>{formatPrice(hoveredPoint.price)}</strong>
            </div>
          )}
        </div>
      )}

      {/* Compact zoom controls */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: 8,
          marginTop: 6,
        }}
      >
        <button
          type="button"
          onClick={zoomOut}
          disabled={duration >= MAX_RANGE}
          aria-label="Zoom out"
          style={{
            background: THEME.surface,
            color: THEME.text,
            border: `1px solid ${THEME.border}`,
            borderRadius: 5,
            padding: "4px 10px",
            cursor: duration >= MAX_RANGE ? "not-allowed" : "pointer",
          }}
        >
          −
        </button>

        <span
          style={{
            color: MUTED,
            fontSize: 12,
            minWidth: 35,
            textAlign: "center",
          }}
        >
          {formatDuration(duration)}
        </span>

        <button
          type="button"
          onClick={zoomIn}
          disabled={duration <= MIN_RANGE}
          aria-label="Zoom in"
          style={{
            background: THEME.surface,
            color: THEME.text,
            border: `1px solid ${THEME.border}`,
            borderRadius: 5,
            padding: "4px 10px",
            cursor: duration <= MIN_RANGE ? "not-allowed" : "pointer",
          }}
        >
          +
        </button>
      </div>
    </section>
  );
}
