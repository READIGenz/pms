Run the frontend (Vite + React)

Terminal → go to frontend

cd pms/pms-frontend

Create .env

# Windows PowerShell
Set-Content .env "VITE_API=http://localhost:3000/api"

Install & start

npm install
npm run dev


Vite will print a URL (default http://localhost:5173). Open it in your browser.

Log in (seeded users)

Use any of the seeded emails (example): pmc@demo.local

OTP (dev): 000000

If you see “User does not exist”, run backend seed:

cd pms/pms-backend
npm run db:seed


…then try login again.

What you should see

Login → enter email → Send OTP → enter 000000 → Landing.

Click My Projects → KPI tiles + City Hospital Annex card.

Click the project → Project Details with modules shown based on your global user role.

(This matches the updated schema: userId/projectId, global role, and M:N user ↔ project.)

Quick sanity checks

CORS: If the frontend can’t reach the API, ensure backend .env has:

CORS_ORIGIN=http://localhost:5173


Restart backend after changing it.

Wrong API URL: If requests 404, confirm .env in frontend has the trailing /api.

Ports already in use:

Frontend: change server.port in pms-frontend/vite.config.ts (e.g., 5174) and update CORS_ORIGIN accordingly.

Backend: change PORT in pms-backend/.env and update VITE_API.

Token: After login, open DevTools → Application → Local Storage; you should see token and user.