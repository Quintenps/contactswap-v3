import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export type Language = "nl" | "en";

export const languageStorageKey = "contactswap-language";

const english = {
  languageSelect: "Switch language",
  languageCurrent: "Language: {language}",
  languageDutch: "Nederlands",
  languageEnglish: "English",
  languageChanged: "Switched to {language}.",
  notFoundTitle: "Can't find that page",
  notFoundDescription: "Check the link and give it another go.",
  welcomeTitle: "Swap contacts with a link",
  welcomeDescription: "Send your ContactSwap link to friends or family. They can save your details to their phone and share theirs back.",
  welcomeSaveContact: "Save contact",
  passwordPlaceholder: "Enter password",
  continue: "Open",
  loading: "One sec…",
  unauthorizedEnterToken: "That token didn't work. Check it and try again.",
  unauthorizedStorageFailure: "That token didn't work. Try again; if it keeps happening, clear this site's storage.",
  logoutStorageFailure: "You're signed out. Clear this site's storage to finish.",
  storageFailure: "{message} If it keeps happening, clear this site's storage.",
  profileLoadFailed: "Couldn't load your profile. Try again.",
  invalidProfileResponse: "Your profile data looks off. Try reloading.",
  connectionFailed: "Can't connect right now. Try again.",
  signedInTokenNotRemembered: "You're in, but this browser couldn't remember your token.",
  loggedOut: "You're signed out.",
  browserStorageUnavailable: "Browser storage isn't available. Enter your token to continue.",
  navLabel: "Owner navigation",
  profile: "My profile",
  guestLinks: "Share links",
  submissions: "New contacts",
  logOut: "Sign out",
  noProfileYet: "Let's add your contact details.",
  photoUnavailable: "Couldn't find that photo.",
  previewFailed: "Couldn't load the photo preview.",
  checkRequiredFields: "A few details need your attention.",
  invalidProfileFields: "Check the required fields, email, birthday, and phone number.",
  saveFailedChangesKept: "Couldn't save those changes. They're still here—try again.",
  saveNotConfirmed: "Couldn't confirm the save. Reload to check if it went through.",
  saved: "Changes saved.",
  chooseImage: "Choose a photo first.",
  useImageTypes: "Pick a JPEG, PNG, or WebP photo.",
  photoSaved: "Photo updated.",
  photoUploadFailed: "Couldn't upload the photo. Try again.",
  removePhotoConfirmation: "Remove your photo?",
  photoNotFoundReload: "Couldn't find that photo. Reload the page.",
  photoRemovalFailed: "Couldn't remove the photo. Try again.",
  photoRemoved: "Photo removed.",
  photo: "Photo",
  photoAdded: "Added",
  photoNone: "Not added",
  profilePhotoAlt: "Profile photo",
  uploadingPreview: "Loading photo…",
  uploading: "Uploading…",
  replacing: "Replace",
  upload: "Upload",
  removing: "Removing…",
  remove: "Remove",
  contactDetails: "My details",
  profileContactSection: "Contact information",
  profileWorkSection: "Work information",
  new: "Not set up",
  unsaved: "Not saved",
  save: "Save",
  saving: "Saving…",
  fieldName: "Full name",
  fieldEmail: "Email address",
  fieldAddress: "Address",
  fieldBirthday: "Birthday",
  fieldPhone: "Phone number",
  fieldOrg: "Organization",
  fieldTitle: "Title",
  phoneHint: "Use international format. Other country codes work too.",
  enterName: "Add your name.",
  enterEmail: "Add your email address.",
  validEmail: "That email address doesn't look right.",
  enterAddress: "Add your address.",
  enterPhone: "Add your phone number in international format, like +31600000000.",
  validPhone: "Use international E.164 format, like +31600000000.",
  enterBirthday: "Add your birthday.",
  validBirthday: "That birthday doesn't look right.",
  linksCouldNotLoad: "Couldn't load your links. Try again.",
  saveProfileBeforeLink: "Add your contact details before making a share link.",
  saveProfileBeforeLinkAction: "Add your contact details before making a link.",
  linkCreationFailed: "Couldn't make the link. Try again.",
  createdUrlCouldNotDisplay: "Something went wrong showing the new link. Check the list before making another—it might already exist.",
  linkCreatedCopyNow: "Your link's ready—copy it now. You won't be able to get this URL back later.",
  linkOverviewRefreshFailed: "Your link's ready, but the list didn't reload. You can still copy the URL.",
  guestLinkCopied: "Link copied. Send it to a friend!",
  clipboardUnavailable: "Can't copy automatically? Select and copy the link below.",
  revokeLinkConfirmation: "Delete this link? It won't work anymore, including its vCard link.",
  linkRevocationFailed: "Couldn't delete the link. Try again.",
  linkStatusUpdated: "Link deleted.",
  revocationRefreshFailed: "Link deleted, but we couldn't refresh the list.",
  revocationNotConfirmed: "Couldn't confirm the link was deleted. Refresh the list before trying again.",
  yourLinks: "Links to share",
  linksDescription: "Links don't expire. Each one works for one successful submission.",
  goToProfile: "Add your details",
  creating: "Making link…",
  generateNewLink: "Make a link",
  newGuestLink: "Your link's ready",
  guestLinkCopyDescription: "Copy and send this URL now. You won't be able to get it back later.",
  newGuestLinkUrl: "New share link",
  copyLink: "Copy link",
  overview: "All links",
  loadingLinks: "Loading your links…",
  noGuestLinks: "No links yet. Make one when you're ready to share your card.",
  created: "Made",
  linkId: "Link ID",
  active: "Active",
  consumed: "Used",
  revoked: "Revoked",
  revoking: "Deleting…",
  revoke: "Delete",
  submittedContacts: "New contacts",
  submissionsCouldNotLoad: "Couldn't load new contacts. Try again.",
  submissionUnavailable: "This contact isn't available anymore.",
  submissionUnavailableRefreshFailed: "This contact isn't available anymore, and we couldn't refresh the list.",
  cardCouldNotDownload: "Couldn't download this contact. Try again.",
  contactCardDownloaded: "Contact card downloaded.",
  cardDownloadConnectionFailed: "Couldn't download the contact card. Check your connection and try again.",
  guestSubmissions: "Contacts from friends",
  downloadEachCard: "Download a friend's contact details as a vCard.",
  loadingSubmissions: "Loading new contacts…",
  retry: "Try again",
  noGuestSubmissions: "No new contacts yet.",
  submitted: "Shared",
  downloading: "Downloading…",
  download: "Get vCard",
  dateUnavailable: "Date unknown",
  linkLoading: "Getting your link…",
  linkUnavailable: "This link isn't active",
  requestFreshLink: "Ask Quinten for a new link.",
  thanksForSharing: "Thanks for sharing!",
  detailsShared: "Your details are on their way.",
  guestDownloadPending: "Your details have been shared. Download Quinten's card to finish.",
  cardDownloadedHeading: "Card downloaded",
  cardDownloadedDescription: "This one-time link has now been used.",
  guestErrorTitle: "Oops, that didn't work",
  linkCouldNotLoad: "Couldn't load this link. Try again.",
  guestConnectionFailed: "Can't connect right now. Check your connection and try again.",
  guestCardCouldNotDownload: "Couldn't get the contact card. Try again.",
  guestCardDownloadConnectionFailed: "Couldn't download the card. Check your connection and try again.",
  checkRequiredDetails: "A few details need fixing.",
  guestPictureTypeError: "Choose a JPEG, PNG, or WebP photo.",
  guestSubmissionCouldNotConfirm: "We couldn't confirm your submission. Check the link before trying again.",
  guestSubmissionConnectionFailed: "Couldn't confirm your details went through. Check your connection and try again.",
  guestSubmissionFallback: "Couldn't send your details. Try again.",
  guestInvalidSubmission: "Check those details and try again.",
  guestPictureTooLarge: "That photo's too big. Choose a smaller one.",
  guestInvalidPicture: "Couldn't use that photo. Try another one.",
  guestCardHeading: "Here's the contact card",
  guestCardDescription: "Download the latest contact details and add them to your phone.",
  shareDetailsHeading: "Share your details and get {ownerFirstName}'s contact card",
  guestContactSection: "Your contact details",
  guestWorkSection: "Work details",
  guestPhotoPanelHeading: "Profile photo",
  guestPhotoPanelDescription: "Add a photo to share it with your contact details.",
  guestPicturePreviewAlt: "Preview of your selected profile picture",
  guestExampleName: "Alex Morgan",
  guestExampleEmail: "alex@example.com",
  guestExampleAddress: "42 Example Street, London SW1A 1AA",
  guestExampleBirthday: "1990-06-15",
  guestExamplePhone: "+447700900123",
  guestExampleOrg: "Larkspur Creative Studio",
  guestExampleTitle: "Senior Product Designer",
  guestPhoneHint: "Use international format. Other country codes work too. For example: {example}.",
  exampleWithValue: "Example: {example}",
  close: "Close",
  guestPicture: "Picture",
  optional: "optional",
  sending: "Sending…",
  shareDetails: "Share",
  downloadCard: "Download the card",
  shareMyDetails: "Share my details",
  takeDetailsWithYou: "Save the contact card",
  guestDownloadDescription: "Share your details and download the card after you submit, or download the card only.",
  preparingDownload: "Getting your download ready…",
  downloadAndShare: "Share my details, then get the card",
  downloadCardOnly: "Download the card only",
  photoNotFound: "Couldn't find the photo. Reload the page.",
  photoUseTypes: "Pick a JPEG, PNG, or WebP photo.",
  photoTooLarge: "That photo's too big. Choose a smaller one.",
  invalidPhoto: "That photo didn't work. Choose a JPEG, PNG, or WebP.",
  photoChanged: "The photo changed. Reload and try again.",
  saveProfileFirst: "Add your contact details first.",
  photoUpdateFailed: "Couldn't update the photo. Try again."
} as const;

