/** Implementation status: configured Google Maps/geocoding and browser geolocation are real. The SVG fallback, 420/700-foot distances, four-minute route, and nearby fixture are not live navigation. See ../IMPLEMENTATION_STATUS.md. */
import React, { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Compass,
  LocateFixed,
  MapPin,
  Minus,
  Navigation,
  Plus,
  Route,
  ChevronDown,
  Clock,
  Sparkles,
} from "lucide-react";
import { useApp } from "./state";
import { Badge, Button, PageHead, Empty } from "./ui";
import {
  directionsUrl,
  loadGoogleMaps,
  locatePlace,
  mapId,
  mapsConfigured,
  type LatLng,
} from "./google-maps";

/** Real Google map with a numbered pin for each place. Reports a load failure so the caller can fall back. */
function LiveMap({
  places,
  selected,
  onSelect,
  areas,
  showLocation,
  onFail,
  onLocationError,
  onRequestLocation,
}: {
  places: string[];
  selected: string;
  onSelect: (place: string) => void;
  areas: string[];
  showLocation: boolean;
  onFail: () => void;
  onLocationError: () => void;
  onRequestLocation: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const pins = useRef(
    new Map<
      string,
      {
        marker: google.maps.marker.AdvancedMarkerElement;
        el: HTMLElement;
        pos: LatLng;
      }
    >(),
  );
  const [ready, setReady] = useState(false);
  const [missing, setMissing] = useState<string[]>([]);
  // Keep the latest callbacks and selection reachable from async code without re-running the effects.
  const onFailRef = useRef(onFail);
  onFailRef.current = onFail;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const placesKey = places.join("|"),
    areasKey = areas.join("|");

  function applySelected(pan: boolean) {
    pins.current.forEach(({ el }, place) =>
      el.classList.toggle("selected", place === selectedRef.current),
    );
    const chosen = pins.current.get(selectedRef.current);
    if (pan && chosen && map.current) map.current.panTo(chosen.pos);
  }

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadGoogleMaps();
        const { Map: GoogleMap } = (await google.maps.importLibrary(
          "maps",
        )) as google.maps.MapsLibrary;
        await google.maps.importLibrary("marker");
        if (cancelled || !host.current) return;
        map.current = new GoogleMap(host.current, {
          mapId,
          center: { lat: 47.6062, lng: -122.3321 },
          zoom: 12,
          clickableIcons: false,
          gestureHandling: "greedy",
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
        });
        setReady(true);
      } catch {
        if (!cancelled) onFailRef.current();
      }
    })();
    return () => {
      cancelled = true;
      pins.current.clear();
      map.current = null;
    };
  }, []);

  // Find each place and drop its pin whenever the list of places changes.
  useEffect(() => {
    if (!ready || !map.current) return;
    let cancelled = false;
    (async () => {
      const found = await Promise.all(
        places.map(async (p) => [p, await locatePlace(p, areas)] as const),
      );
      if (cancelled || !map.current) return;
      pins.current.forEach(({ marker }) => (marker.map = null));
      pins.current.clear();
      const bounds = new google.maps.LatLngBounds();
      const notFound: string[] = [];
      found.forEach(([place, pos], i) => {
        if (!pos) {
          notFound.push(place);
          return;
        }
        const el = document.createElement("div");
        el.className = "gmap-pin";
        el.textContent = String(i + 1);
        const marker = new google.maps.marker.AdvancedMarkerElement({
          map: map.current!,
          position: pos,
          content: el,
          title: place,
        });
        marker.addListener("click", () => onSelectRef.current(place));
        pins.current.set(place, { marker, el, pos });
        bounds.extend(pos);
      });
      setMissing(notFound);
      if (!bounds.isEmpty()) {
        map.current.fitBounds(bounds, 72);
      } else if (areas[0]) {
        // No pins to fit (a new trip with no events yet): show the trip's own destination.
        const home = await locatePlace(areas[0], []);
        if (cancelled || !map.current) return;
        if (home) {
          map.current.setCenter(home);
          map.current.setZoom(12);
        }
      }
      applySelected(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, placesKey, areasKey]);

  // Highlight and center on the chosen place.
  useEffect(() => {
    if (ready) applySelected(true);
  }, [ready, selected]);

  // The viewer's real position, once known, and the blue dot that marks it.
  const you = useRef<LatLng | null>(null);
  const dot = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const centerWhenFound = useRef(false);
  const alive = useRef(true);
  const showLocationRef = useRef(showLocation);
  showLocationRef.current = showLocation;
  const onLocationErrorRef = useRef(onLocationError);
  onLocationErrorRef.current = onLocationError;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  function centerOnYou() {
    if (!you.current || !map.current) return;
    map.current.panTo(you.current);
    map.current.setZoom(15);
  }

  // Ask the browser for the position, put the dot there, and optionally move the map to it.
  function locate() {
    if (!navigator.geolocation) {
      onLocationErrorRef.current();
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // Ignore answers that arrive after the map closed or location was turned off.
        if (!alive.current || !map.current || !showLocationRef.current) return;
        you.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (dot.current) {
          dot.current.position = you.current;
        } else {
          const el = document.createElement("div");
          el.className = "gmap-you";
          dot.current = new google.maps.marker.AdvancedMarkerElement({
            map: map.current,
            position: you.current,
            content: el,
            title: "You are here",
          });
        }
        if (centerWhenFound.current) {
          centerWhenFound.current = false;
          centerOnYou();
        }
      },
      () => {
        // Permission blocked, or the position could not be found in time.
        centerWhenFound.current = false;
        if (alive.current) onLocationErrorRef.current();
      },
      { timeout: 8000 },
    );
  }

  // Show the viewer's real position whenever location is on.
  useEffect(() => {
    if (!ready || !showLocation) return;
    locate();
    return () => {
      if (dot.current) dot.current.map = null;
      dot.current = null;
      you.current = null;
    };
  }, [ready, showLocation]);

  // The "my location" button: turn location on if needed, then move the map to the dot.
  function showMe() {
    if (!showLocation) {
      centerWhenFound.current = true;
      onRequestLocation();
    } else if (you.current) {
      centerOnYou();
    } else {
      centerWhenFound.current = true;
      locate();
    }
  }

  return (
    <>
      <div
        ref={host}
        className="gmap-host"
        role="application"
        aria-label="Map of your places"
      />
      <div className="map-controls">
        <button
          type="button"
          aria-label="Show my location"
          title="Show my location"
          onClick={showMe}
        >
          <LocateFixed size={19} />
        </button>
      </div>
      {missing.length > 0 && (
        <span className="map-disclaimer">
          Could not locate:{" "}
          {missing.map((m) => m.split("·")[0].trim()).join(", ")}
        </span>
      )}
    </>
  );
}

export function TravelMap({
  compact = false,
  selectedPlace,
}: {
  compact?: boolean;
  selectedPlace?: string;
}) {
  const { trip: t, s, go, mutate } = useApp();
  const [zoom, setZoom] = useState(1),
    [pan, setPan] = useState({ x: 0, y: 0 }),
    [selected, setSelected] = useState(selectedPlace || ""),
    [expanded, setExpanded] = useState(true),
    [liveFailed, setLiveFailed] = useState(false),
    // Asked again each time the map page opens, but not repeatedly while it stays open.
    [locationDismissed, setLocationDismissed] = useState(false),
    [locationBlocked, setLocationBlocked] = useState(false);
  // The live Google map is used only when a key is set and it loaded; otherwise the illustrative map stays.
  const live = mapsConfigured && !liveFailed;
  const areas = t?.destinations || [];
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(
    null,
  );
  const [dragged, setDragged] = useState(false);
  const places = Array.from(
    new Set([
      ...(t?.events.map((e) => e.place) || []),
      ...(selectedPlace ? [selectedPlace] : []),
      // The made-up nearby sample place only exists on the illustrative map.
      ...(live ? [] : ["Cedar Gallery · nearby sample"]),
    ]),
  );
  const selectedIndex = Math.max(0, places.indexOf(selected));
  const points = places.map((place, i) => ({
    place,
    x: 490 + (i % 3) * 125,
    y: 145 + Math.floor(i / 3) * 142,
  }));
  const target = points[selectedIndex];
  // Turning the setting on is what makes the map ask the browser for permission.
  const requestLocation = () => {
    setLocationBlocked(false);
    mutate((v) => {
      v.location = true;
    });
  };
  return (
    <div className={`map-layout ${compact ? "compact" : ""}`}>
      <div className="map-canvas">
        {live && (
          <LiveMap
            places={places}
            selected={selected}
            onSelect={setSelected}
            areas={areas}
            showLocation={s.location}
            onFail={() => setLiveFailed(true)}
            onLocationError={() => {
              setLocationBlocked(true);
              setLocationDismissed(false);
            }}
            onRequestLocation={requestLocation}
          />
        )}
        {live && !compact && !s.location && !locationDismissed && (
          <div
            className="map-location-prompt"
            role="dialog"
            aria-label="Show your location"
          >
            <strong>Show your location on the map?</strong>
            <p>
              Your browser will ask for permission. Your position stays on your
              device and is not saved.
            </p>
            <div>
              <Button onClick={requestLocation}>Turn on location</Button>
              <Button variant="text" onClick={() => setLocationDismissed(true)}>
                Not now
              </Button>
            </div>
          </div>
        )}
        {live &&
          !compact &&
          s.location &&
          locationBlocked &&
          !locationDismissed && (
            <div className="map-location-prompt" role="status">
              <strong>Location is blocked</strong>
              <p>
                Allow location for this site in your browser's address bar
                settings, then reload the page.
              </p>
              <div>
                <Button
                  variant="text"
                  onClick={() => setLocationDismissed(true)}
                >
                  Dismiss
                </Button>
              </div>
            </div>
          )}
        {!live && (
          <svg
            viewBox="0 0 1000 620"
            aria-label="Illustrative interactive map"
            role="group"
            onPointerDown={(e) => {
              drag.current = {
                x: e.clientX,
                y: e.clientY,
                px: pan.x,
                py: pan.y,
              };
              setDragged(false);
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (drag.current) {
                const dx = e.clientX - drag.current.x,
                  dy = e.clientY - drag.current.y;
                if (Math.abs(dx) + Math.abs(dy) > 5) setDragged(true);
                setPan({ x: drag.current.px + dx, y: drag.current.py + dy });
              }
            }}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
          >
            <defs>
              <pattern
                id="blocks"
                x="0"
                y="0"
                width="98"
                height="90"
                patternUnits="userSpaceOnUse"
              >
                <rect width="98" height="90" fill="#f3f0e7" />
                <rect
                  x="9"
                  y="10"
                  width="74"
                  height="64"
                  rx="5"
                  fill="#e7e3d8"
                />
                <path d="M0 85H98M91 0V90" stroke="#fffdf8" strokeWidth="12" />
              </pattern>
            </defs>
            <rect width="1000" height="620" fill="#cadde0" />
            <g
              transform={`translate(${pan.x} ${pan.y}) translate(500 310) scale(${zoom}) translate(-500 -310)`}
            >
              <path
                d="M350-200L1100-200V900H590L420 560 320 430 430 230Z"
                fill="url(#blocks)"
              />
              <path
                d="M404-100L500 620M350 350L1080 140M385 520L1100 440"
                fill="none"
                stroke="#d4c9b5"
                strokeWidth="21"
              />
              <path
                d="M404-100L500 620M350 350L1080 140M385 520L1100 440"
                fill="none"
                stroke="#fffef9"
                strokeWidth="14"
              />
              <path
                d="M540 40h180v75H540zM760 390h160v108H760z"
                fill="#c3d2b2"
              />
              <path d="M355 390l-115 38-10-22 130-41" fill="#e9e4d8" />
              <text x="95" y="265" className="water-label">
                ELLIOTT BAY
              </text>
              <text x="573" y="315" className="map-label">
                DOWNTOWN
              </text>
              <text x="800" y="458" className="park-label">
                City garden
              </text>
              <text x="525" y="95" className="park-label">
                Neighborhood park
              </text>
              <text
                x="825"
                y="180"
                className="street-label"
                transform="rotate(-15 825 180)"
              >
                Pine Street
              </text>
              <text x="590" y="552" className="street-label">
                Waterfront way
              </text>
              {s.location && selected && target && (
                <>
                  <path
                    d={`M475 475L510 438L${target.x} 438L${target.x} ${target.y}`}
                    stroke="#fff"
                    strokeWidth="12"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d={`M475 475L510 438L${target.x} 438L${target.x} ${target.y}`}
                    stroke="#3d7666"
                    strokeWidth="6"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray="1 0"
                  />
                </>
              )}
              {points.map((p, i) => (
                <g
                  key={p.place}
                  className="map-marker"
                  tabIndex={0}
                  role="button"
                  aria-label={`Select ${p.place}`}
                  onPointerUp={(e) => {
                    if (!dragged) setSelected(p.place);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ")
                      setSelected(p.place);
                  }}
                  transform={`translate(${p.x} ${p.y})`}
                >
                  <circle
                    r={selected === p.place ? 23 : 19}
                    fill={selected === p.place ? "#234e43" : "#fffdf8"}
                    stroke="#234e43"
                    strokeWidth="2"
                  />
                  <text
                    textAnchor="middle"
                    y="5"
                    fontSize="14"
                    fill={selected === p.place ? "white" : "#234e43"}
                    fontWeight="700"
                  >
                    {i + 1}
                  </text>
                </g>
              ))}
              {s.location && (
                <g>
                  <circle
                    cx="475"
                    cy="475"
                    r="29"
                    fill="#3b80c9"
                    opacity=".12"
                  />
                  <circle
                    cx="475"
                    cy="475"
                    r="10"
                    fill="#3979c0"
                    stroke="white"
                    strokeWidth="4"
                  />
                </g>
              )}
            </g>
          </svg>
        )}
        <div className="map-label-badge">
          <span className="status-dot" />
          {live ? "Live map" : "Interactive demo map"}
        </div>
        {!live && (
          <div className="map-controls">
            <button
              aria-label="Zoom in"
              onClick={() => setZoom((z) => Math.min(2.5, z + 0.25))}
            >
              <Plus size={19} />
            </button>
            <button
              aria-label="Zoom out"
              onClick={() => setZoom((z) => Math.max(0.6, z - 0.25))}
            >
              <Minus size={19} />
            </button>
            <button
              aria-label="Recenter map"
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
            >
              <LocateFixed size={19} />
            </button>
          </div>
        )}
        {!live && (
          <span className="map-disclaimer">
            Illustrative places & routes · not live navigation
          </span>
        )}
        {compact && selectedPlace && (
          <button
            className="next-place-card"
            onClick={() => go(17, { place: selectedPlace })}
          >
            <span className="little-icon">
              <Navigation size={22} />
            </span>
            <span>
              <small>UP NEXT</small>
              <strong>{selectedPlace}</strong>
            </span>
            <ArrowUpRight size={18} />
          </button>
        )}
      </div>
      {!compact && (
        <aside className={`map-route-panel ${expanded ? "expanded" : ""}`}>
          <button
            className="route-collapse"
            onClick={() => setExpanded(!expanded)}
          >
            <span>{selected || "Places"}</span>
            <ChevronDown size={18} />
          </button>
          <div className="route-content">
            {!live && !s.location && (
              <div className="info-banner">
                Simulated location is unavailable. You can still explore places.
              </div>
            )}
            {selected && live ? (
              <>
                <h2>{selected}</h2>
                <a
                  className="btn outline full"
                  href={directionsUrl(selected, areas)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Navigation size={16} />
                  Walking directions in Google Maps
                </a>
                <p className="fine-print">
                  Opens Google Maps in a new tab. Accessibility and actual
                  conditions need checking.
                </p>
                <Button variant="outline full" onClick={() => setSelected("")}>
                  Show all places
                </Button>
              </>
            ) : selected ? (
              <>
                <h2>{selected}</h2>
                <p className="route-stat">
                  <Route size={17} />
                  700 ft walking route <span>·</span>
                  <Clock size={17} />4 min
                </p>
                <Badge tone="green">420 ft away in a straight line</Badge>
                <p className="fine-print">
                  Illustrative distance and time. Accessibility and actual
                  conditions need checking.
                </p>
                <div className="route-steps">
                  <div>
                    <span className="route-node blue" />
                    <strong>Your simulated location</strong>
                  </div>
                  <div>
                    <span className="route-line" />
                    <p>Follow the highlighted path toward the waterfront.</p>
                  </div>
                  <div>
                    <span className="route-node" />
                    <strong>{selected}</strong>
                  </div>
                </div>
                <Button variant="outline full" onClick={() => setSelected("")}>
                  Show all places
                </Button>
              </>
            ) : null}
            <h3>Places</h3>
            <div className="places-list">
              {points.map((p, i) => (
                <button
                  key={p.place}
                  onClick={() => setSelected(p.place)}
                  className={p.place === selected ? "selected" : ""}
                >
                  <span>{i + 1}</span>
                  <strong>{p.place}</strong>
                  <ChevronDown size={15} />
                </button>
              ))}
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}
export function MapPage() {
  const { trip: t, route, open } = useApp();
  return (
    <>
      <PageHead
        eyebrow={t?.destinations.join(" · ")}
        title="Map"
        action={
          <Button variant="outline" onClick={() => open("nearby")}>
            <Sparkles size={16} />
            Nearby suggestion
          </Button>
        }
      />
      <TravelMap
        key={route.params.get("place") || "map"}
        selectedPlace={route.params.get("place") || undefined}
      />
    </>
  );
}
