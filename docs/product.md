# Product Brief: Contactswap

## 1. One-sentence description

Contactswap lets Quinten share his current contact card with friends and family through a unique link, and optionally collect a guest's contact details when they choose to submit them.

## 2. Problem

People's contact details change over time, including addresses, email addresses, and other personal information. Friends and family often ask for the same information repeatedly, and the person being contacted may not have saved or updated it. Contactswap makes it easy to share Quinten's latest contact details through a single link and to collect a guest's details only when the guest explicitly chooses to share them.

## 3. Intended users

- Owner: Quinten is the only person who manages and shares a Contactswap profile.
- Guest: A friend or family member opens a shared link. Guests do not need an account to view Quinten's contact details or optionally submit their own.
- The product is single-owner only and does not support public discovery or multiple profile owners.
- Quinten's own contact details are persisted so he does not have to re-enter them every time he wants to share or update them.
- The initial product targets mobile web users on modern browsers with basic accessibility expectations rather than a formal accessibility certification program.

## 4. Final product decisions

The following decisions are resolved for this version:

- Each guest link supports guest form submission and has its own signed URL for accessing Quinten's current vCard 3.0; there is no public profile URL.
- A signed vCard URL is unique to and valid only for its associated guest link. It is revoked when that link is manually deleted or consumed by a successful card download; it does not expire by age while the link remains active.
- After a guest submits the form, Quinten receives a notification that a form was completed.
- Quinten then opens the authorized owner page, where he can click Download to generate and download a vCard from the database record.
- Quinten is the only profile owner.
- Quinten's editable profile fields are persisted in D1. Generate his current vCard 3.0 when requested from those fields and his optional optimized photo in private R2; do not store the rendered vCard or image data in D1.
- An active guest link may show Quinten's name and optional profile picture on its landing page. If no picture is set, show an initials avatar. Do not show other owner contact fields in this preview; it is not a public profile and is available only through an active guest link.
- First name, last name, email, street, city, postal code, country, birthday, and phone number are required for both profiles; picture is optional. New owner and guest forms default Country to `The Netherlands`, and the owner sees the saved country when editing an existing profile. Phone numbers use international E.164 format and are included in every generated vCard. Dutch-facing phone examples use the `+31` country code; other valid international numbers are accepted.
- Organization and job title are optional for both the owner profile and guest submissions. When supplied, they are included in the corresponding generated vCard.
- Downloaded vCards use a personal `firstname-lastname.vcf` filename derived from the card owner's first and last names.
- Guest submissions are retained for 30 days and then deleted automatically.
- Links do not expire by age; they can be manually deleted and are consumed after the first successful card download. A link accepts at most one successful guest submission.
- The frontend welcome page is at `/`, with a cheerful, animated introduction and no owner-dashboard link. Owner pages are at `/quinten`, `/quinten/links`, and `/quinten/submissions`; shareable guest links are at `/token/{token}`. The owner link-creation API returns the absolute guest URL in that form.

## 5. Proposed solution

Quinten maintains his editable profile in D1 through an owner-only interface authorized by a secret token. His required first name, last name, street, city, postal code, and country are stored as separate fields alongside his other contact fields. His optional organization and title are stored with the profile, and his optional optimized photo is stored in private R2. Contactswap generates his current vCard 3.0 when requested, assembling it from the profile fields in D1 and the photo in R2; the vCard is not stored in D1. Both Quinten and each guest provide a phone number in international E.164 format. Dutch-facing examples use the `+31` country code, while other valid international numbers are accepted. Every generated vCard includes the number as a vCard 3.0 text telephone property and includes optional organization and title as `ORG` and `TITLE` properties when supplied. The vCard `N` and `ADR` properties use the structured component order and delimiters defined in RFC 2426. For each unique guest link, Contactswap creates a signed URL that grants access to Quinten's current vCard specifically through that link. The active link's landing page may also show only Quinten's joined first and last name and optional profile picture, served through link-scoped access; if no picture is set, it shows an initials avatar. The guest can use the link to access Quinten's card and submit their own contact information through a form.

The guest's combined form action submits their details first. After the API confirms a successful submission, Contactswap stores the guest data, sends a webhook notification to Quinten saying that a form was completed, and downloads Quinten's current vCard 3.0. The signed link remains usable until a successful card download consumes it. If the card download fails after submission, the guest can retry the download without submitting again. The guest may also choose to download the card without submitting details; a successful download consumes the link. Quinten can then open the authorized owner page and download a vCard 3.0 generated from the stored guest record.

The system is web-based, mobile-first, and deployed on Cloudflare Pages. vCard 3.0 is the required generated contact-file format.

## 6. Core user journey