type MessageKey = keyof typeof english;
type DutchMessages = Record<MessageKey, string>;

const dutch: DutchMessages = {
  languageSelect: "Taal kiezen",
  languageCurrent: "Taal: {language}",
  languageDutch: "Nederlands",
  languageEnglish: "English",
  languageChanged: "Taal staat nu op {language}.",
  notFoundTitle: "Deze pagina bestaat niet",
  notFoundDescription: "Check de link en probeer het nog eens.",
  welcomeTitle: "Deel contactgegevens met één link",
  welcomeDescription: "Stuur je ContactSwap-link naar vrienden of familie. Ze kunnen jouw gegevens op hun telefoon opslaan en die van hen met je delen.",
  welcomeSaveContact: "Contact opslaan",
  passwordPlaceholder: "Vul je wachtwoord in",
  continue: "Openen",
  loading: "Even laden…",
  unauthorizedEnterToken: "Deze token werkt niet. Check 'm en probeer het nog eens.",
  unauthorizedStorageFailure: "Deze token werkt niet. Probeer het nog eens. Blijft het misgaan, wis dan de opslag van deze site.",
  logoutStorageFailure: "Je bent uitgelogd. Wis de opslag van deze site om af te ronden.",
  storageFailure: "{message} Blijft het misgaan, wis dan de opslag van deze site.",
  profileLoadFailed: "Je profiel laden ging niet goed. Probeer het nog eens.",
  invalidProfileResponse: "Er klopt iets niet aan je profielgegevens. Laad de pagina opnieuw.",
  connectionFailed: "Geen verbinding. Probeer het nog eens.",
  signedInTokenNotRemembered: "Je bent binnen, maar je token kon niet in deze browser worden bewaard.",
  loggedOut: "Je bent uitgelogd.",
  browserStorageUnavailable: "Browseropslag werkt niet. Vul je token in om verder te gaan.",
  navLabel: "Hoofdnavigatie",
  profile: "Mijn profiel",
  guestLinks: "Deellinks",
  submissions: "Nieuwe contacten",
  logOut: "Uitloggen",
  noProfileYet: "Voeg eerst je contactgegevens toe.",
  photoUnavailable: "Foto niet gevonden.",
  previewFailed: "De foto-preview laden ging niet goed.",
  checkRequiredFields: "Er missen nog wat gegevens.",
  invalidProfileFields: "Check de verplichte velden, je e-mailadres, geboortedatum en telefoonnummer.",
  saveFailedChangesKept: "Opslaan lukte niet. Je wijzigingen staan er nog; probeer het nog eens.",
  saveNotConfirmed: "We konden niet checken of alles is opgeslagen. Laad de pagina opnieuw.",
  saved: "Opgeslagen!",
  chooseImage: "Kies eerst een foto.",
  useImageTypes: "Kies een JPEG-, PNG- of WebP-foto.",
  photoSaved: "Foto bijgewerkt.",
  photoUploadFailed: "Foto uploaden lukte niet. Probeer het nog eens.",
  removePhotoConfirmation: "Je foto verwijderen?",
  photoNotFoundReload: "Foto niet gevonden. Laad de pagina opnieuw.",
  photoRemovalFailed: "Foto verwijderen lukte niet. Probeer het nog eens.",
  photoRemoved: "Foto verwijderd.",
  photo: "Foto",
  photoAdded: "Toegevoegd",
  photoNone: "Niet toegevoegd",
  profilePhotoAlt: "Profielfoto",
  uploadingPreview: "Foto laden…",
  uploading: "Uploaden…",
  replacing: "Vervangen",
  upload: "Uploaden",
  removing: "Verwijderen…",
  remove: "Verwijderen",
  contactDetails: "Mijn gegevens",
  profileContactSection: "Contactgegevens",
  profileWorkSection: "Werkgegevens",
  new: "Nog niet ingevuld",
  unsaved: "Niet opgeslagen",
  save: "Opslaan",
  saving: "Opslaan…",
  fieldName: "Naam",
  fieldEmail: "E-mail",
  fieldAddress: "Adres",
  fieldBirthday: "Verjaardag",
  fieldPhone: "Telefoonnummer",
  fieldOrg: "Organisatie",
  fieldTitle: "Functietitel",
  phoneHint: "Gebruik internationaal formaat. +31 is een voorbeeld; andere landcodes zijn ook goed.",
  enterName: "Vul je naam in.",
  enterEmail: "Vul je e-mailadres in.",
  validEmail: "Dit e-mailadres lijkt niet te kloppen.",
  enterAddress: "Vul je adres in.",
  enterPhone: "Vul je telefoonnummer internationaal in, bijvoorbeeld +31600000000.",
  validPhone: "Gebruik internationaal E.164-formaat, bijvoorbeeld +31600000000.",
  enterBirthday: "Vul je geboortedatum in.",
  validBirthday: "Deze geboortedatum lijkt niet te kloppen.",
  linksCouldNotLoad: "Je links laden lukte niet. Probeer het nog eens.",
  saveProfileBeforeLink: "Vul je contactgegevens in voordat je een deellink maakt.",
  saveProfileBeforeLinkAction: "Vul je contactgegevens in voordat je een link maakt.",
  linkCreationFailed: "Link maken lukte niet. Probeer het nog eens.",
  createdUrlCouldNotDisplay: "Er ging iets mis bij het tonen van je link. Check de lijst voordat je er nog een maakt—deze bestaat misschien al.",
  linkCreatedCopyNow: "Je link is klaar. Kopieer 'm nu; later kun je deze URL niet meer ophalen.",
  linkOverviewRefreshFailed: "Je link is klaar, maar de lijst kon niet worden vernieuwd. Je kunt de URL nog wel kopiëren.",
  guestLinkCopied: "Link gekopieerd. Stuur 'm naar een vriend!",
  clipboardUnavailable: "Automatisch kopiëren lukt niet? Selecteer de link hieronder en kopieer 'm zelf.",
  revokeLinkConfirmation: "Deze link verwijderen? Daarna werken de link en de vCard-link niet meer.",
  linkRevocationFailed: "Link verwijderen lukte niet. Probeer het nog eens.",
  linkStatusUpdated: "Link verwijderd.",
  revocationRefreshFailed: "Link verwijderd, maar de lijst kon niet worden vernieuwd.",
  revocationNotConfirmed: "We konden niet checken of de link is verwijderd. Vernieuw de lijst voordat je het opnieuw probeert.",
  yourLinks: "Links om te delen",
  linksDescription: "Links verlopen niet. Elke link werkt voor één geslaagde inzending.",
  goToProfile: "Contactgegevens invullen",
  creating: "Link maken…",
  generateNewLink: "Link maken",
  newGuestLink: "Je link is klaar",
  guestLinkCopyDescription: "Kopieer en stuur deze URL nu. Later kun je 'm niet meer ophalen.",
  newGuestLinkUrl: "Nieuwe deellink",
  copyLink: "Link kopiëren",
  overview: "Alle links",
  loadingLinks: "Je links laden…",
  noGuestLinks: "Nog geen links. Maak er een als je je contactkaart wilt delen.",
  created: "Gemaakt",
  linkId: "Link-ID",
  active: "Actief",
  consumed: "Gebruikt",
  revoked: "Ingetrokken",
  revoking: "Verwijderen…",
  revoke: "Verwijderen",
  submittedContacts: "Nieuwe contacten",
  submissionsCouldNotLoad: "Nieuwe contacten laden lukte niet. Probeer het nog eens.",
  submissionUnavailable: "Dit contact is niet meer beschikbaar.",
  submissionUnavailableRefreshFailed: "Dit contact is niet meer beschikbaar en de lijst kon niet worden vernieuwd.",
  cardCouldNotDownload: "Contactkaart downloaden lukte niet. Probeer het nog eens.",
  contactCardDownloaded: "Contactkaart gedownload.",
  cardDownloadConnectionFailed: "Contactkaart downloaden lukte niet. Check je verbinding en probeer het nog eens.",
  guestSubmissions: "Contacten van vrienden",
  downloadEachCard: "Download de contactgegevens van een vriend als vCard.",
  loadingSubmissions: "Nieuwe contacten laden…",
  retry: "Nog eens proberen",
  noGuestSubmissions: "Nog geen nieuwe contacten.",
  submitted: "Gedeeld",
  downloading: "Downloaden…",
  download: "vCard ophalen",
  dateUnavailable: "Datum onbekend",
  linkLoading: "Je link ophalen…",
  linkUnavailable: "Deze link is niet actief",
  requestFreshLink: "Vraag Quinten om een nieuwe link.",
  thanksForSharing: "Bedankt voor het delen!",
  detailsShared: "Gelukt! Je gegevens zijn gedeeld.",
  guestDownloadPending: "Je gegevens zijn gedeeld. Download Quinten's contactkaart om af te ronden.",
  cardDownloadedHeading: "Contactkaart gedownload",
  cardDownloadedDescription: "Deze eenmalige link is nu gebruikt.",
  guestErrorTitle: "Oeps, dat ging niet goed",
  linkCouldNotLoad: "Deze link laden lukte niet. Probeer het nog eens.",
  guestConnectionFailed: "Geen verbinding. Check je verbinding en probeer het nog eens.",
  guestCardCouldNotDownload: "Contactkaart ophalen lukte niet. Probeer het nog eens.",
  guestCardDownloadConnectionFailed: "Kaart downloaden lukte niet. Check je verbinding en probeer het nog eens.",
  checkRequiredDetails: "Er missen nog wat gegevens.",
  guestPictureTypeError: "Kies een JPEG-, PNG- of WebP-foto.",
  guestSubmissionCouldNotConfirm: "We konden je inzending niet bevestigen. Check de link voordat je het opnieuw probeert.",
  guestSubmissionConnectionFailed: "We konden niet checken of je gegevens zijn verstuurd. Check je verbinding en probeer het nog eens.",
  guestSubmissionFallback: "Je gegevens versturen lukte niet. Probeer het nog eens.",
  guestInvalidSubmission: "Check je gegevens en probeer het nog eens.",
  guestPictureTooLarge: "Deze foto is te groot. Kies een kleinere.",
  guestInvalidPicture: "Deze foto werkt niet. Probeer een andere.",
  guestCardHeading: "Hier is de contactkaart",
  guestCardDescription: "Download de nieuwste contactgegevens en zet ze in je telefoon.",
  shareDetailsHeading: "Deel je gegevens en ontvang de contactkaart van {ownerFirstName}",
  guestContactSection: "Je contactgegevens",
  guestWorkSection: "Werkgegevens",
  guestPhotoPanelHeading: "Profielfoto",
  guestPhotoPanelDescription: "Voeg een foto toe om samen met je contactgegevens te delen.",
  guestPicturePreviewAlt: "Voorbeeld van je gekozen profielfoto",
  guestExampleName: "Lotte de Vries",
  guestExampleEmail: "lotte.devries@gmail.com",
  guestExampleAddress: "Kerkstraat 12, 1015 AB Amsterdam",
  guestExampleBirthday: "1990-06-15",
  guestExamplePhone: "+31612345678",
  guestExampleOrg: "Albert Heijn",
  guestExampleTitle: "Vakkenvuller",
  guestPhoneHint: "Gebruik internationaal formaat. +31 is een voorbeeld; andere landcodes zijn ook goed. Bijvoorbeeld: {example}.",
  exampleWithValue: "Bijvoorbeeld: {example}",
  close: "Sluiten",
  guestPicture: "Foto",
  optional: "optioneel",
  sending: "Verzenden…",
  shareDetails: "Delen",
  downloadCard: "Contactkaart downloaden",
  shareMyDetails: "Mijn gegevens delen",
  takeDetailsWithYou: "De contactkaart opslaan",
  guestDownloadDescription: "Deel je gegevens en download daarna de contactkaart, of download alleen de kaart.",
  preparingDownload: "Download klaarmaken…",
  downloadAndShare: "Mijn gegevens delen en daarna de kaart ophalen",
  downloadCardOnly: "Alleen kaart downloaden",
  photoNotFound: "Foto niet gevonden. Laad de pagina opnieuw.",
  photoUseTypes: "Kies een JPEG-, PNG- of WebP-foto.",
  photoTooLarge: "Deze foto is te groot. Kies een kleinere.",
  invalidPhoto: "Deze foto werkt niet. Kies een JPEG, PNG of WebP.",
  photoChanged: "De foto is gewijzigd. Laad de pagina opnieuw en probeer het nog eens.",
  saveProfileFirst: "Vul eerst je contactgegevens in.",
  photoUpdateFailed: "Foto bijwerken lukte niet. Probeer het nog eens."
};

