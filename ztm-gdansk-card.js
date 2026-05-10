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
  "https://ckan2.multimediagdansk.pl/dataset/c24aa637-3619-4dc2-a171-a23eec8f2172/resource/4c4025f0-01bf-41f7-a39f-d156d201b82b/download/stops.json";

const CARD_VERSION = "1.2.0";

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function routeColor(routeId) {
  const s = String(routeId || "");
  if (!s) return "#6b7280";
  
  // Linie nocne (N...)
  if (/^[Nn]/.test(s)) return "#1e2a6e";
  
  const n = parseInt(s, 10);
  if (isNaN(n)) return "#DA2128";
  
  // Tramwaje (1-2 cyfry, 1-99)
  if (n < 100) {
    // Sezonowe (6x)
    if (n >= 60 && n < 70) return "#8B4513";
    // Specjalne (9x)
    if (n >= 90 && n < 100) return "#4B0082";
    // Zwykłe tramwaje
    return "#0369a1";
  }
  
  // Autobusy
  return "#DA2128";
}

function routeTypeLabel(routeId) {
  const s = String(routeId || "");
  if (/^[Nn]/.test(s)) return "Nocna";
  const n = parseInt(s, 10);
  if (isNaN(n)) return "";
  if (n < 100) {
    if (n >= 60 && n < 70) return "Sezonowa";
    if (n >= 90 && n < 100) return "Specjalna";
    return "Tramwaj";
  }
  return "";
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

let _stopsPromise = null;

function loadAllStops() {
  if (_stopsPromise) return _stopsPromise;
  
  _stopsPromise = (async () => {
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
  })();
  
  return _stopsPromise;
}

function findStopName(stopId, stops) {
  const stop = stops.find(s => String(s.stopId) === String(stopId));
  return stop ? stop.stopDesc : null;
}

/* ── Static CSS ── */

const CARD_CSS = `
  :host { display: block; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  ha-card {
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  .header {
    background: #DA2128;
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
    padding: 10px 14px;
    border-bottom: 1px solid var(--divider-color, #f0f0f0);
    transition: background 0.1s;
    min-height: 44px;
  }
  .dep-row:last-child { border-bottom: none; }
  .dep-row.imminent { background: rgba(218,33,40,0.04); }
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
    font-size: 14px;
    font-weight: 600;
    color: var(--primary-text-color, #111);
    white-space: nowrap;
  }
  .time-sub {
    font-size: 11px;
    color: var(--secondary-text-color, #888);
    white-space: nowrap;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .time-sub .dot { color: #10b981; font-weight: 700; }
  .delay-badge { font-size: 11px; font-weight: 600; }
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
  .footer {
    padding: 6px 14px;
    font-size: 10px;
    color: var(--secondary-text-color, #aaa);
    display: flex;
    justify-content: space-between;
    border-top: 1px solid var(--divider-color, #f0f0f0);
  }
  .footer-countdown {
    color: var(--secondary-text-color, #aaa);
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
    this._stops.sort((a, b) => a.stopDesc.localeCompare(b.stopDesc, "pl"));
    this._render();
  }

  _fire() {
    const get = (id) => this.shadowRoot.getElementById(id);
    const filterRaw = get("filter_routes").value;
    const routes = filterRaw.split(",").map(r => r.trim()).filter(Boolean);

    this.dispatchEvent(new CustomEvent("config-changed", {
      detail: { config: {
        ...this._config,
        type: "custom:ztm-gdansk-card",
        stop_id: get("stop_id").value,
        title: get("title").value || undefined,
        max_departures: parseInt(get("max_departures").value, 10) || 10,
        refresh_interval: parseInt(get("refresh_interval").value, 10) || 30,
        filter_routes: routes.length ? routes : undefined,
        show_delays: get("show_delays").checked,
        hide_terminus: get("hide_terminus").checked,
      }}
    }));
  }

  _render() {
    const c = this._config;
    const stopOpts = this._stops.length > 0
      ? `<input id="stop_search" type="text" placeholder="Szukaj nazwy lub ID..." autocomplete="off" />
         <select id="stop_id" size="8">
          ${this._stops.map(s => `<option value="${s.stopId}" ${String(s.stopId) === String(c.stop_id) ? "selected" : ""} data-search="${s.stopDesc.toLowerCase()} ${s.stopId}">${s.stopDesc} (${s.stopId})</option>`).join("")}
         </select>`
      : `<input id="stop_id" type="number" value="${c.stop_id || ""}" placeholder="np. 1327" />`;

    this.shadowRoot.innerHTML = `
      <style>
        * { box-sizing: border-box; }
        .form { padding: 4px 0 8px; }
        .row { margin-bottom: 14px; }
        label { display: block; font-size: 12px; font-weight: 600; color: var(--secondary-text-color, #555); margin-bottom: 4px; }
        input, select { width: 100%; padding: 8px 10px; border: 1px solid var(--divider-color, #ddd); border-radius: 6px; font-size: 14px; background: var(--card-background-color, #fff); color: var(--primary-text-color, #111); }
        input:focus, select:focus { outline: 2px solid #DA2128; }
        .hint { font-size: 11px; color: var(--secondary-text-color, #888); margin-top: 3px; }
        .checkbox-row { display: flex; align-items: center; gap: 8px; }
        .checkbox-row input { width: auto; }
      </style>
      <div class="form">
        <div class="row"><label>Przystanek (stop_id)</label>${stopOpts}<div class="hint">Wyszukaj po nazwie lub ID przystanku</div></div>
        <div class="row"><label>Tytuł karty (opcjonalnie)</label><input id="title" type="text" value="${c.title || ""}" placeholder="np. Autobusy spod domu" /></div>
        <div class="row"><label>Liczba odjazdów</label><input id="max_departures" type="number" min="3" max="20" value="${c.max_departures ?? 10}" /></div>
        <div class="row"><label>Filtruj linie (oddziel przecinkami)</label><input id="filter_routes" type="text" value="${(c.filter_routes || []).join(", ")}" placeholder="np. 110, 148, N8" /><div class="hint">Zostaw puste, aby wyświetlić wszystkie linie</div></div>
        <div class="row"><label>Odświeżanie (sekundy, min. 15)</label><input id="refresh_interval" type="number" min="15" max="300" value="${c.refresh_interval ?? 30}" /></div>
        <div class="row"><div class="checkbox-row"><input id="show_delays" type="checkbox" ${c.show_delays !== false ? "checked" : ""} /><label style="margin:0">Pokaż opóźnienia / przyspieszenia</label></div></div>
        <div class="row"><div class="checkbox-row"><input id="hide_terminus" type="checkbox" ${c.hide_terminus !== false ? "checked" : ""} /><label style="margin:0">Ukryj kursy kończące się na tym przystanku</label></div></div>
      </div>`;

    const searchEl = this.shadowRoot.getElementById("stop_search");
    if (searchEl) {
      searchEl.addEventListener("input", () => {
        const q = searchEl.value.toLowerCase();
        this.shadowRoot.querySelectorAll("#stop_id option").forEach(opt => {
          opt.style.display = (opt.getAttribute("data-search") || "").toLowerCase().includes(q) ? "" : "none";
        });
      });
    }

    ["stop_id", "title", "max_departures", "filter_routes", "refresh_interval", "show_delays", "hide_terminus"].forEach(id => {
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
    this._countdownTimer = null;
    this._fetching = false;
    this._abortController = null;
    this._rendered = false;
    this._nextRefreshIn = 0;
    this.attachShadow({ mode: "open" });
  }

  static getConfigElement() { return document.createElement("ztm-gdansk-card-editor"); }
  static getStubConfig() { return { type: "custom:ztm-gdansk-card", stop_id: "1327", max_departures: 10, refresh_interval: 30, show_delays: true, hide_terminus: true }; }

  setConfig(config) {
    if (!config.stop_id) throw new Error("[ztm-gdansk-card] stop_id jest wymagane");
    const changed = JSON.stringify(config) !== JSON.stringify(this._config);
    const stopIdChanged = String(this._config.stop_id) !== String(config.stop_id);
    
    this._config = { max_departures: 10, refresh_interval: 30, show_delays: true, hide_terminus: true, ...config };
    
    if (changed && this._rendered) {
      if (stopIdChanged) this._stopName = "";
      this._departures = [];
      this._loading = true;
      this._error = null;
      this._fullRender();
      this._fetchDepartures();
    }
  }

  set hass(_hass) {}
  getCardSize() { return Math.ceil((this._config.max_departures || 10) / 2) + 2; }

  connectedCallback() {
    if (!this._rendered) {
      this._fullRender();
      this._fetchDepartures();
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
    const interval = Math.max(15, this._config.refresh_interval || 30) * 1000;
    this._nextRefreshIn = Math.floor(interval / 1000);
    this._refreshTimer = setInterval(() => {
      this._fetchDepartures();
      this._nextRefreshIn = Math.floor(interval / 1000);
    }, interval);
  }
  _stopRefreshTimer() { if (this._refreshTimer) { clearInterval(this._refreshTimer); this._refreshTimer = null; } }
  
  _startTickTimer() {
    this._tickTimer = setInterval(() => { if (!this._loading && !this._error) this._updateDepartureList(); }, 10000);
  }

  _startCountdownTimer() {
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
    if (this._fetching) return;
    this._abortFetch();
    this._fetching = true;
    this._abortController = new AbortController();
    
    this._error = null;

    try {
      if (!this._stopName) {
        const stops = await loadAllStops();
        const name = findStopName(this._config.stop_id, stops);
        this._stopName = name || `Przystanek ${this._config.stop_id}`;
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

      if (this._config.hide_terminus && this._stopName && !this._stopName.startsWith("Przystanek")) {
        const sn = normalizeText(this._stopName);
        deps = deps.filter(d => normalizeText(d.headsign) !== sn);
      }

      const filters = this._config.filter_routes;
      if (Array.isArray(filters) && filters.length > 0) {
        const fs = new Set(filters.map(f => String(f).trim().toUpperCase()));
        deps = deps.filter(d => fs.has(d.routeId.toUpperCase()));
      }

      deps.sort((a, b) => new Date(a.estimatedTime) - new Date(b.estimatedTime));
      this._departures = deps.slice(0, this._config.max_departures || 10);
      this._lastUpdate = new Date();
    } catch (e) {
      if (e.name === 'AbortError') return;
      this._error = e.message;
    }

    this._loading = false;
    this._fetching = false;
    this._abortController = null;
    this._updateDepartureList();
    this._updateFooter();
  }

  _fullRender() {
    const c = this._config;
    const title = c.title || this._stopName || `Przystanek ${c.stop_id}`;
    const lastUpdateStr = this._lastUpdate ? this._lastUpdate.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : null;

    this.shadowRoot.innerHTML = `
      <style>${CARD_CSS}</style>
      <ha-card>
        <div class="header">
          <span class="header-icon" aria-label="przystanek">${BUS_STOP_ICON}</span>
          <div class="header-body">
            <div class="header-title">${title}</div>
            <div class="header-sub">Przystanek ${c.stop_id} · ZTM Gdańsk</div>
          </div>
        </div>
        <div class="dep-list">${this._renderDepartureList()}</div>
        <div class="footer">
          <span>${lastUpdateStr ? `Odświeżono: ${lastUpdateStr} · Następne za <span class="footer-countdown">${this._nextRefreshIn}s</span>` : "Ładowanie…"}</span>
          <span>TRISTAR · otwarte dane ZTM</span>
        </div>
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
    const el = this.shadowRoot.querySelector('.footer span:first-child');
    if (el && this._lastUpdate) {
      el.innerHTML = `Odświeżono: ${this._lastUpdate.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} · Następne za <span class="footer-countdown">${this._nextRefreshIn}s</span>`;
    }
  }

  _updateCountdown() {
    const el = this.shadowRoot.querySelector('.footer-countdown');
    if (el) el.textContent = `${this._nextRefreshIn}s`;
  }

  _renderDepartureList() {
    const c = this._config;

    if (this._loading) {
      return Array.from({ length: c.max_departures || 10 }, (_, i) =>
        `<div class="dep-row">
          <div class="skel" style="height:26px;width:40px;border-radius:6px;animation-delay:${i*0.08}s"></div>
          <div class="skel" style="height:13px;width:${55+(i*13)%35}%;animation-delay:${i*0.08+0.05}s;flex:1"></div>
          <div class="skel" style="height:13px;width:60px;animation-delay:${i*0.08+0.1}s"></div>
        </div>`).join("");
    }

    if (this._error) return `<div class="state-msg"><span class="icon">⚠️</span>Błąd pobierania danych<br><small>${this._error}</small></div>`;
    if (this._departures.length === 0) return `<div class="state-msg"><span class="icon">⏳</span>Brak nadchodzących odjazdów</div>`;

    return this._departures.map(d => {
      const mins = minutesUntil(d.estimatedTime);
      const imminent = mins !== null && mins <= 2;
      const delayMin = Math.round((d.delaySeconds || 0) / 60);
      const showDelay = c.show_delays !== false && Math.abs(delayMin) >= 1;
      const isLate = delayMin > 0;
      const isRealtime = d.status === "REALTIME";
      
      let timeColHTML = '';
      if (isRealtime) {
        const delayPart = showDelay ? ` • <span class="delay-badge ${isLate ? 'late' : 'early'}">${isLate ? '+' : ''}${delayMin} min</span>` : '';
        timeColHTML = `<div class="time-main${imminent ? ' imminent' : ''}">${formatHHMM(d.estimatedTime)}</div><div class="time-sub"><span class="dot">●</span> ${formatMins(mins)}${delayPart}</div>`;
      } else {
        timeColHTML = `<div class="time-main">${formatHHMM(d.theoreticalTime)}</div>`;
      }
      
      return `<div class="dep-row${imminent ? ' imminent' : ''}">
        <span class="badge" style="background:${routeColor(d.routeId)}">${d.routeId}</span>
        <span class="headsign">${d.headsign}</span>
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