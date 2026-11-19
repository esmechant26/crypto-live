deployed at: https://crypto-live-liart.vercel.app/

Crypto Live: A lightweight performance focused cryptocurrency dashboard designed for real-time price tracking and rapid price updates for prediction-market users.

Features:

Markets

- Live Coinbase price updates for BTC, ETH, SOL, and DOGE.
- Interactive price charts with selectable time windows and zoom controls.
- Historical price data where available.

Polymarket Mode

- Switch between Bitcoin 5-minute and 15-minute Up/Down markets.
- Follow Chainlink BTC/USD TWAP60
- View the current round's countdown
- View Price to Beat when a verified opening reference is available. Historical lookup may be unavailable when joining a round late.
- A lag indicator displays one of three states:
  - Normal: No qualifying delayed quote detected
  - Possible Lag: A Coinbase price move coincides with a Polymarket quote that has not adjusted under the current BTC price estimate
  - Insufficient Data: Required feeds or recent observations are unavailable.

Tech stack
- JavaScript
- React
- Vite

Data sources
Coinbase API
Chainlink via Polymarket live data for BTC TWAP60 (Time Weighted Average Price / 60 seconds) 
Polymarket current market  and live UP/DOWN order-book quotes, as well as Price To Beat per 5 minute and 15 minute markets

You may notice the Markets chart and the Polymarket Mode chart behaving differently. Coinbase spot prices and Chainlink TWAP60 are not interchangeable. TWAP60 is smoother and may respond more gradually to abrupt market moves. The two sources can also differ in price level. This is normal and should be taken into consideration whilst using Crypto Live for trades.

Known limitations

- Price to Beat may be unavailable if the app missed the exact round-opening observation and the fallback endpoint does not return an opening reference.
- Chart history collected in the browser may be limited when a page is first opened. Not every data source is capable of supplying a complete historical series
- Network delays, stale quotes, API changes, and WebSocket interruptions can affect the display
- The app is a read-only market monitor. It does not execute trades.

!Disclaimer!
Crypto Live is an educational and informational project. Market data may be delayed or incomplete. Nothing displayed is financial advice or a guarantee of trading outcomes.
