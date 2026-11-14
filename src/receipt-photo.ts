import { parseReceiptFields } from "./receipt-fields";
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
  if (error) throw new Error("Could not attach the receipt. Try again or save without the photo.");
}

export async function readReceipt(path: string) {
  const { data, error } = await bucket().download(path, {}, { cache: "no-store" });
  if (error) throw new Error("Could not open the receipt.");
  return data;
}

export async function removeReceipt(path: string) {
  await bucket().remove([path]);
}

async function prepareReceiptImage(photo: File) {
  const bitmap = await createImageBitmap(photo);
  try {
    const scale = Math.min(2, 2400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return photo;

    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.filter = "grayscale(1) contrast(1.45)";
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    bitmap.close();
  }
}

export async function scanReceiptPhoto(photo: File) {
  const { createWorker, PSM } = await import("tesseract.js");
  let worker: Worker | undefined;
  let ended = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const recognize = async () => {
    const instance = await createWorker("eng", 1, {
      workerPath, workerBlobURL: false, errorHandler: () => {},
    });
    if (ended) {
      await instance.terminate();
      throw new Error("Receipt reading timed out.");
    }
    worker = instance;
    const image = await prepareReceiptImage(photo).catch(() => photo);
    const primary = parseReceiptFields((await instance.recognize(image, { rotateAuto: true })).data.text);
    if (primary.needsManualAmount || (primary.amount && primary.purpose && primary.category)) return primary;

    await instance.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
    const alternate = parseReceiptFields((await instance.recognize(image)).data.text);
    const conflict = !!(primary.amount && alternate.amount && primary.amount !== alternate.amount);
    const needsManualAmount = alternate.needsManualAmount || conflict;
    // Prefer the clean name when a second pass omits a stray logo character.
    const suffix = primary.purpose.slice(alternate.purpose.length);
    const cleanMerchant = alternate.purpose
      && primary.purpose.startsWith(alternate.purpose)
      && /^\s+\d$/.test(suffix);
    return {
      purpose: cleanMerchant ? alternate.purpose : primary.purpose || alternate.purpose,
      category: primary.category ?? alternate.category,
      amount: needsManualAmount ? "" : primary.amount || alternate.amount,
      needsManualAmount,
    };
  };
  try {
    return await Promise.race([
      recognize(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Receipt reading timed out.")), 40000);
      }),
    ]);
  } finally {
    ended = true;
    clearTimeout(timer);
    await worker?.terminate();
  }
}
