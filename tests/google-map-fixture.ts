import type { Page } from "@playwright/test";

/** Deterministic SDK-shaped map controls; never evidence of real Google imagery. */
export async function installGoogleMapFixture(page: Page, options: { tilesLoaded?: boolean } = {}): Promise<void> {
  await page.addInitScript(({ tilesLoaded }) => {
    type Point = { lat: number; lng: number };
    class Geocoder {
      async geocode(request: { address?: string; placeId?: string }) {
        const places = [
          {
            address: "400 Broad St, Seattle, WA",
            id: "needle",
            lat: 47.62,
            lng: -122.349,
          },
          {
            address: "85 Pike St, Seattle, WA",
            id: "market",
            lat: 47.609,
            lng: -122.342,
          },
        ];
        const place = places.find(
          (p) => request.address === p.address || request.placeId === p.id,
        );
        return {
          results: place
            ? [
                {
                  place_id: place.id,
                  types: ["street_address"],
                  geometry: {
                    location: {
                      toJSON: () => ({ lat: place.lat, lng: place.lng }),
                    },
                  },
                },
              ]
            : [],
        };
      }
    }
    // Lifecycle observations are test-only; this fixture never renders provider imagery.
    const instances: { center: Point; zoom: number; heading: number; tilt: number; mapTypeId: string; colorScheme: string }[] = [];
    Object.assign(window, { __googleMapFixture: { instances } });
    class TestMap {
      host: HTMLElement;
      state: typeof instances[number];
      listeners: [string, EventListener][] = [];
      constructor(host: HTMLElement, options: Partial<typeof instances[number]> = {}) {
        this.host = host;
        host.tabIndex = 0;
        this.state = {
          center: options.center ?? { lat: 0, lng: 0 }, zoom: options.zoom ?? 2,
          heading: options.heading ?? 0, tilt: options.tilt ?? 0,
          mapTypeId: options.mapTypeId ?? "roadmap", colorScheme: options.colorScheme ?? "LIGHT",
        };
        instances.push(this.state);
      }
      get center() { return this.state.center; }
      set center(point: Point) { this.state.center = point; }
      get zoom() { return this.state.zoom; }
      set zoom(zoom: number) { this.state.zoom = zoom; }
      getHeading() { return this.state.heading; }
      getTilt() { return this.state.tilt; }
      getMapTypeId() { return this.state.mapTypeId; }
      setMapTypeId(type: string) { this.state.mapTypeId = type; }
      panBy(x: number, y: number) {
        this.center = { lat: this.center.lat - y / 32000, lng: this.center.lng + x / 32000 };
      }
      getCenter() {
        const point = { ...this.center };
        return { toJSON: () => point, equals: (other: { toJSON(): Point }) => {
          const next = other.toJSON();
          return next.lat === point.lat && next.lng === point.lng;
        } };
      }
      getZoom() {
        return this.zoom;
      }
      setZoom(zoom: number) {
        this.zoom = zoom;
        this.host.dispatchEvent(new Event("zoom_changed"));
      }
      moveCamera({ center, zoom }: { center: Point; zoom: number }) {
        this.center = center;
        this.zoom = zoom;
        this.host.dispatchEvent(new Event("zoom_changed"));
      }
      addListener(type: string, fn: EventListener) {
        this.host.addEventListener(type, fn);
        this.listeners.push([type, fn]);
        if (type === "tilesloaded" && tilesLoaded)
          queueMicrotask(() => this.host.dispatchEvent(new Event(type)));
      }
      clearListeners() {
        this.listeners.forEach(([type, fn]) => this.host.removeEventListener(type, fn));
        this.listeners = [];
      }
      fitBounds() {}
    }
    class TestMarker extends HTMLElement {
      constructor(options: { map: TestMap; title: string }) {
        super();
        this.tabIndex = 0;
        this.setAttribute("role", "button");
        this.setAttribute("aria-label", options.title);
        this.onclick = () => this.dispatchEvent(new Event("gmp-click"));
        this.onkeydown = (key) => {
          if (key.key === "Enter") this.click();
        };
        options.map.host.append(this);
      }
      set map(value: null) {
        if (value === null) this.remove();
      }
    }
    customElements.define("test-map-marker", TestMarker);
    class Bounds {
      points: Point[] = [];
      extend(p: Point) {
        this.points.push(p);
      }
      getNorthEast() {
        return { equals: () => this.points.length === 1 };
      }
      getSouthWest() {
        return this.points[0];
      }
    }
    Object.assign(window, {
      google: {
        maps: {
          importLibrary: async () => ({ Map: TestMap, Geocoder, ColorScheme: { LIGHT: "LIGHT", DARK: "DARK", FOLLOW_SYSTEM: "FOLLOW_SYSTEM" } }),
          marker: { AdvancedMarkerElement: TestMarker },
          LatLngBounds: Bounds,
          event: { clearInstanceListeners(instance: TestMap) { instance.clearListeners(); } },
        },
      },
    });
  }, { tilesLoaded: options.tilesLoaded ?? true });
}
