import { useItineraryPins } from "./use-itinerary-pins";
import React, { useEffect, useId, useRef, useState } from "react";
import { authFailureEvent, loadGoogleMaps, mapId } from "./google-maps";
import "./trip-map.css";
import {
  ArrowUpRight,
  ChevronRight,
  Crosshair,
  CalendarDays,
  LocateFixed,
  MapPin,
  Minus,
  Navigation,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { useApp } from "./state";
import { Button, PageHead } from "./ui";
import { canEdit, dateText, member, timeText, type Event, type MapPoint } from "./domain";
import { resolveSearchFocus } from "./event-location-search";
import { usePalette } from "./theme";

/** A rejected/partially initialized SDK can throw while detaching its marker.
 * Release its DOM node as a fallback so leaving the map never crashes routing.
 */
function detachMarker(marker: google.maps.marker.AdvancedMarkerElement): void {
  try { marker.map = null; }
  catch { marker.remove(); }
}

function showStops(map: google.maps.Map, points: MapPoint[], singleZoom = 16) {
  if (!points.length) return;
  const bounds = new google.maps.LatLngBounds();
  points.forEach((point) => bounds.extend(point));
  if (bounds.getNorthEast().equals(bounds.getSouthWest())) {
    map.moveCamera({ center: points[0], zoom: singleZoom });
  } else {
    map.fitBounds(bounds, { top: 116, right: 82, bottom: 48, left: 42 });
  }
}
function focusPoint(map: google.maps.Map, point: MapPoint, area = false) {
  map.moveCamera({
    center: point,
    zoom: area ? 13 : Math.max(map.getZoom() ?? 0, 16),
  });
}

const mapDayColors = ["#245f9e", "#b84f32", "#147a70", "#7855a6", "#a73858", "#657d18", "#9a650a", "#147a9a"];
const tripDayNumber = (start: string, date: string) => {
  const parse = (value: string) => {
    const [year, month, day] = value.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.max(1, Math.floor((parse(date) - parse(start)) / 86_400_000) + 1);
};

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
  const { isDark } = usePalette();
  // Google only accepts colorScheme at construction. Resolve device appearance
  // ourselves: FOLLOW_SYSTEM did not repaint an existing map in live SDK checks.
  const requestedAppearance = isDark ? "DARK" : "LIGHT";
  const [mapAppearance, setMapAppearance] = useState<"DARK" | "LIGHT">(requestedAppearance);
  const host = useRef<HTMLDivElement>(null);
  const pinActions = useRef<HTMLDivElement>(null);
  const pinInstructionsId = useId();
  const map = useRef<google.maps.Map | null>(null);
  const markers = useRef(
    new Map<string, google.maps.marker.AdvancedMarkerElement>(),
  );
  const [ready, setReady] = useState(false);
  const [mapGeneration, setMapGeneration] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [satellite, setSatellite] = useState(false);
  const [compactSelection, setCompactSelection] = useState<string>();
  const [hiddenMapDays, setHiddenMapDays] = useState<string[]>([]);
  const requestedId = selectedEvent || trip?.events.find((e) => e.place === selectedPlace)?.id || "";
  const selectedId = compact ? compactSelection ?? requestedId : requestedId;
  function select(id: string) {
    if (compact) setCompactSelection(id);
    else go(17, id ? { event: id } : {}, true);
  }
  const [nearbyIds, setNearbyIds] = useState<string[]>([]);
  const [updatedPin, setUpdatedPin] = useState("");
  useEffect(() => setUpdatedPin(""), [selectedId]);
  const chooser = useRef<HTMLDivElement>(null);
  const clickedMarker = useRef("");
  const [editing, setEditing] = useState(false);
  // Device or account appearance can change while a pin is being placed.
  // Finish that draft first; rebuilding its map would otherwise interrupt input.
  useEffect(() => {
    if (!editing) setMapAppearance(requestedAppearance);
  }, [editing, requestedAppearance]);
  const [preciseZoom, setPreciseZoom] = useState(false);
  const [locationStatus, setLocationStatus] = useState("");
  const [locating, setLocating] = useState(false);
  const { events, statusFor, retryLookup } = useItineraryPins(
    trip,
    s.userId,
    ready && !loadError,
    updateTrip,
  );
  const mapDays = Array.from(new Set(events.map((event) => event.date))).sort();
  const dayColor = (date: string) => {
    const day = tripDayNumber(trip?.start || date, date);
    return mapDayColors[(day - 1 + mapDayColors.length) % mapDayColors.length];
  };
  const visibleMapDays = new Set(mapDays.filter((date) => !hiddenMapDays.includes(date)));
  const allDaysVisible = mapDays.every((date) => visibleMapDays.has(date));
  const mapDayGroups = mapDays.map((date) => ({
    date,
    day: tripDayNumber(trip?.start || date, date),
    events: events.filter((event) => event.date === date),
  }));
  useEffect(() => {
    setHiddenMapDays((current) => current.filter((date) => mapDays.includes(date)));
  }, [trip?.id, mapDays.join(",")]);
  const nearbyStops = events.filter((event) => nearbyIds.includes(event.id) && event.point);
  useEffect(() => {
    const panel = chooser.current;
    if (!panel) return;
    panel.querySelector("button")?.focus({ preventScroll: true });
    const frame = requestAnimationFrame(() => {
      const bounds = panel.getBoundingClientRect();
      const navigation = document.querySelector<HTMLElement>(".mobile-nav");
      const bottom = navigation?.getClientRects().length ? navigation.getBoundingClientRect().top : window.innerHeight;
      // A previous stop can leave the map partly scrolled offscreen. Reopening
      // its choices must reveal the close control as well as the focused item.
      if (bounds.top < 12 || bounds.bottom > bottom - 12)
        panel.scrollIntoView({ block: "center", inline: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [nearbyIds]);
  const selection = events.find((e) => e.id === selectedId);
  const activeActions = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!compact && selectedId) activeActions.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [compact, selectedId]);
  // Keep markers and the visitor's viewport stable through unrelated trip saves.
  const pinKey = JSON.stringify([trip?.start, events.map((e) => [e.id, e.place, e.date, e.point, e.area, !hiddenMapDays.includes(e.date)])]);
  const destination = trip?.destinations[0] ?? "";
  const initialFocus = useRef(true);
  const geoDot = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const locationPoint = useRef<MapPoint | null>(null);
  const latestSelectedId = useRef(selectedId);
  latestSelectedId.current = selectedId;
  const retainedView = useRef<{
    center: MapPoint; zoom: number; heading: number; tilt: number;
    mapTypeId: string; selectedId: string;
  } | null>(null);
  const restoredSelection = useRef<{ view: google.maps.Map; selectedId: string } | null>(null);
  const retainedFocus = useRef<string | null>(null);
  const pinCompletionFocus = useRef<Element | null>(null);

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let active = true;
    let deniedForAttempt = false;
    let timer: number;
    setReady(false);
    setLoadError("");
    const savedView = retainedView.current;
    setSatellite(savedView?.mapTypeId === "hybrid");
    setEditing(false);
    setLocating(false);
    setLocationStatus((status) => status === "Finding your location…" ? "" : status);
    initialFocus.current = !savedView;
    const denied = () => {
      deniedForAttempt = true;
      clearTimeout(timer);
      if (active) {
        setReady(false);
        setLoadError("Google Maps declined this site's map key.");
      }
    };
    window.addEventListener(authFailureEvent, denied);
    // Offer recovery during either SDK or tile delay; a late successful load
    // still becomes ready automatically without requiring a retry.
    timer = window.setTimeout(() => {
      if (active && !deniedForAttempt)
        setLoadError("Google Maps is taking longer than usual to display this area.");
    }, 8000);
    void (async () => {
      await loadGoogleMaps();
      const { Map: GoogleMap } = (await google.maps.importLibrary(
        "maps",
      )) as google.maps.MapsLibrary;
      const { ColorScheme } = await google.maps.importLibrary("core") as google.maps.CoreLibrary;
      await google.maps.importLibrary("marker");
      if (!active || deniedForAttempt) return;
      const view = new GoogleMap(container, {
        mapId,
        colorScheme: ColorScheme[mapAppearance],
        center: savedView?.center ?? { lat: 20, lng: 0 },
        zoom: savedView?.zoom ?? 2,
        heading: savedView?.heading ?? 0,
        mapTypeId: savedView?.mapTypeId ?? "roadmap",
        minZoom: 2,
        maxZoom: 21,
        disableDefaultUI: true,
        gestureHandling: compact ? "cooperative" : "greedy",
        keyboardShortcuts: true,
        clickableIcons: true,
        tilt: savedView?.tilt ?? 0,
      });
      map.current = view;
      // Cached libraries/tiles may resolve in one React batch. The generation
      // still reconnects markers and focus even if ready never renders false.
      setMapGeneration((generation) => generation + 1);
      setPreciseZoom((view.getZoom() ?? 0) >= 15);
      if (savedView) restoredSelection.current = { view, selectedId: savedView.selectedId };
      view.addListener("dragstart", () => {
        initialFocus.current = false;
        setNearbyIds([]);
      });
      view.addListener("zoom_changed", () =>
        setPreciseZoom((view.getZoom() ?? 0) >= 15),
      );
      view.addListener("tilesloaded", () => {
        clearTimeout(timer);
        if (active && !deniedForAttempt) {
          setReady(true);
          setLoadError((current) => current.includes("taking longer") ? "" : current);
        }
      });
    })().catch((error) => {
      clearTimeout(timer);
      if (active) setLoadError(error.message || "Google Maps could not load.");
    });
    return () => {
      active = false;
      window.removeEventListener(authFailureEvent, denied);
      clearTimeout(timer);
      if (map.current) {
        const center = map.current.getCenter()?.toJSON();
        if (center) retainedView.current = {
          center, zoom: map.current.getZoom() ?? 2,
          heading: map.current.getHeading() ?? 0, tilt: map.current.getTilt() ?? 0,
          mapTypeId: map.current.getMapTypeId() ?? "roadmap", selectedId: latestSelectedId.current,
        };
        const focused = document.activeElement?.closest<HTMLElement>("[data-map-focus]");
        if (!pinCompletionFocus.current && focused && container.closest(".trip-map")?.contains(focused))
          retainedFocus.current = focused.dataset.mapFocus ?? null;
        google.maps.event.clearInstanceListeners(map.current);
      }
      markers.current.forEach(detachMarker);
      markers.current.clear();
      if (geoDot.current) detachMarker(geoDot.current);
      geoDot.current = null;
      map.current = null;
      container.replaceChildren();
    };
  }, [attempt, compact, mapAppearance]);

  useEffect(() => {
    const view = map.current;
    if (!ready || !view || loadError) return;
    const controller = new AbortController();
    const points: MapPoint[] = [];
    const pinned = new Set(events.filter((event) => event.point && !hiddenMapDays.includes(event.date)).map((event) => event.id));
    markers.current.forEach((marker, id) => {
      if (!pinned.has(id)) {
        detachMarker(marker);
        markers.current.delete(id);
      }
    });
    events.forEach((event, index) => {
      if (!event.point || hiddenMapDays.includes(event.date)) return;
      points.push(event.point);
      // Another stop finishing its lookup must not detach a focused marker.
      const signature = JSON.stringify([event.place, event.point.lat, event.point.lng, event.area]);
      const existing = markers.current.get(event.id);
      if (existing?.dataset.pinSignature === signature) {
        const numeral = existing.querySelector(".trip-pin-face");
        if (numeral) {
          numeral.textContent = String(index + 1);
          (numeral as HTMLElement).style.setProperty("--trip-day-color", dayColor(event.date));
        }
        return;
      }
      if (existing) detachMarker(existing);
      const face = document.createElement("span");
      face.className = "trip-pin";
      const numeral = document.createElement("span");
      numeral.className = "trip-pin-face";
      numeral.textContent = String(index + 1);
      numeral.style.setProperty("--trip-day-color", dayColor(event.date));
      face.append(numeral);
      const marker = new google.maps.marker.AdvancedMarkerElement({
        map: view,
        position: event.point,
        title: `Select ${event.place}`,
        gmpClickable: true,
      });
      marker.dataset.pinSignature = signature;
      marker.dataset.mapFocus = `marker:${event.id}`;
      marker.append(face);
      marker.addEventListener("gmp-click", () => {
        // Use rendered bounds so the picker works at any zoom, even for
        // separate itinerary items at exactly the same address.
        const hits: string[] = [];
        const rect = numeral.getBoundingClientRect();
        markers.current.forEach((other, id) => {
          const box = other.querySelector(".trip-pin-face")?.getBoundingClientRect();
          if (box && box.width && box.height && rect.left < box.right && rect.right > box.left &&
              rect.top < box.bottom && rect.bottom > box.top) hits.push(id);
        });
        if (hits.length > 1) {
          clickedMarker.current = event.id;
          setEditing(false);
          setNearbyIds(hits);
        } else {
          choose(event);
        }
      });
      markers.current.set(event.id, marker);
    });
    if (initialFocus.current && !selection?.point && !editing) {
      if (points.length) {
        showStops(
          view,
          points,
          events.some((e) => e.point && !e.area) ? 16 : 13,
        );
        initialFocus.current = events.some(
          (e) => !e.point && statusFor(e) === undefined,
        );
      } else if (destination) {
        const center = view.getCenter(),
          zoom = view.getZoom();
        void resolveSearchFocus(destination, controller.signal)
          .then((area) => {
            if (
              area &&
              initialFocus.current &&
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
  }, [ready, mapGeneration, pinKey, destination, loadError]);

  useEffect(() => {
    markers.current.forEach((marker, id) => {
      const active = id === selectedId;
      marker.zIndex = active ? 1000 : 0;
      marker.querySelector(".trip-pin")?.classList.toggle("chosen", active);
      marker.setAttribute("aria-pressed", String(active));
    });
  }, [ready, mapGeneration, pinKey, selectedId]);

  useEffect(() => {
    if (!ready) return;
    const restored = restoredSelection.current;
    restoredSelection.current = null;
    // Rebuilding for appearance is not a new selection: keep the exact camera.
    if (restored?.view === map.current && restored.selectedId === selectedId) return;
    const point = selection?.point;
    if (point && map.current && !editing) focusPoint(map.current, point, selection?.area);
  }, [ready, mapGeneration, selectedId, selection?.point?.lat, selection?.point?.lng]);

  useEffect(() => {
    if (!ready || loadError) return;
    if (map.current && locationPoint.current && !geoDot.current) showLocation(map.current, locationPoint.current);
    const key = retainedFocus.current;
    if (!key) return;
    const frame = requestAnimationFrame(() => {
      retainedFocus.current = null;
      const completionFocus = pinCompletionFocus.current;
      pinCompletionFocus.current = null;
      // Do not steal focus if the traveler moved to another control while tiles loaded.
      if (document.activeElement !== document.body && document.activeElement !== host.current &&
          document.activeElement !== completionFocus) return;
      const controls = host.current?.closest(".trip-map")?.querySelectorAll<HTMLElement>("[data-map-focus]");
      const control = Array.from(controls ?? []).find((element) => element.dataset.mapFocus === key);
      control?.focus({ preventScroll: true });
      if (control && completionFocus) {
        const bounds = control.getBoundingClientRect();
        const nav = document.querySelector<HTMLElement>(".mobile-nav");
        const bottom = nav?.getClientRects().length ? nav.getBoundingClientRect().top : innerHeight;
        if (bounds.top < 8 || bounds.bottom > bottom - 8)
          control.scrollIntoView({ block: "center", inline: "nearest" });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [ready, mapGeneration, loadError]);

  const overview = () => {
    select("");
    setNearbyIds([]);
    setEditing(false);
    if (map.current)
      showStops(
        map.current,
        events.flatMap((e) => (e.point ? [e.point] : [])),
        events.some((e) => e.point && !e.area) ? 16 : 13,
      );
  };
  function showLocation(view: google.maps.Map, point: MapPoint) {
    if (geoDot.current) detachMarker(geoDot.current);
    const dot = document.createElement("span");
    dot.className = "google-location-dot";
    geoDot.current = new google.maps.marker.AdvancedMarkerElement({
      map: view, position: point, title: "Your location", anchorTop: "-50%",
    });
    geoDot.current.append(dot);
  }
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
        locationPoint.current = point;
        showLocation(view, point);
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
  function choose(event: Event & { area: boolean }) {
    initialFocus.current = false;
    setNearbyIds([]);
    setEditing(false);
    setHiddenMapDays((current) => current.filter((date) => date !== event.date));
    select(event.id);
    if (event.point && map.current)
      focusPoint(map.current, event.point, event.area);
  }
  function dismissChooser() {
    setNearbyIds([]);
    markers.current.get(clickedMarker.current)?.focus({ preventScroll: true });
  }
  function finishPinPlacement() {
    if (requestedAppearance !== mapAppearance) {
      retainedFocus.current = "pin-edit";
      // Safari clicks focus the nearest focusable ancestor instead of the button.
      // Accept that unchanged origin after rebuilding, but preserve any later move.
      pinCompletionFocus.current = document.activeElement;
    }
    setEditing(false);
    requestAnimationFrame(() => activeActions.current?.querySelector<HTMLElement>("[data-pin-edit]")?.focus());
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
    let updated = false;
    updateTrip((draft) => {
      const event = draft.events.find(
        (e) => e.id === selection.id && e.place === selection.place,
      );
      if (event) {
        event.point = { lat: center.lat, lng: center.lng };
        event.googlePlaceId = null;
        updated = true;
      }
    });
    // Account changes use the shared queue's confirmed-save feedback, including retries.
    // An optimistic local pin is not proof that the database accepted the position.
    if (updated) setUpdatedPin(trip.persistence === "account" ? "" : selection.id);
    finishPinPlacement();
  }
  const editingPin = ready && !loadError && editing && !!selection;
  useEffect(() => {
    const actions = pinActions.current;
    const canvas = host.current?.parentElement;
    if (!editingPin || !actions || !canvas) return;
    let frame = 0;
    const measure = () => {
      // The actual Google canvas grows too, so the crosshair still marks its center.
      canvas.style.setProperty("--pin-actions-height", `${actions.getBoundingClientRect().height}px`);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const bottom = document.querySelector(".mobile-nav")?.getBoundingClientRect().top ?? innerHeight;
        if (innerWidth <= 760 && actions.getBoundingClientRect().bottom > bottom - 8) canvas.scrollIntoView({block: "center"});
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(actions);
    measure();
    // The initiating button disappears in placement mode. Keep keyboard users
    // on our map region, where arrows pan through the public Maps API.
    const focusFrame = requestAnimationFrame(() => host.current?.focus({ preventScroll: true }));
    return () => { observer.disconnect(); cancelAnimationFrame(frame); cancelAnimationFrame(focusFrame); canvas.style.removeProperty("--pin-actions-height"); };
  }, [editingPin, selectedId]);
  return (
    <div className={`map-layout trip-map ${compact ? "compact" : ""}`} data-map-state={loadError ? "unavailable" : !events.length ? "empty" : ready ? "ready" : "loading"}>
      <div
        className="map-canvas"
        onPointerDownCapture={() => {
          initialFocus.current = false;
        }}
        onKeyDownCapture={() => {
          initialFocus.current = false;
        }}
      >
        <div
          ref={host}
          className="trip-map-host"
          data-map-focus="map"
          role="region"
          tabIndex={editingPin ? 0 : -1}
          aria-label="Trip places map"
          aria-describedby={editingPin ? pinInstructionsId : undefined}
          onKeyDown={(key) => {
            if (!editingPin || key.target !== key.currentTarget || !map.current) return;
            const movement: Record<string, [number, number]> = {
              ArrowLeft: [-32, 0], ArrowRight: [32, 0], ArrowUp: [0, -32], ArrowDown: [0, 32],
            };
            if (movement[key.key]) {
              key.preventDefault();
              key.stopPropagation();
              map.current.panBy(...movement[key.key]);
            } else if (key.key === "Escape") {
              key.preventDefault();
              finishPinPlacement();
            }
          }}
        />
        {nearbyStops.length > 0 && ready && !loadError && (
          <div className="overlapping-stops" role="group" aria-label="Choose a map stop" ref={chooser}
            onKeyDown={(key) => { if (key.key === "Escape") dismissChooser(); }}>
            <div className="overlapping-stops-heading">
              <strong>Choose a stop · {nearbyStops.length}</strong>
              <button onClick={dismissChooser} aria-label="Close stop list" data-map-focus="stop-list"><X size={16} /></button>
            </div>
            <div className="overlapping-stops-list">{nearbyStops.map((event) => (
              <button key={event.id} data-map-focus={`stop:${event.id}`} onClick={() => {
                choose(event);
                markers.current.get(event.id)?.focus({ preventScroll: true });
              }}>
                <strong>{event.name}</strong>
                <small>{dateText(event.date, true)} · {timeText(event.start)}</small>
              </button>
            ))}</div>
          </div>
        )}
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
                    data-map-focus={`type:${label}`}
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
                data-map-focus="zoom-in"
                aria-label="Zoom in"
                title="Zoom in"
                onClick={() =>
                  map.current?.setZoom((map.current.getZoom() ?? 2) + 1)
                }
              >
                <Plus />
              </button>
              <button
                data-map-focus="zoom-out"
                aria-label="Zoom out"
                title="Zoom out"
                onClick={() =>
                  map.current?.setZoom((map.current.getZoom() ?? 2) - 1)
                }
              >
                <Minus />
              </button>
              <button
                data-map-focus="all-pins"
                aria-label="Show all pins"
                title="Show all pins"
                onClick={overview}
              >
                <span className="map-fit-label">All<br/>pins</span>
              </button>
              <button
                data-map-focus="my-location"
                aria-label="Show my location"
                title="Show my location"
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
            <strong>{loadError.includes("taking longer") ? "Still loading Google Maps" : "Google Maps is unavailable"}</strong>
            <span>{loadError.includes("declined") ? "Your itinerary is still available. Try again later or open Google Maps." : loadError}</span>
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
          <div ref={pinActions} className="pin-placement">
            <span className="pin-placement-copy">
              <strong>{selection?.name}</strong>
              <span id={pinInstructionsId}>{preciseZoom
                ? "Drag the map or use arrow keys to position the pin"
                : "Zoom in to position the pin"}</span>
            </span>
            <Button disabled={!preciseZoom} onClick={savePin}>
              Save pin
            </Button>
            <button
              aria-label="Cancel pin placement"
              onClick={finishPinPlacement}
            >
              Cancel
            </button>
          </div>
        )}
        {!compact && selection?.point && ready && !loadError && !editingPin && !nearbyStops.length && (
          <a className="map-itinerary-card"
            aria-label={`Open ${selection.name} in itinerary`}
            href={`#/11?${new URLSearchParams({ date: selection.date, event: selection.id })}`}>
            <CalendarDays size={19} aria-hidden="true" />
            <span>
              <strong>{selection.name}</strong>
              <small>View itinerary item</small>
            </span>
            <ChevronRight size={17} aria-hidden="true" />
          </a>
        )}
      </div>
        {!compact && selection && <button className="map-selected-return" onClick={() => { activeActions.current?.scrollIntoView({block:"center"}); activeActions.current?.focus({preventScroll:true}); }}>Selected stop: {selection.name} <ChevronRight size={16}/></button>}
        {compact && selection && !nearbyStops.length && (
          <button
            className="next-place-card"
            onClick={() => go(17, { event: selection.id })}
          >
            <Navigation />
            <span>
              <small>{selection.id === selectedEvent ? (selection.date === s.date && selection.start <= s.time && selection.end > s.time ? "HAPPENING NOW" : "UP NEXT") : "VIEW ON MAP"}</small>
              <strong>{selection.place}</strong>
            </span>
            <ArrowUpRight />
          </button>
        )}
      {!compact && (
        <aside className="trip-map-list" aria-label="Trip places">
          <h2>
            Places <small>{events.length}</small>
          </h2>
          {mapDayGroups.length > 0 && (
            <label className="map-day-all-toggle">
              <input
                type="checkbox"
                aria-label="Show events from all days on the trip"
                checked={allDaysVisible}
                onChange={(change) => {
                  const show = change.currentTarget.checked;
                  setHiddenMapDays(show ? [] : mapDays);
                }}
              />
              <span>Show events from all days on the trip</span>
            </label>
          )}
          {selectedId && !selection && events.length > 0 && (
            <div role="status"><p>This stop was removed or no longer has a location.</p><Button variant="outline" onClick={() => go(8)}>View itinerary</Button></div>
          )}
          {!events.length && (
            <div className="map-empty-places"><p role={selectedId ? "status" : undefined}>{selectedId ? "This stop was removed or no longer has a location." : trip && canEdit(trip, s.userId, trip.start) ? "Add a place to your itinerary to see it on the map." : "Places will appear when a trip editor adds locations to the itinerary."}</p><Button variant="outline" onClick={() => go(8)}>View itinerary</Button>{trip && canEdit(trip, s.userId, trip.start) && <Button onClick={() => go(7, { date: trip.start, return: "17" })}>Add a place</Button>}</div>
          )}
          {mapDayGroups.map((group, groupIndex) => (
            <div className="map-day-group" key={group.date} style={{ "--trip-day-color": dayColor(group.date) } as React.CSSProperties}>
              <details className="map-day-disclosure" open={groupIndex === 0 || selection?.date === group.date}>
                <summary>
                  <span className="map-day-number">Day {group.day}</span>
                  <span className="map-day-date">{dateText(group.date, true)}</span>
                  <small>{group.events.length}</small>
                  <ChevronRight size={15} aria-hidden="true" />
                </summary>
                <div className="map-day-events">
            {group.events.map((event, index) => (
            <div
              key={event.id}
              className={
                selection?.id === event.id ? "place-row active" : "place-row"
              }
            >
              <button
                className="place-select"
                aria-expanded={selection?.id === event.id}
                onClick={() => {
                  if (selection?.id === event.id) {
                    select("");
                    setNearbyIds([]);
                    setEditing(false);
                  } else choose(event);
                }}
              >
                <span className="place-number" style={{ "--trip-day-color": dayColor(event.date) } as React.CSSProperties}>{index + 1}</span>
                <span>
                  <strong>{event.name}</strong>
                  <small>{event.place}</small>
                  <small>{dateText(event.date, true)} · {timeText(event.start)}</small>
                  {event.point && event.area && <em>Area center</em>}
                  {!event.point && (
                    <em>
                      {!ready
                        ? "Address only"
                        : statusFor(event) === undefined
                          ? "Finding address…"
                          : statusFor(event) === "error"
                            ? "Lookup unavailable"
                            : "Location not found"}
                    </em>
                  )}
                </span>
                <ChevronRight size={15} />
              </button>
              {selection?.id === event.id && (
                <div className="place-actions" ref={activeActions} tabIndex={-1}>
                  {event.point && ready && !loadError && <button className="place-show-map" onClick={() => {
                    host.current?.scrollIntoView({ block: "center" });
                    host.current?.focus({ preventScroll: true });
                  }}><MapPin size={15} aria-hidden="true" /> Show on map</button>}
                  <a href={`#/11?${new URLSearchParams({ date: event.date, event: event.id })}`}>
                    <CalendarDays size={15} aria-hidden="true" /> View itinerary item
                  </a>
                  {!event.point && statusFor(event) === "error" && (
                    <button className={!loadError ? "primary-recovery" : undefined} onClick={() => retryLookup(event)}>
                      Retry lookup
                    </button>
                  )}
                  {event.point && (
                    <a
                      href={`https://www.google.com/maps/dir/?${new URLSearchParams({ api: "1", destination: `${event.point.lat},${event.point.lng}`, travelmode: "walking" })}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Navigation size={15} /> Directions
                    </a>
                  )}
                  {!event.point && (loadError || statusFor(event) !== undefined) && (
                    <a className={loadError || (!trip || !canEdit(trip, s.userId, event.date)) && statusFor(event) !== "error" ? "primary-recovery" : undefined} href={`https://www.google.com/maps/search/?${new URLSearchParams({ api: "1", query: event.place })}`}
                      target="_blank" rel="noreferrer">
                      <ArrowUpRight size={15} /> Search in Google Maps
                    </a>
                  )}
                  {trip && canEdit(trip, s.userId, event.date) && !editing && (
                    <>
                      {ready && !loadError && (event.point || statusFor(event) !== undefined) && (
                        <button data-pin-edit data-map-focus="pin-edit" onClick={() => {
                          initialFocus.current = false;
                          setUpdatedPin("");
                          setLocationStatus("");
                          setEditing(true);
                          host.current?.scrollIntoView({ block: "center" });
                        }}>
                          <MapPin size={15} /> {event.point && !event.area ? "Adjust pin" : "Place pin"}
                        </button>
                      )}
                      {(!event.point || event.area) && (
                        <button aria-label="Edit itinerary location" className={!loadError && !event.point && statusFor(event) !== "error" ? "primary-recovery" : undefined} onClick={() => go(7, { event: event.id, date: event.date, return: "17" })}>
                          Edit location
                        </button>
                      )}
                    </>
                  )}
                  {updatedPin === event.id && <p className="pin-update-status" role="status">Pin position updated.</p>}
                </div>
              )}
            </div>
          ))}
                </div>
              </details>
              <label className="map-day-toggle">
                <input
                  type="checkbox"
                  aria-label={`Show Day ${group.day} events on the map`}
                  checked={visibleMapDays.has(group.date)}
                  onChange={(change) => {
                    const show = change.currentTarget.checked;
                    setHiddenMapDays((current) => show
                      ? current.filter((date) => date !== group.date)
                      : current.includes(group.date) ? current : [...current, group.date]);
                  }}
                />
                <span>Show on map</span>
              </label>
            </div>
          ))}
        </aside>
      )}
    </div>
  );
}
export function MapPage() {
  const { trip, s, route, open } = useApp();
  const viewOnly = trip && member(trip, s.userId)?.role === "Viewer";
  return (
    <>
      <PageHead
        eyebrow={viewOnly ? "View only" : undefined}
        description={trip?.destinations.join(" · ")}
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
          key={trip.id}
          selectedEvent={route.params.get("event") || undefined}
          selectedPlace={route.params.get("place") || undefined}
        />
      )}
    </>
  );
}
