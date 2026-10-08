export type OwnerProfile = {
  firstName: string;
  lastName: string;
  email: string;
  street: string;
  city: string;
  postalCode: string;
  country: string;
  birthday: string;
  phone: string;
  org: string | null;
  title: string | null;
};

export type StoredOwnerProfile = OwnerProfile & { photo_key: string | null };
export type GuestSubmission = OwnerProfile;
export type StoredGuestSubmission = GuestSubmission & { photo_key: string | null };
export type NotificationJob = { id: string; attempts: number };
