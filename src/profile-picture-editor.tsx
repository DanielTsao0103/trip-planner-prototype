import { useId, useRef, useState } from "react";
import { Camera, Trash2 } from "lucide-react";
import { useApp } from "./state";
import { Button, ErrorBox } from "./ui";

/** Upload or remove the signed-in account's profile picture (real accounts only). */
export function ProfilePictureEditor() {
  const { picture, user, s } = useApp();
  const input = useRef<HTMLInputElement>(null);
  const formatHintId = useId();
  const [retryFile, setRetryFile] = useState<File | null>(null);
  // Sample travelers and Maya's standalone demo are not accounts, so they cannot have a picture.
  const editable = Boolean(user) && user!.id === s.userId && !user!.id.startsWith("demo-") && user!.id !== "maya";
  if (!editable) return null;
  const hint =
    picture.source === "custom"
      ? "Your uploaded photo."
      : picture.source === "google"
        ? "Showing your Google photo until you upload one."
        : "Showing your initials until you upload a photo.";
  return (
    <div className="picture-editor">
      <div>
        <p className="picture-hint" role="status">
          {picture.busy ? "Updating your photo…" : hint}
        </p>
        <div className="picture-actions">
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            aria-label="Choose a profile picture"
            aria-describedby={formatHintId}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) { setRetryFile(file); void picture.upload(file); }
            }}
          />
          <Button
            variant="outline small"
            disabled={picture.busy}
            onClick={() => input.current?.click()}
            aria-describedby={formatHintId}
          >
            <Camera size={15} /> {picture.source === "custom" ? "Change photo" : "Upload photo"}
          </Button>
          {picture.source === "custom" && (
            <Button
              variant="outline small"
              disabled={picture.busy}
              onClick={() => { setRetryFile(null); void picture.remove(); }}
            >
              <Trash2 size={15} /> Remove
            </Button>
          )}
        </div>
        <p className="picture-hint" id={formatHintId}>JPEG, PNG or WebP · up to 10 MB.</p>
      </div>
      <ErrorBox text={picture.error} />
      {picture.error && retryFile && /(?:upload|save).*picture/.test(picture.error) && <Button variant="outline small" disabled={picture.busy} onClick={() => void picture.upload(retryFile)}>Retry photo upload</Button>}
    </div>
  );
}
