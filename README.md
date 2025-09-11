# PMS Monorepo — End-to-end Demo (2025)

This repository contains a **fully commented, runnable** demo for:
- **Backend**: NestJS + Prisma + PostgreSQL (no Docker required)
- **Frontend**: React (Vite + TS + Tailwind)
- **Auth**: OTP (dev static code `000000`) → JWT
- **Flow**: Login → Landing (My Projects / Notifications / Payments) → My Projects (KPIs + cards) → Project Details (modules per role)

> All files include **inline comments** explaining *what* and *why*.

---

## Quick Start

### 1) PostgreSQL 16
Create DB & user (via pgAdmin or `psql`). Example:
```sql
CREATE USER pms WITH PASSWORD 'pms';
CREATE DATABASE pms OWNER pms;
GRANT ALL PRIVILEGES ON DATABASE pms TO pms;
```

### 2) Backend
```bash
cd pms/pms-backend
cp .env.example .env  # adjust DATABASE_URL if needed
npm install
npx prisma db push
npm run db:seed
npm run start:dev     # http://localhost:3000/api/healthz
```

### 3) Frontend
```bash
cd ../pms-frontend
cp .env.example .env  # VITE_API=http://localhost:3000/api
npm install
npm run dev           # http://localhost:5173
```

### 4) Login (Dev)
- **OTP** is always `000000` in dev.
- **No auto-create**: the user must exist in DB (seeded users below).  
  If not found → **"User does not exist"**.

Seeded users with project access (email):
- `pmc@demo.local`, `contractor@demo.local`, `architect@demo.local`, `designer@demo.local`,
  `customer@demo.local`, `legal@demo.local`, `pmt@demo.local`, `inspector.pmc@demo.local`, `hod.pmc@demo.local`

Seeded project:
- **City Hospital Annex** (`CH-ANN`, Chennai)

---

## Repo Layout

- `pms-backend/`: NestJS app, Prisma schema, seed, and REST endpoints.
- `pms-frontend/`: Vite React app with routes & pages for the demo flow.
- Everything is commented. Search for `// NOTE:` and `// REMARK:` markers for rationale.

Have fun building!
