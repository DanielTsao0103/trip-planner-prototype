import React, { useEffect, useRef, useState } from "react";
import { useApp } from "./state";
import {
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
import { StylePage } from "./style-page";
import { AccountPage } from "./account-page";
import { Shell, Empty, Button } from "./ui";
import { PAGES } from "./data";
import { member, type Trip } from "./domain";
export function PrototypeApp() {
  const { route, user, trip, open, tripGo, go, s, accountTrips } = useApp();
  const [deferred, setDeferred] = useState<string[]>([]);
  const needsSurvey = (t: Trip) => {
    const traveler = member(t, s.userId);
    return t.persistence === "account" && !!traveler?.accountId && traveler.accountId === s.userId && !t.prefs[traveler.id];
  };
  // Let travelers return to their other trips, but guard this trip on every entry.
  const openingTrip = [7, 8, 9, 10, 11, 12, 13, 15, 16, 17].includes(route.page);
  const pendingSurvey = accountTrips && (
    (openingTrip && trip && needsSurvey(trip) && trip) ||
    ([1, 4, 5].includes(route.page) && s.trips.find(t => !deferred.includes(t.id) && needsSurvey(t)))
  );
  const routeKey = `${route.page}?${route.params}`;
  const previousRoute = useRef(routeKey);
  useEffect(() => {
    const eventId = route.page === 11 && route.params.get("event");
    const target = eventId && document.getElementById(`day-event-${eventId}`);
    if (target) {
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: "center" });
    } else if (previousRoute.current !== routeKey && route.page !== 16 &&
        !(route.page === 17 && previousRoute.current.startsWith("17?"))) {
      document.getElementById("main-content")?.focus({ preventScroll: true });
    }
    previousRoute.current = routeKey;
  }, [routeKey, trip?.id, Boolean(pendingSurvey)]);
  useEffect(() => {
    document.title = pendingSurvey ? `Trip preferences · ${pendingSurvey.title}` : `${PAGES[route.page] || "Home"} · Trip Planner`;
    if (!pendingSurvey && route.page === 16 && user) open("nearby");
  }, [route.page, user?.id, pendingSurvey]);
  if (pendingSurvey) return (
    <main className="main-content page-15 invite-survey" id="main-content" tabIndex={-1}>
      <Survey key={pendingSurvey.id} trip={pendingSurvey} leaveOnboarding={() => {
        setDeferred(s.trips.filter(needsSurvey).map(t => t.id));
        go(5);
      }} />
    </main>
  );
  let content: React.ReactNode;
  if (!user || route.page === 1) content = <Shell><Home /></Shell>;
  else if (openingTrip && !trip)
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
      15: trip && <Survey key={`${user.id}:${trip.id}`} trip={trip} />,
      16: <Dashboard />,
      17: <MapPage />,
      18: <StylePage />,
      19: <AccountPage />,
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
