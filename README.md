# Manipal Fintech — Branch Attendance (Simplified: Supabase + Netlify)

One web app, no server to manage. Employees, Managers, and Admin all use the
same site — it shows the right screen based on who's logged in.

- **Employees**: open the site on their phone's browser → Login/Logout with
  a selfie + location → view their own attendance calendar with hours
  spent → raise a mistaken-logout request.
- **Admin**: add employees (single or CSV bulk), forward regularization
  requests to managers, reset passwords, activate/deactivate accounts, view
  everyone's attendance calendar + CSV export.
- **Manager**: mark their own attendance ("My Attendance" tab), approve/reject
  regularization requests (capped at 3/month per employee — beyond that,
  email Admin directly), view their direct reports' attendance calendar +
  CSV export.

See **DEPLOYMENT.md** for the full setup walkthrough (takes about 20 minutes
end to end: create Supabase project → run 5 SQL files → deploy 1 small
Edge Function → deploy to Netlify → create first Admin).

## What replaced what (if you're comparing to the earlier 3-piece version)

| Before | Now |
|---|---|
| Node/Express backend on Render | Postgres functions inside Supabase (see `supabase/02_functions.sql`) |
| Separate React admin dashboard | Same web app, shown when an Admin/Manager logs in |
| Separate Expo mobile app (Android-only APK) | Same web app, shown when an Employee logs in — works on Android *and* iPhone browsers |
| Custom JWT auth | Supabase Auth (Emp ID is mapped to a hidden internal email behind the scenes) |
| Multer + local disk / Supabase Storage via backend | Browser uploads straight to Supabase Storage |

## Local development

```
npm install
cp .env.example .env.local   # fill in your Supabase URL + anon key
npm run dev
```

Opens on http://localhost:5173. Camera/location need either `localhost` or
HTTPS to work in the browser — both are fine for this.
