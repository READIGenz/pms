/**
 * tailwind.config.js
 * ------------------
 * REMARK: We scan index.html and all TS/TSX files.
 */
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html","./src/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
}
