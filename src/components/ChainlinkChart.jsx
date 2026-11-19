import { useState } from "react";
import PriceChart from "./PriceChart";

export default function ChainlinkChart({ history = [], now = Date.now() }) {
  const [timeRange, setTimeRange] = useState("1m");

  const chartHistory = history.filter(({ timestamp, price }) => Number.isFinite(timestamp) && Number.isFinite(price));

  return (
    <div style={{ width: "100%", minWidth: 0 }}>
      <PriceChart history={chartHistory} historicalPrices={[]} historyLoading={false} historyError={null} selectedCoin="BTC" timeRange={timeRange} onTimeRangeChange={setTimeRange} now={now} />
    </div>
  );
}
