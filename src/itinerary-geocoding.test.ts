import test from "node:test";
import assert from "node:assert/strict";
import { geocodeItineraryPlace } from "./itinerary-geocoding.ts";

function response(id: string, type = "street_address", partial = false) {
  return {
    results: [
      {
        place_id: id,
        types: [type],
        partial_match: partial,
        geometry: {
          location: { toJSON: () => ({ lat: 47.62, lng: -122.349 }) },
        },
      },
    ],
  } as unknown as google.maps.GeocoderResponse;
}
test("the same short address in two trip cities needs confirmation", async () => {
  const calls: string[] = [];
  const result = await geocodeItineraryPlace(
    async ({ address }) => {
      calls.push(address!);
      return response(address!);
    },
    "10 Main St",
    ["Seattle", "Portland"],
  );
  assert.equal(result, null);
  assert.deepEqual(calls, ["10 Main St, Seattle", "10 Main St, Portland"]);
});
test("a shared ID resolves directly and a coarse or partial result stays unpinned", async () => {
  const match = await geocodeItineraryPlace(
    async (request) => {
      assert.deepEqual(request, { placeId: "known" });
      return response("known");
    },
    "14 Main St",
    ["Seattle"],
    "known",
  );
  assert.equal(match?.placeId, "known");
  for (const data of [
    response("city", "locality"),
    response("wrong", "street_address", true),
  ]) {
    assert.equal(
      await geocodeItineraryPlace(async () => data, "10 Main St, Seattle", []),
      null,
    );
  }
});
test("a venue-prefixed booking can resolve from its complete street address", async () => {
  const match = await geocodeItineraryPlace(
    async ({ address }) => {
      if (address === "400 Broad St, Seattle") return response("needle");
      throw new Error("ZERO_RESULTS");
    },
    "Group entrance, 400 Broad St, Seattle",
    ["New York"],
  );
  assert.equal(match?.placeId, "needle");
});
