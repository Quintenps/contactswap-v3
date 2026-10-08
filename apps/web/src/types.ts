export type ProfileFields = {
  name: string;
  email: string;
  address: string;
  birthday: string;
  phone: string;
  org: string;
  title: string;
};

export type Profile = Omit<ProfileFields, "org" | "title"> & {
  org: string | null;
  title: string | null;
  hasPhoto: boolean;
};
export type FieldName = keyof ProfileFields;
export type LinkStatus = "active" | "consumed" | "revoked";
export type GuestLink = { id: string; createdAt: string; status: LinkStatus };
export type OwnerSubmission = { id: string; name: string; createdAt: string; expiresAt: string };
export type GuestPageState =
  | "loading"
  | "error"
  | "ready"
  | "submitted"
  | "downloaded"
  | "unavailable"
  | "thank-you";
export type GuestLinkResolution = {
  ownerName: string;
  profilePhotoUrl: string | null;
  vcardUrl: string;
  submissionComplete: boolean;
};
