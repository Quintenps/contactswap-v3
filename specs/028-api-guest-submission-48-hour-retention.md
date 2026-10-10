# 028: Guest Submission 48-Hour Retention

## Status

Implemented

## Goal

Replace the 30-day guest-submission retention period with 48 hours and make the retention period clear to guests before they submit their data.

This specification supersedes the guest-submission retention requirements in specs 004 and 024. It does not change guest-link expiration or single-use behavior.

## Scope

- Retain each successful guest submission and any associated stored files for 48 hours from the successful submission time.
- Shorten the expiration of existing submissions based on their original submission timestamps when this policy is deployed.
- Make expired submissions unavailable through owner-facing APIs at the 48-hour deadline, even if scheduled deletion has not yet run.
- Automatically delete expired D1 submission records and associated stored guest files.
- Show a clear disclosure on the guest form before submission that submitted contact details and any optional picture are stored for 48 hours and then automatically deleted.
- Update focused tests and applicable retention documentation.

## Out of Scope

- Changes to which guest fields are collected or which are required.
- Changes to webhook contents, guest-link lifecycle, or vCard download behavior.
- Changes to owner-profile data retention.

## Data and Behavior

- Calculate each submission's expiration from its successful submission timestamp: `expires_at = submitted_at + 48 hours`.
- Apply the same calculation to existing records in a versioned D1 migration so data created under the previous retention period does not remain available longer than 48 hours from submission.
- Treat a submission as expired when `expires_at` is at or before the current time. Owner list, detail, and download operations must not return expired submission data.
- Scheduled cleanup deletes expired D1 submissions and any associated guest-picture files. Cleanup may run asynchronously after the deadline, but expired data must no longer be accessible through the application.
- Keep the guest link's submitted state independently of the submission record so cleanup does not permit a second submission through the same link.
- Display the retention notice before the guest submits. The notice must explicitly say that submitted contact details and any optional picture are stored for 48 hours and then automatically deleted. Do not add a separate consent checkbox unless separately specified.
- Do not include guest contact details in webhook notifications.

## Acceptance Criteria

- A successful submission is assigned an expiration exactly 48 hours after its successful submission timestamp.
- Existing submissions are migrated to expire 48 hours after their original successful submission timestamp.
- Owner list, detail, and vCard-download endpoints exclude a submission at and after its expiration deadline, including before scheduled cleanup runs.
- Scheduled cleanup removes expired D1 records and their associated stored guest-picture files without deleting unexpired submissions or owner photos.
- Expiration does not reset the guest link's submitted state or allow another submission.
- The guest form presents the 48-hour storage and automatic-deletion notice before the submit action.
- Automated tests cover the expiration boundary, owner access after expiration, cleanup of associated files, preservation of active submissions, and the guest-facing notice.
- The existing guest submission, link, notification, and vCard behavior remains unchanged apart from the retention period and its disclosure.
