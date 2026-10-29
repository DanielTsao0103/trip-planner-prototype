import { createRoot } from "react-dom/client";
import { AuthApp } from "./auth";
import { Provider } from "./state";
import { PrototypeApp } from "./prototype";
import "./styles.css";
import { ReleaseNotice } from "./release-notice";

createRoot(document.getElementById("root")!).render(
  <><ReleaseNotice /><AuthApp renderDemo={exitDemo => (
    <Provider key="standalone-demo" account={{ id: "demo-maya", email: "maya@example.com", name: "Maya Chen" }}
      initialTripId="seattle" onSignOut={exitDemo}>
      <PrototypeApp />
    </Provider>
  )}>{(session, signOut) => (
    <Provider key={session.user.id} cloud account={{
      id: session.user.id,
      email: session.user.email || "",
      name: session.user.user_metadata.name || "Traveler",
    }} onSignOut={signOut}>
      <PrototypeApp />
    </Provider>
  )}</AuthApp></>,
);
