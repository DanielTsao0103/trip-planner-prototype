import { useEffect } from "react";
import { applyRemoteStyle, setStyleSaver } from "./theme";
import { loadAccountStyle, saveAccountStyle } from "./style-sync.ts";

/** Mounted only for real (non-demo) accounts: loads the saved style on sign-in and saves each Apply. */
export function StyleSync({ userId }: { userId: string }) {
  useEffect(() => {
    let active = true;
    loadAccountStyle(userId)
      .then((saved) => {
        if (active && saved) applyRemoteStyle(saved);
      })
      .catch((issue) => console.warn("Could not load your saved style.", issue));
    setStyleSaver((choice) => {
      saveAccountStyle(userId, choice).catch((issue) => console.warn("Could not save your style.", issue));
    });
    return () => {
      active = false;
      setStyleSaver(null);
    };
  }, [userId]);
  return null;
}
