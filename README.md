# ARC | Ateneo College Red Cross Youth Operations

A comprehensive web-based platform designed to streamline duty scheduling, personnel management, and attendance tracking for the Red Cross Camarines Sur Chapter. This solution modernizes the workflow by replacing manual logs with a centralized, real-time database system.

![Dashboard Overview](public/showcase/screenshot-2.png)

## Table of Contents

- [Features](#features)
- [Built With](#built-with)
- [Getting Started](#getting-started)
- [Usage](#usage)
- [Deploy](#deploy)
- [License](#license)

## Features

*   **Role-Based Access Control**: Secure authentication distinguishing between administrators and standard volunteers.
*   **Dynamic Scheduling**: Drag-and-drop calendar interface for assigning field duties and managing rosters.
*   **Personnel Management**: Centralized database for staff profiles, contact details, and department allocation.
*   **Attendance Tracking**: Digital check-in/check-out system with automated status reporting (Present, Late, Absent).
*   **Shift Swapping**: Automated workflow for personnel to request and validate shift exchanges.
*   **Real-time Dashboard**: Live statistics on workforce deployment and pending administrative actions.
*   **NEXUS Resource Board**: Officer-only shared QR cards, links, descriptions, ordering, and image exports.
*   **CORE Deliverables**: Officer-only shared committee deliverables, statuses, deadlines, remarks, and exports.
*   **ARC Alerts**: A categorized announcement feed with unread badges, rich text, urgent pins, realtime updates, and Web Push delivery.
*   **Officer Access Level**: Officers keep normal volunteer abilities while gaining secure access to NEXUS and CORE.
*   **ARC Design System**: A responsive cream, maroon, and navy interface with light/dark themes, a collapsible sidebar, optional interface sounds, and an in-app walkthrough.

## Built With

This project exploits a modern tech stack to ensure performance, scalability, and ease of maintenance.

*   [React](https://reactjs.org/) - Frontend library for building user interfaces
*   [Vite](https://vitejs.dev/) - Next Generation Frontend Tooling
*   [Supabase](https://supabase.com/) - Open Source Firebase alternative (PostgreSQL + Auth)
*   [Lucide React](https://lucide.dev/) - Consistent icon set

## Getting Started

Follow these steps to set up the project locally.

### Prerequisites

*   Node.js (v20 or higher recommended)
*   npm or yarn
*   A Supabase project (Free Tier is sufficient)

### Installation

1.  Clone the repository
    ```sh
    git clone https://github.com/AbeneilMagpantay/red-cross-scheduler.git
    ```
2.  Install NPM packages
    ```sh
    npm install
    ```
3.  Configure Environment Variables
    Create a `.env.local` file in the root directory and add your Supabase credentials:
    ```env
    VITE_SUPABASE_URL=your_supabase_project_url
    VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
    ```
4.  Run the application
    ```sh
    npm run dev
    ```

### Google Sign-In

1. Create a Google OAuth Web client and add your application URL as an authorized JavaScript origin.
2. Add `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback` as an authorized Google redirect URI.
3. Enable Google under **Supabase Dashboard → Authentication → Providers** and enter the Google client ID and secret.
4. Add both the production URL and local development URL to **Authentication → URL Configuration → Redirect URLs**.

Google users must have an existing Personnel record with the same email address. This keeps access administrator-controlled.

### Deployment Notifications

Apply the database migrations, generate Web Push VAPID keys, and deploy the notification function:

```sh
supabase db push
npx web-push generate-vapid-keys
supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:admin@example.com REMINDER_CRON_SECRET=...
supabase functions deploy send-deployment-notifications
supabase functions deploy send-duty-reminders --no-verify-jwt
```

Set the generated public key as `VITE_VAPID_PUBLIC_KEY` in the deployed web app. Notifications require HTTPS in production. On iPhone and iPad, install the site to the Home Screen before enabling background notifications.

For timed duty reminders, create a Supabase Cron job that runs every 15 minutes and sends a `POST` request to `https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-duty-reminders`. Add an `x-cron-secret` header containing the same private value used for `REMINDER_CRON_SECRET`. The reminder function rejects calls that do not have this secret or the service-role token.

### Required security rollout

Before treating a deployment as production-ready:

1. Apply every migration, including `20260828_security_hardening.sql`, with `supabase db push` or by running that file in the Supabase SQL Editor. This removes the original public attendance/swap policies and enforces active-member, owner, and administrator access.
   After applying it, run `npm run security:check` locally. It performs anonymous, count-only reads and should report `PASS` for every protected table.
2. Redeploy both Edge Functions after changing their code:
   ```sh
   supabase functions deploy send-deployment-notifications
   supabase functions deploy send-duty-reminders --no-verify-jwt
   ```
3. In **Supabase Dashboard → Authentication → Sign In / Providers → Email**, keep **Allow new users to sign up** and **Confirm email** enabled. New Auth users remain blocked until an administrator approves their request in Personnel. Leave anonymous sign-ins disabled.
4. In the Supabase password security settings, require at least 12 characters and enable leaked-password protection when available. Require MFA for administrator accounts when the project plan supports it.
5. Keep `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PRIVATE_KEY`, Google client secrets, and `REMINDER_CRON_SECRET` only in Supabase/Vercel secret settings. Never prefix a private value with `VITE_` or commit it to Git.

The Supabase project URL, anonymous/publishable key, and VAPID public key are expected to be visible in the browser. RLS and the Edge Function checks are the security boundary for those public values.

### Account approval and roles

Apply `20260905_access_roles_and_approvals.sql` before enabling self-registration. Members request an account from the sign-in page; administrators review pending requests in **Personnel → Account approvals**. Approval creates a Volunteer profile, or restores an email-matched archived profile so its duty history stays connected. Administrators can promote approved members to Officer afterward.

- Volunteers can view NEXUS and CORE and manage only their own duty registration.
- Officers can edit NEXUS, CORE, upcoming schedules, teams, and assignments.
- Administrators additionally manage Personnel, account approvals, attendance administration, swap approvals, and deletion of concluded events.

The existing `send-duty-reminders` Cron run also sends background push alerts to notification-enabled administrators when new account requests are waiting, so redeploy that function after applying this update.

## Usage

### Scheduling View
The core interface allows administrators to view and manage monthly schedules. Assignments can be modified or removed directly from the calendar grid.

![Schedule Interface](public/showcase/screenshot-1.png)

### Personnel Directory
Manage the volunteer database, including adding new members, updating roles, and monitoring active status.

![Personnel Management](public/showcase/screenshot-3.png)

### Attendance Tracking
Complete digital log of check-ins and check-outs with status monitoring.

![Attendance Tracking](public/showcase/screenshot-4.png)

### Shift Swaps
Dedicated interface for approving or rejecting shift change requests.

![Shift Swaps](public/showcase/screenshot-5.png)

## Deploy

The application is optimized for deployment on Vercel.

1.  Push code to GitHub.
2.  Import project into Vercel.
3.  Set `Framework Preset` to **Vite**.
4.  Add Environment Variables from `.env`.
5.  Deploy.

### ARC integration

Apply `supabase/migrations/20260822_arc_integration.sql`, followed by
`supabase/migrations/20260827_arc_alerts.sql`, after the earlier migrations.
They convert existing Staff personnel to Officer, create NEXUS, CORE, and
Alerts, create private QR storage, and install the required database access
rules. Redeploy `send-deployment-notifications` so the existing Web Push setup
can also send ARC announcements.

After deployment, an Admin can open **Settings → Existing ARC Data** to import
the latest snapshot from the legacy ARC site. Follow `ARC_CUTOVER.md` for the
verification and read-only cutover sequence.

## License

Distributed under the MIT License. See `LICENSE` for more information.


