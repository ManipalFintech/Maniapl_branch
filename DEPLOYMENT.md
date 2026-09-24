# Branch Attendance — Simple Deploy (Supabase + Netlify only)

> Upgrading an existing deployment? Follow **UPGRADE_NOTES.md** instead.

One web app. No Node server to host, no Render, no npm commands to run
day-to-day once it's deployed. Everything free-tier.

```
attendance-web/
  supabase/            SQL files to run once in the Supabase dashboard,
                        plus one small Edge Function
  src/                 The React web app (Login, Employee, Admin, Manager
                        all in one)
```

---

## STEP 1 — Create the Supabase project

1. Go to supabase.com → sign up/log in → **New Project**.
2. Name it (e.g. `branch-attendance`), set a database password (save it —
   you won't need it anywhere in this simplified setup, but keep it safe),
   pick a region, Free plan.
3. Wait ~2 minutes for it to finish provisioning.

## STEP 2 — Run the database setup

1. In your Supabase project, open **SQL Editor** (left sidebar) → **New query**.
2. Open `supabase/01_schema.sql` from this project, copy all of it, paste
   into the query box, click **Run**.
3. New query again → paste all of `supabase/02_functions.sql` → **Run**.
4. Go to **Storage** (left sidebar) → **New bucket**:
   - Name: `attendance-photos` (exact spelling matters)
   - Public bucket: **On**
5. Back in **SQL Editor** → new query → paste all of `supabase/03_storage_policies.sql` → **Run**.
6. New query → paste all of `supabase/04_fixes.sql` → **Run**.
7. New query → paste all of `supabase/05_bugfixes.sql` → **Run**.
8. **Authentication → Rate Limits**: raise "sign ups and sign ins" to ~300 per
   5 minutes and "token refreshes" to ~1000 (a whole branch shares one office
   IP address — see `UPGRADE_NOTES.md`).

## STEP 3 — Deploy the one Edge Function

This is the only piece that needs a command line, and you only do it once
(and again only if you ever change that one file).

1. Install the Supabase CLI (one-time, on your computer):
   ```
   npm install -g supabase
   ```
2. Log in:
   ```
   supabase login
   ```
3. From inside the `attendance-web` folder, link it to your project (find
   your project ref in the Supabase dashboard URL:
   `supabase.com/dashboard/project/<project-ref>`):
   ```
   supabase link --project-ref <your-project-ref>
   ```
4. Set the secrets the function needs (get the **service_role** key from
   Supabase → **Settings → API** — the one marked "secret", not "anon"):
   ```
   supabase secrets set SUPABASE_URL=https://<your-project-ref>.supabase.co
   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<your service_role secret key>
   supabase secrets set DEFAULT_PASSWORD=Welcome@123
   ```
5. Deploy the function:
   ```
   supabase functions deploy admin-employees
   ```
   That's it — this function now lives on Supabase's infrastructure. You
   never have to keep a server running or worry about it sleeping.

## STEP 4 — Deploy the web app to Netlify

1. Push this whole `attendance-web` folder to a GitHub repo.
2. Go to netlify.com → sign up/log in with GitHub.
3. **Add new site** → **Import an existing project** → pick your repo.
4. Build settings (Netlify usually auto-detects these from `netlify.toml`,
   double-check):
   - Build command: `npm run build`
   - Publish directory: `dist`
5. Add environment variables (**Site configuration → Environment variables**):
   - `VITE_SUPABASE_URL` = your Supabase project URL (Settings → API → Project URL)
   - `VITE_SUPABASE_ANON_KEY` = the **anon / public** key (same page — NOT the
     service_role one; this one is safe to expose in a browser)
6. Click **Deploy**. You get a URL like `https://your-site.netlify.app`.

**Don't have GitHub set up / want the fastest possible option?**
Run `npm install` then `npm run build` on your computer, then go to
app.netlify.com → drag the resulting `dist` folder onto the page. You'll
still need to set the two environment variables in Site settings and
redeploy once after that.

## STEP 5 — Create your first Admin

1. Open your deployed site.
2. On the login screen, click **"First time setting this up? Create the
   first Admin"**.
3. Enter an Emp ID (e.g. `ADMIN001`) and a name, click **Create first Admin**.
4. This only works once — the moment any Admin account exists, that link
   stops working (it's meant purely as a bootstrap step).
5. Log in with that Emp ID and the printed default password. You'll be
   asked to set a real password immediately.

## STEP 6 — Onboard employees and managers

From the Admin dashboard:
1. Create your Manager(s) first (role = Manager).
2. Create Employees, picking their manager from the dropdown — or use the
   CSV bulk upload (columns: `emp_id,name,role,reporting_manager_id,branch`;
   note `reporting_manager_id` needs the manager's internal Profile ID shown
   in the Employees table, not their Emp ID).
3. Every new account gets the same default password and is forced to set a
   real one on first login.
4. Share the site link with employees — they open it in their phone's
   browser (Chrome or Safari both work), log in, and allow camera +
   location access when prompted.

---

## Go-live checklist

- [ ] Supabase schema + functions + storage bucket + policies all run
- [ ] Edge Function deployed, secrets set
- [ ] Site deployed on Netlify, env vars set
- [ ] First Admin created and logged in
- [ ] Manager(s) created
- [ ] 2–3 pilot employees created, tested full flow on their own phones:
      Login (selfie + location) → Logout → mistaken-logout
      Regularization request → Admin forwards → Manager approves/rejects
- [ ] Calendar view shows correct hours-per-day
- [ ] CSV export works
- [ ] Roll out the link to the rest of the branch

## Notes

- **Browser support:** camera + location work on modern Chrome/Safari/Edge
  on both Android and iPhone — this is actually an upgrade over the old
  Android-only APK, since iOS employees can use it too now, no app store
  needed at all.
- **If you ever need to change the Edge Function:** edit
  `supabase/functions/admin-employees/index.ts`, then re-run
  `supabase functions deploy admin-employees`.
