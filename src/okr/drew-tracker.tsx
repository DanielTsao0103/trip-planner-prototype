import { OkrTrackerShell } from "./okr-shell";
import { BudgetOkrTracker } from "./budget-tracker";
import "./daniel-tracker.css";

export function DrewOkrTracker() {
  return <OkrTrackerShell owner="Drew"><BudgetOkrTracker /></OkrTrackerShell>;
}
