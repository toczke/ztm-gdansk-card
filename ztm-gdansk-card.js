/**
 * ZTM Gdańsk Timetable Card
 * HACS Lovelace custom card for real-time bus/tram departures in Gdańsk
 *
 * Data source: TRISTAR open data by ZTM Gdańsk / Otwarty Gdańsk (CC-BY)
 *   Departures:  https://ckan2.multimediagdansk.pl/departures?stopId={id}
 *   Stops list:  https://ckan2.multimediagdansk.pl/dataset/.../stops.json
 */

const DEPARTURES_URL = "https://ckan2.multimediagdansk.pl/departures";
const STOPS_URL =
  "https://ckan2.multimediagdansk.pl/dataset/c24aa637-3619-4dc2-a171-a23eec8f2172/resource/4c4025f0-01bf-41f7-a39f-d156d201b82b/download/stops.json";

const CARD_VERSION = "1.1.0";

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function routeColor(routeId) {
  const s = String(routeId || "");
  if (!s) return "#6b7280";
  if (/^[Nn]/.test(s)) return "#1e2a6e";
  const n = parseInt(s, 10);
  if (!isNaN(n) && n < 100) return "#0369a1";
  return "#c2410c";
}

function minutesUntil(isoString) {
  if (!isoString) return null;
  const diff = Math.round((new Date(isoString) - Date.now()) / 60_000);
  return diff;
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

/* ── Global stops cache ── */

async function loadAllStops() {
  try {
    let res = await fetch(STOPS_URL);
    if (!res.ok) {
      const altUrl = "https://mapa.ztm.gda.pl/dataset/c24aa637-3619-4dc2-a171-a23eec8f2172/resource/4c4025f0-01bf-41f7-a39f-d156d201b82b/download/stops.json";
      res = await fetch(altUrl);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const today = Object.keys(data).sort().reverse()[0];
    const stops = (data[today]?.stops || []).filter(s => s.stopDesc && !s.nonpassenger);
    return stops;
  } catch (e) {
    console.warn("[ztm-gdansk-card] Nie można pobrać listy przystanków:", e.message);
    return [];
  }
}

function findStopName(stopId, stops) {
  const stop = stops.find(s => String(s.stopId) === String(stopId));
  return stop ? stop.stopDesc : null;
}

/* ── Editor ──────────────────────────────────────────────────────────────── */

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
    this._render();
  }

  _fire() {
    const get = (id) => this.shadowRoot.getElementById(id);
    const filterRaw = get("filter_routes").value;
    const routes = filterRaw
      .split(",")
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
        ? `<input id="stop_search" type="text" placeholder="Szukaj nazwy lub ID..." autocomplete="off" />
           <select id="stop_id" size="8">
            ${this._stops
              .map(
                (s) =>
                  `<option value="${s.stopId}" ${
                    String(s.stopId) === String(c.stop_id) ? "selected" : ""
                  } data-search="${s.stopDesc.toLowerCase()} ${s.stopId}">${s.stopDesc} (${s.stopId})</option>`
              )
              .join("")}
           </select>`
        : `<input id="stop_id" type="number" value="${c.stop_id || ""}" placeholder="np. 1327" />`;

    this.shadowRoot.innerHTML = `
      <style>
        * { box-sizing: border-box; }
        .form { padding: 4px 0 8px; }
        .row { margin-bottom: 14px; }
        label { display: block; font-size: 12px; font-weight: 600; color: var(--secondary-text-color, #555); margin-bottom: 4px; }
        input, select {
          width: 100%; padding: 8px 10px;
          border: 1px solid var(--divider-color, #ddd);
          border-radius: 6px; font-size: 14px;
          background: var(--card-background-color, #fff);
          color: var(--primary-text-color, #111);
        }
        input:focus, select:focus { outline: 2px solid #c2410c; }
        .hint { font-size: 11px; color: var(--secondary-text-color, #888); margin-top: 3px; }
        .checkbox-row { display: flex; align-items: center; gap: 8px; }
        .checkbox-row input { width: auto; }
      </style>
      <div class="form">
        <div class="row">
          <label>Przystanek (stop_id)</label>
          ${stopOpts}
          <div class="hint">Wyszukaj po nazwie lub ID przystanku</div>
        </div>
        <div class="row">
          <label>Tytuł karty (opcjonalnie)</label>
          <input id="title" type="text" value="${c.title || ""}" placeholder="np. Autobusy spod domu" />
        </div>
        <div class="row">
          <label>Liczba odjazdów</label>
          <input id="max_departures" type="number" min="3" max="20" value="${c.max_departures ?? 10}" />
        </div>
        <div class="row">
          <label>Filtruj linie (oddziel przecinkami)</label>
          <input id="filter_routes" type="text" value="${(c.filter_routes || []).join(", ")}" placeholder="np. 110, 148, N8" />
          <div class="hint">Zostaw puste, aby wyświetlić wszystkie linie</div>
        </div>
        <div class="row">
          <label>Odświeżanie (sekundy, min. 15)</label>
          <input id="refresh_interval" type="number" min="15" max="300" value="${c.refresh_interval ?? 30}" />
        </div>
        <div class="row">
          <div class="checkbox-row">
            <input id="show_delays" type="checkbox" ${c.show_delays !== false ? "checked" : ""} />
            <label style="margin:0">Pokaż opóźnienia / przyspieszenia</label>
          </div>
        </div>
        <div class="row">
          <div class="checkbox-row">
            <input id="hide_terminus" type="checkbox" ${c.hide_terminus !== false ? "checked" : ""} />
            <label style="margin:0">Ukryj kursy kończące się na tym przystanku</label>
          </div>
        </div>
      </div>
    `;

    const searchEl = this.shadowRoot.getElementById("stop_search");
    if (searchEl) {
      searchEl.addEventListener("input", () => {
        const query = searchEl.value.toLowerCase();
        const options = this.shadowRoot.querySelectorAll("#stop_id option");
        options.forEach(opt => {
          const txt = (opt.getAttribute("data-search") || "").toLowerCase();
          opt.style.display = txt.includes(query) ? "" : "none";
        });
      });
    }

    ["stop_id", "title", "max_departures", "filter_routes", "refresh_interval", "show_delays", "hide_terminus"].forEach((id) => {
      const el = this.shadowRoot.getElementById(id);
      if (el) el.addEventListener("change", () => this._fire());
    });
  }
}

