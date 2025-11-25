//pms-frontend/src/api/client.ts
import axios from "axios";

// no import.meta usage:
const baseURL =
  (window as any).__API_BASE_URL__ ||
  "http://localhost:3000"; // fallback

export const api = axios.create({
  baseURL,
  withCredentials: false,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const skip =
    (config.headers && (config.headers as any)["X-Skip-Auth"] === "1") ||
    (config as any).skipAuth === true;

  if (!skip) {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers = config.headers || {};
      (config.headers as any).Authorization = `Bearer ${token}`;
    }
  } else if (config.headers) {
    delete (config.headers as any).Authorization;
  }
  return config;
});

// Only redirect to /login on 401; let other errors reach the caller
api.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error?.response?.status;

    // Network error / no response: surface to caller (do NOT redirect)
    if (!error?.response) {
      return Promise.reject(error);
    }

    // Respect per-request opt-out to avoid hard redirect on 401
    const cfg = (error as any)?.config || {};
    const headers = (cfg.headers || {}) as Record<string, string>;
    const noRedirect =
      cfg.skipAuthRedirect === true ||
      headers["X-No-Redirect"] === "1" ||
      headers["x-no-redirect"] === "1";

    // ⬇️ THIS LINE IS THE IMPORTANT CHANGE
    if (status === 401 && !noRedirect) {
      try { localStorage.removeItem("token"); } catch {}
      window.location.assign("/login");
      return new Promise(() => {}); // stop further handling
    }

    // Let caller handle 401 with noRedirect, and all 403/404/500
    return Promise.reject(error);
  }
);
