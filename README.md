# ZTM Gdańsk Timetable Card

[![HACS Custom](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://hacs.xyz)
[![Version](https://img.shields.io/badge/version-1.3.0-blue.svg)](https://github.com/toczke/ztm-gdansk-card/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

Lovelace card for Home Assistant showing real-time bus and tram departures for any stop in Gdańsk, powered by the open **TRISTAR** API from ZTM Gdańsk / Otwarty Gdańsk.

**No API key required.** Data is fully open and free under the CC-BY licence.

---

## Features

- 🚌 Real-time departures for any ZTM Gdańsk stop (bus, tram, night lines)
- 🟢 Live indicator — green dot and "za X min" countdown shown only when TRISTAR has real-time GPS data; scheduled-only departures show just the clock time
- 🎨 Colour-coded route badges — red for buses, blue for trams, dark navy for night lines
- ⚠️ Delay and early arrival indicators (when TRISTAR reports deviation > 1 min)
- 🔍 Filter by specific lines — hide mode or highlight mode (dim other lines instead of removing them)
- 🚫 Automatically hides terminal arrivals — stops showing buses that are finishing their run at this stop
- ✏️ Visual editor with stop search and route chips for easy configuration
- ⏱️ Auto-refresh with configurable interval and live countdown to next refresh
- 💀 Skeleton loading state on first load
- 🚫 No page flicker on refresh — only the departure list is updated, not the whole card

---

## Screenshots

> Add screenshots here after first install.

---

## Installation

### Via HACS (recommended)

1. Open **HACS** in Home Assistant.
2. Go to **Frontend** → click the three-dot menu → **Custom repositories**.
3. Add `https://github.com/toczke/ztm-gdansk-card` with category **Dashboard**.
4. Find **ZTM Gdańsk Timetable Card** and click **Download**.
5. Hard reload your browser: **Ctrl+Shift+R** (Cmd+Shift+R on Mac).

### Manual

1. Download `ztm-gdansk-card.js` from the [latest release](https://github.com/toczke/ztm-gdansk-card/releases/latest).
2. Copy it to `config/www/ztm-gdansk-card.js`.
3. Go to **Settings → Dashboards → Resources → Add resource**:
   - URL: `/local/ztm-gdansk-card.js`
   - Type: `JavaScript module`
4. Hard reload your browser.

---

## Finding your Stop ID

Every physical bus/tram pole in the Tri-City has a unique **stopId** in the TRISTAR system.

**Option A – ZTM map**
Go to [mapa.ztm.gda.pl](https://mapa.ztm.gda.pl), click a stop, and read the ID from the info panel.

**Option B – przyjazdy.pl**
Browse to [przyjazdy.pl](https://przyjazdy.pl), select a stop — the number at the end of the URL is the stopId.

**Option C – TRISTAR stops API**
The full stops list is available at:
```
https://ckan.multimediagdansk.pl/dataset/c24aa637-3619-4dc2-a171-a23eec8f2172/resource/4c4025f0-01bf-41f7-a39f-d156d201b82b/download/stops.json
```
Each stop object has `stopId` and `stopDesc` (name).

---

## Configuration

### Minimal

```yaml
type: custom:ztm-gdansk-card
stop_id: "1327"
```

### Full example

```yaml
type: custom:ztm-gdansk-card
stop_id: "1327"
title: Autobusy spod domu
max_departures: 10
refresh_interval: 30
show_delays: true
hide_terminus: true
highlight_mode: false
filter_routes:
  - "110"
  - "148"
  - "N8"
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `stop_id` | string | **required** | TRISTAR stop ID |
| `title` | string | stop name from API | Custom card title |
| `max_departures` | number | `10` | Number of departures shown (3–20) |
| `refresh_interval` | number | `30` | Auto-refresh in seconds (min 15) |
| `show_delays` | boolean | `true` | Show delay/early arrival badges |
| `hide_terminus` | boolean | `true` | Hide buses finishing their run at this stop |
| `highlight_mode` | boolean | `false` | When using `filter_routes`: dim other lines instead of hiding them |
| `filter_routes` | list | _(all lines)_ | Only show (or highlight) these route IDs |

---

## How the time column works

The card uses the `status` field from the TRISTAR API to determine whether a departure has live GPS data:

| Status | What you see |
|---|---|
| `REALTIME` | 🟢 dot + **za X min** + clock time below |
| `SCHEDULED` | Clock time only (no countdown, no dot) |

This mirrors the behaviour of the official TRISTAR departure boards.

Delay badges appear only for real-time departures and only when the deviation is ≥ 1 minute. Positive values mean late, negative values mean early.

---

## Multiple stops in a grid

```yaml
type: grid
columns: 2
square: false
cards:
  - type: custom:ztm-gdansk-card
    stop_id: "1327"
    title: Kierunek centrum
    max_departures: 6

  - type: custom:ztm-gdansk-card
    stop_id: "1328"
    title: Kierunek powrotny
    max_departures: 6
```

---

## Data source & licence

Departure data comes from the **TRISTAR** system operated by ZTM Gdańsk, published as open data on [Otwarty Gdańsk](https://ckan.multimediagdansk.pl/dataset/tristar) under the **Creative Commons Attribution (CC-BY)** licence.

- Departures endpoint: `https://ckan2.multimediagdansk.pl/departures?stopId={id}`
- Stops list: `https://ckan.multimediagdansk.pl/dataset/tristar`

The API requires no authentication. Data is updated in real-time from GPS devices installed on all ZTM vehicles. Departures without GPS lock fall back to the scheduled timetable (`status: SCHEDULED`).

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `Custom element doesn't exist` | JS not registered | Check **Settings → Dashboards → Resources** for the JS entry; hard reload |
| Card not in `www/community/` | HACS didn't download | Make sure the repo has a published GitHub Release; use HACS → Redownload |
| "Błąd pobierania danych" | Wrong `stop_id` or network issue | Verify the ID at przyjazdy.pl; check HA can reach `ckan2.multimediagdansk.pl` |
| "Brak nadchodzących odjazdów" | No departures soon | Normal late at night or for infrequent lines; remove `filter_routes` to check |
| All departures show only clock, no countdown | No real-time GPS data | Normal — TRISTAR only sends live data when the vehicle is tracked |
| Terminal arrivals still showing | Stop name mismatch | Set `hide_terminus: false` and report the stop ID in an issue |

---

## Licence

MIT — do whatever you want, attribution appreciated.
