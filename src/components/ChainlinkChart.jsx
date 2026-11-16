import { useState } from "react";
import PriceChart from "./PriceChart";

export default function ChainlinkChart({ history = [], startTime, endTime, now = Date.now() }) {
  const [timeRange, setTimeRange] = useState("1m");

  // Use the same chart renderer as Markets.
  // Chainlink observations already have the
  // { timestamp, price } structure it expects.
  const chartHistory = history.filter((point) => Number.isFinite(point.timestamp) && Number.isFinite(point.price));

  return (
    <div
      style={{
        width: "100%",
        minWidth: 0,
        color: "var(--text)",
      }}
    >
      <PriceChart history={chartHistory} historicalPrices={[]} historyLoading={false} historyError={null} selectedCoin="BTC" timeRange={timeRange} onTimeRangeChange={setTimeRange} now={now} />
    </div>
  );
}
