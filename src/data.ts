import {
  blankPrefs,
  splitCents,
  type Store,
  type Trip,
  type Member,
} from "./domain";
export const IMAGES = {
  seattle: "images/seattle.jpg",
  coast: "images/coast.jpg",
  city: "images/city.jpg",
  food: "images/food.jpg",
  museum: "images/museum.jpg",
};
const members: Member[] = [
  {
    id: "maya",
    name: "Maya Chen",
    email: "maya@example.com",
    role: "Owner",
    days: [],
    status: "accepted",
  },
  {
    id: "eli",
    name: "Eli Brooks",
    email: "eli@example.com",
    role: "Editor",
    days: [],
    status: "accepted",
  },
  {
    id: "nora",
    name: "Nora Patel",
    email: "nora@example.com",
    role: "Viewer",
    days: [],
    status: "accepted",
  },
  {
    id: "sam",
    name: "Sam Rivera",
    email: "sam@example.com",
    role: "Day Editor",
    days: ["2026-10-17"],
    status: "accepted",
  },
];
export const PAGES: Record<number, string> = {
  1: "Log in / Create account",
  2: "Connect accounts",
  3: "Provider authorization",
  4: "Home",
  5: "Existing trips",
  6: "Create / edit trip",
  7: "Add / edit event",
  8: "Itinerary",
  9: "Suggestions",
  10: "Active trip",
  11: "Day detail / Calendar",
  12: "Budget",
  13: "Collaborators",
  14: "Reserved — no source page",
  15: "My preferences",
  16: "Nearby suggestion",
  17: "Map",
};
export const SERVICES = ["Instagram", "Facebook", "TikTok", "Gmail"];
export const PERMISSIONS = (service: string) =>
  service === "Gmail"
    ? ["Read email messages and settings"]
    : [
        "Basic profile",
        `Selected travel ${service === "TikTok" ? "videos" : "posts"}`,
      ];
