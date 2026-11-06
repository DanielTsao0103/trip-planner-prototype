import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabase } from "./supabase";
import {
  PROFILE_PICTURE_BUCKET,
  PROFILE_PICTURE_SIZE,
  centerSquare,
  companionPictureMap,
  isGooglePhotoUrl,
  isOwnPicturePath,
  pictureFileError,
  pictureObjectPath,
  resolvePicture,
  type PictureSource,
} from "./profile-picture";

export type ProfilePicture = {
  url?: string;
  source: PictureSource;
  busy: boolean;
  error: string;
  upload: (file: File) => Promise<void>;
  remove: () => Promise<void>;
};

const publicUrl = (path: string) =>
  getSupabase().storage.from(PROFILE_PICTURE_BUCKET).getPublicUrl(path).data.publicUrl;

/** Shrink to a centered square so uploads are tiny, uniform, and free of camera metadata. */
async function squarePicture(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("That image could not be read. Try a different one.");
  }
  try {
    const crop = centerSquare(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = PROFILE_PICTURE_SIZE;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser could not prepare the picture.");
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, crop.x, crop.y, crop.size, crop.size, 0, 0, PROFILE_PICTURE_SIZE, PROFILE_PICTURE_SIZE);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.88));
    if (!blob) throw new Error("Your browser could not prepare the picture.");
    return blob;
  } finally {
    bitmap.close();
  }
}

/**
 * The signed-in account's picture: an uploaded one wins, then the Google photo, then initials.
 * Demo sessions (cloud = false) never touch the database and always show initials.
 */
export function useProfilePicture(cloud: boolean, userId: string, googleUrl?: string): ProfilePicture {
  const [path, setPathState] = useState<string | null>(null);
  const pathRef = useRef<string | null>(null);
  const setPath = (next: string | null) => {
    pathRef.current = next;
    setPathState(next);
  };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (!cloud) return;
    let active = true;
    void getSupabase()
      .from("user")
      .select("profile_picture_path,google_picture_url")
      .eq("userID", userId)
      .maybeSingle()
      .then(({ data, error: failure }) => {
        // A failed read (for example before the migration is applied) just keeps the fallback photo.
        if (!active || failure) return;
        const saved = data?.profile_picture_path;
        setPath(isOwnPicturePath(userId, saved) ? saved : null);
        // Share the Google photo with trip companions: record it once, and again if it changes.
        const stored = data?.google_picture_url ?? null;
        if (googleUrl && isGooglePhotoUrl(googleUrl) && stored !== googleUrl)
          // Query builders only send once awaited or chained, so a bare `void` would do nothing.
          void getSupabase()
            .rpc("set_google_picture", { p_url: googleUrl })
            .then(() => undefined);
      });
    return () => {
      active = false;
    };
  }, [cloud, userId, googleUrl]);

  const removeObject = (old: string | null) => {
    if (old && isOwnPicturePath(userId, old))
      void getSupabase().storage.from(PROFILE_PICTURE_BUCKET).remove([old]);
  };

  const upload = useCallback(
    async (file: File) => {
      if (!cloud) return;
      const problem = pictureFileError(file);
      if (problem) {
        setError(problem);
        return;
      }
      setBusy(true);
      setError("");
      const client = getSupabase();
      let uploaded = "";
      try {
        const blob = await squarePicture(file);
        const next = pictureObjectPath(userId, crypto.randomUUID(), blob.type);
        const stored = await client.storage
          .from(PROFILE_PICTURE_BUCKET)
          .upload(next, blob, { contentType: blob.type, upsert: false });
        if (stored.error) throw new Error("Could not upload the picture. Please try again.");
        uploaded = next;
        const saved = await client.rpc("set_profile_picture", { p_path: next });
        if (saved.error) throw new Error("Could not save the picture to your account. Please try again.");
        if (!alive.current) return;
        removeObject(pathRef.current);
        setPath(next);
      } catch (failure) {
        removeObject(uploaded || null);
        if (alive.current)
          setError(failure instanceof Error ? failure.message : "Could not update the picture.");
      } finally {
        if (alive.current) setBusy(false);
      }
    },
    [cloud, userId],
  );

  const remove = useCallback(async () => {
    if (!cloud) return;
    setBusy(true);
    setError("");
    try {
      const saved = await getSupabase().rpc("set_profile_picture", { p_path: null });
      if (saved.error) throw new Error("Could not remove the picture. Please try again.");
      if (!alive.current) return;
      removeObject(pathRef.current);
      setPath(null);
    } catch (failure) {
      if (alive.current)
        setError(failure instanceof Error ? failure.message : "Could not remove the picture.");
    } finally {
      if (alive.current) setBusy(false);
    }
  }, [cloud, userId]);

  const resolved = cloud
    ? resolvePicture(path ? publicUrl(path) : undefined, googleUrl)
    : { source: "initials" as PictureSource };
  return { ...resolved, busy, error, upload, remove };
}

/**
 * Pictures of the people who share a trip with this account (owners and accepted travelers only;
 * the database decides who is visible). Refreshes on focus and every minute so a newly accepted
 * traveler appears without a reload. Failures keep what is already shown.
 */
export function useCompanionPictures(cloud: boolean): Map<string, string> {
  const [pictures, setPictures] = useState<Map<string, string>>(() => new Map());
  useEffect(() => {
    if (!cloud) return;
    let active = true;
    const load = () => {
      void getSupabase()
        .rpc("trip_companion_pictures")
        .then(({ data, error: failure }) => {
          if (active && !failure) setPictures(companionPictureMap(data, publicUrl));
        });
    };
    load();
    const timer = window.setInterval(load, 60_000);
    window.addEventListener("focus", load);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  }, [cloud]);
  return pictures;
}
