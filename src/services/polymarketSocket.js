const SOCKET_URL = "wss://ws-subscriptions-clob.polymarket.com/ws/market";

function parsePrice(value) {
  if (value == null || value === "") return null;

  const price = Number(value);

  return Number.isFinite(price) && price > 0 && price <= 1 ? price : null;
}

function getBestAsk(asks) {
  if (!Array.isArray(asks)) return null;

  const prices = asks.map((order) => parsePrice(order.price)).filter((price) => price !== null);

  return prices.length ? Math.min(...prices) : null;
}

export function subscribeMarketPrices(market, onUpdate, onStatus) {
  let socket = null;
  let pingTimer = null;
  let reconnectTimer = null;
  let stopped = false;

  const tokenSides = new Map([
    [String(market.upTokenId), "up"],
    [String(market.downTokenId), "down"],
  ]);

  function connect() {
    if (stopped) return;

    onStatus("connecting");

    socket = new WebSocket(SOCKET_URL);
    const ws = socket;

    ws.onopen = () => {
      if (stopped) return;

      ws.send(
        JSON.stringify({
          type: "market",
          assets_ids: [String(market.upTokenId), String(market.downTokenId)],
          custom_feature_enabled: true,
        }),
      );

      onStatus("waiting");

      pingTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send("PING");
        }
      }, 10000);
    };

    function publish(assetId, price, timestamp) {
      const side = tokenSides.get(String(assetId));

      if (!side) return;

      onUpdate({
        side,
        price,
        receivedAt: Date.now(),
        eventTime: timestamp ?? null,
      });

      const eventMs = Number(timestamp);
      const normalizedEventMs = eventMs < 1e11 ? eventMs * 1000 : eventMs;

      if (Number.isFinite(normalizedEventMs) && normalizedEventMs > 0) {
        console.log(`[CLOB ${side}] Event age:`, `${Date.now() - normalizedEventMs}ms`);
      }

      onStatus("live");
    }

    function handleMessage(message) {
      if (!message || typeof message !== "object") {
        return;
      }

      const timestamp = message.timestamp;

      if (message.event_type === "book") {
        publish(message.asset_id, getBestAsk(message.asks), timestamp);
      }

      if (message.event_type === "best_bid_ask") {
        publish(message.asset_id, parsePrice(message.best_ask), timestamp);
      }

      if (message.event_type === "price_change" && Array.isArray(message.price_changes)) {
        for (const change of message.price_changes) {
          if ("best_ask" in change) {
            publish(change.asset_id, parsePrice(change.best_ask), timestamp);
          }
        }
      }
    }

    ws.onmessage = (event) => {
      if (event.data === "PONG") return;

      try {
        const data = JSON.parse(event.data);

        if (Array.isArray(data)) {
          data.forEach(handleMessage);
        } else {
          handleMessage(data);
        }
      } catch {
        // Ignore non-JSON messages.
      }
    };

    ws.onerror = () => {
      if (!stopped) onStatus("error");
    };

    ws.onclose = () => {
      clearInterval(pingTimer);

      if (stopped) return;

      // Invalidate old prices on disconnect.
      for (const side of ["up", "down"]) {
        onUpdate({
          side,
          price: null,
          receivedAt: Date.now(),
          eventTime: null,
        });
      }

      onStatus("reconnecting");

      reconnectTimer = setTimeout(connect, 2000);
    };
  }

  connect();

  return () => {
    stopped = true;

    clearInterval(pingTimer);
    clearTimeout(reconnectTimer);

    if (socket) {
      socket.close();
    }
  };
}
