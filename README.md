Crypto Live
A real-time cryptocurrency dashboard built with React and Vite. Follow live market prices and explore Bitcoin's short-duration Polymarket Up/Down markets from one interface.
Features

Markets

- Live Coinbase price updates for BTC, ETH, SOL, and DOGE.
- Interactive price charts with selectable time windows and zoom controls.
- Historical price data where available.

Polymarket Mode

- Switch between Bitcoin 5-minute and 15-minute Up/Down markets.
- Follow Chainlink BTC/USD TWAP60 (a 60-second time-weighted average) and recent price changes.
- View the current round's countdown and Polymarket UP/DOWN best ask quotes.
- View Price to Beat when a verified opening reference is available. The app captures exact Chainlink boundary observations and saves them locally; historical lookup may be unavailable when joining a round late.
- A simple experimental lag indicator displays one of three states:
  - Normal: No qualifying delayed quote detected.
  - Possible Lag: A Coinbase price move coincides with a Polymarket quote that has not adjusted under the current approximation.
  - Insufficient Data: Required feeds, recent observations, or other prerequisites are unavailable.
    The lag indicator is an approximation, not an estimate of expected profit or a recommendation to trade. Price changes and quote delays do not establish a profitable opportunity.
    About
    Explains the app, data sources, and interpretation limits.

Tech stack

- React
- Vite
- React Router
- Browser WebSockets and asynchronous API requests
- SVG-based charting through the shared PriceChart component

  Getting started
  Requires a recent Node.js version and npm.
  npm install
  npm run dev
  Open the local address printed by Vite (typically http://localhost:5173).

Data sources
Source Used for Coinbase Live cryptocurrency spot prices and market charts
Chainlink via Polymarket live data BTC/USD TWAP60 observations
Polymarket Current market metadata and live UP/DOWN order-book quotes

Coinbase spot prices and Chainlink TWAP60 are not interchangeable. TWAP60 is smoother and may respond more gradually to abrupt market moves. The two sources can also differ in price level.
Known limitations

- Price to Beat may be unavailable if the app missed the exact round-opening observation and the fallback endpoint does not return an opening reference.
- Chart history collected in the browser may be limited when a page is first opened; not every data source supplies a complete historical series.
- Network delays, stale quotes, API changes, and WebSocket interruptions can affect the display.
- The lag indicator is experimental and has not been backtested to demonstrate trading profitability.
- The app is a read-only market monitor; it does not execute trades.

Disclaimer
Crypto Live is an educational and informational project. Market data may be delayed or incomplete. Nothing displayed is financial advice or a guarantee of trading outcomes.
