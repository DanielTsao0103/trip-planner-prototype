import { expect, test } from "@playwright/test";
import { seed } from "../src/data.ts";

test("select a shared stop, fine-tune its pin, reload, and restore the overview", async ({
  page,
}) => {
  const store = seed();
  store.tripId = "seattle";
  store.userId = "maya";
  await page.addInitScript((value) => {
    sessionStorage.setItem("trip-planner-demo-session", "active");
    if (!localStorage.getItem("trip-planner-demo-v1:demo-maya"))
      localStorage.setItem(
        "trip-planner-demo-v1:demo-maya",
        JSON.stringify(value),
      );
  }, store);
  // Keep the save/reload regression deterministic. Live provider rendering is
  // checked separately with the published origin and its restricted browser key.
  await page.addInitScript(() => {
    type Point = { lat: number; lng: number };
    class TestMap {
      center: Point = { lat: 0, lng: 0 };
      zoom = 2;
      host: HTMLElement;
      constructor(host: HTMLElement) {
        this.host = host;
        host.tabIndex = 0;
        host.addEventListener("keydown", (key) => {
          if (key.key === "ArrowRight")
            this.center = { ...this.center, lng: this.center.lng + 0.001 };
        });
      }
      getCenter() {
        return { toJSON: () => this.center };
      }
      getZoom() {
        return this.zoom;
      }
      moveCamera({ center, zoom }: { center: Point; zoom: number }) {
        this.center = center;
        this.zoom = zoom;
        this.host.dispatchEvent(new Event("zoom_changed"));
      }
      addListener(type: string, fn: EventListener) {
        this.host.addEventListener(type, fn);
        if (type === "tilesloaded")
          queueMicrotask(() => this.host.dispatchEvent(new Event(type)));
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
          importLibrary: async () => ({ Map: TestMap }),
          marker: { AdvancedMarkerElement: TestMarker },
          LatLngBounds: Bounds,
          event: { clearInstanceListeners() {} },
        },
      },
    });
  });
  await page.route("https://photon.komoot.io/**", (route) =>
    route.fulfill({ json: { features: [] } }),
  );
  await page.goto("./#/17");
  const museum = page.getByRole("button", {
    name: "Select Seattle Art Museum",
    exact: true,
  });
  await expect(museum).toBeVisible();
  await museum.focus();
  await museum.press("Enter");
  await expect(
    page.getByRole("link", { name: "Directions", exact: true }),
  ).toHaveAttribute("href", /47.6077008%2C-122.3385575/);
  await page.getByRole("button", { name: "Adjust pin" }).click();
  const map = page.locator(".trip-map-host");
  await map.focus();
  await map.press("ArrowRight");
  await page.getByRole("button", { name: "Save pin", exact: true }).click();
  const url = await page
    .getByRole("link", { name: "Directions", exact: true })
    .getAttribute("href");
  expect(url).not.toContain("47.6077008%2C-122.3385575");
  await page.reload();
  await page
    .getByRole("button", { name: /A morning of art.*Seattle Art Museum/ })
    .click();
  await expect(
    page.getByRole("link", { name: "Directions", exact: true }),
  ).toHaveAttribute("href", url!);
  await page.getByRole("button", { name: "Show all pins" }).click();
  await expect(
    page.getByRole("link", { name: "Directions", exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});

test("a blocked Google SDK offers recovery and keeps saved directions available", async ({
  page,
}) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("trip-planner-demo-session", "active"),
  );
  await page.route("https://maps.googleapis.com/maps/api/js?**", (route) =>
    route.abort(),
  );
  await page.goto("./#/17?event=museum");
  await expect(
    page.getByText("Google Maps is unavailable", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Open Google Maps", exact: true }),
  ).toHaveAttribute("href", /47.6077008/);
  await expect(
    page.getByRole("link", { name: "Directions", exact: true }),
  ).toHaveAttribute("href", /47.6077008/);
});
