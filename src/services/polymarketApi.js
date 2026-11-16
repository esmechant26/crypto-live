const GAMMA_URL = "https://gamma-api.polymarket.com";
const CLOB_URL = "https://clob.polymarket.com";

export const MARKET_DURATIONS = {
  "5m": 300,
  "15m": 900,
};

// Convert JSON-encoded arrays into JavaScript arrays.
function parseArray(value) {
  if (Array.isArray(value)) return value;

  if (typeof value !== "string") return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Validate a possible Price to Beat value.
function parsePriceToBeat(value) {
  if (value == null || value === "") {
    return null;
  }

  const price = Number(value);

  return Number.isFinite(price) && price > 0 ? price : null;
}

// Determine the current market's exact time window.
export function getCurrentMarketSlug(duration, now = Date.now()) {
  const seconds = MARKET_DURATIONS[duration];

  if (!seconds) {
    throw new Error("Unsupported market duration");
  }

  const start = Math.floor(now / 1000 / seconds) * seconds;

  return {
    slug: `btc-updown-${duration}-${start}`,
    startTime: start * 1000,
    endTime: (start + seconds) * 1000,
  };
}

// Find the active BTC Up/Down market using Gamma.
export async function fetchCurrentMarket(duration, signal) {
  const round = getCurrentMarketSlug(duration);

  const url = new URL(`${GAMMA_URL}/events`);
  url.searchParams.set("slug", round.slug);

  const response = await fetch(url, { signal });

  if (!response.ok) {
    throw new Error(`Polymarket API error: ${response.status}`);
  }

  const events = await response.json();

  if (!Array.isArray(events)) {
    throw new Error("Invalid Polymarket API response");
  }

  const event = events.find((item) => item.slug === round.slug);

  if (!event || !event.markets?.length) {
    throw new Error("Current market not available yet");
  }

  const market = event.markets.find((item) => !item.closed);

  console.log("POLYMARKET EVENT:", event);
  console.log("POLYMARKET MARKET:", market);
  console.log("EVENT METADATA:", event.eventMetadata);
  console.log("MARKET METADATA:", market?.eventMetadata);
  //   console.log("EVENT KEYS:", Object.keys(event));
  //   console.log("MARKET KEYS:", Object.keys(market));

  if (!market || event.closed) {
    throw new Error("This market is already closed");
  }

  // Gamma may return these fields as JSON strings.
  const outcomes = parseArray(market.outcomes);
  const tokenIds = parseArray(market.clobTokenIds);

  const upIndex = outcomes.findIndex((name) => String(name).toLowerCase() === "up");

  const downIndex = outcomes.findIndex((name) => String(name).toLowerCase() === "down");

  if (upIndex === -1 || downIndex === -1 || !tokenIds[upIndex] || !tokenIds[downIndex]) {
    throw new Error("Market outcome tokens unavailable");
  }

  // Price to Beat is not guaranteed to be published
  // during the active market window.
  const rawPriceToBeat = event.eventMetadata?.priceToBeat ?? market.eventMetadata?.priceToBeat ?? null;

  const priceToBeat = parsePriceToBeat(rawPriceToBeat);

  return {
    slug: round.slug,
    title: event.title || market.question,
    startTime: round.startTime,
    endTime: round.endTime,
    upTokenId: tokenIds[upIndex],
    downTokenId: tokenIds[downIndex],
    priceToBeat,
    url: `https://polymarket.com/event/${round.slug}`,
  };
}

// Retrieve the lowest available asking price
// for a Polymarket outcome token.
async function fetchBestAsk(tokenId, signal) {
  const url = new URL(`${CLOB_URL}/book`);
  url.searchParams.set("token_id", tokenId);

  const response = await fetch(url, { signal });

  if (!response.ok) {
    throw new Error(`Order book error: ${response.status}`);
  }

  const book = await response.json();

  const asks = (book.asks || []).map((order) => Number(order.price)).filter((price) => Number.isFinite(price) && price > 0 && price <= 1);

  return asks.length > 0 ? Math.min(...asks) : null;
}

// Fetch the current Up and Down prices.
export async function fetchOutcomePrices(market, signal) {
  if (!market?.upTokenId || !market?.downTokenId) {
    throw new Error("Missing Polymarket outcome token IDs");
  }

  const [up, down] = await Promise.all([fetchBestAsk(market.upTokenId, signal), fetchBestAsk(market.downTokenId, signal)]);

  return {
    up,
    down,
    updatedAt: Date.now(),
  };
}

export async function fetchPriceToBeat(duration, signal) {
  const round = getCurrentMarketSlug(duration);

  const url = new URL("https://polymarket.com/api/crypto/crypto-price");

  url.searchParams.set("symbol", "BTC");
  url.searchParams.set("eventStartTime", new Date(round.startTime).toISOString());
  url.searchParams.set("endDate", new Date(round.endTime).toISOString());
  url.searchParams.set("variant", duration === "5m" ? "fiveminute" : "fifteen");

  const response = await fetch(url, { signal });

  if (!response.ok) {
    throw new Error(`Price to Beat request failed: ${response.status}`);
  }

  const data = await response.json();
  const price = Number(data.openPrice);

  if (!Number.isFinite(price) || price <= 0) {
    return null;
  }

  return {
    price,
    source: "polymarket",
    slug: round.slug,
  };
}
