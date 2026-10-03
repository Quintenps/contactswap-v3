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

- Each guest link supports guest form submission and has its own signed URL for accessing Quinten's current vCard 4.0; there is no public profile URL.
- A signed vCard URL is unique to and valid only for its associated guest link. It is revoked when that link is manually deleted or consumed by a successful submission; it does not expire by age while the link remains active.
- After a guest submits the form, Quinten receives a notification that a form was completed.
- Quinten then opens the authorized owner page, where he can click Download to generate and download a vCard from the database record.
- Quinten is the only profile owner.
- Quinten's editable profile fields are persisted in D1. Whenever he successfully saves profile changes, Contactswap renders and stores the current vCard 4.0 so it is ready to use without extracting data from a previous download.
- Name, email, address, and birthday are required for both profiles; picture is optional.
- Guest submissions are retained for 30 days and then deleted automatically.
- Links do not expire by age; they can be manually deleted and are removed after the first successful form submission.

## 5. Proposed solution

Quinten maintains his editable profile in D1 through an owner-only interface authorized by a secret token. When he saves profile changes, Contactswap renders and stores the corresponding vCard 4.0. For each unique guest link, Contactswap also creates a signed URL that grants access to Quinten's current vCard 4.0 specifically through that link. The guest can use the link to access Quinten's card and submit their own contact information through a form.

After a successful submission, Contactswap stores the guest data in a database, sends a webhook notification to Quinten saying that a form was completed, and shows the guest a thank-you page. Quinten then opens the authorized owner page, where he can click Download to generate a vCard 4.0 from the stored guest record and download it.

The system is web-based, mobile-first, and deployed on Cloudflare Pages. vCard 4.0 is the required file format.

## 6. Core user journey

1. Quinten opens the owner-only page and sees his saved, editable contact details from D1.
2. Quinten can either edit his details or create a shareable guest link from the same page.
3. Quinten saves contact information; the editable fields persist in D1 and the corresponding vCard 4.0 is rendered and stored ready for use.
4. Quinten creates a unique guest link, with its own signed URL for his current vCard, and sends it to a friend or family member.
5. The guest opens the link, can access Quinten's vCard through its signed URL, and can submit their own contact details.
6. Contactswap stores the guest record and sends Quinten a notification that someone completed the form.
7. Quinten opens the authorized owner page and clicks Download.
8. Contactswap generates a vCard 4.0 from the stored guest data and downloads it for Quinten.
9. The link is deleted after the first successful form submission, and guest submissions are deleted after 30 days.

## 7. Features and scope

### Must have

- A single owner, Quinten, can maintain the contact details shared with guests.
- Quinten's editable contact details are persisted in D1 so they do not need to be re-entered or extracted from a downloaded vCard when he updates them.
- Quinten can edit his profile or create a shareable link from the same owner-only page protected by a secret token; a full account system is not required.
- Quinten can rotate the owner secret by updating the API Worker's Cloudflare Worker Secret; the secret must never be exposed in client-side code.
- On every successful owner-profile save, Quinten's contact information is rendered as vCard 4.0 and the current rendered vCard is stored ready for use.
- Quinten can generate a unique guest link for form submission.
- Every guest link has a distinct signed URL for accessing Quinten's current vCard 4.0; the card must not be available through a public profile URL.
- A guest can open the link, access Quinten's vCard through its signed URL, and submit their own contact details through a form.
- Guest submissions are stored in a database and used to generate a vCard 4.0 file for Quinten.
- Guest submissions and related stored files are deleted after 30 days.
- Quinten receives a webhook notification after a successful guest submission.
- Quinten can open the authorized owner page and click Download to generate a vCard from the stored guest database record.
- Shared links and their signed vCard URLs do not expire by age. Quinten can delete a link, and each link and its signed vCard URL are revoked after its first successful form submission.
- After a successful submission, the guest sees a thank-you page.
- Both owner and guest forms require name, email, address, and birthday; picture is optional.
- The app is fully web-based and deployed on Cloudflare Pages.

### Should have

- Clear owner and guest workflows designed for mobile devices.
- Simple operational maintenance that can be handled by one person without a support team.

### Out of scope for v1

- Multiple owners or guest accounts.
- Public directory or discovery features.
- Broader account, analytics, or management features beyond the personal-use flow.

## 8. Information and content

