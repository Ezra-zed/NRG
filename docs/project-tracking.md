# Order tracking and maintenance reminders

Solar quote projects expose the customer order journey in the existing project tracking responses. Installer acceptance of a lead assigns the project, appends the `order-confirmed` and `installer-assigned` audit events, and closes competing installer leads. Customers can read their project tracker; only the assigned verified installer can move it forward.

Installer milestone updates use `PATCH /api/projects/:projectId/order-tracking` with one of `site-survey`, `installation-scheduled`, `installation-in-progress`, or `installation-completed`. The API only accepts the next stage. The existing `/tracking` lifecycle remains available for compatibility.

At installation completion, ENRG records `installationCompletedAt` and upserts one `MaintenanceReminder` per project. The database-backed worker starts with the API after MongoDB connects, checks due reminders each minute by default, retries delivery with backoff, and cancels reminders whose projects are no longer valid. Set these environment values in every deployment:

- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`
- `SMTP_SECURE` and `EMAIL_FROM`
- `MAINTENANCE_REMINDER_MONTHS` (default `3`)
- `MAINTENANCE_REMINDER_POLL_MS` (default `60000`)
- `FRONTEND_URL` to the public frontend origin used by email links

`MaintenanceReminder` stores `scheduledAt`, `status`, and `sentAt`; the unique project index and atomic worker claim prevent concurrent duplicate sends. Signup policy consent uses `TERMS_VERSION` and `PRIVACY_VERSION` (both default to `1.0`) and stores the acceptance timestamp with the account or public customer intake.

Customer maintenance requests are available at `POST /api/projects/:projectId/maintenance-requests`. Assigned installers can review and update requests through `/api/projects/vendor/maintenance-requests`.
