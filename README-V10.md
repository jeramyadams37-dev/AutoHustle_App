# AutoHustle v10 — canonical merge (Nov 8, 2026)

One app, one app ID, one signing key, one backend. Everything else is archived.

## What this is

- **Base:** `autohustle_full.zip` (Oct 4, 2026) — the complete Capacitor React
  source: App.jsx, Home / NewTicket / TicketDetail / Garage / Codes,
  Login / Register / Forgot / Reset / OAuthConsent, components/ui, Stripe.
- **App ID:** `com.atothei.autohustle` (was `com.autohustle.aimechanic`).
  This is the ID on v7, v8 and the Bluetooth MVP, and v9's web bundle is
  byte-identical to v7/v8's, so no code was lost by going back to it.
- **App name:** Auto-Hustle AI Mechanic.

## What was merged in

### 1. Bluetooth / Live Scan (from the Bluetooth MVP debug APK)
- Native plugin `Obd2` (`com.atothei.autohustle.obd2.Obd2Plugin`) — classic
  Bluetooth SPP to an ELM327 adapter (UUID
  00001101-0000-1000-8000-00805F9B34FB), NOT BLE. Web Bluetooth cannot do
  this; the native plugin is required for live data.
- **The plugin is now written and registered** (Nov 8, 2026): clean-room
  `Obd2Plugin.java` (no decompiled code), as a local Capacitor plugin
  package at `plugins/obd2/` (`@autohustle/obd2`, wired in via a
  `file:./plugins/obd2` dependency in `package.json`). It exposes exactly
  the three methods the JS calls: `connect()`, `readCodes()` (OBD mode 03,
  returns `{ codes: string[] }`), `readLiveData()` (PIDs 0100 supported,
  0105 coolant temp, 010C RPM, plus 0104 load, 010D speed, 0142 battery
  voltage). ELM327 init: ATZ, ATE0, ATL0, ATS0, ATH0, ATSP0. The adapter
  is picked from paired devices by name (OBD / ELM / VLink / Vgate) or,
  if there is exactly one paired device, that one. Android 12+
  BLUETOOTH_CONNECT / BLUETOOTH_SCAN are requested at runtime; the
  permissions also live in the plugin's own AndroidManifest.xml (the
  durable copy — `android/` is gitignored and regenerated).