export function seed(): Store {
  const ids = members.map((m) => m.id);
  const trip: Trip = {
    id: "seattle",
    title: "Seattle & Bainbridge getaway",
    destinations: ["Seattle, WA", "Bainbridge Island, WA"],
    start: "2026-10-15",
    end: "2026-10-18",
    zone: "America/Los_Angeles",
    image: IMAGES.seattle,
    sample: true,
    members: structuredClone(members),
    budget: 300000,
    budgetMode: "group",
    individual: Object.fromEntries(ids.map((id) => [id, 75000])),
    dismissed: [],
    prefs: {
      maya: {
        ...blankPrefs(),
        diet: ["Vegetarian"],
        food: "Local favorites",
        interests: ["Culture", "Art"],
        walk: 1500,
      },
      eli: {
        ...blankPrefs(),
        food: "Local favorites",
        interests: ["Modern architecture", "Art"],
      },
      nora: {
        ...blankPrefs(),
        diet: ["Peanut avoidance"],
        food: "Familiar favorites",
        atmosphere: "Quiet",
        spending: "Budget-conscious",
        interests: ["History"],
      },
      sam: {
        ...blankPrefs(),
        access: ["Step-free access"],
        walk: 400,
        interests: ["Culture", "History"],
      },
    },
    events: [
      {
        id: "hotel",
        name: "Settle into our city stay",
        place: "The Alder House · downtown",
        date: "2026-10-15",
        start: "15:00",
        end: "16:00",
        cost: 160000,
        attendees: ids,
        image: IMAGES.city,
        notes:
          "Fictional booking. Check-in together, then take a little time to unwind.",
      },
      {
        id: "dinner",
        name: "A first-night dinner",
        place: "Juniper Table · near Pike Place",
        date: "2026-10-15",
        start: "18:00",
        end: "19:30",
        cost: 12000,
        attendees: ids,
        image: IMAGES.food,
        notes:
          "Fictional restaurant. Vegetarian options requested; verify restrictions before dining.",
      },
      {
        id: "museum",
        name: "A morning of art",
        place: "Seattle Art Museum",
        date: "2026-10-16",
        start: "10:00",
        end: "12:00",
        cost: 6000,
        attendees: ids,
        image: IMAGES.museum,
        notes: "Illustrative booking. Tickets are in our sample confirmations.",
      },
      {
        id: "market",
        name: "Wander through Pike Place",
        place: "Pike Place Market",
        date: "2026-10-16",
        start: "13:00",
        end: "14:00",
        cost: 8000,
        attendees: ids,
        image: IMAGES.food,
        notes:
          "An easy lunch and a little exploring. Cost is an estimate, not a logged expense.",
      },
      {
        id: "ferry",
        name: "Across the sound",
        place: "Bainbridge Island ferry",
        date: "2026-10-17",
        start: "10:00",
        end: "11:00",
        cost: 16000,
        attendees: ids,
        image: IMAGES.coast,
        notes: "Sample transport booking; confirm actual services separately.",
      },
      {
        id: "waterfront",
        name: "A little waterfront time",
        place: "Bainbridge waterfront",
        date: "2026-10-17",
        start: "14:00",
        end: "15:00",
        cost: 0,
        attendees: ids,
        image: IMAGES.coast,
        notes: "Short walk with stops. Accessibility details need checking.",
      },
    ],
    expenses: [
      {
        id: "xhotel",
        purpose: "Alder House · three nights",
        amount: 160000,
        category: "Stay",
        payer: "maya",
        shares: splitCents(160000, ids),
        date: "2026-10-14",
        source: "Manual",
        settled: [],
      },
      {
        id: "xtransport",
        purpose: "Ferry & local transport",
        amount: 16000,
        category: "Transport",
        payer: "eli",
        shares: splitCents(16000, ids),
        date: "2026-10-14",
        source: "Manual",
        settled: [],
      },
      {
        id: "xdinner",
        purpose: "Juniper Table dinner",
        amount: 12000,
        category: "Food",
        payer: "maya",
        shares: splitCents(12000, ids),
        date: "2026-10-15",
        source: "Manual",
        settled: [],
      },
      {
        id: "xart",
        purpose: "Museum tickets",
        amount: 6000,
        category: "Activities",
        payer: "nora",
        shares: splitCents(6000, ids),
        date: "2026-10-14",
        source: "Demo Gmail",
        settled: [],
      },
    ],
    todos: [
      {
        id: "t1",
        text: "Have museum tickets handy",
        date: "2026-10-16",
        done: false,
      },
      {
        id: "t2",
        text: "Check dietary options for lunch",
        date: "2026-10-16",
        done: false,
      },
      {
        id: "t3",
        text: "Confirm ferry meeting point",
        date: "2026-10-17",
        done: true,
      },
    ],
  };
  const past: Trip = {
    ...structuredClone(trip),
    id: "past",
    title: "A weekend by the coast",
    destinations: ["Cannon Beach, OR"],
    start: "2026-06-12",
    end: "2026-06-14",
    image: IMAGES.coast,
    events: [
      {
        ...structuredClone(trip.events[5]),
        id: "beach",
        name: "Slow morning by the ocean",
        place: "Cannon Beach",
        date: "2026-06-13",
        start: "09:00",
        end: "11:00",
      },
    ],
    expenses: [],
    budget: 120000,
    todos: [],
    prefs: {},
  };
  const upcoming: Trip = {
    ...structuredClone(past),
    id: "winter",
    title: "Chicago, a little later",
    destinations: ["Chicago, IL"],
    start: "2026-12-04",
    end: "2026-12-06",
    image: IMAGES.city,
    events: [],
    expenses: [],
    budget: null,
  };
  return {
    version: 1,
    users: members.map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      connections: (m.id === "maya"
        ? { Gmail: PERMISSIONS("Gmail") }
        : {}) as Record<string, string[]>,
    })),
    userId: null,
    trips: [trip, past, upcoming],
    tripId: null,
    date: "2026-10-14",
    time: "09:00",
    location: true,
    noticeDismissed: false,
  };
}
export function loadStore(): Store {
  try {
    const raw = localStorage.getItem("trip-planner-v1");
    if (raw) {
      const state = JSON.parse(raw);
      if (state.version === 1) return state;
    }
  } catch {}
  return seed();
}
