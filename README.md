# ZTM Gdańsk Timetable Card

A [HACS](https://hacs.xyz/) Lovelace card for **Home Assistant** that displays real-time bus and tram departures for any stop in Gdańsk, powered by the open **TRISTAR** API provided by ZTM Gdańsk / Otwarty Gdańsk (CC-BY licence).

No API key required — data is completely open and free.

---

## Features

- 🚌 Real-time departures from any ZTM Gdańsk stop
- 🚃 Colour-coded badges — red for buses, blue for trams, navy for night lines
- ⏱️ Countdown in minutes + exact departure time
- ⚠️ Delay indicator (when TRISTAR reports a delay > 1 min)
- 🔄 Auto-refresh (configurable interval, default 30 s)
- 🔍 Filter to specific lines (e.g. only show lines 110 and 148)
- ✏️ Visual editor in the Lovelace UI editor
- 💀 Skeleton loading state while data is fetching

---

## Installation

### Via HACS (recommended)

1. Open **HACS** in Home Assistant.
2. Go to **Frontend** → click the three-dot menu → **Custom repositories**.
3. Add your repository URL and set category to **Lovelace**.
4. Search for **ZTM Gdańsk Timetable Card** and click **Download**.
5. Reload your browser.

### Manual

1. Copy `ztm-gdansk-card.js` to your `config/www/` directory.
2. In Home Assistant go to **Settings → Dashboards → Resources** and add:
   - **URL:** `/local/ztm-gdansk-card.js`
   - **Type:** `JavaScript module`
3. Reload your browser.

---

## Finding your Stop ID

Every physical bus/tram pole in the Tri-City has a unique **stopId** in the TRISTAR system.

**Option A – ZTM website**
Go to [ztm.gda.pl/rozklady](https://ztm.gda.pl/rozklady), click a stop on the map, and read the ID from the URL or stop info panel.

**Option B – TRISTAR stops API**
The full stops list (updated daily) is available at:
```
https://ckan.multimediagdansk.pl/dataset/c24aa637-3619-4dc2-a171-a23eec8f2172/resource/4c4025f0-01bf-41f7-a39f-d156d201b82b/download/stops.json
```
Each stop object includes `stopId`, `stopDesc` (name), and coordinates.

**Option C – przyjazdy.pl**
Browse to [przyjazdy.pl](https://przyjazdy.pl) and look at the URL when you select a stop — the number at the end is the stopId.

---

## Configuration

### Minimal (YAML)

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
filter_routes:
  - "110"
  - "148"
  - "N8"
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `stop_id` | string | **required** | TRISTAR stop ID (stopId) |
| `title` | string | stop name from API | Custom card title |
| `max_departures` | number | `10` | Max number of departures shown (3–20) |
| `refresh_interval` | number | `30` | Auto-refresh interval in seconds (min 15) |
| `show_delays` | boolean | `true` | Show delay badges when TRISTAR reports a delay |
| `filter_routes` | list | _(all lines)_ | List of route IDs to show; leave empty for all |

---

## Data source & licence

Departure data comes from the **TRISTAR** system operated by ZTM Gdańsk, published as open data on [Otwarty Gdańsk](https://ckan.multimediagdansk.pl/dataset/tristar) under the **Creative Commons Attribution (CC-BY)** licence.

- Departures endpoint: `https://ckan2.multimediagdansk.pl/departures?stopId={id}`
- Stops list: `https://ckan.multimediagdansk.pl/dataset/tristar` → *Lista przystanków*

The API does **not** require authentication. Data is updated in real-time from GPS tracking devices installed on all ZTM vehicles.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| "Błąd pobierania danych" | Wrong stop_id or network issue | Double-check the stop_id; verify your HA instance can reach `ckan2.multimediagdansk.pl` |
| "Brak nadchodzących odjazdów" | No departures in next ~60 min | Normal late at night or for infrequent lines; try removing `filter_routes` |
| Card not appearing | Resource not registered | Check Settings → Dashboards → Resources for the JS file |

---

## Licence

MIT — do whatever you want, attribution appreciated.