1. Quinten opens the owner-only page and sees his saved, editable contact details from D1.
2. Quinten can edit his details on the profile page or open the separate guest-link management page to review and create shareable links.
3. Quinten saves contact information; the editable fields persist in D1. If he uploads a photo, Contactswap resizes and compresses it and stores the optimized image in private R2.
4. Quinten creates a unique guest link, with its own signed URL for his current vCard, and sends it to a friend or family member.
5. The guest opens the link and chooses to submit their details or download Quinten's card only.
6. For the combined action, Contactswap stores one guest record and sends Quinten a notification after successful submission, then downloads Quinten's current vCard for the guest.
7. Quinten opens the authorized owner page and clicks Download.
8. Contactswap generates a vCard 3.0 from the stored guest data and downloads it for Quinten.
9. The link is consumed after the first successful card download. Guest submissions are deleted after 30 days.

## 7. Features and scope

### Must have

- A single owner, Quinten, can maintain the contact details shared with guests.
- Quinten's editable contact details are persisted in D1 so they do not need to be re-entered or extracted from a downloaded vCard when he updates them.
- Quinten can edit his profile on the owner profile page and manage guest links on a separate owner-only page protected by a secret token; a full account system is not required.
- Quinten can rotate the admin token by updating the API Worker's Cloudflare Worker Secret; the token must never be exposed in client-side code.
- Quinten can download his current profile vCard through an owner-authorized endpoint. Generate it on request from the current D1 profile fields and optional photo in R2; do not store vCard text or image data in D1.
- When a profile photo is present, include it in vCard 3.0 as a base64-encoded `PHOTO;ENCODING=b;TYPE=JPEG` property. Resize and compress uploads before storing them in private R2.
- Quinten can generate a unique guest link for form submission.
- Every guest link has a distinct signed URL for accessing Quinten's current vCard 3.0; the card must not be available through a public profile URL.
- A guest can open the link, access Quinten's vCard through its signed URL, and submit their own contact details through a form.
- Guest submissions are stored in a database and used to generate a vCard 3.0 file for Quinten.
- Guest submissions and related stored files are deleted after 30 days.
- Quinten receives a webhook notification after a successful guest submission.
- Quinten can open the authorized owner page and click Download to generate a vCard from the stored guest database record.
- Shared links and their signed vCard URLs do not expire by age. Quinten can delete a link, and each link and its signed vCard URL are revoked after its first successful card download.
- The combined guest action submits the form first and downloads Quinten's card only after a successful submission. After the card is downloaded, the guest sees a thank-you page.
- A successful submission prevents further submissions through that link but leaves its signed vCard URL available until the card download succeeds. The guest can retry the card download without submitting again.
- The guest may download the card without submitting; a successful card download consumes the link.
- Both owner and guest forms require first name, last name, email, street, city, postal code, country, birthday, and an international E.164 phone number; organization, title, and picture are optional. New forms default Country to `The Netherlands`.
- Downloaded owner and guest vCards use a sanitized `firstname-lastname.vcf` filename derived from that card's first and last names.
- The app is fully web-based and deployed on Cloudflare Pages.

### Should have

- Clear owner and guest workflows designed for mobile devices.
- Simple operational maintenance that can be handled by one person without a support team.

### Out of scope for v1

- Multiple owners or guest accounts.
- Public directory or discovery features.
- Broader account, analytics, or management features beyond the personal-use flow.

## 8. Information and content

- Quinten's profile contains first name, last name, email, street, city, postal code, country, birthday, an international E.164 phone number, optional organization and title, and an optional picture.
- Quinten's editable profile fields are persisted in D1 and reused without re-entering or extracting details from a downloaded vCard. The optional photo is stored in private R2, not D1.
- A guest may submit the same data types: first name, last name, email, street, city, postal code, country, birthday, an international E.164 phone number, optional organization and title, and an optional picture.
- Quinten's profile fields are stored in D1; the optional optimized photo is stored in private R2. Generate the vCard 3.0 on request and embed the photo as base64 using vCard 3.0 binary photo syntax when present. Do not store image bytes, base64 image data, or the rendered vCard in D1.
- Guest-submitted fields are stored in a database and used to generate a vCard 3.0 for Quinten when needed.
- First name, last name, email, street, city, postal code, country, birthday, and phone number are required for both owner and guest forms. New forms default Country to `The Netherlands`. Phone numbers use international E.164 format and are included in every generated vCard as a telephone property.
- Organization and title are optional for owner and guest forms. Include supplied values as vCard 3.0 `ORG` and `TITLE` properties, respectively; omit either property when its value is unset.
- Guest submissions and associated stored files are retained for 30 days, then automatically deleted.
- Contact details, birthdays, addresses, and pictures are personal information and should only be exposed through the intended owner flow or an active guest link. The guest landing-page preview is limited to Quinten's name and optional profile picture; do not expose other owner fields there. Keep profile photos private in R2 and serve any guest preview only through a link-scoped resource that rejects deleted or consumed links.
- Treat each signed vCard URL as a bearer credential scoped to its guest link; do not expose it outside that sharing flow or include its signature in logs.
- Before release, vCard import behavior should be validated on current iOS and Android contact apps; support may vary by device and app.

## 9. Behavior and edge cases

