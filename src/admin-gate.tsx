import { useEffect, useState, type ReactNode } from "react";
import { useApp } from "./state";
import { Button, Empty } from "./ui";
import { checkIsAdmin, rememberAdmin } from "./admin-access";

/**
 * Wraps every Admin page. The database decides who is an admin; this only shows its answer.
 * It asks every time a page opens, so a removed admin loses access without signing out.
 */
export function AdminGate({ children }: { children: ReactNode }) {
  const { user, accountInfo, go } = useApp();
  const { cloud } = accountInfo;
  const [access, setAccess] = useState<"checking" | "allowed" | "denied">("checking");

  useEffect(() => {
    if (!cloud || !user?.id) {
      setAccess("denied");
      return;
    }
    let active = true;
    setAccess("checking");
    void checkIsAdmin()
      .catch(() => false)
      .then((allowed) => {
        rememberAdmin(user.id, allowed);
        if (active) setAccess(allowed ? "allowed" : "denied");
      });
    return () => {
      active = false;
    };
  }, [cloud, user?.id]);

  if (access === "denied")
    return (
      <Empty
        title="You do not have access to this page."
        body={cloud
          ? `Admin access requires an approved Google account. You’re signed in as ${accountInfo.email || "this account"}. Ask an existing admin to approve that email.`
          : "Sign in with an approved Google account to open Admin. The sample account does not have admin access."}
        action={<Button onClick={() => go(19)}>Back to account</Button>}
      />
    );
  if (access === "checking")
    return (
      <div className="account-page admin-page">
        <p className="account-note" role="status">
          Checking your access…
        </p>
      </div>
    );
  return <>{children}</>;
}
