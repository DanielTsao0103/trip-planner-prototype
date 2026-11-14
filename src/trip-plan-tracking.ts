/** Only genuine saved itinerary/Today/map screens count toward plan access. */
export function canTrackTripPlan(cloud: boolean, persistence: string | undefined, sample: boolean | undefined, page: number): boolean {
  return cloud && persistence === "account" && !sample && [8, 10, 11, 17].includes(page);
}
