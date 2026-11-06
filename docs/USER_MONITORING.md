# User Monitoring

User Monitoring is a restricted operational view for reviewing active device sessions and authentication activity.

## Interface

- Live view groups browser installations by account and device.
- Each login remains available in the device history.
- Activity view supports filtering by outlet and includes events that cannot be associated with a known account.
- The page supports automatic and manual refresh.

## Device identification

- A random browser identifier is stored locally to group repeat logins from the same browser installation.
- This identifies a browser installation, not physical hardware. A different browser, private session, or cleared site storage may appear as a separate device.
- Existing sessions may not be reliably associated with a browser installation created before device identification was introduced.

## Session behavior

- Authenticated sessions periodically report activity.
- Sessions that stop reporting activity are marked offline after the configured threshold.
- Logout is recorded separately from an offline session.
- Session and activity records follow configured retention periods.

## Security overview

- Monitoring information is available only to authorized users.
- Database access is restricted by the application's access policies.
- Client-side code cannot directly write monitoring records.
- Session identity is derived from the authenticated session.
- Failed login events may contain a masked identifier; passwords and IP addresses are not stored by the monitoring feature.
- Server-only credentials remain in the server environment and must never be placed in frontend files.

## Deployment and verification

Deploy backend changes and frontend changes in the documented release order for the environment. Verify successful and failed login events, logout, offline transitions, device grouping, outlet filtering, and access restrictions using authorized test accounts.
