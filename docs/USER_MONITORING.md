# User Monitoring

User Monitoring is a Developer-only view for live device sessions and authentication history.

## Interface

- First tab: Live Users.
- Second tab: Activity Log.
- Live Users groups browser installations by account. A browser-stored device ID keeps repeated logins in the same browser under one device card; each login session remains available in the device detail.
- Activity Log requires the outlet filter. It includes an "Unidentified" filter for failed login attempts that cannot be associated with an account or outlet.
- Automatic refresh runs every 30 seconds while the page is visible; a manual refresh is available.
- No search or export controls.

## Device identification

- The browser stores a random UUID under `user_monitoring_device_id_v1` in localStorage and sends it during session registration.
- This identifies the same browser installation, not the physical hardware. A different browser, private browsing session, or cleared site storage may be counted as a separate device.
- Existing sessions are assigned individual IDs during migration because they cannot be reliably matched to a physical browser after the fact.

## Session behavior

- The client updates last_seen_at every 25 seconds through the authenticated touch_user_monitoring_session RPC.
- A session becomes offline after 120 seconds without a heartbeat. The database sweep runs once per minute, so the persisted status may be updated shortly after the 120-second threshold; the interface applies the 120-second threshold immediately.
- Logout is stored separately from offline.
- Offline and logged-out sessions are retained for seven days.
- Activity records are retained for 30 days.
- The daily cleanup job runs at 18:17 UTC (01:17 WIB).

## Security

- The monitoring tables are readable only by authenticated Developer accounts through RLS.
- Direct client writes to the monitoring tables are revoked.
- Session registration, heartbeat, and logout use SECURITY DEFINER RPCs with a fixed empty search path and derive the user/session identity from the verified JWT.
- Failed password attempts are recorded by the auth-login Edge Function. Passwords and IP addresses are not stored. The attempted email is masked before logging.
- The Edge Function is public by design because it is the unauthenticated login entry point. It forwards the credentials to Supabase Auth and returns only the Auth response; the service-role key remains server-side.

## Required Realtime project setting

Before relying on the private Presence channel, open the Supabase Dashboard:

1. Select project niwapjafzaizlnenuyui.
2. Open Realtime → Settings.
3. Turn off Allow public access to channels.
4. Save the setting.

The connector used for this implementation cannot change this project-level setting. The client creates the user-monitoring:global channel as a private channel. RLS permits authenticated users to publish Presence but permits only Developer users to read Presence.

## Deployment order

1. Apply the SQL migrations in supabase/migrations/.
2. Deploy supabase/functions/auth-login/.
3. Publish the frontend files to GitHub Pages.
4. Disable public Realtime channels in the Dashboard before testing Live Users.

## Verification checklist

- Correct password creates one login-success activity and one session.
- Wrong password creates a login-failed activity with a masked identifier.
- Auth service errors are recorded separately as login errors.
- Logout marks only the current session as logged out.
- A disconnected session becomes offline after the 120-second threshold.
- Repeated logins in the same browser share one device card while each login session remains in its detail history.
- A different browser or separate browser storage creates a separate device card.
- Non-Developer users cannot read monitoring tables or other users' Presence.
- Developer can see all sessions and filter activity by outlet.
- Offline/logged-out sessions and activity logs are removed at their respective retention limits.
