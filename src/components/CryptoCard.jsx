const formatPrice = (price) => {
  if (price == null) return "Loading...";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(price);
};

function CryptoCard({ coin, price, selected, onSelect }) {
  return (
    <button className={`crypto-card ${selected ? "selected" : ""}`} onClick={() => onSelect(coin.symbol)}>
      <span className="coin-name">
        {coin.name} ({coin.symbol})
      </span>
      <span className="coin-price">{formatPrice(price)}</span>
    </button>
  );
}

export default CryptoCard;
