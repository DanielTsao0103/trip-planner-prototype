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
  const { createWorker } = await import("tesseract.js");
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
    return instance.recognize(photo);
  };
  try {
    const { data } = await Promise.race([
      recognize(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Receipt reading timed out.")), 25000);
      }),
    ]);
    const lines = data.text.split("\n").map(line => line.trim()).filter(Boolean);
    const amounts = new Set<string>();
    for (const line of lines) {
      const match = line.match(/^(?:grand\s+total|total(?:\s+(?:paid|due|amount))?|amount\s+(?:due|paid))\s*[:=]?\s*(?:USD\s*|US\$\s*|\$\s*)?(\d{1,3}(?:,\d{3})+\.\d{2}|\d+\.\d{2})(?:\s+USD)?\s*$/i);
      if (match) amounts.add(match[1].replaceAll(",", ""));
    }
    return { purpose: lines.find(line => /[a-z]{3}/i.test(line)) ?? "", amount: amounts.size === 1 ? [...amounts][0] : "" };
  } finally {
    ended = true;
    clearTimeout(timer);
    await worker?.terminate();
  }
}
