// AH-H9 — Back with a Home fallback.
// Seven inner screens used bare navigate(-1): opened from a push tap or a
// deep link (no in-app history) Back exited the app instead of going
// Home. react-router keeps an entry index in window.history.state.idx;
// idx 0 means this is the first in-app entry, so go Home instead.
// Falls back to window.history.length when idx is unavailable.
export function goBackOrHome(navigate) {
  const state = window.history.state;
  const idx = state && typeof state.idx === 'number' ? state.idx : null;
  if (idx !== null) {
    if (idx > 0) navigate(-1);
    else navigate('/', { replace: true });
    return;
  }
  if (window.history.length > 1) navigate(-1);
  else navigate('/', { replace: true });
}
