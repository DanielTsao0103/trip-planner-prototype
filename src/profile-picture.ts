/** Pure profile-picture rules. Kept free of React and Supabase imports so node can unit test them. */

export const PROFILE_PICTURE_BUCKET = "profile-pictures";
export const PROFILE_PICTURE_INPUT_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const PROFILE_PICTURE_MAX_INPUT_BYTES = 10 * 1024 * 1024;
export const PROFILE_PICTURE_SIZE = 256;

export type PictureSource = "custom" | "google" | "initials";

type AuthLike = {
  identities?: { provider?: string; identity_data?: Record<string, unknown> | null }[] | null;
  app_metadata?: Record<string, unknown> | null;
  user_metadata?: Record<string, unknown> | null;
};

function httpsUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 2048) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** The Google account photo, or undefined for anyone who did not sign in with Google. */
export function googlePictureOf(user: AuthLike | null | undefined): string | undefined {
  if (!user) return undefined;
  const identity = user.identities?.find((i) => i.provider === "google");
  const providers = user.app_metadata?.providers;
  const usesGoogle =
    Boolean(identity) ||
    user.app_metadata?.provider === "google" ||
    (Array.isArray(providers) && providers.includes("google"));
  if (!usesGoogle) return undefined;
  const sources = [identity?.identity_data, user.user_metadata];
  for (const data of sources)
    for (const key of ["avatar_url", "picture"]) {
      const url = httpsUrl(data?.[key]);
      if (url) return url;
    }
  return undefined;
}

/** Uploaded picture first, then the Google photo, then initials (no url). */
export function resolvePicture(custom?: string | null, google?: string | null): { url?: string; source: PictureSource } {
  if (custom) return { url: custom, source: "custom" };
  if (google) return { url: google, source: "google" };
  return { source: "initials" };
}

const OBJECT_PATH = /^([0-9a-f-]{36})\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg|png)$/;

/** True only for a path inside this account's own folder, matching the database constraint. */
export function isOwnPicturePath(userId: string, path: unknown): path is string {
  if (typeof path !== "string") return false;
  const match = OBJECT_PATH.exec(path);
  return Boolean(match) && match![1] === userId;
}

export function pictureObjectPath(userId: string, id: string, mime: string): string {
  const extension = mime === "image/png" ? "png" : mime === "image/jpeg" ? "jpg" : "webp";
  return `${userId}/${id}.${extension}`;
}

/** Why a chosen file cannot be used, or an empty string when it is fine. */
export function pictureFileError(file: { type: string; size: number }): string {
  if (!PROFILE_PICTURE_INPUT_TYPES.includes(file.type)) return "Choose a JPEG, PNG, or WebP image.";
  if (file.size > PROFILE_PICTURE_MAX_INPUT_BYTES) return "Choose an image under 10 MB.";
  if (file.size === 0) return "That file is empty. Choose another image.";
  return "";
}

/** The largest centered square inside a width by height image. */
export function centerSquare(width: number, height: number): { x: number; y: number; size: number } {
  const size = Math.min(width, height);
  return { x: Math.floor((width - size) / 2), y: Math.floor((height - size) / 2), size };
}

const GOOGLE_PHOTO_HOST = /^https:\/\/[a-z0-9-]+\.googleusercontent\.com\/[^\s]+$/;

/** True only for photo links on Google's own image hosts, matching the database constraint. */
export function isGooglePhotoUrl(value: unknown): value is string {
  return typeof value === "string" && value.length <= 2048 && GOOGLE_PHOTO_HOST.test(value);
}

export type CompanionPictureRow = { account_id?: unknown; picture_path?: unknown; google_url?: unknown };

/**
 * Picture links for the people who share a trip with the signed-in account, keyed by account id.
 * Every row is re-checked here, so a bad row can never point an avatar at an unexpected place.
 */
export function companionPictureMap(
  rows: unknown,
  publicUrl: (path: string) => string,
): Map<string, string> {
  const map = new Map<string, string>();
  if (!Array.isArray(rows)) return map;
  for (const row of rows as CompanionPictureRow[]) {
    const id = typeof row?.account_id === "string" ? row.account_id : "";
    if (!id) continue;
    if (isOwnPicturePath(id, row.picture_path)) map.set(id, publicUrl(row.picture_path));
    else if (isGooglePhotoUrl(row.google_url)) map.set(id, row.google_url);
  }
  return map;
}

export function initialsOf(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");
}
