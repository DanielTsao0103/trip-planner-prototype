import { useEffect } from "react";
import { startAccountStyleSync } from "./style-sync.ts";

/** Mounted only for real (non-demo) accounts: loads the saved style on sign-in and saves each Apply. */
export function StyleSync({ userId }: { userId: string }) {
  useEffect(() => startAccountStyleSync(userId), [userId]);
  return null;
}
