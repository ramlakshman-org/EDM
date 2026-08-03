import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import api from '../api/client.js';

const AuthContext = createContext(null);

// Auto-logout after this much inactivity (no genuine user interaction).
const IDLE_LIMIT_MS = 30 * 60 * 1000; // 30 minutes
// Slide the backend token at most this often, and only on real activity, so
// background polling (e.g. the CRM inbox) can't keep an idle session alive.
const REFRESH_THROTTLE_MS = 5 * 60 * 1000; // 5 minutes
// Ignore repeat activity events fired more often than this (perf).
const ACTIVITY_THROTTLE_MS = 5 * 1000; // 5 seconds
const LAST_ACTIVE_KEY = 'edm_last_active';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('edm_user') || 'null'); } catch { return null; }
  });

  const idleTimer = useRef(null);
  const lastRefresh = useRef(0);
  const lastActivityHandled = useRef(0);

  const login = async (username, password) => {
    const { data } = await api.post('/auth/login', { username, password });
    if (data.success) {
      // The JWT now lives in an HttpOnly cookie set by the server — not in
      // localStorage. We only persist non-sensitive user info for the UI.
      localStorage.setItem('edm_user', JSON.stringify(data.user));
      localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()));
      setUser(data.user);
    }
    return data;
  };

  const logout = useCallback(() => {
    // Revoke the token server-side (best-effort, fire-and-forget) so it can't be
    // reused, then clear local state.
    api.post('/auth/logout').catch(() => {});
    localStorage.removeItem('edm_token');
    localStorage.removeItem('edm_user');
    localStorage.removeItem(LAST_ACTIVE_KEY);
    setUser(null);
  }, []);

  const updateUserData = (extra) => {
    setUser((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, ...extra };
      localStorage.setItem('edm_user', JSON.stringify(updated));
      return updated;
    });
  };

  // ---- Inactivity auto-logout (applies to every logged-in role) ----
  useEffect(() => {
    if (!user) return undefined;

    const forceLogout = () => {
      logout();
      if (!location.pathname.startsWith('/login')) location.href = '/login';
    };

    const armTimer = () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(forceLogout, IDLE_LIMIT_MS);
    };

    // Slide the server-side token so an active user never gets 401'd, but only
    // on genuine activity and no more than once per REFRESH_THROTTLE_MS.
    const slideToken = () => {
      const now = Date.now();
      if (now - lastRefresh.current < REFRESH_THROTTLE_MS) return;
      lastRefresh.current = now;
      // Refresh slides the HttpOnly auth cookie server-side; nothing to store here.
      api.post('/auth/refresh').catch(() => { /* 401 handled by the response interceptor */ });
    };

    const onActivity = () => {
      const now = Date.now();
      if (now - lastActivityHandled.current < ACTIVITY_THROTTLE_MS) return;
      lastActivityHandled.current = now;
      localStorage.setItem(LAST_ACTIVE_KEY, String(now));
      armTimer();
      slideToken();
    };

    // On mount / tab-return, if we've already been idle past the limit, log out.
    const checkIdle = () => {
      const last = Number(localStorage.getItem(LAST_ACTIVE_KEY) || Date.now());
      if (Date.now() - last >= IDLE_LIMIT_MS) forceLogout();
      else armTimer();
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel', 'click'];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));

    const onVisibility = () => { if (document.visibilityState === 'visible') checkIdle(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', checkIdle);

    // Cross-tab: if the user is cleared in another tab (logout), drop this tab too.
    const onStorage = (ev) => {
      if (ev.key === 'edm_user' && !ev.newValue) setUser(null);
    };
    window.addEventListener('storage', onStorage);

    if (!localStorage.getItem(LAST_ACTIVE_KEY)) localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()));
    checkIdle();

    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity));
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', checkIdle);
      window.removeEventListener('storage', onStorage);
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [user, logout]);

  return <AuthContext.Provider value={{ user, login, logout, updateUserData }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
