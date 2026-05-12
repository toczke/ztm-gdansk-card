/**
 * ZTM Gdańsk Timetable Card
 * HACS Lovelace custom card for real-time bus/tram departures in Gdańsk
 *
 * Data source: TRISTAR open data by ZTM Gdańsk / Otwarty Gdańsk (CC-BY)
 *   Departures:  https://ckan2.multimediagdansk.pl/departures?stopId={id}
 *   Stops list:  https://ckan2.multimediagdansk.pl/dataset/.../stops.json
 *
 * Bus stop icon: Iconoir Icons (MIT License) - https://iconoir.com
 */

const DEPARTURES_URL = "https://ckan2.multimediagdansk.pl/departures";
const STOPS_URL =
  "https://mapa.ztm.gda.pl/dataset/c24aa637-3619-4dc2-a171-a23eec8f2172/resource/4c4025f0-01bf-41f7-a39f-d156d201b82b/download/stops.json";
const ROUTES_URL =
  "https://ckan.multimediagdansk.pl/dataset/c24aa637-3619-4dc2-a171-a23eec8f2172/resource/22313c56-5acf-41c7-a5fd-dc5dc72b3851/download/routes.json";
const STOPS_IN_TRIP_URL =
  "https://ckan.multimediagdansk.pl/dataset/c24aa637-3619-4dc2-a171-a23eec8f2172/resource/3115d29d-b763-4af5-93f6-763b835967d6/download/stopsintrip.json";

const CARD_VERSION = "2.0.0";

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function routeColor(routeId) {
  const s = String(routeId || "");
  if (!s) return "#6b7280";
  if (/^[Nn]/.test(s)) return "#000000";
  const n = parseInt(s, 10);
  if (isNaN(n)) return "#DA2128";
  if (n < 100) {
    if (n >= 60 && n < 70) return "#8B4513";
    if (n >= 90 && n < 100) return "#4B0082";
    return "#0369a1";
  }
  return "#DA2128";
}

function routeClass(routeId) {
  return /^[Nn]/.test(String(routeId || "")) ? "night-route" : "";
}

function minutesUntil(isoString) {
  if (!isoString) return null;
  const diff = Math.round((new Date(isoString) - Date.now()) / 60_000);
  return diff;
}

function formatMins(min) {
  if (min === null) return "—";
  if (min <= 0) return "za <1 min";
  if (min >= 60) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m > 0 ? `za ${h}h ${m}min` : `za ${h}h`;
  }
  return `za ${min} min`;
}