- Why a local plugin package and not a file under `android/app/src/main/`:
  Capacitor 8 only loads plugins listed in `capacitor.plugins.json`,
  which `npx cap sync` regenerates from node_modules dependencies — a
  lone .java file in the app module is never registered. As a package,
  `npx cap sync android` finds it ("Found 1 Capacitor plugin for
  android: @autohustle/obd2@1.0.0") and writes the classpath
  `com.atothei.autohustle.obd2.Obd2Plugin` into `capacitor.plugins.json`.
- JS wrapper: `src/lib/obd2.js` — `connectObd2()`, `readObd2Codes()`,
  `readObd2LiveData()`, plus a clearly-labelled demo fallback for trying
  the screens without an adapter. The JS interface did not change.
- New page `src/pages/Scan.jsx` (`/scan`, also in the bottom nav): the MVP
  flow exactly — connect → read codes → if none, "No trouble codes found.
  Vehicle looks clean." → read live data → POST to the backend `/diagnose`
  → urgency / plain-language summary / likely causes / cost / next step,
  with a "Start a shop ticket" button.

### 2. Server-side Gemini (from the AI Studio server version)
- The old `src/lib/gemini.js` prompted the user for a Gemini API key and
  stored it in localStorage, then called Google directly from the app.
  That is gone. `src/lib/gemini.js` now POSTs to the backend and keeps
  the same `invokeFunction(name, payload)` interface, so NewTicket,
  Codes, TicketDetail and ChatPanel did not change.
- `server.ts` (root): Express backend with both endpoints —
  `POST /api/diagnose` `{prompt, json}` → `{text}` (ticket generation,
  code lookup, re-rank, chat) and `POST /diagnose`
  `{codes, liveData, vehicle}` → `{urgency, plain_language_summary,
  likely_causes, estimated_cost_range_usd, recommended_next_step}`
  (Live Scan contract from the MVP backend). Model:
  gemini-3-flash-preview. Key comes only from `GEMINI_API_KEY` env var.
- Client picks the backend URL from `localStorage.backend_url`, or
  `http://localhost:3000` when served from localhost, or the Cloud Run
  URL `auto-hustle-backend-926589006847.us-central1.run.app` otherwise.
- Run it: `cp .env.example .env` (add your key), then `npm run server`.

### 3. Driver Uptime — Pre-Shift Check
- New page `src/pages/PreShift.jsx` (`/pre-shift`, linked from Home):
  pick a vehicle, enter expected earnings today (default $180), answer
  three manual checks (warning light / temp gauge / slow crank), then run.
  With the adapter connected it also reads live codes, coolant temp and
  battery voltage. Checks: misfire codes P0300–P0308 (fail), coolant
  >105°C (fail) / 95–105°C (warn), battery <12.4V (warn), a ticket in
  the last 7 days (warn). Verdict: GO / CAUTION / DO NOT DRIVE FOR WORK,
  with dollars at risk (fail = full day's earnings, caution = half).

## What was scrubbed
- The GitHub Actions workflow used to generate a fresh keystore and sign
  with a hardcoded password. It now signs only when Jeramy supplies the
  real keystore as Actions secrets — a fresh key would break Play Store
  updates. No passwords are stored anywhere in this tree.

## What is NOT in this tree (on purpose)
- No keystore / .jks files, no API keys, no passwords, no .env.
- `android/` is gitignored and regenerated by `npx cap add android` +
  `npx cap sync android` (in GitHub Actions and locally). The Obd2
  plugin source does NOT live there — it lives in `plugins/obd2/`, which
  is committed, so sync re-registers it on every fresh checkout.
- The old lineages are NOT merged in: Base44 plain-JS version and the
  AI Studio / Repair Sol2 web version are archived separately.

## Build
- `npm install` then `npm run build` (web bundle → `dist/`). Verified
  Nov 8, 2026: vite build exit 0 in ~6s; 0 direct Gemini URLs and
  0 `gemini_key` references in `dist/`.
- APK: GitHub Actions workflow `.github/workflows/build-apk.yml`
  (debug build; release signing needs the Actions secrets above).
  It runs `npx cap add android`, `npx cap copy android`,
  `npx cap update android`, so the Obd2 plugin is registered in CI too.
- **Java compile status: NOT verified.** There is no JDK / javac on
  this machine, so `Obd2Plugin.java` could not be compiled here. It was
  syntax-checked by hand (balanced braces/parens/brackets) and every
  Capacitor API it uses (`requestPermissionForAlias`, `getContext`,
  `PluginCall.resolve/reject`, `JSObject.put`, `JSArray(Collection)`,
  `@CapacitorPlugin`, `@Permission`, `@PermissionCallback`) was verified
  against the installed Capacitor 8.6.0 sources in
  `node_modules/@capacitor/android/`. The first real compile happens in
  GitHub Actions (`./gradlew assembleDebug`) — if that fails, the error
  will name the exact line.

## Still needs Jeramy
1. Which keystore signed v7/v8 and the Bluetooth build (the live key).
   The other key file must be stored offline, never sent in chat again.
2. Rotate the Firebase API key that was inside the AI Studio zip.
3. Set `GEMINI_API_KEY` on the backend (Cloud Run env var / secret).
4. ELM327 test on the LeSabre — the exact next step: push this tree to
   GitHub (or run the workflow), let Actions build the APK
   (`./gradlew assembleDebug` — this is also the first real compile of
   `Obd2Plugin.java`), install the APK, pair the ELM327 adapter in
   Android Bluetooth settings, then in the app run Live Scan and a
   Pre-Shift Check and confirm codes + live data come through. If the
   Gradle build fails, it will name the exact Java line to fix.
5. Decide the Play Store track (internal first) before any public release.
