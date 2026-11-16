import { BrowserRouter, NavLink, useLocation } from "react-router-dom";

import MarketsPage from "./pages/MarketsPage";
import PolymarketPage from "./pages/PolymarketPage";
import AboutPage from "./pages/AboutPage";
import "./App.css";

function AppContent() {
  const { pathname } = useLocation();

  return (
    <>
      <nav className="app-nav">
        <NavLink to="/" end>
          Markets
        </NavLink>

        <NavLink to="/polymarket">Polymarket Mode</NavLink>

        <NavLink to="/about">About</NavLink>
      </nav>

      {/* Keep all pages mounted to preserve live data */}
      <div
        style={{
          display: pathname === "/" ? "block" : "none",
        }}
      >
        <MarketsPage />
      </div>

      <div
        style={{
          display: pathname === "/polymarket" ? "block" : "none",
        }}
      >
        <PolymarketPage />
      </div>

      <div
        style={{
          display: pathname === "/about" ? "block" : "none",
        }}
      >
        <AboutPage />
      </div>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}
