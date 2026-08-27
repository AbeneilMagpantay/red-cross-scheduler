# ARC integration cutover

Use this checklist only after the integrated application has been reviewed
locally and the existing Supabase project has been backed up.

## 1. Apply the database migrations

Run `supabase/migrations/20260822_arc_integration.sql` in the Supabase SQL
Editor after all earlier migrations. Then run
`supabase/migrations/20260827_arc_alerts.sql`. Together they:

- convert existing `staff` personnel to `officer`;
- restrict role and personnel changes to administrators;
- create NEXUS and CORE tables with Admin/Officer-only access;
- create the Alerts feed, which every active member can read and only Admins
  and Officers can manage;
- create a private QR-image bucket and its access policies; and
- enable realtime updates for all three modules.

## 2. Redeploy the notification function

The existing notification function now handles both deployment duties and ARC
announcements. Redeploy it after the Alerts migration:

```sh
supabase functions deploy send-deployment-notifications
```

This uses the same VAPID secrets already configured for deployment
notifications. No new secret is required.

## 3. Deploy the integrated app

Push the Scheduler repository after the migration succeeds. Its existing
GitHub-to-Vercel connection can deploy it without an additional environment
variable.

## 4. Confirm the old ARC API is on REV 91

The latest pushed ARC version already permits the new app to read its API from
a different web address. Deploy REV 91 to the old ARC Vercel project before
importing if that deployment has not updated automatically.

Do not try to make the old site read-only yet. REV 91 replaced the earlier
`ARC_READ_ONLY` compatibility guard, so setting that environment variable by
itself currently has no effect.

## 5. Import the live ARC snapshot

1. Ask officers to stop editing the old ARC website temporarily.
2. Sign in to the new ARC app as an Admin.
3. Open **Settings → Existing ARC Data**.
4. Choose **Import existing ARC data** and wait for the success message.
5. Verify that NEXUS shows the old resources, CORE matches the old table, and
   Alerts contains the old FEED announcements.
6. Test one harmless edit in NEXUS, CORE, and Alerts from an Officer account.
7. Confirm that a Volunteer can read `/alerts` but cannot open `/nexus` or
   `/core`, create announcements, or see announcement management controls.

The importer is repeat-safe. It updates resources and announcements carrying
the same legacy ID instead of creating duplicates.

## 6. Retire the old ARC site

After verification, either restore a server-side read-only guard in the legacy
ARC API or redirect the old deployment directly to the unified ARC app. Merely
setting `ARC_READ_ONLY=true` will not work on the current REV 91 source.

The safest sequence is a short read-only verification period followed by a
redirect. The old Vercel owner must perform that deployment-side step.
