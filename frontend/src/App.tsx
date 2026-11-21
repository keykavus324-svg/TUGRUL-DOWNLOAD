import { HashRouter, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Toasts from "./components/Toasts";
import Shortcuts from "./components/Shortcuts";
import { AppProvider } from "./store";
import Home from "./pages/Home";
import Search from "./pages/Search";
import Library from "./pages/Library";
import Queue from "./pages/Queue";
import Schedule from "./pages/Schedule";
import Watch from "./pages/Watch";
import Templates from "./pages/Templates";
import StatsPage from "./pages/Stats";
import SettingsPage from "./pages/Settings";
import Studio from "./pages/Studio";

export default function App() {
  return (
    <AppProvider>
      <HashRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/search" element={<Search />} />
            <Route path="/library" element={<Library />} />
            <Route path="/studio" element={<Studio />} />
            <Route path="/queue" element={<Queue />} />
            <Route path="/schedule" element={<Schedule />} />
            <Route path="/watch" element={<Watch />} />
            <Route path="/templates" element={<Templates />} />
            <Route path="/stats" element={<StatsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Home />} />
          </Routes>
        </Layout>
        <Shortcuts />
        <Toasts />
      </HashRouter>
    </AppProvider>
  );
}
