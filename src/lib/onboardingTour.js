// Onboarding tour — first-run guided tour of AutoHustle. Free for every
// user; onboarding is not a paid tier.
// Pure logic, no React imports, so it can be unit-tested with plain node.
// State lives on-device in localStorage only — nothing is sent anywhere.
// Completion is one flag: 'ah_onboarding_tour_v1' = 'done'.

export const TOUR_STORAGE_KEY = 'ah_onboarding_tour_v1';

// Window event that re-opens the tour (fired by the "Take the tour again"
// button in Settings → API Keys). The tour component listens for it.
export const TOUR_START_EVENT = 'ah:start-tour';

// One stop per screen, in the order the bottom tabs run, plus a
// Pre-Shift stop (the daily free check) and a final Settings stop
// (where the free Gemini key lives and where the tour can be replayed).
// Routes are the real routes from src/App.jsx at HEAD 4095d12: / (Home),
// /new, /scan, /pre-shift, /garage, /fleet, /codes, /subscribe,
// /api-keys (the Settings page — there is no separate Settings page).
// Copy is plain-English, driver-first, and short on purpose.
export const TOUR_STEPS = [
  {
    id: 'home',
    route: '/',
    title: 'Welcome to AutoHustle',
    body: 'Your AI mechanic. Describe what\u2019s wrong with your car and get a shop ticket you can hand to a mechanic. This quick tour shows you around \u2014 about a minute.',
  },
  {
    id: 'new',
    route: '/new',
    title: 'Start a diagnosis',
    body: 'Tap New, pick your vehicle, and type what\u2019s wrong in plain words \u2014 noises, smells, warning lights. No code needed. The AI builds your shop ticket.',
  },
  {
    id: 'scan',
    route: '/scan',
    title: 'Scan with an adapter',
    body: 'Plug in an OBD2 Bluetooth adapter, tap Scan Vehicle, and read your codes and live data. No adapter yet? Try the demo scan \u2014 it uses a sample P0300.',
  },
  {
    id: 'pre-shift',
    route: '/pre-shift',
    title: 'Daily pre-shift check',
    body: 'Before a shift, run the free pre-shift check \u2014 warning lights, temp gauge, crank and recent tickets \u2014 and get a Go, Caution or Do not drive verdict. Two minutes, before the car costs you a day.',
  },
  {
    id: 'garage',
    route: '/garage',
    title: 'Your garage',
    body: 'Your vehicles live here. Add each one once and every ticket stays with it. Back up your garage here too \u2014 export a file, or auto-back it up to your own Google Drive.',
  },
  {
    id: 'fleet',
    route: '/fleet',
    title: 'Owner Fleet \u2014 for Pro',
    body: 'Run more than one vehicle for work? Owner Fleet keeps every vehicle, driver, cost and contract on one screen. Owner Fleet tools are Pro \u2014 on Free you\u2019ll see a locked card here instead.',
  },
  {
    id: 'codes',
    route: '/codes',
    title: 'Look up any code',
    body: 'Got a code like P0562 from another scanner? Type it here for what it means, the common causes, and the first test to run. Free.',
  },
  {
    id: 'subscribe',
    route: '/subscribe',
    title: 'Free, Plus, Pro',
    body: 'Diagnosis is free. Plus ($10/month) adds parts prices, nearby stores and labor on every ticket. Pro ($30/month) adds the fleet tools. Pay with the same email you signed in with.',
  },
  {
    id: 'settings',
    route: '/api-keys',
    title: 'You\u2019re set \u2014 one last thing',
    body: 'Diagnoses use your own free Gemini key \u2014 add it here in Settings. About a minute, and the key stays on your phone. Want this tour again? Come back here and tap \u201cTake the tour again\u201d.',
  },
];

function storage() {
  try {
    if (typeof localStorage !== 'undefined' && localStorage) return localStorage;
  } catch {
    // No storage (private mode, tests without a stub) — treat as fresh.
  }
  return null;
}

// True once the user finished the tour or tapped Skip. First run: false.
export function hasCompletedTour() {
  const store = storage();
  if (!store) return false;
  try {
    return store.getItem(TOUR_STORAGE_KEY) === 'done';
  } catch {
    return false;
  }
}

// True when the tour should pop up on its own (first run, on Home).
export function shouldShowTour() {
  return !hasCompletedTour();
}

export function markTourComplete() {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(TOUR_STORAGE_KEY, 'done');
  } catch {
    // Storage full or blocked — the tour just shows again next launch.
  }
}

// Clears the flag so the tour can run again (Settings replay button).
export function resetTour() {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(TOUR_STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
}

// Index of the step for a route (e.g. '/garage' -> 3), or -1.
export function stepIndexForRoute(route) {
  return TOUR_STEPS.findIndex((step) => step.route === route);
}
