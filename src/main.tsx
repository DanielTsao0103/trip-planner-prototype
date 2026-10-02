import React, { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { Provider, useApp } from "./state";
import {
  Auth,
  Connections,
  ConnectProvider,
  Home,
  Trips,
  TripForm,
} from "./onboarding";
import {
  Dashboard,
  DayDetail,
  EventForm,
  Itinerary,
  Suggestions,
} from "./planning";
import { Budget } from "./finance";
import { Group, Survey } from "./group";
import { MapPage } from "./travelmap";
import { Overlays } from "./overlays";
import { Shell, Empty, Button } from "./ui";
import { PAGES } from "./data";
import "./styles.css";
function App() {
  const { route, user, trip, open, tripGo, go } = useApp();
  const routeKey = `${route.page}?${route.params}`;
  const previousRoute = useRef(routeKey);
  useEffect(() => {
    if (previousRoute.current !== routeKey && route.page !== 16) {
      document.getElementById("main-content")?.focus({ preventScroll: true });
    }
    previousRoute.current = routeKey;
  }, [routeKey]);
  useEffect(() => {
    document.title = `${PAGES[route.page] || "Home"} · Trip Planner`;
    if (route.page === 16 && user) open("nearby");
  }, [route.page, user?.id]);
  let content: React.ReactNode;
  if (!user || route.page === 1) content = <Auth />;
  else if ([7, 8, 9, 10, 11, 12, 13, 15, 16, 17].includes(route.page) && !trip)
    content = (
      <Shell>
        <Empty
          title="Choose your next adventure."
          body="Select an accepted trip to see its plans, group, and details."
          action={
            <Button onClick={() => tripGo(route.page)}>Choose a trip</Button>
          }
        />
      </Shell>
    );
  else {
    const pages: Record<number, React.ReactNode> = {
      2: <Connections />,
      3: <ConnectProvider key={route.params.get("service")} />,
      4: <Home />,
      5: <Trips />,
      6: <TripForm key={route.params.toString()} />,
      7: <EventForm key={route.params.toString()} />,
      8: <Itinerary />,
      9: <Suggestions />,
      10: <Dashboard />,
      11: <DayDetail />,
      12: <Budget />,
      13: <Group />,
      15: <Survey key={user.id} />,
      16: <Dashboard />,
      17: <MapPage />,
    };
    content = (
      <Shell>
        {pages[route.page] || (
          <Empty
            title="This reference is reserved."
            body="Page 14 was not specified in the source requirements."
            action={<Button onClick={() => go(4)}>Back home</Button>}
          />
        )}
      </Shell>
    );
  }
  return (
    <>
      <a
        className="skip-link"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          const main = document.getElementById("main-content");
          main?.focus();
          main?.scrollIntoView();
        }}
      >
        Skip to content
      </a>
      {content}
      <Overlays />
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <Provider>
    <App />
  </Provider>,
);
