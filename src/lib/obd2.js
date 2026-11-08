// v10: Bluetooth / OBD2, ported from the Bluetooth MVP debug build.
// The MVP used a native Capacitor plugin named "Obd2"
// (com.atothei.autohustle.obd2.Obd2Plugin, Obd2Plugin.java) that opens a
// classic Bluetooth Serial Port Profile (SPP) connection to an ELM327
// adapter — UUID 00001101-0000-1000-8000-00805F9B34FB — and exposes three
// methods: connect(), readCodes() and readLiveData(). This is NOT Web
// Bluetooth: Web Bluetooth is BLE only and cannot talk to a classic
// SPP ELM327 clone, so the native plugin is required for live data.
// To ship it: add the Obd2Plugin Java source under android/app/src/main/
// and register it in the Capacitor config (see README-V10.md). Until then,
// the functions below report the plugin as unavailable instead of failing
// silently, and a clearly-marked demo fallback lets the Live Scan screen
// be tried in a browser.
import { Capacitor } from '@capacitor/core';

// Lazily registered so a web build without the plugin still loads.
let plugin = null;
function getPlugin() {
  if (plugin) return plugin;
  try {
    plugin = Capacitor.registerPlugin('Obd2');
  } catch {
    plugin = null;
  }
  return plugin;
}

export function isObd2Available() {
  // Capacitor.isNativePlatform() is true inside the Android app; the plugin
  // itself is only present once Obd2Plugin.java is bundled (see README).
  return Capacitor.isNativePlatform() && !!getPlugin();
}

export async function connectObd2() {
  const p = getPlugin();
  if (!p || typeof p.connect !== 'function') {
    throw new Error('OBD2 plugin not available in this build. Install the app with Obd2Plugin.java bundled and pair an ELM327 adapter.');
  }
  return p.connect();
}

// Returns { codes: string[] } — mode 03 trouble codes from the adapter.
export async function readObd2Codes() {
  const p = getPlugin();
  if (!p || typeof p.readCodes !== 'function') {
    throw new Error('OBD2 plugin not available in this build.');
  }
  return p.readCodes();
}

// Returns live data keyed by PID, e.g. { rpm, coolantTempC, ... }.
// The MVP read PID 0100 (supported PIDs), 0105 (coolant temp) and
// 010C (engine RPM); extra PIDs are passed through unchanged.
export async function readObd2LiveData() {
  const p = getPlugin();
  if (!p || typeof p.readLiveData !== 'function') {
    throw new Error('OBD2 plugin not available in this build.');
  }
  return p.readLiveData();
}

// Demo readings for trying the Live Scan / Pre-Shift screens in a browser
// or on a build without the plugin. Clearly labelled DEMO wherever shown.
export function demoLiveData() {
  return {
    demo: true,
    rpm: 780,
    coolantTempC: 92,
    batteryVoltage: 13.8,
    speedKmh: 0,
    engineLoadPct: 18,
  };
}

export function demoCodes() {
  return { codes: ['P0300'], demo: true };
}