export function translate(
  language: Language,
  key: MessageKey,
  values?: Record<string, string>
): string {
  let message = (language === "nl" ? dutch : english)[key];
  if (values) {
    for (const [name, value] of Object.entries(values)) {
      message = message.split(`{${name}}`).join(value);
    }
  }
  return message;
}

type LanguageContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: MessageKey, values?: Record<string, string>) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function readLanguage(): Language {
  try {
    const saved = window.localStorage.getItem(languageStorageKey);
    return saved === "nl" || saved === "en" ? saved : "nl";
  } catch {
    return "nl";
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(readLanguage);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  function setLanguage(nextLanguage: Language) {
    setLanguageState(nextLanguage);
    try {
      window.localStorage.setItem(languageStorageKey, nextLanguage);
    } catch {
      // The language still changes for this visit when browser storage is unavailable.
    }
  }

  const value: LanguageContextValue = {
    language,
    setLanguage,
    t: (key, values) => translate(language, key, values)
  };

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("Language context is unavailable.");
  return context;
}

export function LanguageSwitcher() {
  const { language, setLanguage, t } = useLanguage();
  const [announcement, setAnnouncement] = useState<Language | null>(null);
  const [open, setOpen] = useState(false);
  const control = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function closeWhenClickedOutside(event: PointerEvent) {
      if (event.target instanceof Node && !control.current?.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", closeWhenClickedOutside);
    return () => document.removeEventListener("pointerdown", closeWhenClickedOutside);
  }, [open]);

  function handleChange(nextLanguage: Language) {
    setLanguage(nextLanguage);
    setAnnouncement(nextLanguage);
    setOpen(false);
    trigger.current?.focus();
  }

  return (
    <div
      className="language-control"
      ref={control}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          setOpen(false);
          trigger.current?.focus();
        }
      }}
      onBlur={(event) => {
        if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
        }
      }}
    >
      <button
        id="contactswap-language-toggle"
        className="language-trigger"
        type="button"
        ref={trigger}
        data-language={language}
        aria-label={t("languageCurrent", {
          language: t(language === "nl" ? "languageDutch" : "languageEnglish")
        })}
        aria-expanded={open}
        aria-controls="contactswap-language-menu"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="language-flag" aria-hidden="true">{language === "nl" ? "🇳🇱" : "🇬🇧"}</span>
        <span>{language.toUpperCase()}</span>
        <svg className="language-chevron" viewBox="0 0 12 12" aria-hidden="true">
          <path d="m3 4.5 3 3 3-3" />
        </svg>
      </button>
      {open && (
        <div className="language-menu" id="contactswap-language-menu" role="group" aria-label={t("languageSelect")}>
          <button
            className="language-option"
            type="button"
            data-language="nl"
            aria-pressed={language === "nl"}
            onClick={() => handleChange("nl")}
          >
            <span className="language-flag" aria-hidden="true">🇳🇱</span>
            <span>{t("languageDutch")}</span>
          </button>
          <button
            className="language-option"
            type="button"
            data-language="en"
            aria-pressed={language === "en"}
            onClick={() => handleChange("en")}
          >
            <span className="language-flag" aria-hidden="true">🇬🇧</span>
            <span>{t("languageEnglish")}</span>
          </button>
        </div>
      )}
      <span className="visually-hidden" role="status" aria-live="polite">
        {announcement
          ? t("languageChanged", { language: t(announcement === "nl" ? "languageDutch" : "languageEnglish") })
          : ""}
      </span>
    </div>
  );
}

export function formatDateTime(value: string, language: Language, fallback: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) return fallback;
  const locale = language === "nl" ? "nl-NL" : "en";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export type { MessageKey };
