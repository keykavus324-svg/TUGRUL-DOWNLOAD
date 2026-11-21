import { renderToString } from "react-dom/server";
import { HashRouter, Route, Routes } from "react-router-dom";
import Layout from "../src/components/Layout";
import { AppProvider } from "../src/store";
import Home from "../src/pages/Home";
import Search from "../src/pages/Search";
import Library from "../src/pages/Library";
import Studio from "../src/pages/Studio";
import Queue from "../src/pages/Queue";
import Schedule from "../src/pages/Schedule";
import Watch from "../src/pages/Watch";
import Templates from "../src/pages/Templates";
import StatsPage from "../src/pages/Stats";
import SettingsPage from "../src/pages/Settings";

const pages: Record<string, JSX.Element> = {
  "/": <Home />,
  "/search": <Search />,
  "/library": <Library />,
  "/studio": <Studio />,
  "/queue": <Queue />,
  "/schedule": <Schedule />,
  "/watch": <Watch />,
  "/templates": <Templates />,
  "/stats": <StatsPage />,
  "/settings": <SettingsPage />,
};

export async function renderAll() {
  const out: Record<string, string> = {};
  for (const [route, el] of Object.entries(pages)) {
    window.location.hash = "#" + route;
    out[route] = renderToString(
      <AppProvider>
        <HashRouter>
          <Layout>
            <Routes>
              <Route path={route} element={el} />
              <Route path="*" element={el} />
            </Routes>
          </Layout>
        </HashRouter>
      </AppProvider>
    );
  }
  return out;
}
