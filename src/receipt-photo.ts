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
    const primary = parseReceiptFields((await instance.recognize(photo)).data.text);
    if (primary.amount && primary.purpose) return primary;

    // A scattered receipt layout can fall outside the default text block.
    await instance.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
    const alternate = parseReceiptFields((await instance.recognize(photo)).data.text);
    return {
      purpose: primary.purpose || alternate.purpose,
      category: primary.category ?? alternate.category,
      amount: primary.amount || (primary.needsManualAmount ? "" : alternate.amount),
      needsManualAmount: primary.needsManualAmount || alternate.needsManualAmount,
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
