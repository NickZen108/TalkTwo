# Push notifications: final activation checklist

TalkTwo's app, database outbox and dispatcher can be reviewed and merged without Apple Developer or Google Play accounts. Production delivery remains deliberately disabled until every credential below is configured.

## Privacy contract

- Notification payloads contain only `TalkTwo`, `You have a new message.`, and the non-identifying event kind `message_available`.
- Payloads never contain message text, sender or relationship names, document names, risk level, or relationship identifiers.
- A job cannot be claimed before both the message's server-owned `available_at` and its retry time.
- Opened, withdrawn, rejected, blocked, or disabled-device jobs are cancelled before dispatch.
- Expo tokens are server-private. Authenticated clients can register, check, or disable only a token already held in encrypted device storage.
- Delivery tickets and receipts are retained only as operational metadata and contain no conversation content.

## Account-dependent activation

1. Create the TalkTwo EAS project and place its project ID at `expo.extra.eas.projectId` without committing account secrets.
2. Configure APNs credentials for `com.talktwo.app` and FCM v1 credentials for the same Android package in EAS.
3. Enable Expo Push security and store its access token as the Edge Function secret `EXPO_ACCESS_TOKEN`.
4. Generate a high-entropy dispatcher secret and store it as the Edge Function secret `PUSH_DISPATCH_SECRET` and in Supabase Vault as `push_dispatch_secret`.
5. Apply `20260820174500_private_push_notifications.sql` only after review and merge.
6. Deploy `dispatch-push-notifications` with JWT verification disabled; the function performs constant-shape bearer-secret authentication itself.
7. Store the project URL in Vault as `project_url`, then schedule a one-minute call with Supabase Cron and `pg_net`:

```sql
select cron.schedule(
  'dispatch-talktwo-push',
  '* * * * *',
  $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
        || '/functions/v1/dispatch-push-notifications',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' ||
          (select decrypted_secret from vault.decrypted_secrets where name = 'push_dispatch_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $$
);
```

8. Validate on physical iPhone and Android devices: opt in, foreground/background/terminated delivery, token rotation, sign-out, account switching, permission denial, communication windows, withdrawal before window, and disabled notifications.
9. Confirm Expo tickets and receipts transition jobs to `delivered`, and a `DeviceNotRegistered` receipt disables the token.
10. Add monitoring for repeated dispatcher failures and pending jobs older than ten minutes. Never log tokens or payload authorization headers.

Do not create the Cron job, store secrets, deploy the function, or send production notifications until deployment is explicitly approved.
