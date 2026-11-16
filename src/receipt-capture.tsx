import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Camera, Upload } from "lucide-react";
import { Button, ErrorBox } from "./ui";
import { prepareReceiptInput } from "./receipt-image";

/** Keep capture in the browser, including phones that cannot open a native camera picker. */
export function ReceiptCapture({ onPhoto, disabled, onPreparingChange }: { onPhoto: (photo: File) => void; disabled?: boolean; onPreparingChange?: (preparing: boolean) => void }) {
  const upload = useRef<HTMLInputElement>(null);
  const nativeCamera = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | undefined>(undefined);
  const request = useRef(0);
  const [camera, setCamera] = useState(false);
  const [ready, setReady] = useState(false);
  const [opening, setOpening] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState("");
  const stop = () => {
    request.current++;
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = undefined;
    if (video.current) video.current.srcObject = null;
    setCamera(false); setReady(false); setOpening(false); setPreparing(false); onPreparingChange?.(false);
  };
  useEffect(() => () => { request.current++; stream.current?.getTracks().forEach(track => track.stop()); onPreparingChange?.(false); }, [onPreparingChange]);
  useEffect(() => {
    const hidden = () => { if (document.hidden) stop(); };
    document.addEventListener("visibilitychange", hidden);
    return () => document.removeEventListener("visibilitychange", hidden);
  }, []);
  const selected = async (input: HTMLInputElement) => {
    const file = input.files?.[0]; input.value = "";
    if (!file) return;
    stop(); setError(""); setPreparing(true); onPreparingChange?.(true);
    const current = request.current;
    try {
      const photo = await prepareReceiptInput(file);
      if (current === request.current) onPhoto(photo);
    } catch (issue) {
      if (current === request.current) setError(issue instanceof Error ? issue.message : "Could not prepare this photo. Try another image.");
    } finally { if (current === request.current) { setPreparing(false); onPreparingChange?.(false); } }
  };
  const openCamera = async () => {
    if (disabled || opening || camera || preparing) return;
    // Do not leave an older video track alive when starting a new capture session.
    stream.current?.getTracks().forEach(track => track.stop()); stream.current = undefined;
    setReady(false); setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      nativeCamera.current?.click(); return;
    }
    const current = ++request.current;
    // Mount the inline video before requesting media, even if permission was
    // already granted and getUserMedia resolves before React's next commit.
    flushSync(() => { setOpening(true); setCamera(true); });
    const timeout = window.setTimeout(() => {
      if (current !== request.current) return;
      stop(); setError("The camera did not start. Check camera access in your browser, then try again or upload a receipt photo.");
    }, 20_000);
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
      if (current !== request.current) { media.getTracks().forEach(track => track.stop()); return; }
      stream.current = media;
      const preview = video.current;
      if (!preview) throw new Error("Camera preview is unavailable.");
      // Explicit properties keep iPhone playback inline and silent.
      preview.muted = true; preview.playsInline = true;
      preview.srcObject = media;
      await preview.play();
      if (current !== request.current) return;
      setReady(preview.videoWidth > 0 && preview.videoHeight > 0); setOpening(false);
    } catch (issue) {
      if (current !== request.current) return;
      stop();
      setError(issue instanceof DOMException && issue.name === "NotAllowedError"
        ? "Camera access was declined. Allow it in your browser, or upload a receipt photo."
        : "The camera could not open. Upload a receipt photo instead.");
    } finally { window.clearTimeout(timeout); }
  };
  const capture = () => {
    const source = video.current;
    if (!source?.videoWidth || !source.videoHeight) return;
    const canvas = document.createElement("canvas");
    canvas.width = source.videoWidth; canvas.height = source.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) { setError("Could not take the photo. Upload a receipt photo instead."); return; }
    context.drawImage(source, 0, 0);
    const current = request.current;
    canvas.toBlob(blob => {
      if (current !== request.current) return;
      if (!blob) { setError("Could not take the photo. Try again."); return; }
      stop(); onPhoto(new File([blob], "receipt.jpg", { type: "image/jpeg" }));
    }, "image/jpeg", .92);
  };
  return <section className="receipt-capture" aria-label="Receipt photo">
    <div className="receipt-capture-actions">
      <Button variant="outline" disabled={disabled || opening || camera || preparing} onClick={() => void openCamera()}><Camera size={17}/>Take photo</Button>
      <Button variant="outline" disabled={disabled || preparing} onClick={() => upload.current?.click()}><Upload size={17}/>Upload receipt</Button>
    </div>
    <input hidden ref={upload} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Upload receipt image" onChange={event => void selected(event.currentTarget)}/>
    <input hidden ref={nativeCamera} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" aria-label="Take receipt photo" onChange={event => void selected(event.currentTarget)}/>
    {preparing && <p role="status">Preparing photo…</p>}
    {camera && <div className="receipt-camera">
      <video ref={video} autoPlay playsInline muted aria-label="Receipt camera preview"/>
      <p>{opening ? "Opening camera…" : "Keep the whole receipt in view, with clear light and no glare."}</p>
      <div className="row"><Button disabled={!ready} onClick={capture}>Capture receipt</Button><Button variant="text" onClick={stop}>Close camera</Button></div>
    </div>}
    <ErrorBox text={error}/>
  </section>;
}
