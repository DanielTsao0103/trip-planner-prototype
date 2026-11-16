import workerPath from "tesseract.js/dist/worker.min.js?url";
import type { Worker } from "tesseract.js";

export type ReceiptProgress = (progress: number, status: string) => void;
type Scanner = { worker: Promise<Worker>; progress?: ReceiptProgress };
let idle: Scanner | undefined;
let expiry: ReturnType<typeof setTimeout> | undefined;

/** Keep one ready scanner briefly; never retain a growing pool of phone workers. */
function keep(scanner: Scanner): void {
  if (idle && idle !== scanner) void idle.worker.then(worker => worker.terminate()).catch(() => undefined);
  idle = scanner;
  clearTimeout(expiry);
  expiry = setTimeout(() => {
    if (idle !== scanner) return;
    idle = undefined;
    void scanner.worker.then(worker => worker.terminate()).catch(() => undefined);
  }, 60_000);
}

function createScanner(): Scanner {
  const scanner: Scanner = {
    worker: import("tesseract.js").then(({ createWorker }) => createWorker("eng", 1, {
      workerPath, workerBlobURL: false,
      logger: progress => scanner.progress?.(Math.max(0, Math.min(1, progress.progress || 0)),
        progress.status === "recognizing text" ? "Reading receipt" : "Preparing scanner"),
    })),
  };
  void scanner.worker.catch(() => {
    if (idle === scanner) { idle = undefined; clearTimeout(expiry); }
  });
  return scanner;
}

/** Start only after camera/upload intent, while the traveler chooses their photo. */
export function warmReceiptScanner(): Promise<void> {
  if (!idle) keep(createScanner());
  return idle!.worker.then(() => undefined);
}

/** A scan exclusively owns its worker until it finishes or is cancelled. */
export function takeReceiptScanner(progress?: ReceiptProgress) {
  const scanner = idle ?? createScanner();
  idle = undefined; clearTimeout(expiry);
  scanner.progress = progress;
  let released = false;
  return {
    worker: scanner.worker,
    release(reuse: boolean): void {
      if (released) return;
      released = true; scanner.progress = undefined;
      if (reuse) keep(scanner);
      else void scanner.worker.then(worker => worker.terminate()).catch(() => undefined);
    },
  };
}
