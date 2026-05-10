/**
 * ZTM Gdańsk Timetable Card (HACS optimized full version)
 */

const DEPARTURES_URL = "https://ckan2.multimediagdansk.pl/departures";
const STOPS_URL =
  "https://ckan2.multimediagdansk.pl/dataset/c24aa637-3619-4dc2-a171-a23eec8f2172/resource/4c4025f0-01bf-41f7-a39f-d156d201b82b/download/stops.json";

const CARD_VERSION = "1.1.1";

/* ─────────────────────────────────────────────
   GLOBAL CACHE (IMPORTANT FIX)
──────────────────────────────────────────── */

let stopsCachePromise = null;
let departuresCache = new Map(); // stopId -> { ts, data }
const CACHE_TTL = 15_000;

/* ───────────────────────────────────────────── */

function routeColor(routeId) {
  const s = String(routeId || "");
  if (!s) return "#6b7280";
  if (/^[Nn]/.test(s)) return "#1e2a6e";
  const n = parseInt(s, 10);
  if (!isNaN(n) && n < 100) return "#0369a1";
  return "#DA2128";
}

function minutesUntil(isoString) {
  if (!isoString) return null;
  return Math.round((new Date(isoString) - Date.now()) / 60000);
}

function formatMins(min) {
  if (min === null) return "—";
  if (min <= 0) return "za <1 min";
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

/* ─────────────────────────────────────────────
   STOPS CACHE (FIXED)
──────────────────────────────────────────── */

async function loadAllStops() {
  if (!stopsCachePromise) {
    stopsCachePromise = (async () => {
      const res = await fetch(STOPS_URL);
      if (!res.ok) throw new Error("Stops fetch failed");
      const data = await res.json();

      const today = Object.keys(data).sort().reverse()[0];
      return (data[today]?.stops || []).filter(
        (s) => s.stopDesc && !s.nonpassenger
      );
    })();
  }
  return stopsCachePromise;
}

function findStopName(stopId, stops) {
  const stop = stops.find((s) => String(s.stopId) === String(stopId));
  return stop ? stop.stopDesc : null;
}

/* ─────────────────────────────────────────────
   DEPARTURES CACHE
──────────────────────────────────────────── */

async function fetchDepartures(stopId, signal) {
  const now = Date.now();
  const cached = departuresCache.get(stopId);

  if (cached && now - cached.ts < CACHE_TTL) {
    return cached.data;
  }

  const url = `${DEPARTURES_URL}?stopId=${encodeURIComponent(stopId)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data = await res.json();

  const deps = (data.departures || []).map((d) => ({
    routeId: String(d.routeId || d.routeShortName || "?"),
    headsign: d.headsign || d.tripHeadsign || "—",
    estimatedTime: d.estimatedTime || d.theoreticalTime || null,
    theoreticalTime: d.theoreticalTime || null,
    delaySeconds: d.delayInSeconds || d.delay || 0,
    vehicleCode: d.vehicleCode || null,
    vehicleId: d.vehicleId || null,
    status: d.status || "SCHEDULED",
    tripId: d.tripId || null,
  }));

  departuresCache.set(stopId, { ts: now, data: deps });
  return deps;
}

/* ─────────────────────────────────────────────
   EDITOR
──────────────────────────────────────────── */

class ZtmGdanskCardEditor extends HTMLElement {
  constructor() {
    super();
    this._config = {};
    this._stops = [];
    this.attachShadow({ mode: "open" });
  }

  setConfig(config) {
    this._config = { ...config };
    this._render();
  }

  connectedCallback() {
    this._loadStops();
  }

  async _loadStops() {
    this._stops = await loadAllStops();
    this._stops.sort((a, b) =>
      a.stopDesc.localeCompare(b.stopDesc, "pl")
    );
    this._render();
  }

  _fire() {
    const get = (id) => this.shadowRoot.getElementById(id);

    const routes = get("filter_routes")
      .value.split(",")
      .map((r) => r.trim())
      .filter(Boolean);

    const cfg = {
      ...this._config,
      type: "custom:ztm-gdansk-card",
      stop_id: get("stop_id").value,
      title: get("title").value || undefined,
      max_departures: parseInt(get("max_departures").value, 10) || 10,
      refresh_interval: parseInt(get("refresh_interval").value, 10) || 30,
      filter_routes: routes.length ? routes : undefined,
      show_delays: get("show_delays").checked,
      hide_terminus: get("hide_terminus").checked,
    };

    this.dispatchEvent(
      new CustomEvent("config-changed", { detail: { config: cfg } })
    );
  }

  _render() {
    const c = this._config;

    const stopOpts =
      this._stops.length > 0
        ? `<input id="stop_search" placeholder="Szukaj..." />
           <select id="stop_id" size="8">
            ${this._stops
              .map(
                (s) =>
                  `<option value="${s.stopId}" ${
                    String(s.stopId) === String(c.stop_id)
                      ? "selected"
                      : ""
                  } data-search="${s.stopDesc.toLowerCase()} ${s.stopId}">
                    ${s.stopDesc} (${s.stopId})
                  </option>`
              )
              .join("")}
           </select>`
        : `<input id="stop_id" value="${c.stop_id || ""}" />`;

    this.shadowRoot.innerHTML = `
      <style>
        input, select { width:100%; padding:6px; margin:4px 0; }
      </style>

      <div>
        <label>Stop</label>
        ${stopOpts}

        <label>Title</label>
        <input id="title" value="${c.title || ""}" />

        <label>Max</label>
        <input id="max_departures" value="${c.max_departures || 10}" />

        <label>Routes</label>
        <input id="filter_routes" value="${(c.filter_routes || []).join(",")}" />

        <label>Refresh</label>
        <input id="refresh_interval" value="${c.refresh_interval || 30}" />

        <label><input id="show_delays" type="checkbox" ${
          c.show_delays !== false ? "checked" : ""
        }> delays</label>

        <label><input id="hide_terminus" type="checkbox" ${
          c.hide_terminus !== false ? "checked" : ""
        }> hide terminus</label>
      </div>
    `;

    this.shadowRoot
      .querySelectorAll("input, select")
      .forEach((el) =>
        el.addEventListener("change", () => this._fire())
      );
  }
}

/* ─────────────────────────────────────────────
   CARD
──────────────────────────────────────────── */

class ZtmGdanskCard extends HTMLElement {
  constructor() {
    super();
    this._config = {};
    this._departures = [];
    this._stopName = "";
    this._loading = true;
    this._error = null;
    this._lastUpdate = null;

    this._refreshTimer = null;
    this._tickTimer = null;
    this._abort = null;

    this._isConnected = false;

    this.attachShadow({ mode: "open" });
  }

  static getConfigElement() {
    return document.createElement("ztm-gdansk-card-editor");
  }

  static getStubConfig() {
    return {
      type: "custom:ztm-gdansk-card",
      stop_id: "1327",
      max_departures: 10,
      refresh_interval: 30,
      show_delays: true,
      hide_terminus: true,
    };
  }

  setConfig(config) {
    if (!config.stop_id) throw new Error("stop_id required");

    const stopChanged =
      String(this._config.stop_id) !== String(config.stop_id);

    this._config = {
      max_departures: 10,
      refresh_interval: 30,
      show_delays: true,
      hide_terminus: true,
      ...config,
    };

    if (stopChanged) {
      this._departures = [];
      this._stopName = "";
    }

    this._fetch();
    this._startTimers();
  }

  connectedCallback() {
    this._isConnected = true;
    this._startTimers();
  }

  disconnectedCallback() {
    this._isConnected = false;
    this._stopTimers();
    if (this._abort) this._abort.abort();
  }

  _startTimers() {
    this._stopTimers();

    const interval =
      Math.max(15, this._config.refresh_interval || 30) * 1000;

    this._refreshTimer = setInterval(() => this._fetch(), interval);

    this._tickTimer = setInterval(() => {
      if (!this._isConnected) return;
      this._updateTimesOnly();
    }, 10000);
  }

  _stopTimers() {
    if (this._refreshTimer) clearInterval(this._refreshTimer);
    if (this._tickTimer) clearInterval(this._tickTimer);
  }

  async _fetch() {
    if (!this._isConnected) return;

    this._loading = true;
    this._error = null;
    this._render();

    try {
      if (this._abort) this._abort.abort();
      this._abort = new AbortController();

      if (!this._stopName) {
        const stops = await loadAllStops();
        this._stopName =
          findStopName(this._config.stop_id, stops) ||
          `Przystanek ${this._config.stop_id}`;
      }

      let deps = await fetchDepartures(
        this._config.stop_id,
        this._abort.signal
      );

      const filters = this._config.filter_routes;
      if (filters?.length) {
        const set = new Set(filters.map((f) => String(f).toUpperCase()));
        deps = deps.filter((d) => set.has(d.routeId.toUpperCase()));
      }

      deps.sort(
        (a, b) =>
          new Date(a.estimatedTime) - new Date(b.estimatedTime)
      );

      this._departures = deps.slice(
        0,
        this._config.max_departures || 10
      );

      this._lastUpdate = new Date();
    } catch (e) {
      this._error = e.message;
    }

    this._loading = false;
    this._render();
  }

  _updateTimesOnly() {
    const rows = this.shadowRoot.querySelectorAll(".dep-row");
    rows.forEach((row, i) => {
      const d = this._departures[i];
      if (!d) return;

      const el = row.querySelector(".time-sub");
      if (el) el.textContent = formatMins(minutesUntil(d.estimatedTime));
    });
  }

  _openMap(dep) {
    const url = `https://mapa.ztm.gda.pl/?line=${dep.routeId}`;
    window.open(url, "_blank");
  }

  _render() {
    const c = this._config;

    const rows = this._loading
      ? `<div>Loading...</div>`
      : this._departures
          .map((d, i) => {
            const mins = minutesUntil(d.estimatedTime);

            return `
              <div class="dep-row" data-i="${i}">
                <span style="background:${routeColor(d.routeId)}" class="badge">
                  ${d.routeId}
                </span>
                <span>${d.headsign}</span>
                <span class="time-sub">${formatMins(mins)}</span>
              </div>
            `;
          })
          .join("");

    this.shadowRoot.innerHTML = `
      <style>
        .dep-row { display:flex; gap:10px; padding:6px; }
        .badge { color:white; padding:2px 6px; border-radius:4px; }
      </style>

      <ha-card>
        <div>${this._stopName}</div>
        ${rows}
      </ha-card>
    `;
  }
}

/* ───────────────────────────────────────────── */

customElements.define("ztm-gdansk-card", ZtmGdanskCard);
customElements.define("ztm-gdansk-card-editor", ZtmGdanskCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "ztm-gdansk-card",
  name: "ZTM Gdańsk Card",
  preview: true,
});

console.info(`ZTM Card v${CARD_VERSION}`);