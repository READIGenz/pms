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
