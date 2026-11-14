import { ArrowRight, ShieldCheck } from "lucide-react";
import { useApp } from "./state";
import { Button, PageHead } from "./ui";
import { AdminGate } from "./admin-gate";
import { ADMIN_ACCESS_PAGE, OKR_TRACKERS, okrLabel } from "./okr-trackers";
import "./admin-page.css";

/** Admin menu: one button per OKR tracker, plus a small link to the access list. */
export function AdminPage() {
  const { go } = useApp();
  return (
    <AdminGate>
      <div className="account-page admin-page">
        <PageHead title="Admin" description="Open an OKR tracker." />
        <section className="card account-section" aria-labelledby="admin-trackers">
          <h2 id="admin-trackers">OKR trackers</h2>
          <div className="menu-links">
            {OKR_TRACKERS.map(({ owner, page }) => (
              <button key={page} onClick={() => go(page)}>
                {okrLabel(owner)}
                <ArrowRight size={16} />
              </button>
            ))}
          </div>
        </section>
        <div>
          <Button variant="outline" onClick={() => go(ADMIN_ACCESS_PAGE)}>
            <ShieldCheck size={16} aria-hidden="true" /> Manage admin access
          </Button>
        </div>
      </div>
    </AdminGate>
  );
}
