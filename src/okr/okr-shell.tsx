import type { ReactNode } from "react";
import { AdminGate } from "../admin-gate";
import { Empty, PageHead } from "../ui";
import { okrLabel } from "../okr-trackers";
import "../admin-page.css";

/**
 * Common frame for an OKR tracker page: the admin check, the page heading and an empty state.
 * Pass the tracker as children. With no children it shows a placeholder until the tracker exists.
 */
export function OkrTrackerShell({ owner, children }: { owner: string; children?: ReactNode }) {
  return (
    <AdminGate>
      <div className="okr-page">
        <PageHead title={okrLabel(owner)} description={`${owner}’s space for tracking objectives and key results.`} />
        {children ?? <Empty title="Nothing here yet." body={`${owner}’s tracker will be built on this page.`} />}
      </div>
    </AdminGate>
  );
}
