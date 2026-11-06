import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
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

const tiles = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const animate = () =>
  !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
function showStops(map: L.Map, points: MapPoint[]) {
  if (points.length)
    map.fitBounds(L.latLngBounds(points), {
      padding: [46, 46],
      maxZoom: 16,
      animate: false,
    });
}
function focusPoint(map: L.Map, point: MapPoint) {
  map.stop().setView(point, Math.max(map.getZoom(), 16), {
    animate: animate() && map.getBounds().contains(point),
  });
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
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.TileLayer | null>(null);
  const markers = useRef(new Map<string, L.Marker>());
  const [selectedId, select] = useState(
    selectedEvent ||
      trip?.events.find((e) => e.place === selectedPlace)?.id ||
      "",
  );
  const [editing, setEditing] = useState(false);
  const [preciseZoom, setPreciseZoom] = useState(false);
  const [query, setQuery] = useState("");
  const [locationStatus, setLocationStatus] = useState("");
  const [tileError, setTileError] = useState(false);
  const [locating, setLocating] = useState(false);
  const selection = trip?.events.find((e) => e.id === selectedId);
  const events = trip?.events ?? [];
  // Keep markers and the visitor's viewport stable through unrelated trip saves.
  const pinKey = JSON.stringify(events.map((e) => [e.id, e.place, e.point]));
  const destination = trip?.destinations[0] ?? "";
  const initialFocus = useRef(true);
  const geoDot = useRef<L.CircleMarker | null>(null);

  useEffect(() => {
    if (!host.current) return;
    const view = L.map(host.current, {
      zoomControl: false,
      scrollWheelZoom: false,
      minZoom: 2,
      maxZoom: 19,
      zoomAnimation: animate(),
      fadeAnimation: animate(),
      markerZoomAnimation: animate(),
    }).setView([20, 0], 2);
    map.current = view;
    initialFocus.current = true;
    view.on("zoomend", () => setPreciseZoom(view.getZoom() >= 15));
    view.attributionControl.setPrefix(false);
    const base = L.tileLayer(tiles, {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
    }).addTo(view);
    layer.current = base;
    base.on("tileerror", () => setTileError(true));
    const observer = new ResizeObserver(() =>
      view.invalidateSize({ pan: false }),
    );
    observer.observe(host.current);
    return () => {
      observer.disconnect();
      view.remove();
      map.current = null;
      markers.current.clear();
    };
  }, []);

  useEffect(() => {
    const view = map.current;
    if (!view) return;
    const controller = new AbortController();
    markers.current.forEach((m) => m.remove());
    markers.current.clear();
    const points: MapPoint[] = [];
    events.forEach((event, index) => {
      if (!event.point) return;
      points.push(event.point);
      const face = document.createElement("span");
      face.className = "trip-pin-face";
      face.textContent = String(index + 1);
      const marker = L.marker(event.point, {
        icon: L.divIcon({
          className: "trip-pin",
          html: face,
          iconSize: [44, 48],
          iconAnchor: [22, 48],
        }),
        title: event.place,
        alt: event.place,
        keyboard: true,
        riseOnHover: true,
      })
        .addTo(view)
        .on("click", () => {
          select(event.id);
          setEditing(false);
          focusPoint(view, event.point!);
        });
      marker.getElement()?.setAttribute("aria-label", `Select ${event.place}`);
      marker.getElement()?.addEventListener("keydown", (key) => {
        if (key.key === "Enter" || key.key === " ") {
          key.preventDefault();
          key.stopPropagation();
          marker.fire("click");
        }
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
              view.getCenter().equals(center) &&
              view.getZoom() === zoom
            )
              view.setView([area.latitude, area.longitude], area.zoom, {
                animate: false,
              });
          })
          .catch(() => {});
      }
    }
    return () => controller.abort();
  }, [pinKey, destination]);

  useEffect(() => {
    markers.current.forEach((marker, id) => {
      const active = id === selectedId;
      marker.setZIndexOffset(active ? 1000 : 0);
      marker.getElement()?.classList.toggle("chosen", active);
      marker.getElement()?.setAttribute("aria-pressed", String(active));
    });
  }, [pinKey, selectedId]);

  useEffect(() => {
    const point = selection?.point;
    if (point && map.current) focusPoint(map.current, point);
  }, [selectedId, selection?.point?.lat, selection?.point?.lng]);

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
        geoDot.current?.remove();
        geoDot.current = L.circleMarker(point, {
          radius: 7,
          color: "white",
          weight: 3,
          fillColor: "#1476d3",
          fillOpacity: 1,
        })
          .addTo(view)
          .bindTooltip("Your location");
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
    if (map.current.getZoom() < 15) return;
    const center = map.current.getCenter().wrap();
    updateTrip((draft) => {
      const event = draft.events.find(
        (e) => e.id === selection.id && e.place === selection.place,
      );
      if (event) event.point = { lat: center.lat, lng: center.lng };
    });
    setEditing(false);
  }
  const editingPin = editing && !!selection;
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
        <div className="trip-map-tools">
          <button aria-label="Zoom in" onClick={() => map.current?.zoomIn()}>
            <Plus />
          </button>
          <button aria-label="Zoom out" onClick={() => map.current?.zoomOut()}>
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
        {(locationStatus || tileError || mapSyncOffline) && (
          <div className="map-feedback" role="status">
            {locationStatus ||
              (tileError
                ? "Map tiles could not load."
                : "Reconnecting to the shared map…")}
            {tileError && (
              <button
                onClick={() => {
                  setTileError(false);
                  layer.current?.redraw();
                }}
              >
                Retry
              </button>
            )}
          </div>
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
                  {trip && canEdit(trip, s.userId, event.date) && !editing && (
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
                          map.current
                            .stop()
                            .setView(point, 18, { animate: false });
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
