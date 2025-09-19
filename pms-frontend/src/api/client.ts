import axios from 'axios';

export const api = axios.create({
  baseURL: '',
  withCredentials: false,
  headers: { 'Content-Type': 'application/json' }
});

// Optionally attach token automatically
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
