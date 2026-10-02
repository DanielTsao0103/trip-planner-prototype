import React, { useRef, useState } from "react";
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
export function TravelMap({
  compact = false,
  selectedPlace,
}: {
  compact?: boolean;
  selectedPlace?: string;
}) {
  const { trip: t, s, go } = useApp();
  const [zoom, setZoom] = useState(1),
    [pan, setPan] = useState({ x: 0, y: 0 }),
    [selected, setSelected] = useState(selectedPlace || ""),
    [expanded, setExpanded] = useState(true);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(
    null,
  );
  const [dragged, setDragged] = useState(false);
  const places = Array.from(
    new Set([
      ...(t?.events.map((e) => e.place) || []),
      ...(selectedPlace ? [selectedPlace] : []),
      "Cedar Gallery · nearby sample",
    ]),
  );
  const selectedIndex = Math.max(0, places.indexOf(selected));
  const points = places.map((place, i) => ({
    place,
    x: 490 + (i % 3) * 125,
    y: 145 + Math.floor(i / 3) * 142,
  }));
  const target = points[selectedIndex];
  return (
    <div className={`map-layout ${compact ? "compact" : ""}`}>
      <div className="map-canvas">
        <svg
          viewBox="0 0 1000 620"
          aria-label="Illustrative interactive map"
          role="group"
          onPointerDown={(e) => {
            drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
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
              <rect x="9" y="10" width="74" height="64" rx="5" fill="#e7e3d8" />
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
            <path d="M540 40h180v75H540zM760 390h160v108H760z" fill="#c3d2b2" />
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
                  if (e.key === "Enter" || e.key === " ") setSelected(p.place);
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
                <circle cx="475" cy="475" r="29" fill="#3b80c9" opacity=".12" />
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
        <div className="map-label-badge">
          <span className="status-dot" />
          Interactive demo map
        </div>
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
        <span className="map-disclaimer">
          Illustrative places & routes · not live navigation
        </span>
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
            <span>{selected || "Around you"}</span>
            <ChevronDown size={18} />
          </button>
          <div className="route-content">
            {!s.location && (
              <div className="info-banner">
                Simulated location is unavailable. You can still explore places.
              </div>
            )}
            {selected ? (
              <>
                <div className="eyebrow">A LITTLE WAY FROM HERE</div>
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
                  Explore other places
                </Button>
              </>
            ) : (
              <>
                <div className="eyebrow">GET YOUR BEARINGS</div>
                <h2>Around you.</h2>
                <p>Your plans and a little nearby inspiration.</p>
              </>
            )}
            <h3>Places on your map</h3>
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
        title="Find your way to a good day."
        description="Your places, and the little journeys between them."
        action={
          <Button variant="outline" onClick={() => open("nearby")}>
            <Sparkles size={16} />
            Nearby idea
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
