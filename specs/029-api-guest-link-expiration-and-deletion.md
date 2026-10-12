# 029: Guest-Link Expiration and Deletion

## Status

Implemented

## Goal

Limit the lifetime of each shareable guest link: stop accepting guest access 24 hours after creation and automatically delete the link record 48 hours after creation. Keep guest-submission retention independent of the link's lifetime.

This specification revises the no-age-expiration decisions in the product brief and specs 003, 004, 006, 011, and 021. Existing links are subject to the new limits based on their original creation times.

## Scope

- Make a guest link unavailable to guests at and after 24 hours from its creation.
- Reject link resolution, vCard access, and guest submission after the 24-hour deadline, even before scheduled cleanup runs.
- Show expired status for otherwise-active links in the owner link overview.
- Automatically delete guest-link records at and after 48 hours from creation.
- Apply both deadlines to links already in D1 when this policy is deployed, using their existing `created_at` values.
- Preserve guest-submission records, associated files, and notification delivery according to their own lifecycle, regardless of link-record deletion.
- Add focused tests and update directly related lifecycle documentation.

## Out of Scope

- Changes to the 48-hour retention period for guest submissions or their associated files, which starts at successful submission.
- Changes to owner-profile retention, guest form fields, validation, webhook contents, or vCard generation.
- Changes to manual owner revocation or successful card-download consumption.
- Extending a link's lifetime or adding an owner-configurable expiration.

## Data and Behavior

- Derive link deadlines from the persisted creation time:
  - `expires_at = created_at + 24 hours`
  - `delete_at = created_at + 48 hours`
- Use UTC timestamps consistently. A link is expired when `expires_at` is at or before the current time. A link record is eligible for deletion when `delete_at` is at or before the current time.
- Use each existing link's `created_at` when enforcing the policy after deployment; do not restart the clock for existing links. Existing links at least 24 hours old become unavailable immediately, and records at least 48 hours old become eligible for cleanup immediately.
- An expired link cannot resolve, serve its signed vCard URL or profile photo, or accept a guest submission. Enforce expiration in each relevant API operation, not only in the owner interface or scheduled cleanup.
- Use the existing safe unavailable-link responses and response headers. Do not expose tokens, signatures, contact details, or internal expiration checks in errors or logs.
- In the owner link overview, report `expired` for a link that has reached its age deadline and has not already been consumed or manually revoked. Preserve `consumed` and `revoked` statuses for links with those recorded states.
- Scheduled cleanup deletes every link record at or after its 48-hour deadline, including consumed, revoked, and expired links. Cleanup must be safe to run repeatedly.
- Deleting a link record must not delete or alter a guest submission, its stored picture, or its notification outbox entry. A submission may remain available to the owner for its separate 48-hour period after its link record has been deleted.
- Keep the submission's successful-submission timestamp and single-submission protection independent of the guest-submission row's later deletion. Link expiry or link-record cleanup must never permit a second submission.
- Do not store a duplicate owner profile or vCard, or add guest contact data to link records. Reuse `created_at` to derive link deadlines; add only the indexes or migration changes needed for efficient enforcement and cleanup.

## Acceptance Criteria

- A newly created link resolves, serves its signed vCard URL and profile photo, and accepts a valid guest submission before its 24-hour deadline, subject to the existing consumption, revocation, and single-submission rules.
- At exactly 24 hours after creation and afterward, guest resolution, signed vCard access, profile-photo access, and submission are rejected, including before the scheduled cleanup runs.
- Existing links are evaluated using their original `created_at` values: links at least 24 hours old are unavailable after deployment, and links at least 48 hours old are eligible for deletion.
- The owner link overview reports otherwise-active expired links as `expired` without exposing guest tokens or signed URL signatures. Consumed and revoked links retain their existing statuses until deleted.
- Scheduled cleanup removes link rows whose 48-hour deadline has arrived and leaves younger link rows untouched.
- Deleting a link does not delete, modify, or make inaccessible an unexpired guest submission or its associated stored picture, nor does it remove a pending notification outbox entry.
- Guest-submission visibility and deletion continue to follow the existing 48-hour deadline measured from successful submission, independently of link creation and link-record deletion.
- A link's submission state remains effective for the lifetime of the link; expiry or cleanup cannot allow a second successful submission.
- Automated tests cover just-before, exact, and just-after both deadlines; existing-link behavior after deployment; expired API access before cleanup; owner status; repeated cleanup; and preservation of submission files and notifications.
- Existing authorization, single-use behavior, manual revocation, privacy protections, webhook behavior, vCard behavior, and cache-control requirements remain unchanged except for the age-based unavailability defined here.

## Verification

Run focused guest-flow and owner-link tests, then the repository type-check, full test suite, and production build. Verify the 24-hour access boundary independently of the scheduled job, verify cleanup at 48 hours using existing and newly created links, and confirm submission retention and notification processing are unaffected by link deletion.
