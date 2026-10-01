import { useState, useEffect, useCallback } from "react";
import { Sprout, BarChart2, GitBranch, Info, Sun, Moon, IndianRupee } from "lucide-react";
import PredictPage from "./pages/PredictPage";
import ModelComparisonPage from "./pages/ModelComparisonPage";
import PsoSearchPage from "./pages/PsoSearchPage";
import AboutPage from "./pages/AboutPage";
import CropRankerPage from "./pages/CropRankerPage";

const TABS = [
  { id: "predict",  label: "Predict",          icon: Sprout },
  { id: "compare",  label: "Model Comparison",  icon: BarChart2 },
  { id: "pso",      label: "PSO Search",         icon: GitBranch },
  { id: "ranker",   label: "Crop Ranker",        icon: IndianRupee },
  { id: "about",    label: "About / SDG",        icon: Info },
];

export default function App() {
  const [tab, setTab] = useState("predict");
  const [theme, setTheme] = useState(
    () => localStorage.getItem("theme") || "dark"
  );

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = useCallback(
    () => setTheme(t => (t === "dark" ? "light" : "dark")),
    []
  );

  const Page =
    tab === "predict" ? PredictPage
    : tab === "compare" ? ModelComparisonPage
    : tab === "pso"     ? PsoSearchPage
    : tab === "ranker"  ? CropRankerPage
    : AboutPage;

  return (
    <div className="app-shell">
      {/* ── Sidebar ── */}
      <nav className="sidebar" role="navigation" aria-label="Main navigation">
        <div className="sidebar-logo">
          <span className="sidebar-logo-icon">🌾</span>
          <div className="sidebar-logo-text">
            Crop<span>Yield</span> AI
          </div>
        </div>

        <div className="sidebar-nav">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              id={`nav-${id}`}
              className={`nav-item${tab === id ? " active" : ""}`}
              onClick={() => setTab(id)}
              aria-current={tab === id ? "page" : undefined}
            >
              <Icon size={18} className="nav-icon" />
              <span>{label}</span>
            </button>
          ))}
        </div>

        <div className="sidebar-footer">
          <button
            id="theme-toggle"
            className="btn-icon"
            onClick={toggleTheme}
            aria-label="Toggle colour theme"
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            style={{ width: "100%" }}
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </nav>

      {/* ── Main ── */}
      <div className="main-content">
        <main className="page-container" key={tab}>
          <div className="fade-in">
            <Page />
          </div>
        </main>

        <footer className="disclaimer-strip" role="contentinfo">
          <span>⚠</span>
          Estimates are based on historical state-level patterns and are not a substitute for local agronomic advice.
        </footer>
      </div>
    </div>
  );
}
