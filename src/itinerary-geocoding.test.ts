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

test("Taipei district text gets an area-center pin while a venue cannot inherit a district centroid", async () => {
  const entered = "Zhongzheng District, Taipei City, Taiwan 100";
  const district = response("taipei-district", "postal_code");
  district.results[0].formatted_address = entered;
  const geocode = async () => district;
  assert.equal(
    (await geocodeItineraryPlace(geocode, entered, ["Taiwan"]))?.area,
    true,
  );
  assert.equal(
    (
      await geocodeItineraryPlace(
        geocode,
        entered,
        ["Taiwan"],
        "taipei-district",
      )
    )?.area,
    true,
  );
  assert.equal(
    await geocodeItineraryPlace(
      geocode,
      "Unknown museum, Taipei City, Taiwan",
      ["Taiwan"],
    ),
    null,
  );
});

test("a place in the right country cannot substitute its own center for the requested region", async () => {
  const city = response("taipei", "locality");
  city.results[0].address_components = [
    { long_name: "Taipei City", short_name: "Taipei", types: ["locality", "political"] },
    { long_name: "Taiwan", short_name: "TW", types: ["country", "political"] },
  ];
  const locate = (address: string) => geocodeItineraryPlace(async () => city, address, []);
  assert.equal(await locate("Taiwan"), null);
  assert.equal((await locate("Taipei, Taiwan"))?.placeId, "taipei");
});

test("unit details are retained on the itinerary but do not turn local streets into worldwide lookups", async () => {
  for (const address of ["400 Broad Street, Suite 301", "Apt 3B, 400 Broad Street", "400 Broad Street #301"]) {
    const calls: string[] = [];
    const result = await geocodeItineraryPlace(async (r) => {
      calls.push(r.address!);
      return response("seattle-door");
    }, address, ["Seattle"]);
    assert.equal(result?.placeId, "seattle-door");
    assert.deepEqual(calls, ["400 Broad Street, Seattle"]);
  }
  for (const [address, expected] of [
    ["10 Main Street, Apt 2, Boston, MA", "10 Main Street, Boston, MA"],
    ["No. 2, Section 3, Tingzhou Rd, Taipei City, Taiwan", "No. 2, Section 3, Tingzhou Rd, Taipei City, Taiwan"],
    ["臺北市中正區，汀州路三段2號", "臺北市中正區, 汀州路三段2號"],
  ]) {
    const calls: string[] = [];
    await geocodeItineraryPlace(async (r) => {
      calls.push(r.address!);
      return response("explicit-address");
    }, address, ["Seattle"]);
    assert.deepEqual(calls, [expected]);
  }
});
test("a rejected saved place ID falls back to its address, but a provider outage stays retryable", async () => {
  for (const code of ["NOT_FOUND", "INVALID_REQUEST", "OVER_QUERY_LIMIT"]) {
    const calls: google.maps.GeocoderRequest[] = [];
    const lookup = geocodeItineraryPlace(async (r) => {
      calls.push(r);
      if (r.placeId) throw Object.assign(new Error("Geocoder failed"), { code });
      return response("replacement");
    }, "10 Main St", ["Seattle"], "obsolete");
    if (code === "OVER_QUERY_LIMIT") {
      await assert.rejects(lookup);
      assert.deepEqual(calls, [{placeId:"obsolete"}]);
    } else {
      assert.equal((await lookup)?.placeId, "replacement");
      assert.deepEqual(calls, [{placeId:"obsolete"}, {address:"10 Main St, Seattle"}]);
    }
  }
});
