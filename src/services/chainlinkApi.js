const RTDS_URL = "wss://ws-live-data.polymarket.com";

const TWAP_TOPIC = "crypto_prices_twap_sixty";
const SPOT_TOPIC = "crypto_prices_chainlink";

const STALE_AFTER_MS = 10000;

function normalizeTimestamp(value) {
  if (value == null || value === "") return null;

  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return null;
  }

  return number < 1e11 ? number * 1000 : number;
}

export function subscribeChainlinkTwap(onUpdate, onStatus) {
  let socket = null;
  let heartbeat = null;
  let freshnessTimer = null;
  let reconnectTimer = null;

  let stopped = false;
  let lastTwapReceived = 0;

  const latest = {
    twap: null,
    spot: null,
  };

  function clearTimers() {
    clearInterval(heartbeat);
    clearInterval(freshnessTimer);
    clearTimeout(reconnectTimer);
  }

  function connect() {
    if (stopped) return;

    onStatus("connecting");

    const ws = new WebSocket(RTDS_URL);
    socket = ws;

    lastTwapReceived = 0;
    latest.twap = null;
    latest.spot = null;

    ws.onopen = () => {
      if (stopped) return;

      const filters = JSON.stringify({
        symbol: "btc/usd",
      });

      ws.send(
        JSON.stringify({
          action: "subscribe",
          subscriptions: [
            {
              topic: TWAP_TOPIC,
              type: "update",
              filters,
            },
            {
              topic: SPOT_TOPIC,
              type: "update",
              filters,
            },
          ],
        }),
      );

      onStatus("waiting");

      heartbeat = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send("PING");
        }
      }, 5000);

      freshnessTimer = setInterval(() => {
        if (lastTwapReceived && Date.now() - lastTwapReceived > STALE_AFTER_MS) {
          onStatus("stale");
        }
      }, 1000);
    };

    ws.onmessage = (event) => {
      if (typeof event.data !== "string") return;
      if (event.data === "PONG") return;

      let message;

      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }

      if (message.message && !message.payload) {
        console.warn("[Chainlink] Server message:", message.message);
        return;
      }

      if (message.type !== "update") return;

      const payload = message.payload;
      if (!payload) return;

      if (String(payload.symbol).toLowerCase() !== "btc/usd") {
        return;
      }

      const isTwap = message.topic === TWAP_TOPIC;
      const isSpot = message.topic === SPOT_TOPIC;

      if (!isTwap && !isSpot) return;

      if (isTwap && Number(payload.window_s) !== 60) {
        return;
      }

      const price = Number(payload.value);

      const timestamp = normalizeTimestamp(payload.timestamp ?? message.timestamp);

      const publishedAt = normalizeTimestamp(message.timestamp);

      const receivedAt = Date.now();

      if (!Number.isFinite(price) || price <= 0 || timestamp == null || timestamp > receivedAt + 5000) {
        return;
      }

      const observation = {
        price,
        timestamp,
        publishedAt,
        receivedAt,
      };

      if (isTwap) {
        latest.twap = observation;
        lastTwapReceived = receivedAt;

        // Exact TWAP60 observations at 5-minute boundaries
        // are also at 15-minute boundaries when applicable.
        const isFiveMinuteBoundary = timestamp % 300000 === 0;

        onUpdate({
          price,
          timestamp,
          receivedAt,
          source: "Polymarket RTDS TWAP60",
          boundaryPrice: isFiveMinuteBoundary ? price : null,
        });

        onStatus(receivedAt - timestamp > STALE_AFTER_MS ? "stale" : "live");
      }

      if (isSpot) {
        latest.spot = observation;
      }

      // Log a comparison when either feed updates.
      const twap = latest.twap;
      const spot = latest.spot;

      if (twap && spot) {
        console.log("[Chainlink comparison]", {
          twapPrice: twap.price,
          spotPrice: spot.price,

          twapObservationAgeMs: receivedAt - twap.timestamp,

          spotObservationAgeMs: receivedAt - spot.timestamp,

          twapPublicationAgeMs: twap.publishedAt == null ? null : receivedAt - twap.publishedAt,

          spotPublicationAgeMs: spot.publishedAt == null ? null : receivedAt - spot.publishedAt,

          twapReceivedAgoMs: receivedAt - twap.receivedAt,

          spotReceivedAgoMs: receivedAt - spot.receivedAt,
        });
      }
    };

    ws.onerror = () => {
      if (!stopped) {
        onStatus("unavailable");
      }
    };

    ws.onclose = () => {
      clearTimers();

      if (stopped) return;

      onStatus("reconnecting");

      reconnectTimer = setTimeout(connect, 3000);
    };
  }

  connect();

  return () => {
    stopped = true;
    clearTimers();

    if (socket) {
      socket.close();
      socket = null;
    }
  };
}
