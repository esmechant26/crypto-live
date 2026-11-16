const MUTED = "var(--muted)";
const panel = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  padding: "18px 20px",
};

const sectionTitle = { margin: "0 0 8px", fontSize: 18, fontWeight: 650, letterSpacing: "0.01em", lineHeight: 1.4, color: "var(--text)" };
const paragraph = { margin: 0, lineHeight: 1.65, color: MUTED, fontSize: 14 };

export default function AboutPage() {
  return (
    <main className="dashboard" style={{ paddingTop: 12, paddingBottom: 24 }}>
      <section className="featured" style={{ padding: "20px" }}>
        <h1 style={{ margin: "0 0 8px", fontSize: 26, letterSpacing: "0.01em", lineHeight: 1.4 }}>About Crypto Live</h1>
        <p style={{ ...paragraph, maxWidth: 740, marginBottom: 20 }}>
          Crypto Live is a real-time crypto dashboard for following spot prices and comparing Bitcoin market movement with Polymarket's short-duration Up/Down contracts.
        </p>

        <div style={{ display: "grid", gap: 12 }}>
          <section style={panel}>
            <h2 style={sectionTitle}>Markets</h2>
            <p style={paragraph}>Watch live Coinbase prices for Bitcoin, Ethereum, Solana, and Dogecoin. Switch coins, explore price history, and zoom into shorter time windows.</p>
          </section>

          <section style={panel}>
            <h2 style={sectionTitle}>Polymarket Mode</h2>
            <p style={paragraph}>
              Monitor Bitcoin's 5-minute and 15-minute Up/Down markets with Chainlink BTC/USD TWAP60, the round countdown, Price to Beat when available, and live UP/DOWN best ask quotes.
            </p>
          </section>

          <section style={panel}>
            <h2 style={sectionTitle}>Spot price vs. TWAP60</h2>
            <p style={paragraph}>
              Coinbase reports spot-market prices. Chainlink TWAP60 is a 60-second time-weighted average, so its line typically moves more smoothly and reacts differently to sudden price changes. They
              are different measurements, not competing versions of the same chart.
            </p>
          </section>

          <section style={panel}>
            <h2 style={sectionTitle}>Market lag indicator</h2>
            <p style={paragraph}>
              The experimental indicator compares recent Coinbase movement with Polymarket quote updates. It displays only three states: Normal, Possible Lag, or Insufficient Data. Possible Lag means
              the current rule detected a delayed-looking response; it does not mean a trade is profitable. Insufficient Data means the detector cannot make a reliable comparison right now.
            </p>
          </section>

          <section style={panel}>
            <h2 style={sectionTitle}>Data and limitations</h2>
            <p style={paragraph}>
              Crypto Live uses Coinbase, Chainlink data delivered through Polymarket's live feed, and Polymarket market information. Feeds can be interrupted or delayed. Price to Beat may be
              unavailable if the opening observation was missed and a historical reference cannot be retrieved. The app is a read-only informational tool, not a trading platform or financial advice.
            </p>
          </section>
        </div>
      </section>
    </main>
  );
}
