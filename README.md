# Collab Creek

This project now runs with:
- Frontend: `Vite + React` (`/`)
- Backend: `Node.js + Express + MongoDB` (`/server`)

## Local setup

1. Update `.env` using `.env.example`
2. Start MongoDB locally (or provide a cloud `MONGODB_URI`)
3. Install dependencies:
   - `npm install`
   - `npm install --prefix server`
4. Run full stack:
   - `npm run dev:full`

Frontend: `http://localhost:8080`  
Backend API: `http://localhost:4000/api`

## Invite emails (optional but recommended)

To send real invite emails, set SMTP values in `.env`:
- `APP_BASE_URL` (e.g. `http://localhost:8080`)
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

If SMTP is missing, invite still gets saved and will auto-apply on signup with the same email, but no email is delivered.

## Supabase data migration

To migrate existing Supabase data into MongoDB, set:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Then run:

`npm run migrate:from-supabase`