- Quinten's profile contains name, email, address, birthday, and an optional picture.
- Quinten's editable profile fields are persisted in D1 and reused without re-entering or extracting details from a downloaded vCard.
- A guest may submit the same data types: name, email, address, birthday, and an optional picture.
- Quinten's profile fields are stored in D1; a vCard 4.0 is rendered and refreshed on each successful profile save and stored ready for use as a vCard file.
- Guest-submitted fields are stored in a database and used to generate a vCard 4.0 for Quinten when needed.
- Name, email, address, and birthday are required for both owner and guest forms.
- Guest submissions and associated stored files are retained for 30 days, then automatically deleted.
- Contact details, birthdays, addresses, and pictures are personal information and should only be exposed through the intended owner flow or the signed vCard URL associated with an active guest link.
- Treat each signed vCard URL as a bearer credential scoped to its guest link; do not expose it outside that sharing flow or include its signature in logs.
- Before release, vCard import behavior should be validated on current iOS and Android contact apps; support may vary by device and app.

## 9. Behavior and edge cases

- The guest must be able to submit their contact details through the guest link.
- Required fields must be validated before accepting a guest submission.
- The same link is single-use; the first successful form submission consumes it.
- Each active guest link's signed URL grants access only to Quinten's vCard for that link; deleting or consuming the guest link revokes its signed URL.
- Incomplete profiles, invalid submissions, failed downloads, duplicate submissions, and service errors should show clear user-facing feedback and safe fallback behavior.
- A successful owner-profile save updates the D1 fields and the rendered vCard together; failed saves must not leave the current vCard out of sync with the saved profile.
- The thank-you page appears after a successful guest submission.
- Guest submissions are deleted automatically after 30 days.
- Quinten receives a webhook notification after a successful form submission. The notification should be a simple summary and should not include guest contact details unless explicitly approved.
- Quinten must be able to open the authorized owner page and generate/download the vCard from the saved database record.

## 10. Platform and integrations

- The application is entirely web-based and deployable on Cloudflare Pages.
- The product is mobile-first, with desktop and tablet support as secondary goals.
- The product targets current mobile browsers, especially Safari on iPhone and Chrome on Android.
- Quinten accesses the owner-only profile-management page using a secret token; no full account system is included.
- The owner secret is stored as a Cloudflare Worker Secret on the API Worker and never exposed to the browser.
- Signed vCard URLs are generated and validated server-side and are scoped to their associated guest link.
- Guest submissions are stored in a database compatible with Cloudflare Pages; Cloudflare D1 is the default choice.
- Webhook credentials are configured as Cloudflare Worker Secrets on the API Worker, with Discord as the initial example destination.
- vCard 4.0 is the required storage and contact-file format.

## 11. Design and accessibility

- All flows should be designed for mobile interaction and touch-first usage.
- Keep the visual style minimal, understandable, and straightforward.
- Use semantic HTML, visible focus states, strong contrast, and clear copy.
- The primary flows should be easy to complete on a phone without a formal accessibility compliance program.

## 12. Constraints and risks

- Contact data is personal and potentially sensitive, including address, birthday, and picture data.
- Shared links are not time-based, but they are single-use and may be manually deleted.
- Guest submissions and generated vCards must be protected and access-controlled.
- The product should stay within Cloudflare free-tier services by default unless usage demands a small paid plan.
- This is a hobby project, so the scope should remain practical, lightweight, and easy to maintain.

## 13. Success criteria

- Quinten can open the owner page and see his saved contact details.
- Quinten can either edit his own details or create a shareable guest link from the same page.
- Quinten's profile persists between visits so he does not need to re-enter it every time.
- Quinten can edit his persisted D1 profile, and each successful save leaves its current vCard 4.0 ready for use.
- A guest can complete the form successfully and sees a thank-you page.
- Quinten receives a notification when a guest submits the form.
- Quinten can open the authorized owner page and generate/download a vCard 4.0 from the stored guest data.
- Quinten can update his own profile through the secret-authorized page without a full account system.
- Guest submissions are stored in a database, generate a vCard 4.0 for Quinten, trigger a webhook notification, and are deleted after 30 days.
- Shared links can be manually deleted and are removed after the first successful form submission.
- Quinten's vCard is not publicly accessible; each guest link provides only its own revocable signed URL to the current card.
- The web app deploys successfully to Cloudflare Pages.
- The project remains simple, reliable, and easy to maintain as a personal-use tool.

## 14. Example scenarios

- Submitting details: A family member opens Quinten's guest link and submits their name, email, address, and birthday, with a picture if they choose. Contactswap stores the submission, sends Quinten a notification, and shows the thank-you page.
- Downloading for Quinten: Quinten opens the authorized owner page, clicks Download, and Contactswap generates and downloads a vCard 4.0 from the guest's stored data in the database.

## 15. Implementation guidance for the agent

- Preserve the single-owner model and the described guest flow.
- Do not expose the owner token or webhook secret to the browser.
- Keep the 30-day retention period, single-use link behavior, and required-field requirements unchanged unless explicitly revised.
- Prefer simple, reliable implementation choices over broad feature expansion.
- When a requirement is ambiguous, resolve it in favor of the final product decisions above instead of leaving it unresolved.
