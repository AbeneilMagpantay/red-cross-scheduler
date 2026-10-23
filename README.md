# ARC — ACRCY Operations

ARC is the operations workspace of the Ateneo de Naga College Red Cross Youth (ACRCY). Members use it for duty scheduling and attendance, council announcements, shared resources, and committee deliverables. It installs to a phone's home screen and sends push notifications even when the app is closed.

Live site: <https://red-cross-scheduler.vercel.app>

## Contents

- [Features](#features)
- [Roles and permissions](#roles-and-permissions)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Local development](#local-development)
- [Setting up a Supabase project](#setting-up-a-supabase-project)
- [Push notifications and reminders](#push-notifications-and-reminders)
- [Deployment](#deployment)
- [Security](#security)
- [Screenshots](#screenshots)

## Features

**Home and Alerts**
- A landing page links to the four main areas: Alerts, NEXUS, CORE, and Tracker.
- **Alerts** is the council feed. Announcements are categorized (Urgent, Operational Dispatch, Deployment, Training, General) and support rich text. Up to three can be pinned, and unread badges show what's new. Updates arrive in real time and as push notifications.

**NEXUS and CORE**
- **NEXUS** is a shared board of QR codes, links, and resources. It has search, a compact view, reordering, and image export.
- **CORE** tracks committee deliverables: status, deadlines, and remarks for each committee. Edits save automatically and appear for everyone in real time. The board can be exported as an image.

**Tracker (volunteer operations)**
- **Overview** shows today's duty roster with each person's live status, plus totals for personnel, swaps, and attendance.
- **Schedule** is a month and week calendar of duties. A step-by-step wizard creates duties with details, contacts, teams, assignments, and up to five reminders. Volunteers register themselves and manage their own times and notes.
- **Attendance** handles check-in and check-out on the duty day. Check-ins more than 15 minutes after the scheduled start are marked **Late**. Admins can set any status: Present, Late, Absent, or Excused.
- **Duty Records** groups attendance by event and shows each member's attendance rate and logged hours.
- **Shift Swaps** lets volunteers request to swap an upcoming duty with someone else. Admins approve or reject the request, and approval swaps the assignments.
- **Personnel** (admins only) manages members, roles, batches, and licenses. Archiving keeps a member's history. New account requests are approved here.

**Everywhere**
- Light and dark themes, a collapsible sidebar, and a bottom navigation bar on phones.
- An in-app walkthrough, a "Page info" guide on every page, and an optional tap sound.
- In-app confirm dialogs and toast messages, keyboard-friendly dialogs, and a layout that works from 360px phones to large monitors.

## Roles and permissions

| Ability | Volunteer | Officer | Admin |
|---|:-:|:-:|:-:|
| Read Alerts, NEXUS, CORE | ✓ | ✓ | ✓ |
| Register for duties, edit own time and notes, check self in and out | ✓ | ✓ | ✓ |
| Request shift swaps | ✓ | ✓ | |
| Publish alerts; edit NEXUS and CORE | | ✓ | ✓ |
| Create and edit duties, teams, and assignments | | ✓ | ✓ |
| Personnel, account approvals, attendance status, swap approvals, deleting events | | | ✓ |

Members request an account from the sign-in page. Approving the request creates a Volunteer profile, or restores an archived profile with the same email so that person's duty history stays attached. Admins can then promote approved members to Officer. Google sign-in only works for an email that matches a Personnel record.

These rules are enforced in the database by row-level security (RLS) and triggers, not only in the interface.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | [React 19](https://react.dev/) single-page app built with [Vite](https://vite.dev/), plain JavaScript (`.jsx`), [React Router](https://reactrouter.com/), [date-fns](https://date-fns.org/), [Lucide](https://lucide.dev/) icons, [html2canvas](https://html2canvas.hertzen.com/) for image exports |
| Backend | [Supabase](https://supabase.com/): PostgreSQL with RLS and triggers, Auth (email and Google), Realtime, and Storage for NEXUS QR images |
| Server functions | Two Supabase Edge Functions (TypeScript on Deno) that send Web Push notifications with [web-push](https://github.com/web-push-libs/web-push) |
| Scheduled jobs | `pg_cron` and `pg_net` call the reminder function every 5 minutes |
| Installable app | Web app manifest and a service worker (`public/sw.js`) that receives push notifications |
| Hosting | [Vercel](https://vercel.com/) serves the built static site and deploys on every push to `main` |

There is no Node, PHP, or Python server. Node.js is only used for local development and the build.

## Project structure

```
src/
  pages/            One component per route (Schedule, Attendance, Alerts, ...)
  components/       Shared UI: Sidebar, Modal, FeedbackProvider (dialogs/toasts), ui.jsx, ...
  context/          AuthContext: session, profile, and role flags
  lib/              Data access (supabase.js) and pure helpers with tests (*.test.js)
  index.css         All styles, organized in sections
public/             Service worker, manifest, icons, theme bootstrap
supabase/
  schema.sql        Base tables for a new project
  migrations/       Schema changes, applied in filename order
  functions/        Edge Functions: send-deployment-notifications, send-duty-reminders
scripts/            security-smoke.mjs (anonymous-access check)
```

## Local development

**Prerequisites:** Node.js 20 or newer, and a Supabase project (the free tier is enough).

```sh
git clone https://github.com/AbeneilMagpantay/red-cross-scheduler.git
cd red-cross-scheduler
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
```

`.env.local` needs these values:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=your_publishable_or_anon_key
VITE_VAPID_PUBLIC_KEY=your_vapid_public_key   # required for background push
```

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Build for production into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Run ESLint |
| `npm test` | Run unit tests for `src/lib` (Node's built-in test runner) |
| `npm run security:check` | Confirm anonymous users can't read protected tables |

## Setting up a Supabase project

1. **Create the tables.** In the Supabase SQL Editor, run `supabase/schema.sql`. Then run every file in `supabase/migrations/` in filename order.
   - `20260125_create_admin_user.sql` is a one-time template, not a schema change. Run it after your own account exists, with your email filled in, to make yourself the first admin.
2. **Configure Auth.** Under **Authentication → Sign In / Providers → Email**, keep **Allow new users to sign up** and **Confirm email** turned on, and leave anonymous sign-ins off. New users can't use the app until an admin approves them.
3. **Google sign-in (optional).**
   - Create a Google OAuth Web client.
   - Add your site URL as an authorized JavaScript origin, and add `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback` as a redirect URI.
   - Enable Google under **Authentication → Providers**.
   - Add your production and local URLs under **Authentication → URL Configuration → Redirect URLs**.
4. **Passwords.** Require at least 12 characters, and enable leaked-password protection if your plan supports it.

> **Existing project:** the current production database was set up by running migrations by hand, so Supabase has no migration history for it. Don't run `supabase db push`, because it would re-run every migration. Apply only new files, in the SQL Editor or with `supabase db query --linked --file supabase/migrations/<file>.sql`.

## Push notifications and reminders

**What gets sent**
- **New duty:** sent to everyone with notifications on when an Officer or Admin creates a duty.
- **New alert:** sent to everyone with notifications on when an alert is published or resent.
- **Duty reminder:** sent to the people assigned to a duty at each reminder time set on it.
- **Account request:** sent to Admins when someone requests an account.

**Setup**

1. Generate VAPID keys and set the function secrets. `VAPID_SUBJECT` must start with `mailto:` or `https:`.
   ```sh
   npx web-push generate-vapid-keys
   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com REMINDER_CRON_SECRET=...
   ```
2. Deploy both functions. Without Docker, add `--use-api`.
   ```sh
   supabase functions deploy send-deployment-notifications
   supabase functions deploy send-duty-reminders --no-verify-jwt
   ```
3. Store the project URL and the cron secret in Vault, once, in the SQL Editor. The reminder job (`20261022_duty_reminder_cron.sql`) reads them each time it runs.
   ```sql
   select vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'project_url');
   select vault.create_secret('SAME_VALUE_AS_REMINDER_CRON_SECRET', 'reminder_cron_secret');
   ```
4. Set the same public key as `VITE_VAPID_PUBLIC_KEY` in Vercel, then redeploy. Without it, notifications only arrive while the app is open.

**Testing:** open **Settings → ARC Notifications**, turn notifications on, press **Send Test**, and close the app. A push should arrive about 10 seconds later. To see recent reminder-job runs, run `select * from cron.job_run_details order by start_time desc limit 10;`.

**On iPhone and iPad:** add the site to the Home Screen first, then turn notifications on from inside the installed app.

## Deployment

Vercel builds and deploys `main` automatically.

1. Import the GitHub repository into Vercel. The framework preset is **Vite**.
2. Add `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_VAPID_PUBLIC_KEY` for the Production environment. Vite only bakes in variables that start with `VITE_`, at build time, so redeploy after changing any of them.
3. `vercel.json` sets the security headers, including the Content-Security-Policy, and the single-page-app rewrites.

If you change an Edge Function, redeploy it with the commands under [Push notifications and reminders](#push-notifications-and-reminders).

## Security

- The Supabase URL, the publishable (anon) key, and the VAPID public key are meant to be public. RLS policies and the Edge Function checks protect the data.
- Keep `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PRIVATE_KEY`, `REMINDER_CRON_SECRET`, and Google client secrets only in Supabase or Vercel secret settings. Never give a private value a `VITE_` prefix, and never commit one.
- After changing RLS policies, run `npm run security:check`. Every protected table should report `PASS`.

## Screenshots

These show the earlier v2 interface; the current design differs.