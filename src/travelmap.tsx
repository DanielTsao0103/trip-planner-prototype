import React, { useEffect, useRef, useState } from "react";
import { authFailureEvent, loadGoogleMaps, mapId } from "./google-maps";
import "./trip-map.css";
import {
  ArrowUpRight,
  ChevronRight,
  Crosshair,
  LocateFixed,
  MapPin,
  Maximize,
  Minus,
  Navigation,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { useApp } from "./state";
import { Button, PageHead } from "./ui";
import { canEdit, type Event, type MapPoint } from "./domain";
import {
  exactAddressPoint,
  searchMeetingPlaces,
  resolveSearchFocus,
} from "./event-location-search";
import { EventLocationInput } from "./event-location-input";

function showStops(map: google.maps.Map, points: MapPoint[]) {
  if (!points.length) return;
  const bounds = new google.maps.LatLngBounds();
  points.forEach((point) => bounds.extend(point));
  if (bounds.getNorthEast().equals(bounds.getSouthWest())) {
    map.moveCamera({ center: points[0], zoom: 16 });
  } else {
    map.fitBounds(bounds, { top: 116, right: 82, bottom: 48, left: 42 });
  }
}
function focusPoint(map: google.maps.Map, point: MapPoint) {
  map.moveCamera({ center: point, zoom: Math.max(map.getZoom() ?? 0, 16) });
}

export function TravelMap({
  compact = false,
  selectedEvent,
  selectedPlace,
}: {
  compact?: boolean;
  selectedEvent?: string;
  selectedPlace?: string;
}) {
  const { trip, s, go, updateTrip, mapSyncOffline } = useApp();
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const markers = useRef(
    new Map<string, google.maps.marker.AdvancedMarkerElement>(),
  );
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [satellite, setSatellite] = useState(false);
  const [selectedId, select] = useState(
    selectedEvent ||
      trip?.events.find((e) => e.place === selectedPlace)?.id ||
      "",
  );
  const [editing, setEditing] = useState(false);
  const [preciseZoom, setPreciseZoom] = useState(false);
  const [query, setQuery] = useState("");
  const [locationStatus, setLocationStatus] = useState("");
  const [locating, setLocating] = useState(false);
  const selection = trip?.events.find((e) => e.id === selectedId);
  const events = trip?.events ?? [];
  // Keep markers and the visitor's viewport stable through unrelated trip saves.
  const pinKey = JSON.stringify(events.map((e) => [e.id, e.place, e.point]));
  const destination = trip?.destinations[0] ?? "";
  const initialFocus = useRef(true);
  const geoDot = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let active = true;
    let timer: number;
    setReady(false);
    setLoadError("");
    setSatellite(false);
    setEditing(false);
    initialFocus.current = true;
    const denied = () => {
      if (active) {
        setReady(false);
        setLoadError("Google Maps declined this site's map key.");
      }
    };
    window.addEventListener(authFailureEvent, denied);
    void (async () => {
      await loadGoogleMaps();
      const { Map: GoogleMap } = (await google.maps.importLibrary(
        "maps",
      )) as google.maps.MapsLibrary;
      await google.maps.importLibrary("marker");
      if (!active) return;
      const view = new GoogleMap(container, {
        mapId,
        center: { lat: 20, lng: 0 },
        zoom: 2,
        minZoom: 2,
        maxZoom: 21,
        disableDefaultUI: true,
        gestureHandling: compact ? "cooperative" : "greedy",
        keyboardShortcuts: true,
        clickableIcons: true,
        tilt: 0,
      });
      map.current = view;
      view.addListener("zoom_changed", () =>
        setPreciseZoom((view.getZoom() ?? 0) >= 15),
      );
      timer = window.setTimeout(() => {
        if (active)
          setLoadError(
            "Google Maps is taking longer than usual to display this area.",
          );
      }, 18000);
      view.addListener("tilesloaded", () => {
        clearTimeout(timer);
        if (active)
          setLoadError((current) =>
            current.includes("taking longer") ? "" : current,
          );
      });
      setReady(true);
    })().catch((error) => {
      if (active) setLoadError(error.message || "Google Maps could not load.");
    });
    return () => {
      active = false;
      window.removeEventListener(authFailureEvent, denied);
      clearTimeout(timer);
      if (map.current) google.maps.event.clearInstanceListeners(map.current);
      markers.current.forEach((marker) => {
        marker.map = null;
      });
      markers.current.clear();
      if (geoDot.current) geoDot.current.map = null;
      geoDot.current = null;
      map.current = null;
      container.replaceChildren();
    };
  }, [attempt, compact]);

  useEffect(() => {
    const view = map.current;
    if (!ready || !view) return;
    const controller = new AbortController();
    markers.current.forEach((marker) => {
      marker.map = null;
    });
    markers.current.clear();
    const points: MapPoint[] = [];
    events.forEach((event, index) => {
      if (!event.point) return;
      points.push(event.point);
      const face = document.createElement("span");
      face.className = "trip-pin";
      const numeral = document.createElement("span");
      numeral.className = "trip-pin-face";
      numeral.textContent = String(index + 1);
      face.append(numeral);
      const marker = new google.maps.marker.AdvancedMarkerElement({
        map: view,
        position: event.point,
        title: `Select ${event.place}`,
        gmpClickable: true,
      });
      marker.append(face);
      marker.addEventListener("gmp-click", () => {
        select(event.id);
        setEditing(false);
        focusPoint(view, event.point!);
      });
      markers.current.set(event.id, marker);
    });
    if (initialFocus.current) {
      if (points.length) {
        showStops(view, points);
        initialFocus.current = false;
      } else if (destination) {
        const center = view.getCenter(),
          zoom = view.getZoom();
        void resolveSearchFocus(destination, controller.signal)
          .then((area) => {
            if (
              area &&
              !controller.signal.aborted &&
              center &&
              view.getCenter()?.equals(center) &&
              view.getZoom() === zoom
            )
              view.moveCamera({
                center: { lat: area.latitude, lng: area.longitude },
                zoom: area.zoom,
              });
          })
          .catch(() => {});
      }
    }
    return () => controller.abort();
  }, [ready, pinKey, destination]);

  useEffect(() => {
    markers.current.forEach((marker, id) => {
      const active = id === selectedId;
      marker.zIndex = active ? 1000 : 0;
      marker.querySelector(".trip-pin")?.classList.toggle("chosen", active);
      marker.setAttribute("aria-pressed", String(active));
    });
  }, [ready, pinKey, selectedId]);

  useEffect(() => {
    const point = selection?.point;
    if (point && map.current) focusPoint(map.current, point);
  }, [ready, selectedId, selection?.point?.lat, selection?.point?.lng]);

  // Existing text-only events can acquire a shared pin when their owner opens a
  // fully specified address. An ambiguous result stays available for manual placement.
  const mayPlace =
    !!trip && !!selection && canEdit(trip, s.userId, selection.date);
  useEffect(() => {
    if (
      !mayPlace ||
      !selection ||
      selection.point ||
      editing ||
      !/\d/.test(selection.place)
    )
      return;
    const { id, place } = selection;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    void searchMeetingPlaces(place, controller.signal)
      .then((matches) => {
        const point = exactAddressPoint(place, matches);
        if (!point || controller.signal.aborted) return;
        updateTrip((draft) => {
          if (draft.id !== trip?.id) return;
          const event = draft.events.find(
            (e) => e.id === id && e.place === place,
          );
          if (event && !event.point) event.point = point;
        });
      })
      .catch(() => {})
      .finally(() => clearTimeout(timeout));
    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [
    trip?.id,
    mayPlace,
    selection?.id,
    selection?.place,
    !!selection?.point,
    editing,
  ]);

  const overview = () => {
    select("");
    setEditing(false);
    if (map.current)
      showStops(
        map.current,
        events.flatMap((e) => (e.point ? [e.point] : [])),
      );
  };
  function locateMe() {
    const view = map.current;
    if (!view || locating) return;
    if (!navigator.geolocation) {
      setLocationStatus("Your browser could not share your location.");
      return;
    }
    setLocating(true);
    setLocationStatus("Finding your location…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (map.current !== view) return;
        setLocating(false);
        setLocationStatus("");
        const point = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        if (geoDot.current) geoDot.current.map = null;
        const dot = document.createElement("span");
        dot.className = "google-location-dot";
        geoDot.current = new google.maps.marker.AdvancedMarkerElement({
          map: view,
          position: point,
          title: "Your location",
          anchorTop: "-50%",
        });
        geoDot.current.append(dot);
        focusPoint(view, point);
      },
      () => {
        if (map.current !== view) return;
        setLocating(false);
        setLocationStatus(
          "Location unavailable. Check your browser’s location permission.",
        );
      },
      { timeout: 10000, enableHighAccuracy: true },
    );
  }
  function choose(event: Event) {
    setEditing(false);
    select(event.id);
    if (event.point && map.current) focusPoint(map.current, event.point);
  }
  function savePin() {
    if (
      !selection ||
      !map.current ||
      !trip ||
      !canEdit(trip, s.userId, selection.date)
    )
      return;
    if ((map.current.getZoom() ?? 0) < 15) return;
    const center = map.current.getCenter()?.toJSON();
    if (!center) return;
    updateTrip((draft) => {
      const event = draft.events.find(
        (e) => e.id === selection.id && e.place === selection.place,
      );
      if (event) event.point = { lat: center.lat, lng: center.lng };
    });
    setEditing(false);
  }
  const editingPin = ready && !loadError && editing && !!selection;
  return (
    <div className={`map-layout trip-map ${compact ? "compact" : ""}`}>
      <div className="map-canvas">
        <div
          ref={host}
          className="trip-map-host"
          aria-label="Trip places map"
        />
        {editingPin && (
          <div className="pin-crosshair" aria-hidden="true">
            <Crosshair size={32} />
          </div>
        )}
        {ready && !loadError && (
          <>
            {!compact && (
              <div
                className="map-style-switch"
                role="group"
                aria-label="Google map type"
              >
                {["Map", "Satellite"].map((label, index) => (
                  <button
                    key={label}
                    aria-pressed={satellite === Boolean(index)}
                    onClick={() => {
                      setSatellite(Boolean(index));
                      map.current?.setMapTypeId(index ? "hybrid" : "roadmap");
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            <div className="trip-map-tools">
              <button
                aria-label="Zoom in"
                onClick={() =>
                  map.current?.setZoom((map.current.getZoom() ?? 2) + 1)
                }
              >
                <Plus />
              </button>
              <button
                aria-label="Zoom out"
                onClick={() =>
                  map.current?.setZoom((map.current.getZoom() ?? 2) - 1)
                }
              >
                <Minus />
              </button>
              <button aria-label="Show all pins" onClick={overview}>
                <Maximize />
              </button>
              <button
                aria-label="Show my location"
                disabled={locating}
                onClick={locateMe}
              >
                <LocateFixed />
              </button>
            </div>
          </>
        )}
        {loadError ? (
          <div className="google-map-state" role="status">
            <MapPin size={24} />
            <strong>Google Maps is unavailable</strong>
            <span>{loadError}</span>
            <div>
              <Button
                onClick={() => {
                  if (loadError.includes("declined")) window.location.reload();
                  else setAttempt((value) => value + 1);
                }}
              >
                Retry
              </Button>
              <a
                href={`https://www.google.com/maps/search/?${new URLSearchParams({ api: "1", query: selection?.point ? `${selection.point.lat},${selection.point.lng}` : selection?.place || destination || "world map" })}`}
                target="_blank"
                rel="noreferrer"
              >
                Open Google Maps
              </a>
            </div>
          </div>
        ) : !ready ? (
          <div className="google-map-state" role="status">
            Loading Google Maps…
          </div>
        ) : (
          (locationStatus || mapSyncOffline) && (
            <div className="map-feedback" role="status">
              {locationStatus || "Reconnecting to the shared map…"}
            </div>
          )
        )}
        {editingPin && (
          <div className="pin-placement">
            <span>
              {preciseZoom
                ? "Move the map to position the pin"
                : "Zoom in or choose an address below"}
            </span>
            <Button disabled={!preciseZoom} onClick={savePin}>
              Save pin
            </Button>
            <button
              aria-label="Cancel pin placement"
              onClick={() => setEditing(false)}
            >
              <X size={17} />
            </button>
          </div>
        )}
        {compact && selection && (
          <button
            className="next-place-card"
            onClick={() => go(17, { event: selection.id })}
          >
            <Navigation />
            <span>
              <small>UP NEXT</small>
              <strong>{selection.place}</strong>
            </span>
            <ArrowUpRight />
          </button>
        )}
      </div>
      {!compact && (
        <aside className="trip-map-list" aria-label="Trip places">
          <h2>
            Places <small>{events.length}</small>
          </h2>
          {!events.length && (
            <p>Add a location to an itinerary event to see it here.</p>
          )}
          {events.map((event, index) => (
            <div
              key={event.id}
              className={
                selection?.id === event.id ? "place-row active" : "place-row"
              }
            >
              <button
                className="place-select"
                aria-expanded={selection?.id === event.id}
                onClick={() => choose(event)}
              >
                <span className="place-number">{index + 1}</span>
                <span>
                  <strong>{event.name}</strong>
                  <small>{event.place}</small>
                  {!event.point && <em>Pin needed</em>}
                </span>
                <ChevronRight size={15} />
              </button>
              {selection?.id === event.id && (
                <div className="place-actions">
                  {event.point && (
                    <a
                      href={`https://www.google.com/maps/dir/?${new URLSearchParams({ api: "1", destination: `${event.point.lat},${event.point.lng}`, travelmode: "walking" })}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Navigation size={15} /> Directions
                    </a>
                  )}
                  {ready &&
                    !loadError &&
                    trip &&
                    canEdit(trip, s.userId, event.date) &&
                    !editing && (
                      <button
                        onClick={() => {
                          setQuery(event.place);
                          setEditing(true);
                        }}
                      >
                        <MapPin size={15} />{" "}
                        {event.point ? "Adjust pin" : "Place pin"}
                      </button>
                    )}
                  {editingPin && (
                    <EventLocationInput
                      autoFocus
                      value={query}
                      destinations={trip?.destinations}
                      onChange={(label, point) => {
                        setQuery(label);
                        if (point && map.current)
                          map.current.moveCamera({ center: point, zoom: 18 });
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          ))}
        </aside>
      )}
    </div>
  );
}
export function MapPage() {
  const { trip, route, open } = useApp();
  return (
    <>
      <PageHead
        eyebrow={trip?.destinations.join(" · ")}
        title="Map"
        action={
          <Button variant="outline" onClick={() => open("nearby")}>
            <Sparkles size={16} />
            Nearby suggestion
          </Button>
        }
      />
      {trip && (
        <TravelMap
          key={`${trip.id}/${route.params}`}
          selectedEvent={route.params.get("event") || undefined}
          selectedPlace={route.params.get("place") || undefined}
        />
      )}
    </>
  );
}
