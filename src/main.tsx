import { createRoot } from "react-dom/client";
import { AuthApp } from "./auth";
import { Provider } from "./state";
import { PrototypeApp } from "./prototype";
import "./styles.css";
import "./design-system.css";
import "./recovery-refinement.css";
import "./theme-compatibility.css";
import "./budget.css";
import "./planning-workspace.css";
import { ReleaseNotice } from "./release-notice";
import { StyleSync } from "./style-sync-mount";
import { startSiteStyle } from "./theme";
import { googlePictureOf } from "./profile-picture";
import { signInMethodOf } from "./account";

startSiteStyle();

createRoot(document.getElementById("root")!).render(
  <><ReleaseNotice /><AuthApp renderDemo={(exitDemo, enterAsMaya) => (
    <Provider key="standalone-demo" account={{ id: "demo-maya", email: "maya@example.com", name: "Maya Chen" }}
      initialTripId="seattle" initialUserId={enterAsMaya ? "maya" : undefined} onSignOut={exitDemo}>
      <PrototypeApp />
    </Provider>
  )}>{(session, signOut) => (
    <Provider key={session.user.id} cloud googlePicture={googlePictureOf(session.user)} signInMethod={signInMethodOf(session.user)} account={{
      id: session.user.id,
      email: session.user.email || "",
      name: session.user.user_metadata.name || "Traveler",
    }} onSignOut={signOut}>
      <StyleSync userId={session.user.id} />
      <PrototypeApp />
    </Provider>
  )}</AuthApp></>,
);
