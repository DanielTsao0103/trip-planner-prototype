import { normalizeReceiptDocument, type ReceiptScanResult } from "./receipt-items";

export type ReceiptKey = { accountId: string; tripId: string; expenseId: string };
export type PendingReceipt = ReceiptKey & { version: string; details: ReceiptScanResult };
const storageKey = (id: ReceiptKey) => `${id.accountId}/${id.tripId}/${id.expenseId}`;
const validKey = (id: ReceiptKey) => [id.accountId,id.tripId,id.expenseId].every(part => typeof part === "string" && /^[a-zA-Z0-9_-]{1,160}$/.test(part));
const database = () => new Promise<IDBDatabase>((resolve,reject) => {
  const open=indexedDB.open("trip-planner-receipt-outbox",1);
  open.onupgradeneeded=()=>open.result.createObjectStore("receipts");
  open.onsuccess=()=>resolve(open.result);
  open.onerror=()=>reject(new Error("Could not preserve the receipt details for recovery. Try saving again."));
});
async function transact<T>(mode:IDBTransactionMode, action:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
  const db=await database();
  try{return await new Promise<T>((resolve,reject)=>{
    const tx=db.transaction("receipts",mode);const request=action(tx.objectStore("receipts"));
    tx.oncomplete=()=>resolve(request.result);
    tx.onerror=tx.onabort=()=>reject(new Error("Could not preserve the receipt details for recovery. Try saving again."));
  });}catch{throw new Error("Could not preserve the receipt details for recovery. Try saving again.");}finally{db.close();}
}
/** Serialize same-expense attachments across tabs, including deletion and edits. */
export async function withReceiptLock<T>(id:ReceiptKey,run:()=>Promise<T>):Promise<T>{
  if(!validKey(id))throw new Error("The receipt identity is invalid. Reopen the expense and try again.");
  if(!navigator.locks)throw new Error("This browser cannot safely recover receipt attachments. Try a current browser.");
  return navigator.locks.request("trip-receipt:"+storageKey(id),{signal:AbortSignal.timeout(15000)},run);
}
export async function readPendingReceipt(id:ReceiptKey):Promise<PendingReceipt|undefined>{
  const raw=await transact<any>("readonly",store=>store.get(storageKey(id)));
  if(!raw||raw.accountId!==id.accountId||raw.tripId!==id.tripId||raw.expenseId!==id.expenseId||typeof raw.version!=="string")return undefined;
  return {...id,version:raw.version,details:normalizeReceiptDocument(raw.details,raw.details?.method)};
}
export async function listPendingReceipts(accountId:string):Promise<PendingReceipt[]>{
  const records=await transact<any[]>("readonly",store=>store.getAll(IDBKeyRange.bound(accountId+"/",accountId+"/\uffff")));
  return records.filter(row=>row&&row.accountId===accountId&&validKey(row)&&typeof row.version==="string").map(row=>({accountId,tripId:row.tripId,expenseId:row.expenseId,version:row.version,details:normalizeReceiptDocument(row.details,row.details?.method)}));
}
export async function stagePendingReceipt(id:ReceiptKey,details:ReceiptScanResult):Promise<void>{
  await withReceiptLock(id,async()=>{
    const record={...id,version:crypto.randomUUID(),details:normalizeReceiptDocument(details,details.method)};
    await transact("readwrite",store=>store.put(record,storageKey(id)));
  });
}
/** Caller holds the receipt lock. Compare the exact version before retiring it. */
export async function retirePendingReceipt(id:ReceiptKey,version?:string):Promise<void>{
  const db=await database();
  try{await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction("receipts","readwrite"),store=tx.objectStore("receipts");
    const read=store.get(storageKey(id));
    read.onsuccess=()=>{if(read.result&&(!version||read.result.version===version))store.delete(storageKey(id));};
    tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(new Error("Could not finish receipt recovery. Try again."));
  });}finally{db.close();}
}
export async function discardPendingReceipt(id:ReceiptKey):Promise<void>{await withReceiptLock(id,()=>retirePendingReceipt(id));}
