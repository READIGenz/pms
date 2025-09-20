import axios from 'axios';

export const api = axios.create({
  baseURL: '',
  withCredentials: false,
  headers: { 'Content-Type': 'application/json' }
});

// Request interceptor: attach Authorization unless explicitly skipped
api.interceptors.request.use((config) => {
  // allow callers to force-skip auth header
  const skip =
    (config.headers && (config.headers as any)['X-Skip-Auth'] === '1') ||
    (config as any).skipAuth === true;

  if (!skip) {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers = config.headers || {};
      (config.headers as any).Authorization = `Bearer ${token}`;
    }
  } else if (config.headers) {
    // ensure no lingering auth header when we want to skip
    delete (config.headers as any).Authorization;
  }

  return config;
});