export type OwnerProfile = {
  name: string;
  email: string;
  address: string;
  birthday: string;
  phone: string;
  org: string | null;
  title: string | null;
};

export type StoredOwnerProfile = OwnerProfile & { photo_key: string | null };
export type GuestSubmission = OwnerProfile;
export type StoredGuestSubmission = GuestSubmission & { photo_key: string | null };
export type NotificationJob = { id: string; attempts: number };
