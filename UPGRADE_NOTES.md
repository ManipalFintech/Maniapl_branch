# Bug-fix release — how to upgrade an existing deployment

Do these three steps in order. Nothing is deleted; existing attendance data is kept.

## 1. Run the database fix (2 minutes)

Supabase Dashboard → **SQL Editor** → New query → paste all of
`supabase/05_bugfixes.sql` → **Run**. It is safe to run more than once.

(If you never ran `supabase/04_fixes.sql`, run that first.)

## 2. Raise the sign-in rate limit (1 minute) — important

Supabase Dashboard → **Authentication → Rate Limits**.

Supabase limits sign-ins **per network (IP address)**. Everyone in a branch on
the same office Wi-Fi shares one IP, so when the whole branch signs in at
9:30 the limit trips and further staff are refused. Raise
**"Rate limit for sign ups and sign ins"** to something like **300** per 5
minutes, and **"Rate limit for token refreshes"** to around **1000**. Save.

The app now also tells staff clearly when this happens, instead of wrongly
saying their password is invalid.

## 3. Redeploy

- **Edge Function:** from the project folder run
  `supabase functions deploy admin-employees`
  (the code now lives in `supabase/functions/admin-employees/`, the folder the
  CLI expects, so no copying is needed).
- **Web app:** push to GitHub (Netlify rebuilds automatically), or run
  `npm install && npm run build` and drag the `dist` folder onto Netlify.

After this deploy, ask staff to refresh the page once (or close and reopen the
tab). This one refresh is needed because the old version has no way to know
it is outdated. From now on, whenever you deploy again, any open tab shows a
"A new version is available — Reload now" bar by itself.

No one needs to reset their password.

## What was fixed

| Problem reported | Root cause | Fix |
|---|---|---|
| Manager's "Mark Login" button disappears | The app read the attendance table directly. For a manager, the database also returns their SBOs' rows, and the app took the first row — often an SBO's login — as the manager's own. | Today's status now comes from a new `my_today()` server function that only ever returns the signed-in person's own row. |
| SBO attendance shows on the manager's own calendar | Same cause — the calendar received the SBOs' rows and drew them on the same dates. | Calendar uses `my_attendance()` (own rows only), plus a per-person safety filter in the calendar itself. |
| App shows attendance "captured" but it's not in the export | (a) For managers, the status box was showing an SBO's login time, so the manager believed they were logged in. (b) Admin export used data loaded once when the page opened, so later logins were missing. (c) Every request is silently capped at 1,000 rows by Supabase, so exports dropped records as data grew. (d) Dates were calculated in UTC, so anything between 00:00–05:30 IST landed on the previous day. | Success is shown only after the saved record is read back from the server. Exports are fetched fresh at click time, page by page with no cap. All dates use India time. CSV times are in IST and cells are properly quoted. |
| Staff suddenly locked out after signing in earlier | (a) A known supabase-js deadlock: the app awaited a database call inside the auth listener, which freezes every request when the session token auto-refreshes (hourly, or when a phone wakes the tab). (b) Signing out on one device signed the person out on **all** devices. (c) Any error loading the profile left a blank white screen. (d) The per-IP sign-in rate limit was reported as "Invalid Employee ID or password". | Auth listener rewritten per Supabase's guidance; sign-out is now this-device-only; profile load retries automatically and shows a clear retry screen on failure; sign-in errors are reported accurately; plus step 2 above. |

### Other fixes found during the review

- Double-tapping Submit, or retrying after a network drop, can no longer overwrite the original login photo/time (the database update is now atomic).
- A tab left open overnight re-checks the server when reopened, so it never shows yesterday's status as today's.
- Selfies are resized before upload (~100 KB instead of 1–3 MB), so uploads finish on weak mobile data.
- Location falls back to a network fix when GPS times out indoors, instead of failing.
- All network calls time out after 45 seconds with a clear message instead of hanging on "Submitting…".
- Managers see only requests assigned to them (not their own requests waiting on their manager).
- Manager team list and team export exclude the manager's own records.
- The employee search box can no longer show one name while displaying another person's calendar.
- Roles are case-insensitive and normalised automatically (a role typed as "Manager " no longer produces an empty screen).
- An admin can no longer deactivate or delete their own account by accident.
- Bulk upload matches Emp IDs case-insensitively and handles quoted CSV cells.
- Managers now land on "My Attendance" first, so marking their own attendance is one tap.

### Found and fixed in the second review (tested in a real browser)

- **Capture button off-screen on laptops.** On a normal 1366×768 laptop the camera video pushed the "Capture Photo" button 120px below the bottom of the screen, so managers on laptops could not mark attendance. The camera screen now always fits.
- **Regularization approval did nothing.** Approving a mistaken-logout request left the wrong logout in place and the employee could never log out again. Approval now reopens the day (same day) so they can mark their real logout; for past days the day is marked "regularized".
- **CSV bulk re-upload demoted managers.** Re-uploading a CSV with blank role or manager cells turned managers into employees and removed reporting managers, which emptied managers' teams. Blank cells now leave existing values unchanged, invalid roles are rejected, and the manager column accepts the manager's Emp ID.
- A slow background status check could overwrite a just-saved login and flip the screen back to "Not logged in". Fixed.
- Export paging is now safe even if the project's row limit is below 1,000, and while new logins arrive during an export.
- Tabs left open across a deploy are told to reload (see step 3).
- The Edge Function folder is now where the Supabase CLI expects it.
- Small hardening: a failed profile load can no longer leave an endless "Loading…" screen; phone layout of the manager console; validation on regularization requests; clearer password-change errors.

### How this release was tested

- The database files were run on PostgreSQL 16 (twice, to confirm they are safe to re-run).
- The built app was driven in Chromium with a fake camera and GPS against the real SQL functions and row-level security: 33 end-to-end checks covering every reported bug, plus export with a 700-row limit and the camera screen at four screen sizes. All passed with no JavaScript errors.
- The same tests run against the previous version reproduce the reported bugs (manager shown as logged in with 0 database rows, SBO days on the manager's calendar, export stopping at 1,000 of 2,761 rows).
- Edge Function bulk-upload rules were unit-tested with a stubbed Supabase client.