customElements.define("ztm-gdansk-card-editor", ZtmGdanskCardEditor);

/* ── Card ────────────────────────────────────────────────────────────────── */

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
    if (!config.stop_id) throw new Error("[ztm-gdansk-card] stop_id jest wymagane");
    const changed = JSON.stringify(config) !== JSON.stringify(this._config);
    const stopIdChanged = String(this._config.stop_id) !== String(config.stop_id);
    
    this._config = {
      max_departures: 10,
      refresh_interval: 30,
      show_delays: true,
      hide_terminus: true,
      ...config,
    };
    
    if (changed) {
      if (stopIdChanged) {
        this._stopName = "";
      }
      this._departures = [];
      this._loading = true;
      this._error = null;
      this._fetchDepartures();
    }
  }

  set hass(_hass) {}

  getCardSize() {
    return Math.ceil((this._config.max_departures || 10) / 2) + 2;
  }

  connectedCallback() {
    this._startRefreshTimer();
    this._startTickTimer();
  }

  disconnectedCallback() {
    this._stopTimers();
  }

  _startRefreshTimer() {
    this._stopRefreshTimer();
    const interval = Math.max(15, this._config.refresh_interval || 30) * 1_000;
    this._refreshTimer = setInterval(() => this._fetchDepartures(), interval);
  }

  _stopRefreshTimer() {
    if (this._refreshTimer) {
      clearInterval(this._refreshTimer);
      this._refreshTimer = null;
    }
  }

  _startTickTimer() {
    this._tickTimer = setInterval(() => {
      if (!this._loading && !this._error) this._render();
    }, 10_000);
  }

  _stopTimers() {
    this._stopRefreshTimer();
    if (this._tickTimer) clearInterval(this._tickTimer);
  }

  async _fetchDepartures() {
    if (this._departures.length === 0) {
      this._loading = true;
    }
    
    this._error = null;
    this._render();

    try {
      if (!this._stopName) {
        const stops = await loadAllStops();
        const name = findStopName(this._config.stop_id, stops);
        if (name) {
          this._stopName = name;
        } else {
          this._stopName = `Przystanek ${this._config.stop_id}`;
        }
      }

      const url = `${DEPARTURES_URL}?stopId=${encodeURIComponent(this._config.stop_id)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} – sprawdź stop_id`);
      const data = await res.json();

      let deps = (data.departures || []).map((d) => ({
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

      deps = deps.filter(
        (d) => !d.estimatedTime || new Date(d.estimatedTime) > Date.now() - 30_000
      );

      if (this._config.hide_terminus && this._stopName && !this._stopName.startsWith("Przystanek")) {
        const stopNameNormalized = normalizeText(this._stopName);
        deps = deps.filter(d => {
          const headsignNormalized = normalizeText(d.headsign);
          return headsignNormalized !== stopNameNormalized;
        });
      }

      const filters = this._config.filter_routes;
      if (Array.isArray(filters) && filters.length > 0) {
        const fs = new Set(filters.map((f) => String(f).trim().toUpperCase()));
        deps = deps.filter((d) => fs.has(d.routeId.toUpperCase()));
      }

      deps.sort((a, b) => new Date(a.estimatedTime) - new Date(b.estimatedTime));

      this._departures = deps.slice(0, this._config.max_departures || 10);
      this._lastUpdate = new Date();
    } catch (e) {
      this._error = e.message;
    }

    this._loading = false;
    this._render();
  }

  /* ── Open vehicle on map ── */

  _openMap(dep) {
    const vehicleCode = dep.vehicleCode || dep.vehicleId;
    const line = dep.routeId || '';
    
    if (vehicleCode && line) {
      const mapUrl = `https://mapa.ztm.gda.pl/?vehicle=${encodeURIComponent(vehicleCode)}&line=${encodeURIComponent(line)}`;
      window.open(mapUrl, '_blank');
    } else if (line) {
      const mapUrl = `https://mapa.ztm.gda.pl/?line=${encodeURIComponent(line)}&stop=${encodeURIComponent(this._config.stop_id)}`;
      window.open(mapUrl, '_blank');
    }
  }

  _render() {
    const c = this._config;
    const title = c.title || this._stopName || `Przystanek ${c.stop_id}`;
    const lastUpdateStr = this._lastUpdate
      ? this._lastUpdate.toLocaleTimeString("pl-PL", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      : null;

    const CSS = `
      :host { display: block; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      ha-card {
        overflow: hidden;
        font-family: var(--paper-font-body1_-_font-family, 'Segoe UI', system-ui, sans-serif);
      }
      .header {
        background: #c2410c;
        padding: 12px 14px;
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
      .refresh-btn {
        background: rgba(255,255,255,0.18);
        border: none;
        border-radius: 6px;
        color: #fff;
        width: 32px;
        height: 32px;
        cursor: pointer;
        font-size: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.15s;
        flex-shrink: 0;
      }
      .refresh-btn:hover { background: rgba(255,255,255,0.28); }
      .refresh-btn.spinning { animation: spin 0.7s linear infinite; }
      @keyframes spin { to { transform: rotate(360deg); } }
      .col-header {
        display: grid;
        grid-template-columns: 56px 1fr 90px;
        gap: 8px;
        padding: 5px 14px;
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.07em;
        text-transform: uppercase;
        color: var(--secondary-text-color, #888);
        border-bottom: 1px solid var(--divider-color, #e5e5e5);
      }
      .col-time { text-align: right; }
      .dep-row {
        display: grid;
        grid-template-columns: 56px 1fr 90px;
        gap: 8px;
        align-items: center;
        padding: 8px 14px;
        border-bottom: 1px solid var(--divider-color, #f0f0f0);
        transition: background 0.1s;
      }
      .dep-row:last-child { border-bottom: none; }
      .dep-row.clickable {
        cursor: pointer;
      }
      .dep-row.clickable:hover {
        background: rgba(194,65,12,0.08);
      }
      .dep-row.imminent { background: rgba(194,65,12,0.06); }
      .dep-row.clickable.imminent:hover {
        background: rgba(194,65,12,0.14);
      }
      .badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 3px 6px;
        border-radius: 6px;
        font-size: 13px;
        font-weight: 700;
        color: #fff;
        min-width: 44px;
        letter-spacing: 0.01em;
      }
      .headsign {
        font-size: 13px;
        color: var(--primary-text-color, #111);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .time-col { text-align: right; }
      .time-main {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 4px;
      }
      .mins {
        font-size: 13px;
        font-weight: 600;
        color: var(--primary-text-color, #111);
      }
      .mins.imminent { color: #c2410c; }
      .mins.realtime::after {
        content: '';
        display: inline-block;
        width: 6px;
        height: 6px;
        background: #10b981;
        border-radius: 50%;
        margin-left: 4px;
        animation: pulse 1.5s infinite;
        flex-shrink: 0;
      }
      @keyframes pulse {
        0% { opacity: 0.3; }
        50% { opacity: 1; }
        100% { opacity: 0.3; }
      }
      .clock {
        font-size: 11px;
        color: var(--secondary-text-color, #888);
        margin-top: 2px;
      }
      .clock-scheduled {
        font-size: 13px;
        font-weight: 600;
        color: var(--primary-text-color, #111);
      }
      .clock-strikethrough {
        text-decoration: line-through;
        color: var(--secondary-text-color, #888);
        font-size: 11px;
        margin-right: 4px;
      }
      .delay-badge {
        display: inline-block;
        font-size: 10px;
        font-weight: 700;
        border-radius: 4px;
        padding: 1px 4px;
        margin-top: 2px;
      }
      .delay-badge.late {
        color: #c2410c;
        background: rgba(194,65,12,0.12);
      }
      .delay-badge.early {
        color: #0369a1;
        background: rgba(3,105,161,0.12);
      }
      /* Tooltip */
      .dep-row.clickable .headsign::after {
        content: " 🗺️";
        font-size: 11px;
        opacity: 0;
        transition: opacity 0.15s;
      }
      .dep-row.clickable:hover .headsign::after {
        opacity: 1;
      }
      .skel { background: var(--divider-color, #e5e5e5); border-radius: 4px; }
      @keyframes shimmer {
        0%   { opacity: 0.5; }
        50%  { opacity: 1;   }
        100% { opacity: 0.5; }
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
      .footer {
        padding: 6px 14px;
        font-size: 10px;
        color: var(--secondary-text-color, #aaa);
        display: flex;
        justify-content: space-between;
        border-top: 1px solid var(--divider-color, #f0f0f0);
      }
    `;

    // Ikona przystanku SVG
    const busStopIcon = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="17" x2="20" y2="17"/><line x1="6" y1="22" x2="14" y2="22"/><line x1="6" y1="3" x2="14" y2="3"/><circle cx="12" cy="12" r="2"/></svg>`;

    const skeletonRows = () =>
      Array.from({ length: c.max_departures || 10 }, (_, i) =>
        `<div class="dep-row">
          <div class="skel" style="height:26px;width:44px;border-radius:6px;animation-delay:${i * 0.08}s"></div>
          <div class="skel" style="height:13px;width:${55 + (i * 13) % 35}%;animation-delay:${i * 0.08 + 0.05}s"></div>
          <div style="text-align:right">
            <div class="skel" style="height:13px;width:48px;margin-left:auto;animation-delay:${i * 0.08 + 0.1}s"></div>
            <div class="skel" style="height:11px;width:36px;margin-left:auto;margin-top:4px;animation-delay:${i * 0.08 + 0.15}s"></div>
          </div>
        </div>`
      ).join("");

    const depRows = () => {
      if (this._error) {
        return `<div class="state-msg">
          <span class="icon">⚠️</span>
          Błąd pobierania danych<br>
          <small style="font-size:11px">${this._error}</small>
        </div>`;
      }
      if (this._departures.length === 0) {
        return `<div class="state-msg">
          <span class="icon">⏳</span>
          Brak nadchodzących odjazdów
        </div>`;
      }
      return this._departures.map((d) => {
        const mins = minutesUntil(d.estimatedTime);
        const imminent = mins !== null && mins <= 2;
        const delayMin = Math.round((d.delaySeconds || 0) / 60);
        const isDelayed = c.show_delays !== false && Math.abs(delayMin) >= 1;
        const isLate = delayMin > 0;
        const isEarly = delayMin < 0;
        const isRealtime = d.estimatedTime && d.theoreticalTime && 
                           new Date(d.estimatedTime).getTime() !== new Date(d.theoreticalTime).getTime();
        const isActive = d.status === "REALTIME" && (d.vehicleCode || d.vehicleId);
        
        // Format opóźnienia/przyspieszenia
        let delayBadge = '';
        if (isDelayed) {
          const sign = isLate ? '+' : '';
          const label = `${sign}${delayMin} min`;
          const cssClass = isLate ? 'late' : 'early';
          delayBadge = `<div class="delay-badge ${cssClass}">${label}</div>`;
        }
        
        return `
          <div class="dep-row${imminent ? " imminent" : ""}${isActive ? " clickable" : ""}"
               ${isActive ? `onclick="this.getRootNode().host._openMap(${JSON.stringify(d).replace(/"/g, '&quot;')})"` : ""}>
            <div>
              <span class="badge" style="background:${routeColor(d.routeId)}">${d.routeId}</span>
            </div>
            <div class="headsign">${d.headsign}</div>
            <div class="time-col">
              ${isRealtime ? `
                <div class="time-main">
                  ${isDelayed ? `<span class="clock-strikethrough">${formatHHMM(d.theoreticalTime)}</span>` : ''}
                  <span class="mins${imminent ? " imminent" : ""} realtime">${formatMins(mins)}</span>
                </div>
                <div class="clock">${formatHHMM(d.estimatedTime)}</div>
              ` : `
                <div class="time-main">
                  <span class="clock-scheduled">${formatHHMM(d.theoreticalTime)}</span>
                </div>
              `}
              ${delayBadge}
            </div>
          </div>`;
      }).join("");
    };

    this.shadowRoot.innerHTML = `
      <style>${CSS}</style>
      <ha-card>
        <div class="header">
          <span class="header-icon" aria-label="przystanek">${busStopIcon}</span>
          <div class="header-body">
            <div class="header-title">${title}</div>
            <div class="header-sub">Przystanek ${c.stop_id} · ZTM Gdańsk</div>
          </div>
          <button class="refresh-btn${this._loading ? " spinning" : ""}"
                  aria-label="Odśwież"
                  onclick="this.getRootNode().host._fetchDepartures()">↻</button>
        </div>
        <div class="col-header">
          <span>Linia</span>
          <span>Kierunek</span>
          <span class="col-time">Odjazd</span>
        </div>
        ${this._loading ? skeletonRows() : depRows()}
        <div class="footer">
          <span>${lastUpdateStr ? `Odświeżono: ${lastUpdateStr}` : "Ładowanie…"}</span>
          <span>TRISTAR · otwarte dane ZTM</span>
        </div>
      </ha-card>
    `;
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
  "background:#c2410c;color:#fff;padding:2px 6px;border-radius:4px 0 0 4px;font-weight:bold",
  "background:#1f2937;color:#fff;padding:2px 6px;border-radius:0 4px 4px 0"
);