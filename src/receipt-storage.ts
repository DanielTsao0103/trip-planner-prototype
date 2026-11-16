import { getSupabase } from "./supabase";
import { member, type Trip } from "./domain";
import { searchRequest } from "./search-request";
import { stagePendingReceipt, readPendingReceipt, listPendingReceipts, retirePendingReceipt, discardPendingReceipt, withReceiptLock } from "./receipt-outbox";
import { normalizeReceiptDocument, type ReceiptScanResult } from "./receipt-items";
import { receiptPath, uploadReceipt, readReceipt, removeReceipt } from "./receipt-photo";

export type ReceiptIdentity = { account: boolean; accountId: string; tripId: string; expenseId: string };
const key = (id: ReceiptIdentity) => `${id.accountId}/${id.tripId}/${id.expenseId}`;
const demoDatabase = () => new Promise<IDBDatabase>((resolve, reject) => {
  const opening = indexedDB.open("trip-planner-demo-receipts", 1);
  opening.onupgradeneeded = () => opening.result.createObjectStore("receipts");
  opening.onsuccess = () => resolve(opening.result);
  opening.onerror = () => reject(new Error("Could not open receipt storage."));
});
async function demoReceipt<T>(id: ReceiptIdentity, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await demoDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction("receipts", mode);
      const request = action(tx.objectStore("receipts"));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = tx.onerror = () => reject(new Error("Could not save the receipt. Try again."));
    });
  } finally { db.close(); }
}
export async function saveReceiptPhoto(id: ReceiptIdentity, photo: File) {
  if (id.account) return uploadReceipt(receiptPath(id.accountId,id.tripId,id.expenseId), photo);
  const previous = await demoReceipt(id, "readonly", store => store.get(key(id)));
  // WebKit can reject Blob/File records in IndexedDB. Bytes retain the exact
  // photo while avoiding that platform-specific structured-clone failure.
  const photoBytes = await photo.arrayBuffer();
  await demoReceipt(id,"readwrite",store => store.put({ ...previous, photo:undefined, photoBytes, photoType:photo.type },key(id)));
}
export async function saveReceiptDetails(id: ReceiptIdentity, details: ReceiptScanResult) {
  const safe = normalizeReceiptDocument(details, details.method);
  if (!id.account) {
    const previous = await demoReceipt(id,"readonly",store => store.get(key(id)));
    await demoReceipt(id,"readwrite",store => store.put({ ...previous, details:safe },key(id)));
    return;
  }
  await stagePendingReceipt(id,safe);
  await flushReceiptDetails(id);

}
export async function stageReceiptDetails(id:ReceiptIdentity,details:ReceiptScanResult){
  if(id.account)await stagePendingReceipt(id,details);
}
export async function discardReceiptRecovery(id:ReceiptIdentity){
  if(id.account)await discardPendingReceipt(id);
}
async function sameAccount(accountId:string){
  const {data,error}=await getSupabase().auth.getSession();
  if(error||data.session?.user.id!==accountId)throw new Error("Sign back in to finish saving this receipt.");
}
export async function flushReceiptDetails(id:ReceiptIdentity):Promise<void>{
  await withReceiptLock(id,async()=>{
    const pending=await readPendingReceipt(id);
    if(!pending)return;
    await sameAccount(id.accountId);
    const {error}=await searchRequest(signal=>Promise.resolve(getSupabase().from("expense_receipt_details").upsert({account_id:id.accountId,trip_id:id.tripId,expense_id:id.expenseId,details:pending.details,updated_at:new Date().toISOString()}).abortSignal(signal)),new AbortController().signal,8000);
    if(error)throw new Error("The expense is saved, but its receipt details could not be attached. Try Save expense again.");
    await sameAccount(id.accountId);
    await retirePendingReceipt(id,pending.version);
  });
}
/** Only server-confirmed expense snapshots may release pending attachments. */
export async function recoverReceiptDetails(accountId:string,confirmed:Trip[]):Promise<{recovered:number;pending:number}>{
  const records=await listPendingReceipts(accountId);let recovered=0,pending=0;
  for(const record of records){
    const trip=confirmed.find(trip=>trip.id===record.tripId&&trip.persistence==="account");
    const payer=trip&&member(trip,accountId);
    if(!trip||!payer||payer.status!=="accepted"||!trip.expenses.some(expense=>expense.id===record.expenseId&&expense.payer===payer.id))continue;
    try{await flushReceiptDetails({...record,account:true});recovered++;}catch{pending++;}
  }
  return {recovered,pending};
}
export async function loadReceipt(id: ReceiptIdentity): Promise<{ photo?: Blob; details?: ReceiptScanResult; photoError?: string; recoveryError?: string }> {
  if (!id.account) {
    const saved = await demoReceipt(id,"readonly",store => store.get(key(id)));
    const photo = saved?.photo instanceof Blob ? saved.photo
      : saved?.photoBytes instanceof ArrayBuffer && ["image/jpeg","image/png","image/webp"].includes(saved.photoType)
        ? new Blob([saved.photoBytes], {type:saved.photoType}) : undefined;
    return {photo,details:saved?.details ? normalizeReceiptDocument(saved.details,saved.details.method) : undefined};
  }
  await sameAccount(id.accountId);
  let recoveryError:string|undefined;
  try{await flushReceiptDetails(id);}catch{recoveryError="Receipt details are waiting to sync. Try opening the receipt again.";}
  const pending=await readPendingReceipt(id).catch(()=>undefined);
  const [photo,details] = await Promise.allSettled([
    readReceipt(receiptPath(id.accountId,id.tripId,id.expenseId)),
    getSupabase().from("expense_receipt_details").select("details").eq("account_id",id.accountId).eq("trip_id",id.tripId).eq("expense_id",id.expenseId).maybeSingle(),
  ]);
  await sameAccount(id.accountId);
  if ((details.status === "rejected" || details.value.error)&&!pending) throw new Error("Could not load the receipt details. Try opening the receipt again.");
  const value = pending?.details || (details.status === "fulfilled"&&!details.value.error ? details.value.data?.details : undefined);
  if (photo.status === "rejected" && !value) throw new Error("Could not open the receipt. Try again.");
  return {photo:photo.status === "fulfilled" ? photo.value : undefined,details:value ? normalizeReceiptDocument(value,value.method) : undefined,
    photoError:photo.status === "rejected" ? "Could not load the receipt photo. Try opening the receipt again." : undefined,recoveryError};
}
export async function deleteReceipt(id: ReceiptIdentity) {
  if (!id.account) { await demoReceipt(id,"readwrite",store=>store.delete(key(id))); return; }
  await discardPendingReceipt(id);
  await removeReceipt(receiptPath(id.accountId,id.tripId,id.expenseId));
  const { error } = await getSupabase().from("expense_receipt_details").delete().eq("account_id",id.accountId).eq("trip_id",id.tripId).eq("expense_id",id.expenseId);
  if (error) throw new Error("The expense was deleted, but its receipt details could not be removed. Try deleting the receipt again.");
}
