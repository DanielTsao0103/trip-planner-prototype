import { parseReceiptDocument, normalizeReceiptDocument, receiptCents, type ReceiptScanResult } from "./receipt-items";
import { getSupabase } from "./supabase";
import workerPath from "tesseract.js/dist/worker.min.js?url";
import type { Worker } from "tesseract.js";

export const receiptSource = "Receipt photo";
const bucket = () => getSupabase().storage.from("expense-receipts");

export function receiptPath(accountId: string, tripId: string, expenseId: string) {
  return `${accountId}/${tripId}/${expenseId}`;
}

export async function uploadReceipt(path: string, photo: File) {
  const { error } = await bucket().upload(path, photo, { upsert: false });
  if (!error) return;
  // A lost upload response may leave the exact photo in place. Verify bytes
  // without overwriting any object or broadening existing Storage permissions.
  const existing = await bucket().download(path);
  if (!existing.error && existing.data) {
    const [saved, selected] = await Promise.all([existing.data.arrayBuffer(), photo.arrayBuffer()]);
    const a = new Uint8Array(saved), b = new Uint8Array(selected);
    if (a.length === b.length && a.every((value,index) => value === b[index])) return;
  }
  throw new Error("Could not attach the receipt. Try again or save without the photo.");
}

export async function readReceipt(path: string) {
  const { data, error } = await bucket().download(path, {}, { cache: "no-store" });
  if (error) throw new Error("Could not open the receipt.");
  return data;
}

export async function removeReceipt(path: string) {
  const { error } = await bucket().remove([path]);
  if (error) throw new Error("The expense was deleted, but its receipt photo could not be removed. Try deleting the receipt again.");
}

async function prepareReceiptImage(photo: File) {
  const bitmap = await createImageBitmap(photo, { imageOrientation: "from-image" });
  try {
    // Preserve small type on long receipts while bounding phone memory use.
    const scale = Math.min(2, 4096 / Math.max(bitmap.width, bitmap.height), Math.sqrt(8000000 / (bitmap.width * bitmap.height)));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return photo;
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.filter = "grayscale(1) contrast(1.15)";
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally { bitmap.close(); }
}

export type ReceiptScanOptions = { signal?: AbortSignal; onProgress?: (progress: number, status: string) => void };

/** Cloud recognition is optional. Every account can fall back to on-device OCR;
 * no result is saved until the traveler reviews it in the expense form. */
export async function scanReceiptPhoto(photo: File, useVision = false, totalPosition?: number, options: ReceiptScanOptions = {}): Promise<ReceiptScanResult> {
  if (options.signal?.aborted) throw new DOMException("Receipt reading cancelled.", "AbortError");
  if (!["image/jpeg", "image/png", "image/webp"].includes(photo.type) || !photo.size || photo.size > 10 * 1024 * 1024) throw new Error("Choose a JPEG, PNG or WebP receipt photo under 10 MB.");
  let cloudUnavailable = false;
  if (useVision && totalPosition === undefined) {
    options.onProgress?.(0, "Reading receipt");
    try {
      const { data, error } = await getSupabase().functions.invoke<ReceiptScanResult>("read-receipt", {
        body: photo, headers: { "Content-Type": photo.type }, signal: options.signal,
      });
      if (options.signal?.aborted) throw new DOMException("Receipt reading cancelled.", "AbortError");
      // Older deployments provide only a total. Use OCR until item extraction is available.
      if (!error && data && Array.isArray(data.items) && data.items.length) return normalizeReceiptDocument(data, "vision");
      cloudUnavailable = !!error && error.context?.status !== 403;
    } catch (error) {
      if (options.signal?.aborted) throw error;
      cloudUnavailable = true;
    }
  }
  const { createWorker, PSM } = await import("tesseract.js");
  let worker: Worker | undefined, ended = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  const recognize = async () => {
    const instance = await createWorker("eng", 1, {
      workerPath, workerBlobURL: false,
      logger: progress => options.onProgress?.(Math.max(0, Math.min(1, progress.progress || 0)), progress.status === "recognizing text" ? "Reading receipt" : "Preparing scanner"),
    });
    if (ended) { await instance.terminate(); throw new DOMException("Receipt reading cancelled.", "AbortError"); }
    worker = instance;
    const image = await prepareReceiptImage(photo).catch(() => photo);
    if (totalPosition !== undefined) {
      if (image instanceof File || !Number.isFinite(totalPosition) || totalPosition < 0 || totalPosition > 1) throw new Error("Could not crop the receipt.");
      const height = Math.min(image.height, Math.max(18, Math.round(image.height * 0.06)));
      const top = Math.min(image.height - height, Math.max(0, Math.round(totalPosition * image.height - height / 2)));
      await instance.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE });
      const { data } = await instance.recognize(image, { rectangle: { left: 0, top, width: image.width, height } });
      const result = parseReceiptDocument(data.text, data.confidence);
      const amount = receiptCents(data.text.trim());
      return amount !== null ? normalizeReceiptDocument({ ...result, totalCents: amount }) : result;
    }
    const { data } = await instance.recognize(image, { rotateAuto: true });
    let result = parseReceiptDocument(data.text, data.confidence);
    // A second layout pass can recover sparse receipts; never merge item lists
    // from two OCR passes, which would silently duplicate purchased items.
    if ((!result.items.length || !result.totalCents || data.confidence < 65) && !ended) {
      await instance.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
      const alternateData = (await instance.recognize(image)).data;
      const alternate = parseReceiptDocument(alternateData.text, alternateData.confidence);
      const conflicting = result.totalCents !== null && alternate.totalCents !== null && result.totalCents !== alternate.totalCents;
      const rank = (value: ReceiptScanResult) => (value.reconciliation.matches === true ? 1000 : 0) + (value.items.length ? 100 : 0) + (value.totalCents ? 50 : 0) + (value.confidence || 0);
      if (rank(alternate) > rank(result)) result = alternate;
      if (conflicting) result = normalizeReceiptDocument({ ...result, needsManualAmount: true, warnings: [...result.warnings, "Two readings disagree on the final total. Confirm it from the receipt."] });
    }
    if (cloudUnavailable && !result.items.length) result.warnings.push("Some receipt details could not be read automatically. Check the photo and enter missing items.");
    return result;
  };
  try {
    return await Promise.race([
      recognize(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Receipt reading took too long. Try a clearer photo or enter the details manually.")), 45000);
        abort = () => reject(new DOMException("Receipt reading cancelled.", "AbortError"));
        options.signal?.addEventListener("abort", abort, { once: true });
        if (options.signal?.aborted) abort();
      }),
    ]);
  } finally {
    ended = true;
    clearTimeout(timer);
    if (abort) options.signal?.removeEventListener("abort", abort);
    await worker?.terminate().catch(() => undefined);
  }
}