function formatHHMM(isoString) {
  if (!isoString) return "—";
  return new Date(isoString).toLocaleTimeString("pl-PL", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizeText(text) {
  return (text || "").replace(/\s/g, "").toLowerCase().replace(/[0-9]+$/, "");
}

function normalizeSearchText(text) {
  return String(text || "")
    .replace(/[łŁ]/g, "l")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[char]);
}

function clampNumber(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function optionalNumber(value, min, max, fallback = 0) {
  if (value === undefined || value === null || value === "") return fallback;
  return clampNumber(value, min, max, fallback);
}

function normalizeRouteList(routes) {
  if (Array.isArray(routes)) return routes.map(r => String(r).trim()).filter(Boolean);
  if (typeof routes === "string") return routes.split(",").map(r => r.trim()).filter(Boolean);
  return undefined;
}

function normalizeDisplayPreset(config) {
  const preset = String(config.display_preset || "").toLowerCase();
  if (["standard", "compact", "e_ink"].includes(preset)) return preset;
  if (config.e_ink_mode === true) return "e_ink";
  if (config.compact_mode === true) return "compact";
  return "standard";
}

function normalizeConfig(config = {}) {
  const routeList = normalizeRouteList(config.filter_routes);
  const displayPreset = normalizeDisplayPreset(config);
  const normalized = {
    ...config,
    display_preset: displayPreset,
    max_departures: clampNumber(config.max_departures, 3, 20, 10),
    refresh_interval: clampNumber(config.refresh_interval, 15, 300, 30),
    e_ink_refresh_interval: clampNumber(config.e_ink_refresh_interval, 60, 3600, 300),
    max_minutes_ahead: optionalNumber(config.max_minutes_ahead, 0, 1440, 0),
    show_delays: config.show_delays !== false,
    hide_terminus: config.hide_terminus !== false,
    highlight_mode: config.highlight_mode === true,
    e_ink_mode: displayPreset === "e_ink",
    compact_mode: displayPreset === "compact",
    show_footer: config.show_footer !== false,
    realtime_only: config.realtime_only === true || config.hide_scheduled === true,
  };

  delete normalized.hide_scheduled;

  if (routeList && routeList.length > 0) {
    normalized.filter_routes = routeList;
  } else {
    delete normalized.filter_routes;
  }

  if (normalized.stop_id === undefined || normalized.stop_id === null || String(normalized.stop_id).trim() === "") {
    delete normalized.stop_id;
  } else {
    normalized.stop_id = String(normalized.stop_id).trim();
  }

  return normalized;
}

function serializeConfig(config) {
  const output = { ...config };
  delete output.e_ink_mode;
  delete output.compact_mode;
  delete output.hide_scheduled;
  return output;
}

function compareRoutes(a, b) {
  const aRoute = String(a || "");
  const bRoute = String(b || "");
  const aNight = /^[Nn]/.test(aRoute);
  const bNight = /^[Nn]/.test(bRoute);
  if (aNight !== bNight) return aNight ? 1 : -1;

  const aNum = Number.parseInt(aRoute.replace(/^[Nn]/, ""), 10);
  const bNum = Number.parseInt(bRoute.replace(/^[Nn]/, ""), 10);
  if (Number.isFinite(aNum) && Number.isFinite(bNum) && aNum !== bNum) {
    return aNum - bNum;
  }

  return aRoute.localeCompare(bRoute, "pl", { numeric: true, sensitivity: "base" });
}

function readLocalCache(key, ttl) {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(`${LOCAL_CACHE_PREFIX}${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.timestamp || Date.now() - parsed.timestamp > ttl) return null;
    return parsed.value;
  } catch (_) {
    return null;
  }
}

function writeLocalCache(key, value) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(`${LOCAL_CACHE_PREFIX}${key}`, JSON.stringify({
      timestamp: Date.now(),
      value,
    }));
  } catch (_) {
    // localStorage can be unavailable or full; memory cache still works.
  }
}

/* ── Global stops cache ── */

let _stopsPromise = null;

function loadAllStops() {
  if (_stopsPromise) return _stopsPromise;
  
  _stopsPromise = (async () => {
    try {
      const cachedStops = readLocalCache("stops", ROUTES_CACHE_TTL);
      if (Array.isArray(cachedStops)) return cachedStops;

      let res = await fetch(STOPS_URL);
      if (!res.ok) {
        const altUrl = "https://ckan2.multimediagdansk.pl/dataset/c24aa637-3619-4dc2-a171-a23eec8f2172/resource/4c4025f0-01bf-41f7-a39f-d156d201b82b/download/stops.json";
        res = await fetch(altUrl);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const today = Object.keys(data).sort().reverse()[0];
      const stops = (data[today]?.stops || []).filter(s => s.stopDesc && !s.nonpassenger);
      writeLocalCache("stops", stops);
      return stops;
    } catch (e) {
      console.warn("[ztm-gdansk-card] Nie można pobrać listy przystanków:", e.message);
      return [];
    }
  })();
  
  return _stopsPromise;
}

function findStop(stopId, stops) {
  return stops.find(s => String(s.stopId) === String(stopId)) || null;
}

function stopPlatform(stop) {
  return String(stop?.subName || stop?.stopCode || "").trim();
}

function stopDisplayName(stop) {
  if (!stop) return "";
  const name = String(stop.stopDesc || stop.stopName || `Przystanek ${stop.stopId}`).trim();
  const platform = stopPlatform(stop);
  if (!platform || name.endsWith(` ${platform}`)) return name;
  return `${name} ${platform}`;
}

function stopBaseName(stop) {
  return String(stop?.stopDesc || stop?.stopName || "").trim();
}

/* ── Routes cache ── */

const ROUTES_CACHE = {};
const ROUTES_CACHE_TTL = 24 * 60 * 60 * 1000;
const LOCAL_CACHE_PREFIX = "ztm-gdansk-card:";
let _routesIndexPromise = null;
let _routesIndexTimestamp = 0;
const ROUTE_DESCRIPTIONS = {};

function getCachedRoutes(stopId) {
  const entry = ROUTES_CACHE[stopId];
  if (entry && (Date.now() - entry.timestamp) < ROUTES_CACHE_TTL) {
    return entry;
  }
  return null;
}

function setCachedRoutes(stopId, routes, source) {
  ROUTES_CACHE[stopId] = { routes, source, timestamp: Date.now() };
}

function routeDescription(routeId) {
  return ROUTE_DESCRIPTIONS[String(routeId || "").toUpperCase()] || "";
}

function latestDatasetEntry(data) {
  const latest = Object.keys(data || {}).sort().reverse()[0];
  return latest ? data[latest] : null;
}

function normalizeStaticArray(data, key) {
  const entry = latestDatasetEntry(data);
  return Array.isArray(entry?.[key]) ? entry[key] : [];
}

async function loadRoutesIndex() {
  if (_routesIndexPromise && (Date.now() - _routesIndexTimestamp) < ROUTES_CACHE_TTL) return _routesIndexPromise;
  _routesIndexTimestamp = Date.now();

  _routesIndexPromise = (async () => {
    try {
      const cachedIndex = readLocalCache("routes-index", ROUTES_CACHE_TTL);
      if (cachedIndex?.routesByStopEntries) {
        Object.assign(ROUTE_DESCRIPTIONS, cachedIndex.descriptions || {});
        return new Map(cachedIndex.routesByStopEntries.map(([stopId, routes]) => [stopId, new Set(routes)]));
      }

      const [routesRes, stopsInTripRes] = await Promise.all([
        fetch(ROUTES_URL),
        fetch(STOPS_IN_TRIP_URL),
      ]);

      if (!routesRes.ok) throw new Error(`routes HTTP ${routesRes.status}`);
      if (!stopsInTripRes.ok) throw new Error(`stopsInTrip HTTP ${stopsInTripRes.status}`);

      const [routesData, stopsInTripData] = await Promise.all([
        routesRes.json(),
        stopsInTripRes.json(),
      ]);

      const routes = normalizeStaticArray(routesData, "routes");
      const stopsInTrip = normalizeStaticArray(stopsInTripData, "stopsInTrip");
      const routeNameById = new Map();

      routes.forEach(route => {
        const routeId = String(route.routeId ?? "");
        const shortName = String(route.routeShortName || route.routeId || "").trim();
        if (routeId && shortName) {
          routeNameById.set(routeId, shortName);
          if (route.routeLongName) ROUTE_DESCRIPTIONS[shortName.toUpperCase()] = String(route.routeLongName);
        }
      });

      const routesByStop = new Map();
      stopsInTrip.forEach(row => {
        if (!row.passenger) return;
        const stopId = String(row.stopId ?? "");
        const routeId = String(row.routeId ?? "");
        if (!stopId || !routeId) return;

        const routeName = routeNameById.get(routeId) || routeId;
        if (!routesByStop.has(stopId)) routesByStop.set(stopId, new Set());
        routesByStop.get(stopId).add(routeName);
      });

      writeLocalCache("routes-index", {
        descriptions: ROUTE_DESCRIPTIONS,
        routesByStopEntries: [...routesByStop.entries()].map(([stopId, routes]) => [stopId, [...routes]]),
      });

      return routesByStop;
    } catch (e) {
      console.warn("[ztm-gdansk-card] Nie można pobrać pełnej listy linii:", e.message);
      _routesIndexPromise = null;
      _routesIndexTimestamp = 0;
      return null;
    }
  })();

  return _routesIndexPromise;
}

async function loadRoutesForStop(stopId, currentRoutes = []) {
  if (!stopId) return { routes: [], source: "none" };
  const cached = getCachedRoutes(stopId);
  if (cached) return cached;

  const routesIndex = await loadRoutesIndex();
  const indexedRoutes = routesIndex?.get(String(stopId));
  if (indexedRoutes && indexedRoutes.size > 0) {
    const routes = [...indexedRoutes].sort(compareRoutes);
    setCachedRoutes(stopId, routes, "static");
    return { routes, source: "static", timestamp: Date.now() };
  }
  
  try {
    const res = await fetch(`${DEPARTURES_URL}?stopId=${encodeURIComponent(stopId)}`);
    if (!res.ok) return { routes: currentRoutes, source: currentRoutes.length ? "fallback" : "unavailable" };
    const data = await res.json();
    const newRoutes = [...new Set((data.departures || []).map(d => String(d.routeShortName || d.routeId || "")))].filter(Boolean);
    const merged = [...new Set([...currentRoutes, ...newRoutes])];
    merged.sort(compareRoutes);
    setCachedRoutes(stopId, merged, "departures");
    return { routes: merged, source: "departures", timestamp: Date.now() };
  } catch (_) {
    return { routes: currentRoutes, source: currentRoutes.length ? "fallback" : "unavailable" };
  }
}

/* ── Static CSS ── */

const CARD_CSS = `
  :host { display: block; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  ha-card {
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    border: 0;
    box-shadow: 0 6px 18px rgba(0,0,0,0.08);
  }
  .header {
    background: linear-gradient(135deg, #DA2128 0%, #b9151b 100%);
    padding: 13px 14px;
    display: flex;
    align-items: center;
    gap: 10px;
    user-select: none;
  }
  .header-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    color: #fff;
  }
  .header-icon svg { width: 22px; height: 22px; }
  .header-body { flex: 1; min-width: 0; }
  .header-title {
    color: #fff;
    font-size: 15px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .header-sub {
    color: rgba(255,255,255,0.72);
    font-size: 11px;
    margin-top: 1px;
  }
  .dep-list { list-style: none; padding: 0; margin: 0; }
  .dep-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 11px 14px;
    border-bottom: 1px solid var(--divider-color, #f0f0f0);
    transition: all 0.2s;
    min-height: 46px;
  }
  .dep-row:last-child { border-bottom: none; }
  .dep-row.imminent { background: rgba(218,33,40,0.04); }
  .dep-row.dimmed {
    opacity: 0.35;
    transition: opacity 0.3s;
  }
  .dep-row.dimmed:hover {
    opacity: 0.7;
  }
  .dep-row.highlighted {
    opacity: 1;
  }
  .badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 3px 7px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 700;
    color: #fff;
    min-width: 40px;
    flex-shrink: 0;
    transition: opacity 0.2s;
  }
  .dimmed .badge {
    filter: grayscale(30%);
  }
  .badge.night-route {
    background: #000000 !important;
  }
  .headsign {
    font-size: 13px;
    font-weight: 500;
    color: var(--primary-text-color, #111);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    min-width: 0;
  }
  .time-col {
    text-align: right;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
  }
  .time-main {
    font-size: 15px;
    font-weight: 600;
    color: var(--primary-text-color, #111);
    white-space: nowrap;
  }
  .time-sub {
    font-size: 12px;
    color: var(--secondary-text-color, #888);
    white-space: nowrap;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .time-sub .dot { color: #10b981; font-weight: 700; }
  .delay-badge { font-size: 12px; font-weight: 600; }
  .delay-badge.late { color: #DA2128; }
  .delay-badge.early { color: #0369a1; }
  .skel { background: var(--divider-color, #e5e5e5); border-radius: 4px; }
  @keyframes shimmer {
    0%, 100% { opacity: 0.5; }
    50% { opacity: 1; }
  }
  .skel { animation: shimmer 1.4s ease-in-out infinite; }
  .state-msg {
    padding: 24px 16px;
    text-align: center;
    color: var(--secondary-text-color, #888);
    font-size: 13px;
    line-height: 1.6;
  }
  .state-msg .icon { font-size: 28px; display: block; margin-bottom: 8px; }
  .stale-msg {
    padding: 7px 14px;
    border-bottom: 1px solid var(--divider-color, #f0f0f0);
    background: rgba(245,158,11,0.08);
    color: var(--secondary-text-color, #666);
    font-size: 11px;
    line-height: 1.35;
  }
  .footer {
    padding: 7px 14px;
    font-size: 10px;
    color: var(--secondary-text-color, #aaa);
    display: flex;
    justify-content: space-between;
    border-top: 1px solid var(--divider-color, #f0f0f0);
  }
  .footer-countdown {
    color: var(--secondary-text-color, #aaa);
  }
  ha-card.e-ink {
    background: #fff;
    color: #000;
    border: 0;
    border-radius: 0;
    box-shadow: none;
    overflow: visible;
  }
  ha-card.e-ink .header {
    background: #fff;
    border-bottom: 2px solid #000;
    padding: 12px 14px;
  }
  ha-card.e-ink .header-title,
  ha-card.e-ink .header-sub,
  ha-card.e-ink .header-icon,
  ha-card.e-ink .headsign,
  ha-card.e-ink .time-main,
  ha-card.e-ink .time-sub,
  ha-card.e-ink .footer,
  ha-card.e-ink .footer-countdown,
  ha-card.e-ink .state-msg {
    color: #000;
  }
  ha-card.e-ink .dep-row {
    border-bottom-color: #000;
    transition: none;
    min-height: 46px;
  }
  ha-card.e-ink .dep-row.imminent,
  ha-card.e-ink .dep-row.dimmed,
  ha-card.e-ink .dep-row.highlighted {
    background: #fff;
    opacity: 1;
  }
  ha-card.e-ink .badge {
    background: #fff !important;
    border: 1px solid #000;
    color: #000;
  }
  ha-card.e-ink .time-sub .dot,
  ha-card.e-ink .delay-badge,
  ha-card.e-ink .delay-badge.late,
  ha-card.e-ink .delay-badge.early {
    color: #000;
  }
  ha-card.e-ink .skel {
    animation: none;
    background: #d1d5db;
  }
  ha-card.e-ink .footer {
    border-top: 0;
    justify-content: flex-end;
    padding: 7px 14px 2px;
  }
  ha-card.compact .header {
    padding: 9px 12px;
    gap: 8px;
  }
  ha-card.compact .header-icon {
    width: 24px;
    height: 24px;
  }
  ha-card.compact .header-icon svg {
    width: 19px;
    height: 19px;
  }
  ha-card.compact .header-title {
    font-size: 14px;
  }
  ha-card.compact .header-sub {
    font-size: 10px;
  }
  ha-card.compact .dep-row {
    min-height: 38px;
    padding: 7px 12px;
    gap: 8px;
  }
  ha-card.compact .badge {
    min-width: 34px;
    padding: 2px 6px;
    font-size: 12px;
  }
  ha-card.compact .headsign {
    font-size: 12px;
  }
  ha-card.compact .time-main {
    font-size: 13px;
  }
  ha-card.compact .time-sub {
    font-size: 10px;
  }
  ha-card.compact .footer {
    padding: 5px 12px;
  }
`;

const BUS_STOP_ICON = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M16 16.01L16.01 15.9989" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M6 16.01L6.01 15.9989" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M20 22V15V8M20 8H18L18 2H22V8H20Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M4 20V22H6V20H4Z" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M14 20V22H16V20H14Z" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M16 20H2.6C2.26863 20 2 19.7314 2 19.4V12.6C2 12.2686 2.26863 12 2.6 12H16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M14 8H6M14 2H6C3.79086 2 2 3.79086 2 6V8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

/* ── Editor ──────────────────────────────────────────────────────────────── */

class ZtmGdanskCardEditor extends HTMLElement {
  constructor() {
    super();
    this._config = {};
    this._stops = [];
    this._availableRoutes = [];
    this._stopQuery = "";
    this._routesStopId = null;
    this._routesLoading = false;
    this._routesSource = "";
    this._searchTimer = null;
    this.attachShadow({ mode: "open" });
  }

  setConfig(config) {
    this._config = normalizeConfig(config || {});
    this._render();
  }

  connectedCallback() {
    this._loadStops();
  }

  async _loadStops() {
    this._stops = await loadAllStops();
    this._stops.sort((a, b) => stopDisplayName(a).localeCompare(stopDisplayName(b), "pl", { numeric: true }));
    this._render();
  }

  async _fetchRoutesForStop(stopId) {
    if (!stopId) {
      this._availableRoutes = [];
      this._routesStopId = null;
      this._routesLoading = false;
      this._routesSource = "";
      this._updateRoutesChips();
      return;
    }
    if (String(this._routesStopId) !== String(stopId)) {
      this._availableRoutes = [];
      this._routesStopId = stopId;
      this._routesSource = "";
      this._routesLoading = true;
      this._updateRoutesChips();
    }
    const result = await loadRoutesForStop(stopId, this._availableRoutes);
    this._availableRoutes = result.routes;
    this._routesSource = result.source;
    this._routesLoading = false;
    this._updateRoutesChips();
  }

  _updateRoutesChips() {
    const container = this.shadowRoot.querySelector('.available-routes');
    if (!container) return;

    if (this._routesLoading) {
      container.innerHTML = `<div class="route-status">Ładowanie pełnej listy linii…</div>`;
      return;
    }
    
    if (this._availableRoutes.length === 0) {
      container.innerHTML = this._routesStopId
        ? `<div class="route-status">Brak linii do pokazania dla tego przystanku.</div>`
        : '';
      return;
    }

    const selectedRoutes = new Set((this._config.filter_routes || []).map(r => String(r).trim().toUpperCase()));
    const sourceNote = this._routesSource === "static"
      ? "Pełna lista linii z rozkładu."
      : "Lista z aktualnych odjazdów; może być niepełna.";
    
    container.innerHTML = `
      <div class="route-chips">
        ${this._availableRoutes.map(r => {
          const active = selectedRoutes.has(String(r).toUpperCase());
          const description = routeDescription(r);
          const title = description ? `${r}: ${description}` : `Linia ${r}`;
          return `<button type="button" class="route-chip ${routeClass(r)} ${active ? "active" : ""}" style="background:${routeColor(r)}" data-route="${escapeHtml(r)}" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">${escapeHtml(r)}</button>`;
        }).join("")}
      </div>
      <div class="route-status">${escapeHtml(sourceNote)}</div>`;
    
    container.querySelectorAll('.route-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const route = chip.getAttribute('data-route');
        const filterInput = this.shadowRoot.getElementById('filter_routes');
        if (filterInput && route) {
          const current = filterInput.value.split(",").map(r => r.trim()).filter(Boolean);
          const index = current.findIndex(r => r.toUpperCase() === route.toUpperCase());
          if (index >= 0) {
            current.splice(index, 1);
          } else {
            current.push(route);
          }
          filterInput.value = current.join(", ");
          this._fire();
          this._updateRoutesChips();
        }
      });
    });
  }

  _fire() {
    const get = (id) => this.shadowRoot.getElementById(id);
    const value = (id, fallback = "") => get(id)?.value ?? fallback;
    const checked = (id, fallback = false) => get(id)?.checked ?? fallback;
    const numberValue = (id, fallback) => {
      const parsed = Number.parseInt(value(id, fallback), 10);
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    const filterRaw = value("filter_routes");
    const routes = filterRaw.split(",").map(r => r.trim()).filter(Boolean);
    const realtimeOnly = checked("realtime_only", this._config.realtime_only);
    const displayPreset = this.shadowRoot.querySelector('input[name="display_preset"]:checked')?.value
      || this._config.display_preset
      || "standard";

    const nextConfig = normalizeConfig({
        ...this._config,
        type: "custom:ztm-gdansk-card",
        display_preset: displayPreset,
        stop_id: value("stop_id") || undefined,
        title: value("title") || undefined,
        max_departures: numberValue("max_departures", 10),
        refresh_interval: numberValue("refresh_interval", 30),
        e_ink_refresh_interval: numberValue("e_ink_refresh_interval", 300),
        max_minutes_ahead: numberValue("max_minutes_ahead", 0),
        filter_routes: routes.length ? routes : undefined,
        highlight_mode: checked("highlight_mode"),
        show_delays: checked("show_delays", true),
        hide_terminus: checked("hide_terminus", true),
        e_ink_mode: displayPreset === "e_ink",
        compact_mode: displayPreset === "compact",
        show_footer: checked("show_footer", true),
        realtime_only: realtimeOnly,
    });

    this._config = nextConfig;
    this.dispatchEvent(new CustomEvent("config-changed", {
      detail: { config: serializeConfig(nextConfig) },
      bubbles: true,
      composed: true,
    }));
  }

  _selectedStop() {
    return this._stops.find(s => String(s.stopId) === String(this._config.stop_id)) || null;
  }

  _stopMatches() {
    if (!this._stops.length) return [];

    const query = normalizeSearchText(this._stopQuery.trim());
    if (!query) return [];

    return this._stops
      .filter(stop => {
        const label = normalizeSearchText(`${stopDisplayName(stop)} ${stop.stopName || ""} ${stop.stopDesc || ""} ${stop.stopId}`);
        return label.includes(query);
      })
      .slice(0, 8);
  }

  _renderStopPicker() {
    const c = this._config;
    if (!this._stops.length) {
      return `
        <div class="field">
          <label for="stop_id">ID przystanku</label>
          <input id="stop_id" type="number" inputmode="numeric" value="${escapeHtml(c.stop_id || "")}" placeholder="14945" />
          <div class="helper">Lista przystanków jeszcze się ładuje. Możesz wpisać ID ręcznie.</div>
        </div>`;
    }

    const selected = this._selectedStop();
    const selectedName = selected ? stopDisplayName(selected) : "";
    const selectedId = c.stop_id || "";

    return `
      <input id="stop_id" type="hidden" value="${escapeHtml(selectedId)}" />
      ${selectedId ? `
        <div class="selected-stop">
          <div>
            <span class="selected-label">Aktualnie wybrany</span>
            <strong>${escapeHtml(selectedName || `Przystanek ${selectedId}`)}</strong>
            <small>ID ${escapeHtml(selectedId)}</small>
          </div>
          <button type="button" class="clear-stop" aria-label="Wyczyść przystanek">Zmień</button>
        </div>` : ""}
      <div class="field">
        <label for="stop_search">${selectedId ? "Zmień przystanek" : "Wybierz przystanek"}</label>
        <input id="stop_search" type="search" value="${escapeHtml(this._stopQuery)}" placeholder="Nazwa lub ID, np. Warnenska albo 14945" autocomplete="off" />
        <div class="helper">Wyniki pokazują pełną nazwę słupka, np. Warneńska 01.</div>
        <div class="stop-results ${this._stopQuery.trim() ? "" : "hidden"}" role="listbox">
          ${this._stopQuery.trim() ? this._renderStopResults() : ""}
        </div>
      </div>`;
  }

  _renderStopResults() {
    const selectedId = this._config.stop_id || "";
    const matches = this._stopMatches();

    return matches.length ? matches.map(stop => `
      <button type="button" class="stop-result ${String(stop.stopId) === String(selectedId) ? "selected" : ""}" data-stop-id="${escapeHtml(stop.stopId)}">
        <span>${escapeHtml(stopDisplayName(stop))}</span>
        <small>${escapeHtml(stop.stopId)}</small>
      </button>`).join("") : `<div class="empty-results">Brak pasujących przystanków</div>`;
  }

  _updateStopResults() {
    const container = this.shadowRoot.querySelector(".stop-results");
    if (!container) return;
    const hasQuery = this._stopQuery.trim().length > 0;
    container.classList.toggle("hidden", !hasQuery);
    container.innerHTML = hasQuery ? this._renderStopResults() : "";
    this._bindStopResults();
  }

  _bindStopResults() {
    this.shadowRoot.querySelectorAll(".stop-result").forEach(button => {
      button.addEventListener("click", () => {
        const stopId = button.getAttribute("data-stop-id");
        const stopInput = this.shadowRoot.getElementById("stop_id");
        if (!stopId || !stopInput) return;

        stopInput.value = stopId;
        this._stopQuery = "";
        this._fetchRoutesForStop(stopId);
        this._validateEditor();
        this._fire();
        this._render();
      });
    });
  }

  _validateEditor() {
    const validation = this.shadowRoot.querySelector(".validation");
    if (!validation) return true;

    const checks = [
      { id: "max_departures", min: 3, max: 20, message: "Liczba odjazdów musi być w zakresie 3-20." },
      { id: "refresh_interval", min: 15, max: 300, message: "Odświeżanie musi być w zakresie 15-300 sekund." },
      { id: "max_minutes_ahead", min: 0, max: 1440, message: "Limit czasu musi być w zakresie 0-1440 minut." },
      { id: "e_ink_refresh_interval", min: 60, max: 3600, message: "Odświeżanie e-ink musi być w zakresie 60-3600 sekund." },
    ];
    const messages = [];

    checks.forEach(check => {
      const el = this.shadowRoot.getElementById(check.id);
      if (!el) return;
      const value = Number.parseInt(el.value, 10);
      const invalid = !Number.isFinite(value) || value < check.min || value > check.max;
      el.classList.toggle("invalid", invalid);
      if (invalid) messages.push(check.message);
    });

    const stopInput = this.shadowRoot.getElementById("stop_id");
    if (stopInput && stopInput.type !== "hidden" && stopInput.value && !/^\d+$/.test(stopInput.value.trim())) {
      stopInput.classList.add("invalid");
      messages.push("ID przystanku powinno być liczbą.");
    } else if (stopInput) {
      stopInput.classList.remove("invalid");
    }

    validation.classList.toggle("hidden", messages.length === 0);
    validation.innerHTML = messages.length
      ? `<strong>Sprawdź konfigurację</strong><ul>${messages.map(message => `<li>${escapeHtml(message)}</li>`).join("")}</ul>`
      : "";
    return messages.length === 0;
  }

  _render() {
    const c = this._config;
    const realtimeOnly = c.realtime_only;
    const displayPreset = c.display_preset || (c.e_ink_mode ? "e_ink" : c.compact_mode ? "compact" : "standard");

    this.shadowRoot.innerHTML = `
      <style>
        * {
          box-sizing: border-box;
        }
        .form {
          display: grid;
          gap: 22px;
          padding: 0 0 8px;
        }
        .section {
          display: grid;
          gap: 12px;
        }
        .section-heading {
          display: grid;
          gap: 2px;
        }
        .section-title {
          color: var(--primary-text-color, #111827);
          font-size: 14px;
          font-weight: 600;
          line-height: 1.35;
        }
        .section-description,
        .helper {
          color: var(--secondary-text-color, #6b7280);
          font-size: 12px;
          line-height: 1.35;
        }
        .field-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }
        .validation {
          background: rgba(245, 158, 11, 0.08);
          border: 1px solid rgba(245, 158, 11, 0.25);
          border-radius: 6px;
          color: var(--primary-text-color, #111827);
          display: grid;
          font-size: 12px;
          gap: 4px;
          line-height: 1.35;
          padding: 9px 10px;
        }
        .validation.hidden {
          display: none;
        }
        .validation strong {
          font-size: 12px;
        }
        .validation ul {
          margin: 0;
          padding-left: 16px;
        }
        .field {
          display: grid;
          gap: 5px;
          min-width: 0;
        }
        label {
          color: var(--secondary-text-color, #6b7280);
          display: block;
          font-size: 12px;
          font-weight: 500;
          line-height: 1.35;
        }
        input,
        button {
          width: 100%;
          min-height: 40px;
          padding: 8px 10px;
          border: 1px solid var(--input-outlined-idle-border-color, var(--divider-color, #d1d5db));
          border-radius: 4px;
          font-size: 14px;
          background: var(--card-background-color, #fff);
          color: var(--primary-text-color, #111827);
          font-family: inherit;
        }
        input:hover,
        button:hover {
          border-color: var(--primary-color, #DA2128);
        }
        input:focus,
        button:focus {
          border-color: var(--primary-color, #DA2128);
          outline: 2px solid rgba(218, 33, 40, 0.18);
          outline-offset: 1px;
        }
        input.invalid {
          border-color: #f59e0b;
        }
        .preset-group {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 6px;
        }
        .preset-option {
          margin: 0;
        }
        .preset-option input {
          height: 1px;
          opacity: 0;
          position: absolute;
          width: 1px;
        }
        .preset-card {
          border: 1px solid var(--divider-color, #d1d5db);
          border-radius: 6px;
          cursor: pointer;
          display: grid;
          gap: 2px;
          min-height: 62px;
          padding: 9px 8px;
          text-align: center;
        }
        .preset-name {
          color: var(--primary-text-color, #111827);
          font-size: 13px;
          font-weight: 700;
          line-height: 1.25;
        }
        .preset-description {
          color: var(--secondary-text-color, #6b7280);
          font-size: 10px;
          font-weight: 400;
          line-height: 1.25;
        }
        .preset-option input:checked + .preset-card {
          border-color: var(--primary-color, #DA2128);
          box-shadow: inset 0 0 0 1px var(--primary-color, #DA2128);
        }
        .preset-option input:focus-visible + .preset-card {
          outline: 2px solid rgba(218, 33, 40, 0.35);
          outline-offset: 2px;
        }
        .switch-list {
          display: grid;
          gap: 2px;
        }
        .switch-row {
          align-items: center;
          border-radius: 6px;
          cursor: pointer;
          display: flex;
          gap: 12px;
          justify-content: space-between;
          margin: 0;
          min-height: 44px;
          padding: 6px 0;
        }
        .switch-row:hover .switch-title {
          color: var(--primary-text-color, #111827);
        }
        .switch-copy {
          display: grid;
          gap: 1px;
          min-width: 0;
        }
        .switch-title {
          color: var(--primary-text-color, #111827);
          font-size: 13px;
          font-weight: 500;
          line-height: 1.35;
        }
        .switch-helper {
          color: var(--secondary-text-color, #6b7280);
          font-size: 11px;
          font-weight: 400;
          line-height: 1.35;
        }
        .switch-input {
          height: 1px;
          opacity: 0;
          position: absolute;
          width: 1px;
        }
        .switch-ui {
          align-items: center;
          background: var(--switch-unchecked-track-color, #9ca3af);
          border-radius: 999px;
          display: inline-flex;
          flex: 0 0 auto;
          height: 22px;
          padding: 2px;
          transition: background 0.15s;
          width: 38px;
        }
        .switch-ui::before {
          background: #fff;
          border-radius: 50%;
          box-shadow: 0 1px 2px rgba(0,0,0,0.25);
          content: "";
          height: 18px;
          transition: transform 0.15s;
          width: 18px;
        }
        .switch-input:checked + .switch-ui {
          background: var(--primary-color, #DA2128);
        }
        .switch-input:checked + .switch-ui::before {
          transform: translateX(16px);
        }
        .switch-input:focus-visible + .switch-ui {
          outline: 2px solid rgba(218, 33, 40, 0.35);
          outline-offset: 2px;
        }
        .selected-stop {
          align-items: center;
          background: rgba(218,33,40,0.05);
          border: 1px solid rgba(218,33,40,0.18);
          border-radius: 6px;
          display: flex;
          gap: 12px;
          justify-content: space-between;
          padding: 10px 12px;
        }
        .selected-stop strong {
          color: var(--primary-text-color, #111827);
          display: block;
          font-size: 14px;
          line-height: 1.25;
        }
        .selected-stop small {
          color: var(--secondary-text-color, #6b7280);
          display: block;
          font-size: 11px;
          margin-top: 2px;
        }
        .selected-label {
          color: var(--secondary-text-color, #6b7280);
          display: block;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.03em;
          margin-bottom: 2px;
          text-transform: uppercase;
        }
        .clear-stop {
          background: var(--card-background-color, #fff);
          color: var(--primary-color, #DA2128);
          flex-shrink: 0;
          font-size: 12px;
          font-weight: 700;
          min-height: 32px;
          padding: 5px 10px;
          width: auto;
        }
        .stop-results {
          border: 1px solid var(--divider-color, #e5e7eb);
          border-radius: 6px;
          margin-top: 4px;
          max-height: 238px;
          overflow: hidden;
          overflow-y: auto;
        }
        .stop-results.hidden {
          display: none;
        }
        .stop-result {
          border: 0;
          border-bottom: 1px solid var(--divider-color, #e5e7eb);
          border-radius: 0;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 10px;
          justify-content: space-between;
          min-height: 38px;
          text-align: left;
        }
        .stop-result:last-child { border-bottom: 0; }
        .stop-result:hover { background: rgba(218,33,40,0.06); }
        .stop-result.selected {
          background: rgba(218,33,40,0.1);
          font-weight: 700;
        }
        .stop-result small {
          color: var(--secondary-text-color, #6b7280);
          font-weight: 700;
        }
        .empty-results {
          padding: 12px;
          color: var(--secondary-text-color, #6b7280);
          font-size: 12px;
          text-align: center;
        }
        .available-routes {
          margin-top: 2px;
        }
        .route-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .route-status {
          color: var(--secondary-text-color, #6b7280);
          font-size: 11px;
          line-height: 1.35;
          margin-top: 6px;
        }
        .route-chip { 
          width: auto;
          border: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 24px;
          padding: 3px 9px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 700;
          color: #fff;
          cursor: pointer;
          transition: opacity 0.15s;
          min-width: 36px;
        }
        .route-chip:hover { opacity: 0.8; }
        .route-chip.night-route {
          background: #000000 !important;
        }
        .route-chip.active {
          box-shadow: 0 0 0 2px var(--card-background-color, #fff), 0 0 0 4px rgba(218,33,40,0.35);
        }
        @media (max-width: 560px) {
          .field-grid,
          .preset-group {
            grid-template-columns: 1fr;
          }
        }
      </style>
      <div class="form">
        <div class="section">
          <div class="section-heading">
            <div class="section-title">Podstawowe</div>
            <div class="section-description">Nazwa karty i przystanek, który ma być wyświetlany.</div>
          </div>
          <div class="validation hidden" aria-live="polite"></div>
          <div class="field">
            <label for="title">Tytuł karty</label>
            <input id="title" type="text" value="${escapeHtml(c.title || "")}" placeholder="Domyślnie: nazwa przystanku" />
            <div class="helper">Zostaw puste, żeby użyć pełnej nazwy przystanku.</div>
          </div>
          ${this._renderStopPicker()}
        </div>

        <div class="section">
          <div class="section-heading">
            <div class="section-title">Odjazdy</div>
            <div class="section-description">Zakres danych, odświeżanie i filtrowanie kursów.</div>
          </div>
          <div class="field-grid">
            <div class="field">
              <label for="max_departures">Liczba odjazdów</label>
              <input id="max_departures" type="number" inputmode="numeric" min="3" max="20" value="${escapeHtml(c.max_departures ?? 10)}" />
              <div class="helper">Od 3 do 20 pozycji.</div>
            </div>
            <div class="field">
              <label for="refresh_interval">Odświeżanie</label>
              <input id="refresh_interval" type="number" inputmode="numeric" min="15" max="300" value="${escapeHtml(c.refresh_interval ?? 30)}" />
              <div class="helper">Sekundy, od 15 do 300.</div>
            </div>
            <div class="field">
              <label for="max_minutes_ahead">Limit czasu</label>
              <input id="max_minutes_ahead" type="number" inputmode="numeric" min="0" max="1440" value="${escapeHtml(c.max_minutes_ahead ?? 0)}" />
              <div class="helper">Maksymalnie ile minut do odjazdu. 0 wyłącza limit.</div>
            </div>
          </div>
          <div class="switch-list">
            <label class="switch-row" for="show_delays">
              <span class="switch-copy">
                <span class="switch-title">Pokaż opóźnienia i przyspieszenia</span>
                <span class="switch-helper">Widoczne tylko wtedy, gdy TRISTAR zwraca odjazd realtime.</span>
              </span>
              <input class="switch-input" id="show_delays" type="checkbox" ${c.show_delays !== false ? "checked" : ""} />
              <span class="switch-ui" aria-hidden="true"></span>
            </label>
            <label class="switch-row" for="hide_terminus">
              <span class="switch-copy">
                <span class="switch-title">Ukryj kursy kończące bieg</span>
                <span class="switch-helper">Pomija pojazdy, których kierunek jest taki sam jak wybrany przystanek.</span>
              </span>
              <input class="switch-input" id="hide_terminus" type="checkbox" ${c.hide_terminus !== false ? "checked" : ""} />
              <span class="switch-ui" aria-hidden="true"></span>
            </label>
            <label class="switch-row" for="realtime_only">
              <span class="switch-copy">
                <span class="switch-title">Tylko odjazdy realtime</span>
                <span class="switch-helper">Ukrywa kursy bez aktywnych danych GPS.</span>
              </span>
              <input class="switch-input" id="realtime_only" type="checkbox" ${realtimeOnly ? "checked" : ""} />
              <span class="switch-ui" aria-hidden="true"></span>
            </label>
          </div>
        </div>
        
        <div class="section">
          <div class="section-heading">
            <div class="section-title">Linie</div>
            <div class="section-description">Kliknij linię z listy albo wpisz numery ręcznie po przecinku.</div>
          </div>
          <div class="field">
            <label for="filter_routes">Wybrane linie</label>
            <input id="filter_routes" type="text" value="${escapeHtml((c.filter_routes || []).join(", "))}" placeholder="np. 131, 210, N6" />
            <div class="helper">Puste pole pokazuje wszystkie linie z przystanku.</div>
          </div>
          <label class="switch-row" for="highlight_mode">
            <span class="switch-copy">
              <span class="switch-title">Podświetlaj zamiast filtrować</span>
              <span class="switch-helper">Karta pokaże wszystkie odjazdy, a wybrane linie będą wyróżnione.</span>
            </span>
            <input class="switch-input" id="highlight_mode" type="checkbox" ${c.highlight_mode ? "checked" : ""} />
            <span class="switch-ui" aria-hidden="true"></span>
          </label>
          <div class="available-routes"></div>
        </div>
        
        <div class="section">
          <div class="section-heading">
            <div class="section-title">Wygląd</div>
            <div class="section-description">Preset układu karty i elementy pomocnicze.</div>
          </div>
          <div class="preset-group" role="radiogroup" aria-label="Preset wyglądu">
            <label class="preset-option">
              <input type="radio" name="display_preset" value="standard" ${displayPreset === "standard" ? "checked" : ""} />
              <span class="preset-card">
                <span class="preset-name">Standard</span>
                <span class="preset-description">Codzienny dashboard</span>
              </span>
            </label>
            <label class="preset-option">
              <input type="radio" name="display_preset" value="compact" ${displayPreset === "compact" ? "checked" : ""} />
              <span class="preset-card">
                <span class="preset-name">Kompakt</span>
                <span class="preset-description">Więcej odjazdów</span>
              </span>
            </label>
            <label class="preset-option">
              <input type="radio" name="display_preset" value="e_ink" ${displayPreset === "e_ink" ? "checked" : ""} />
              <span class="preset-card">
                <span class="preset-name">E-ink</span>
                <span class="preset-description">Monochromatyczny</span>
              </span>
            </label>
          </div>
          <div class="switch-list">
            <label class="switch-row" for="show_footer">
              <span class="switch-copy">
                <span class="switch-title">Pokaż stopkę</span>
                <span class="switch-helper">Źródło danych oraz, poza e-ink, czas ostatniego odświeżenia.</span>
              </span>
              <input class="switch-input" id="show_footer" type="checkbox" ${c.show_footer !== false ? "checked" : ""} />
              <span class="switch-ui" aria-hidden="true"></span>
            </label>
          </div>
        </div>

        <div class="section">
          <div class="section-heading">
            <div class="section-title">E-ink</div>
            <div class="section-description">Odświeżanie dla presetu e-ink. Sam tryb włączysz w sekcji Wygląd.</div>
          </div>
          <div class="field">
            <label for="e_ink_refresh_interval">Odświeżanie e-ink</label>
            <input id="e_ink_refresh_interval" type="number" inputmode="numeric" min="60" max="3600" value="${escapeHtml(c.e_ink_refresh_interval ?? 300)}" />
            <div class="helper">Sekundy, od 60 do 3600. Używane tylko po włączeniu trybu e-ink.</div>
          </div>
        </div>
      </div>
    `;

    const searchEl = this.shadowRoot.getElementById("stop_search");
    const stopInput = this.shadowRoot.getElementById("stop_id");
    const clearStop = this.shadowRoot.querySelector(".clear-stop");

    if (searchEl) {
      searchEl.addEventListener("input", () => {
        this._stopQuery = searchEl.value;
        this._updateStopResults();
      });
    }

    if (stopInput && stopInput.type !== "hidden") {
      stopInput.addEventListener("change", () => {
        this._stopQuery = "";
        this._fetchRoutesForStop(stopInput.value);
        this._validateEditor();
        this._fire();
      });
    }

    if (clearStop && stopInput) {
      clearStop.addEventListener("click", () => {
        stopInput.value = "";
        this._stopQuery = "";
        this._fetchRoutesForStop("");
        this._validateEditor();
        this._fire();
        this._render();
      });
    }

    this._bindStopResults();

    ["title", "filter_routes"].forEach(id => {
      const el = this.shadowRoot.getElementById(id);
      if (el) el.addEventListener("input", () => {
        this._validateEditor();
        this._fire();
        if (id === "filter_routes") this._updateRoutesChips();
      });
    });

    ["max_departures", "refresh_interval", "e_ink_refresh_interval", "max_minutes_ahead", "show_delays", "hide_terminus", "highlight_mode", "show_footer", "realtime_only"].forEach(id => {
      const el = this.shadowRoot.getElementById(id);
      if (el) {
        el.addEventListener("input", () => {
          this._validateEditor();
          this._fire();
        });
        el.addEventListener("change", () => {
          this._validateEditor();
          this._fire();
        });
      }
    });

    this.shadowRoot.querySelectorAll('input[name="display_preset"]').forEach(el => {
      el.addEventListener("change", () => {
        this._validateEditor();
        this._fire();
      });
    });

    this._validateEditor();

    if (c.stop_id) {
      this._fetchRoutesForStop(c.stop_id);
    }
  }
}

customElements.define("ztm-gdansk-card-editor", ZtmGdanskCardEditor);

/* ── Card ────────────────────────────────────────────────────────────────── */

class ZtmGdanskCard extends HTMLElement {
  constructor() {
    super();
    this._config = {};
    this._departures = [];
    this._lastGoodDepartures = [];
    this._emptyReason = "";
    this._stale = false;
    this._staleMessage = "";
    this._stopName = "";
    this._stopTerminusName = "";
    this._loading = true;
    this._error = null;
    this._lastUpdate = null;
    this._refreshTimer = null;
    this._tickTimer = null;
    this._countdownTimer = null;
    this._fetching = false;
    this._abortController = null;
    this._rendered = false;
    this._nextRefreshIn = 0;
    this.attachShadow({ mode: "open" });
  }

  static getConfigElement() { return document.createElement("ztm-gdansk-card-editor"); }
  static getStubConfig() {
    return {
      type: "custom:ztm-gdansk-card",
      display_preset: "standard",
      max_departures: 10,
      refresh_interval: 30,
      e_ink_refresh_interval: 300,
      max_minutes_ahead: 0,
      show_delays: true,
      hide_terminus: true,
      highlight_mode: false,
      show_footer: true,
      realtime_only: false,
    };
  }

  setConfig(config) {
    const nextConfig = normalizeConfig(config);
    const changed = JSON.stringify(nextConfig) !== JSON.stringify(this._config);
    const stopIdChanged = String(this._config.stop_id) !== String(nextConfig.stop_id);
    const eInkModeChanged = this._config.e_ink_mode !== nextConfig.e_ink_mode;
    const footerVisibilityChanged = this._config.show_footer !== nextConfig.show_footer;
    const refreshIntervalChanged = this._config.refresh_interval !== nextConfig.refresh_interval
      || this._config.e_ink_refresh_interval !== nextConfig.e_ink_refresh_interval
      || eInkModeChanged;
    
    this._config = nextConfig;
    
    if (changed && this._rendered) {
      if (stopIdChanged) {
        this._stopName = "";
        this._stopTerminusName = "";
      }
      this._departures = [];
      this._emptyReason = "";
      this._stale = false;
      this._staleMessage = "";
      if (stopIdChanged) this._lastGoodDepartures = [];
      this._loading = true;
      this._error = null;
      this._fullRender();
      if (this._config.stop_id) this._fetchDepartures();
      if (refreshIntervalChanged && this.isConnected) this._startRefreshTimer();
      if (footerVisibilityChanged && this.isConnected) this._updateFooter();
      if (eInkModeChanged && this.isConnected) {
        this._startTickTimer();
        this._startCountdownTimer();
      }
    }
  }

  set hass(_hass) {}
  getCardSize() { return Math.ceil((this._config.max_departures || 10) / 2) + 2; }

  connectedCallback() {
    if (!this._rendered) {
      this._fullRender();
      if (this._config.stop_id) this._fetchDepartures();
    }
    this._startRefreshTimer();
    this._startTickTimer();
    this._startCountdownTimer();
  }

  disconnectedCallback() {
    this._stopTimers();
    this._abortFetch();
  }

  _startRefreshTimer() {
    this._stopRefreshTimer();
    if (!this._config.stop_id) return;
    const intervalSeconds = this._config.e_ink_mode
      ? Math.max(60, this._config.e_ink_refresh_interval || 300)
      : Math.max(15, this._config.refresh_interval || 30);
    const interval = intervalSeconds * 1000;
    this._nextRefreshIn = Math.floor(interval / 1000);
    this._refreshTimer = setInterval(() => {
      this._fetchDepartures();
      this._nextRefreshIn = Math.floor(interval / 1000);
    }, interval);
  }
  _stopRefreshTimer() { if (this._refreshTimer) { clearInterval(this._refreshTimer); this._refreshTimer = null; } }
  
  _startTickTimer() {
    if (this._tickTimer) clearInterval(this._tickTimer);
    if (this._config.e_ink_mode) return;
    this._tickTimer = setInterval(() => { if (!this._loading && !this._error) this._updateDepartureList(); }, 10000);
  }

  _startCountdownTimer() {
    if (this._countdownTimer) clearInterval(this._countdownTimer);
    if (this._config.e_ink_mode) return;
    this._countdownTimer = setInterval(() => {
      if (this._nextRefreshIn > 0) {
        this._nextRefreshIn--;
        this._updateCountdown();
      }
    }, 1000);
  }

  _stopTimers() {
    this._stopRefreshTimer();
    if (this._tickTimer) { clearInterval(this._tickTimer); this._tickTimer = null; }
    if (this._countdownTimer) { clearInterval(this._countdownTimer); this._countdownTimer = null; }
  }
  
  _abortFetch() {
    if (this._abortController) { this._abortController.abort(); this._abortController = null; }
    this._fetching = false;
  }

  async _fetchDepartures() {
    if (!this._config.stop_id) return;
    if (this._fetching) return;
    this._abortFetch();
    this._fetching = true;
    this._abortController = new AbortController();
    let aborted = false;
    
    this._error = null;

    try {
      if (!this._stopName) {
        const stops = await loadAllStops();
        const stop = findStop(this._config.stop_id, stops);
        this._stopName = stop ? stopDisplayName(stop) : `Przystanek ${this._config.stop_id}`;
        this._stopTerminusName = stopBaseName(stop) || this._stopName;
        this._updateTitle();
      }

      const res = await fetch(`${DEPARTURES_URL}?stopId=${encodeURIComponent(this._config.stop_id)}`, { signal: this._abortController.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status} – sprawdź stop_id`);
      const data = await res.json();

      let deps = (data.departures || []).map(d => ({
        routeId: String(d.routeId || d.routeShortName || "?"),
        headsign: d.headsign || d.tripHeadsign || "—",
        estimatedTime: d.estimatedTime || d.theoreticalTime || null,
        theoreticalTime: d.theoreticalTime || null,
        delaySeconds: d.delayInSeconds || d.delay || 0,
        status: d.status || "SCHEDULED",
      }));

      deps = deps.filter(d => !d.estimatedTime || new Date(d.estimatedTime) > Date.now() - 30000);
      let emptyReason = deps.length === 0 ? "no_departures" : "";

      if (this._config.max_minutes_ahead > 0) {
        const beforeCount = deps.length;
        const maxTime = Date.now() + this._config.max_minutes_ahead * 60_000;
        deps = deps.filter(d => !d.estimatedTime || new Date(d.estimatedTime).getTime() <= maxTime);
        if (beforeCount > 0 && deps.length === 0) emptyReason = "time_limit";
      }

      if (this._config.hide_terminus && this._stopTerminusName && !this._stopTerminusName.startsWith("Przystanek")) {
        const beforeCount = deps.length;
        const sn = normalizeText(this._stopTerminusName);
        deps = deps.filter(d => normalizeText(d.headsign) !== sn);
        if (beforeCount > 0 && deps.length === 0) emptyReason = "terminus";
      }

      if (this._config.realtime_only) {
        const beforeCount = deps.length;
        deps = deps.filter(d => d.status === "REALTIME");
        if (beforeCount > 0 && deps.length === 0) emptyReason = "realtime";
      }

      const filters = this._config.filter_routes;
      const isHighlightMode = this._config.highlight_mode;
      
      if (Array.isArray(filters) && filters.length > 0) {
        const fs = new Set(filters.map(f => String(f).trim().toUpperCase()));
        
        if (isHighlightMode) {
          deps.forEach(d => {
            d._highlighted = fs.has(d.routeId.toUpperCase());
            d._dimmed = !d._highlighted;
          });
        } else {
          const beforeCount = deps.length;
          deps = deps.filter(d => fs.has(d.routeId.toUpperCase()));
          if (beforeCount > 0 && deps.length === 0) emptyReason = "routes";
        }
      } else {
        deps.forEach(d => {
          d._highlighted = false;
          d._dimmed = false;
        });
      }

      deps.sort((a, b) => new Date(a.estimatedTime) - new Date(b.estimatedTime));
      this._departures = deps.slice(0, this._config.max_departures || 10);
      this._lastGoodDepartures = this._departures;
      this._emptyReason = this._departures.length === 0 ? emptyReason || "no_departures" : "";
      this._stale = false;
      this._staleMessage = "";
      this._lastUpdate = new Date();
    } catch (e) {
      if (e.name === 'AbortError') {
        aborted = true;
      } else {
        if (this._lastGoodDepartures.length > 0) {
          this._departures = this._lastGoodDepartures;
          this._emptyReason = "";
          this._stale = true;
          this._staleMessage = e.message;
          this._error = null;
        } else {
          this._error = e.message;
        }
      }
    } finally {
      this._loading = false;
      this._fetching = false;
      this._abortController = null;
    }

    if (aborted) return;
    this._updateDepartureList();
    this._updateFooter();
  }

  _fullRender() {
    const c = this._config;
    const title = c.title || this._stopName || `Przystanek ${c.stop_id}`;
    const lastUpdateStr = this._lastUpdate ? this._lastUpdate.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : null;
    const escapedStopId = escapeHtml(c.stop_id || "nie wybrano");
    const cardClasses = [c.e_ink_mode ? "e-ink" : "", c.compact_mode ? "compact" : ""].filter(Boolean).join(" ");
    const footerHTML = c.e_ink_mode
      ? `<span></span><span>TRISTAR · ZTM Gdańsk</span>`
      : `<span>${c.stop_id ? (lastUpdateStr ? `Odświeżono: ${lastUpdateStr} · Następne za <span class="footer-countdown">${this._nextRefreshIn}s</span>` : "Ładowanie…") : ""}</span><span>TRISTAR · otwarte dane ZTM</span>`;
    const footerBlock = c.show_footer ? `<div class="footer">${footerHTML}</div>` : "";

    this.shadowRoot.innerHTML = `
      <style>${CARD_CSS}</style>
      <ha-card class="${cardClasses}">
        <div class="header">
          <span class="header-icon" aria-label="przystanek">${BUS_STOP_ICON}</span>
          <div class="header-body">
            <div class="header-title">${escapeHtml(c.stop_id ? title : "Wybierz przystanek")}</div>
            <div class="header-sub">Przystanek ${escapedStopId} · ZTM Gdańsk</div>
          </div>
        </div>
        <div class="dep-list">${this._renderDepartureList()}</div>
        ${footerBlock}
      </ha-card>`;

    this._rendered = true;
  }

  _updateTitle() {
    const el = this.shadowRoot.querySelector('.header-title');
    if (el) el.textContent = this._config.title || this._stopName || `Przystanek ${this._config.stop_id}`;
  }

  _updateDepartureList() {
    const el = this.shadowRoot.querySelector('.dep-list');
    if (el) el.innerHTML = this._renderDepartureList();
  }

  _updateFooter() {
    if (!this._config.show_footer) return;
    if (this._config.e_ink_mode) return;
    const el = this.shadowRoot.querySelector('.footer span:first-child');
    if (el && this._lastUpdate) {
      el.innerHTML = `Odświeżono: ${this._lastUpdate.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} · Następne za <span class="footer-countdown">${this._nextRefreshIn}s</span>`;
    }
  }

  _updateCountdown() {
    if (this._config.e_ink_mode) return;
    const el = this.shadowRoot.querySelector('.footer-countdown');
    if (el) el.textContent = `${this._nextRefreshIn}s`;
  }

  _emptyStateHTML() {
    const states = {
      routes: ["🔍", "Brak odjazdów dla wybranych linii", "Usuń filtr linii albo włącz podświetlanie zamiast filtrowania."],
      realtime: ["●", "Brak odjazdów realtime", "Wyłącz opcję „Tylko odjazdy realtime”, żeby zobaczyć kursy rozkładowe."],
      time_limit: ["⏱", "Brak odjazdów w ustawionym limicie czasu", "Zwiększ limit czasu albo ustaw 0, żeby pokazać wszystkie nadchodzące odjazdy."],
      terminus: ["↩", "Brak odjazdów po ukryciu kursów kończących bieg", "Wyłącz ukrywanie kursów kończących bieg, jeśli chcesz je widzieć."],
      no_departures: ["⏳", "Brak nadchodzących odjazdów", "TRISTAR nie zwraca teraz kursów dla tego przystanku."],
    };
    const [icon, title, helper] = states[this._emptyReason] || states.no_departures;
    return `<div class="state-msg"><span class="icon">${icon}</span>${escapeHtml(title)}<br><small>${escapeHtml(helper)}</small></div>`;
  }

  _renderDepartureList() {
    const c = this._config;

    if (!this._config.stop_id) return `<div class="state-msg"><span class="icon">📍</span>Wybierz przystanek w konfiguracji</div>`;

    if (this._loading) {
      return Array.from({ length: c.max_departures || 10 }, (_, i) =>
        `<div class="dep-row">
          <div class="skel" style="height:26px;width:40px;border-radius:6px;animation-delay:${i*0.08}s"></div>
          <div class="skel" style="height:13px;width:${55+(i*13)%35}%;animation-delay:${i*0.08+0.05}s;flex:1"></div>
          <div class="skel" style="height:13px;width:60px;animation-delay:${i*0.08+0.1}s"></div>
        </div>`).join("");
    }

    if (this._error) return `<div class="state-msg"><span class="icon">⚠️</span>Błąd pobierania danych<br><small>${escapeHtml(this._error)}</small></div>`;
    if (this._departures.length === 0) return this._emptyStateHTML();

    const staleHTML = this._stale
      ? `<div class="stale-msg">Pokazuję ostatnie poprawne dane. Nowe pobranie nie powiodło się${this._staleMessage ? `: ${escapeHtml(this._staleMessage)}` : ""}.</div>`
      : "";

    return staleHTML + this._departures.map(d => {
      const mins = minutesUntil(d.estimatedTime);
      const imminent = mins !== null && mins <= 2;
      const delayMin = Math.round((d.delaySeconds || 0) / 60);
      const showDelay = c.show_delays !== false && Math.abs(delayMin) >= 1;
      const isLate = delayMin > 0;
      const isRealtime = d.status === "REALTIME";
      
      let rowClass = '';
      if (imminent) rowClass += ' imminent';
      if (d._highlighted) rowClass += ' highlighted';
      if (d._dimmed) rowClass += ' dimmed';
      
      let timeColHTML = '';
      if (isRealtime) {
        const delayPart = showDelay ? ` • <span class="delay-badge ${isLate ? 'late' : 'early'}">${isLate ? '+' : ''}${delayMin} min</span>` : '';
        timeColHTML = `<div class="time-main${imminent ? ' imminent' : ''}">${formatHHMM(d.estimatedTime)}</div><div class="time-sub"><span class="dot">●</span> ${formatMins(mins)}${delayPart}</div>`;
      } else {
        timeColHTML = `<div class="time-main">${formatHHMM(d.theoreticalTime)}</div>`;
      }
      
      return `<div class="dep-row${rowClass}">
        <span class="badge ${routeClass(d.routeId)}" style="background:${routeColor(d.routeId)}">${escapeHtml(d.routeId)}</span>
        <span class="headsign">${escapeHtml(d.headsign)}</span>
        <div class="time-col">${timeColHTML}</div>
      </div>`;
    }).join("");
  }
}

customElements.define("ztm-gdansk-card", ZtmGdanskCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "ztm-gdansk-card",
  name: "ZTM Gdańsk Timetable Card",
  description: "Tablica odjazdów ZTM Gdańsk (TRISTAR) dla wybranego przystanku",
  preview: true,
  documentationURL: "https://github.com/toczke/ztm-gdansk-card",
});

console.info(
  `%c ZTM-GDANSK-CARD %c v${CARD_VERSION} `,
  "background:#DA2128;color:#fff;padding:2px 6px;border-radius:4px 0 0 4px;font-weight:bold",
  "background:#1f2937;color:#fff;padding:2px 6px;border-radius:0 4px 4px 0"
);