- The guest must be able to submit their contact details through the guest link.
- Required fields must be validated before accepting a guest submission.
- Each link accepts at most one successful form submission and one successful card download. A successful form submission does not consume the link; a successful signed vCard download does.
- Each active guest link's signed URL grants access only to Quinten's vCard for that link; deleting or consuming the guest link revokes its signed URL. Failed card requests do not consume the link.
- The active guest landing page may display Quinten's name and optional profile picture through link-scoped access. It must show initials when no picture is available and must not expose other owner contact fields or create a public profile URL.
- Incomplete profiles, invalid submissions, failed downloads, duplicate submissions, and service errors should show clear user-facing feedback and safe fallback behavior.
- A successful owner-profile save updates the canonical D1 fields. Owner and guest-link vCard downloads are generated from the current D1 fields and optional R2 photo, so they always reflect the saved profile; do not persist rendered vCards in D1.
- The thank-you page appears after a successful card download. If a guest submission succeeds but the card request fails, show that the details were submitted and allow the card request to be retried without resubmission.
- Guest submissions are deleted automatically after 30 days.
- Quinten receives a webhook notification after a successful form submission. The notification should be a simple summary and should not include guest contact details unless explicitly approved.
- Quinten must be able to open the authorized owner page and generate/download the vCard from the saved database record.

## 10. Platform and integrations

- The application is entirely web-based and deployable on Cloudflare Pages.
- The product is mobile-first, with desktop and tablet support as secondary goals.
- The product targets current mobile browsers, especially Safari on iPhone and Chrome on Android.
- Quinten accesses the owner-only profile-management page using a secret token; no full account system is included.
- The admin token is stored as a Cloudflare Worker Secret on the API Worker and never exposed to the browser.
- Signed vCard URLs are generated and validated server-side and are scoped to their associated guest link.
- Guest submissions are stored in a database compatible with Cloudflare Pages; Cloudflare D1 is the default choice.
- Webhook credentials are configured as Cloudflare Worker Secrets on the API Worker, with Discord as the initial example destination.
- vCard 3.0 is the required generated contact-file format.

## 11. Design and accessibility

- All flows should be designed for mobile interaction and touch-first usage.
- Keep the visual style minimal, understandable, and straightforward.
- Use semantic HTML, visible focus states, strong contrast, and clear copy.
- The primary flows should be easy to complete on a phone without a formal accessibility compliance program.

## 12. Constraints and risks

- Contact data is personal and potentially sensitive, including address, birthday, and picture data.
- Shared links do not expire by age, are consumed by a successful card download, and may be manually deleted.
- Guest submissions and generated vCards must be protected and access-controlled.
- The product should stay within Cloudflare free-tier services by default unless usage demands a small paid plan.
- This is a hobby project, so the scope should remain practical, lightweight, and easy to maintain.

## 13. Success criteria

- Quinten can open the owner page and see his saved contact details.
- Quinten can edit his own details on the profile page and manage shareable guest links on a separate page.
- Quinten's profile persists between visits so he does not need to re-enter it every time.
- Quinten can edit his persisted D1 profile and download a current vCard 3.0 generated from the saved profile and optional photo.
- Quinten can download his own current vCard without using a guest link.
- A guest can submit their details, download Quinten's card after success, and sees a thank-you page. The download-only choice remains available.
- Quinten receives a notification when a guest submits the form.
- Quinten can open the authorized owner page and generate/download a vCard 3.0 from the stored guest data.
- Quinten can update his own profile through the secret-authorized page without a full account system.
- Guest submissions are stored in a database, generate a vCard 3.0 for Quinten, trigger a webhook notification, and are deleted after 30 days.
- Shared links can be manually deleted and are consumed after the first successful card download. A successful submission can be followed by a retryable card download.
- Quinten's vCard is not publicly accessible; each guest link provides only its own revocable signed URL to the current card.
- The web app deploys successfully to Cloudflare Pages.
- The project remains simple, reliable, and easy to maintain as a personal-use tool.

## 14. Example scenarios

- Submitting details: A family member opens Quinten's guest link, submits their first name, last name, email, street, city, postal code, country, birthday, and international E.164 phone number, with a picture if they choose, then receives Quinten's card after the submission succeeds. Contactswap stores the submission and sends Quinten a notification. The link is consumed after the card download succeeds.
- Downloading for Quinten: Quinten opens the authorized owner page, clicks Download, and Contactswap generates and downloads a vCard 3.0 from the guest's stored data in the database.

## 15. Implementation guidance for the agent

- Preserve the single-owner model and the described guest flow.
- Do not expose the owner token or webhook secret to the browser.
- Keep the 30-day retention period and single-use guest submission and card-download behavior. Submission succeeds before the combined flow downloads the card; the link is consumed only after a successful card download. Owner and guest forms require first name, last name, email, street, city, postal code, country, birthday, and phone number.
- Prefer simple, reliable implementation choices over broad feature expansion.
- When a requirement is ambiguous, resolve it in favor of the final product decisions above instead of leaving it unresolved.
