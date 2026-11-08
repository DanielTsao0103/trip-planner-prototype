import { IMAGES } from "./data";

export type PlannedStop = {
  day: number;
  name: string;
  start: string;
  end: string;
  place: string;
  notes: string;
};

export type PlannedTrip = {
  id: string;
  title: string;
  destinations: string[];
  days: number;
  estimate: number;
  image: string;
  summary: string;
  stops: PlannedStop[];
};

const trip = (
  id: string,
  title: string,
  destinations: string[],
  days: number,
  estimate: number,
  image: string,
  summary: string,
  stops: PlannedStop[],
): PlannedTrip => ({ id, title, destinations, days, estimate, image, summary, stops });

/** Curated starter itineraries. They are copied into a traveler's account on add. */
export const PREPLANNED_TRIPS: PlannedTrip[] = [
  trip("seattle", "Seattle & Bainbridge Island", ["Seattle, WA", "Bainbridge Island, WA"], 4, 750, IMAGES.seattle, "Coffee, waterfront views, and an easy island day.", [
    { day: 0, name: "Settle into the city", start: "15:00", end: "16:00", place: "Downtown Seattle", notes: "Check in and get oriented around the waterfront." },
    { day: 0, name: "Dinner at Pike Place", start: "18:00", end: "19:30", place: "Pike Place Market, Seattle, WA", notes: "Sample local seafood and market favorites." },
    { day: 1, name: "Explore Pike Place Market", start: "09:00", end: "11:00", place: "Pike Place Market, Seattle, WA", notes: "Arrive early for coffee, breakfast, and the market stalls." },
    { day: 1, name: "Seattle Art Museum", start: "13:00", end: "15:00", place: "Seattle Art Museum, Seattle, WA", notes: "Leave time to explore the rotating exhibitions." },
    { day: 2, name: "Ferry to Bainbridge Island", start: "10:00", end: "11:00", place: "Seattle Ferry Terminal, Seattle, WA", notes: "Enjoy the views across Elliott Bay on the ferry." },
    { day: 2, name: "Walk Winslow", start: "11:30", end: "14:00", place: "Winslow Way, Bainbridge Island, WA", notes: "Browse local shops and stop for a relaxed lunch." },
    { day: 3, name: "Seattle Center", start: "10:00", end: "13:00", place: "Seattle Center, Seattle, WA", notes: "Visit the Space Needle or Chihuly Garden and Glass." },
  ]),
  trip("san-diego", "San Diego coast & city", ["San Diego, CA"], 5, 920, IMAGES.coast, "Beach time, Balboa Park, and relaxed neighborhood evenings.", [
    { day: 0, name: "Sunset at La Jolla Cove", start: "17:00", end: "18:30", place: "La Jolla Cove, San Diego, CA", notes: "Walk the coast and watch for sea lions." },
    { day: 1, name: "Balboa Park gardens", start: "09:30", end: "12:00", place: "Balboa Park, San Diego, CA", notes: "Explore the gardens and Spanish-style architecture." },
    { day: 1, name: "Lunch in Little Italy", start: "12:30", end: "14:00", place: "Little Italy, San Diego, CA", notes: "Choose a patio and take a break between activities." },
    { day: 2, name: "Coronado Beach", start: "10:00", end: "13:00", place: "Coronado Beach, Coronado, CA", notes: "Spend a slow morning by the water." },
    { day: 3, name: "Old Town San Diego", start: "10:00", end: "12:00", place: "Old Town San Diego, San Diego, CA", notes: "Browse historic sites and small shops." },
    { day: 4, name: "Harbor walk", start: "09:00", end: "11:00", place: "Embarcadero, San Diego, CA", notes: "Enjoy one last waterfront stroll before departure." },
  ]),
  trip("chicago", "Chicago long weekend", ["Chicago, IL"], 3, 680, IMAGES.city, "Architecture, lakefront paths, and neighborhood food stops.", [
    { day: 0, name: "Chicago Riverwalk", start: "16:00", end: "18:00", place: "Chicago Riverwalk, Chicago, IL", notes: "Get your bearings along the river." },
    { day: 0, name: "Dinner in River North", start: "19:00", end: "20:30", place: "River North, Chicago, IL", notes: "Pick a neighborhood spot for a first-night dinner." },
    { day: 1, name: "Architecture boat tour", start: "10:00", end: "12:00", place: "Chicago River, Chicago, IL", notes: "See the city from the river and learn its architectural story." },
    { day: 1, name: "Art Institute of Chicago", start: "14:00", end: "17:00", place: "Art Institute of Chicago, Chicago, IL", notes: "Set aside a few hours for the galleries." },
    { day: 2, name: "Millennium Park", start: "09:30", end: "11:00", place: "Millennium Park, Chicago, IL", notes: "Walk the park before heading home." },
  ]),
  trip("nyc", "New York first-timer favorites", ["New York, NY"], 4, 1180, "/images/preplanned-new-york.jpg", "Classic landmarks, a museum afternoon, and a Broadway night.", [
    { day: 0, name: "Times Square after dark", start: "19:00", end: "20:00", place: "Times Square, New York, NY", notes: "Take in the lights, then head to dinner nearby." },
    { day: 1, name: "Central Park stroll", start: "09:00", end: "11:30", place: "Central Park, New York, NY", notes: "Choose a short loop and leave room for coffee." },
    { day: 1, name: "The Metropolitan Museum of Art", start: "13:00", end: "16:00", place: "The Metropolitan Museum of Art, New York, NY", notes: "Pick a few galleries that interest your group." },
    { day: 2, name: "Statue of Liberty ferry", start: "09:00", end: "13:00", place: "The Battery, New York, NY", notes: "Reserve ferry tickets in advance." },
    { day: 2, name: "Broadway evening", start: "19:00", end: "22:00", place: "Theater District, New York, NY", notes: "Choose a show and plan an early dinner." },
    { day: 3, name: "High Line walk", start: "10:00", end: "12:00", place: "The High Line, New York, NY", notes: "Walk the elevated park south toward Chelsea Market." },
  ]),
  trip("sf", "San Francisco neighborhoods", ["San Francisco, CA"], 4, 990, "/images/preplanned-san-francisco.jpg", "Cable cars, bay views, and time to wander local neighborhoods.", [
    { day: 0, name: "Ferry Building Marketplace", start: "16:00", end: "18:00", place: "Ferry Building, San Francisco, CA", notes: "Browse the food stalls and waterfront promenade." },
    { day: 1, name: "Golden Gate Bridge overlook", start: "09:00", end: "11:00", place: "Golden Gate Bridge, San Francisco, CA", notes: "Check the weather and bring a layer for the coast." },
    { day: 1, name: "Lands End trail", start: "13:00", end: "15:00", place: "Lands End, San Francisco, CA", notes: "Follow the coastal path at a comfortable pace." },
    { day: 2, name: "Ride a cable car", start: "10:00", end: "11:30", place: "Powell Street, San Francisco, CA", notes: "Ride toward the waterfront and explore at your own pace." },
    { day: 2, name: "Chinatown lunch", start: "12:00", end: "14:00", place: "Chinatown, San Francisco, CA", notes: "Try a few small dishes and visit nearby shops." },
    { day: 3, name: "Golden Gate Park", start: "09:30", end: "12:00", place: "Golden Gate Park, San Francisco, CA", notes: "Choose a garden or museum before departure." },
  ]),
  trip("portland", "Portland food & gardens", ["Portland, OR"], 3, 610, IMAGES.food, "A low-key city break with gardens, bookstores, and great food.", [
    { day: 0, name: "Browse Powell's City of Books", start: "16:00", end: "18:00", place: "Powell's City of Books, Portland, OR", notes: "Leave time to wander the color-coded rooms." },
    { day: 0, name: "Dinner in the Pearl District", start: "19:00", end: "20:30", place: "Pearl District, Portland, OR", notes: "Find a casual local restaurant nearby." },
    { day: 1, name: "International Rose Test Garden", start: "09:30", end: "11:00", place: "International Rose Test Garden, Portland, OR", notes: "Seasonal blooms are best in late spring and summer." },
    { day: 1, name: "Washington Park", start: "11:30", end: "14:00", place: "Washington Park, Portland, OR", notes: "Pair the gardens with a relaxed picnic lunch." },
    { day: 2, name: "Saturday Market waterfront", start: "10:00", end: "12:00", place: "Portland Saturday Market, Portland, OR", notes: "Check market days before your visit." },
  ]),
  trip("new-orleans", "New Orleans music & flavor", ["New Orleans, LA"], 4, 840, "/images/preplanned-new-orleans.jpg", "Live music, historic streets, and unhurried meals.", [
    { day: 0, name: "Frenchmen Street music", start: "20:00", end: "22:00", place: "Frenchmen Street, New Orleans, LA", notes: "Check venue schedules and arrive early for popular sets." },
    { day: 1, name: "French Quarter walk", start: "09:00", end: "11:00", place: "French Quarter, New Orleans, LA", notes: "Explore the historic streets before the afternoon heat." },
    { day: 1, name: "Jackson Square", start: "11:00", end: "12:30", place: "Jackson Square, New Orleans, LA", notes: "Enjoy the architecture and nearby riverfront." },
    { day: 2, name: "Garden District streetcar", start: "10:00", end: "13:00", place: "Garden District, New Orleans, LA", notes: "Ride the St. Charles streetcar and take a walking tour." },
    { day: 3, name: "City Park and sculpture garden", start: "09:30", end: "12:00", place: "New Orleans City Park, New Orleans, LA", notes: "A calm green-space stop before departure." },
  ]),
  trip("washington-dc", "Washington, DC monuments & museums", ["Washington, DC"], 4, 780, IMAGES.museum, "Monuments, Smithsonian museums, and easy days on foot.", [
    { day: 0, name: "National Mall at sunset", start: "17:00", end: "19:00", place: "National Mall, Washington, DC", notes: "Take an easy first walk and enjoy the monument views." },
    { day: 1, name: "National Air and Space Museum", start: "09:30", end: "12:00", place: "National Air and Space Museum, Washington, DC", notes: "Reserve timed entry when required." },
    { day: 1, name: "National Gallery of Art", start: "13:00", end: "16:00", place: "National Gallery of Art, Washington, DC", notes: "Choose a few collections and take a café break." },
    { day: 2, name: "Lincoln Memorial and Tidal Basin", start: "09:00", end: "12:00", place: "Lincoln Memorial, Washington, DC", notes: "Wear comfortable shoes for the Mall walk." },
    { day: 3, name: "Georgetown waterfront", start: "10:00", end: "12:00", place: "Georgetown Waterfront Park, Washington, DC", notes: "Explore the neighborhood before heading out." },
  ]),
  trip("boston", "Boston history on foot", ["Boston, MA"], 3, 720, "/images/preplanned-boston.jpg", "A compact, walkable history trip with a harbor finish.", [
    { day: 0, name: "Boston Common", start: "16:00", end: "17:30", place: "Boston Common, Boston, MA", notes: "Start with a short loop through the oldest public park." },
    { day: 1, name: "Freedom Trail", start: "09:00", end: "12:00", place: "Boston Freedom Trail, Boston, MA", notes: "Follow a portion of the trail and choose stops as you go." },
    { day: 1, name: "North End lunch", start: "12:30", end: "14:00", place: "North End, Boston, MA", notes: "Settle in for lunch and a bakery stop." },
    { day: 2, name: "Museum of Fine Arts", start: "10:00", end: "13:00", place: "Museum of Fine Arts, Boston, MA", notes: "Pick a few highlights rather than trying to see everything." },
    { day: 2, name: "Harborwalk", start: "15:00", end: "17:00", place: "Boston Harborwalk, Boston, MA", notes: "Finish with a breezy waterfront walk." },
  ]),
  trip("honolulu", "Oahu beach & island days", ["Honolulu, HI"], 5, 1450, "/images/preplanned-honolulu.jpg", "Beach mornings and city evenings with space to slow down.", [
    { day: 0, name: "Waikiki sunset", start: "17:00", end: "18:30", place: "Waikiki Beach, Honolulu, HI", notes: "Unpack, then take an easy beach walk." },
    { day: 1, name: "Diamond Head morning hike", start: "07:30", end: "10:00", place: "Diamond Head State Monument, Honolulu, HI", notes: "Timed reservations are required; bring water." },
    { day: 1, name: "Waikiki beach afternoon", start: "13:00", end: "16:00", place: "Waikiki Beach, Honolulu, HI", notes: "Keep the afternoon flexible for swimming or rest." },
    { day: 2, name: "Bishop Museum", start: "10:00", end: "13:00", place: "Bishop Museum, Honolulu, HI", notes: "Explore the history and culture of Hawaii." },
    { day: 3, name: "Hanauma Bay", start: "08:00", end: "12:00", place: "Hanauma Bay, Honolulu, HI", notes: "Check current access rules and reserve ahead." },
    { day: 4, name: "Kapiolani Park", start: "09:00", end: "11:00", place: "Kapiolani Park, Honolulu, HI", notes: "Enjoy a final easy morning near the coast." },
  ]),
  trip("austin", "Austin live music & lakeside", ["Austin, TX"], 3, 660, "/images/preplanned-austin.jpg", "Live music, tacos, and a little time by the water.", [
    { day: 0, name: "South Congress stroll", start: "16:00", end: "18:00", place: "South Congress Avenue, Austin, TX", notes: "Browse the shops and grab a snack." },
    { day: 0, name: "Live music on Red River", start: "20:00", end: "22:00", place: "Red River Cultural District, Austin, TX", notes: "Look up show times and age policies before you go." },
    { day: 1, name: "Lady Bird Lake trail", start: "09:00", end: "11:00", place: "Lady Bird Lake, Austin, TX", notes: "Walk or rent a kayak if conditions are good." },
    { day: 1, name: "Texas State Capitol", start: "13:00", end: "15:00", place: "Texas State Capitol, Austin, TX", notes: "Join a tour or explore the grounds." },
    { day: 2, name: "Breakfast tacos", start: "09:00", end: "10:30", place: "Austin, TX", notes: "Try a local breakfast spot before departure." },
  ]),
  trip("denver", "Denver & mountain views", ["Denver, CO"], 4, 850, "/images/preplanned-denver.jpg", "City museums and an optional foothills day trip.", [
    { day: 0, name: "Union Station", start: "16:00", end: "18:00", place: "Denver Union Station, Denver, CO", notes: "Explore LoDo and settle in for dinner." },
    { day: 1, name: "Denver Art Museum", start: "10:00", end: "13:00", place: "Denver Art Museum, Denver, CO", notes: "Pick a few galleries to explore at a relaxed pace." },
    { day: 1, name: "Civic Center Park", start: "14:00", end: "15:30", place: "Civic Center Park, Denver, CO", notes: "Walk the civic center and nearby library." },
    { day: 2, name: "Red Rocks Amphitheatre", start: "09:00", end: "13:00", place: "Red Rocks Park and Amphitheatre, Morrison, CO", notes: "Check event schedules and trail conditions." },
    { day: 3, name: "Denver Botanic Gardens", start: "09:30", end: "12:00", place: "Denver Botanic Gardens, Denver, CO", notes: "An easy green-space visit before leaving." },
  ]),
  trip("nashville", "Nashville music weekend", ["Nashville, TN"], 3, 760, "/images/preplanned-nashville.jpg", "Country music history and a night out with live bands.", [
    { day: 0, name: "Broadway live music", start: "19:00", end: "22:00", place: "Lower Broadway, Nashville, TN", notes: "Check venue policies and keep the evening flexible." },
    { day: 1, name: "Country Music Hall of Fame", start: "10:00", end: "13:00", place: "Country Music Hall of Fame, Nashville, TN", notes: "Reserve tickets and take time with the exhibits." },
    { day: 1, name: "Ryman Auditorium tour", start: "14:00", end: "15:30", place: "Ryman Auditorium, Nashville, TN", notes: "Tour availability varies around performances." },
    { day: 2, name: "Centennial Park", start: "09:30", end: "11:00", place: "Centennial Park, Nashville, TN", notes: "Take a relaxed walk around the Parthenon." },
    { day: 2, name: "East Nashville brunch", start: "11:30", end: "13:00", place: "East Nashville, Nashville, TN", notes: "Explore a neighborhood cafe before departure." },
  ]),
  trip("las-vegas", "Las Vegas shows & desert", ["Las Vegas, NV"], 3, 1080, "/images/preplanned-las-vegas.jpg", "A show night, a little Strip time, and a desert escape.", [
    { day: 0, name: "Welcome to the Strip", start: "18:00", end: "20:00", place: "Las Vegas Strip, Las Vegas, NV", notes: "Explore nearby and plan an early dinner." },
    { day: 0, name: "Evening show", start: "20:30", end: "22:30", place: "Las Vegas, NV", notes: "Book a show that fits your group's interests." },
    { day: 1, name: "Red Rock Canyon", start: "08:00", end: "13:00", place: "Red Rock Canyon National Conservation Area, NV", notes: "Check timed entry, weather, and trail conditions." },
    { day: 1, name: "Arts District dinner", start: "18:00", end: "20:00", place: "Las Vegas Arts District, Las Vegas, NV", notes: "Choose a local spot away from the resort corridor." },
    { day: 2, name: "Bellagio Conservatory", start: "10:00", end: "11:30", place: "Bellagio, Las Vegas, NV", notes: "A low-key stop before checkout." },
  ]),
  trip("miami", "Miami art & beach days", ["Miami, FL"], 4, 1120, "/images/preplanned-miami.jpg", "Art Deco architecture, colorful murals, and beach breaks.", [
    { day: 0, name: "Ocean Drive walk", start: "17:00", end: "18:30", place: "Ocean Drive, Miami Beach, FL", notes: "See the Art Deco district in the softer evening light." },
    { day: 1, name: "South Beach morning", start: "09:00", end: "12:00", place: "South Beach, Miami Beach, FL", notes: "Keep the beach time flexible around the weather." },
    { day: 1, name: "Art Deco Welcome Center", start: "14:00", end: "16:00", place: "Art Deco Welcome Center, Miami Beach, FL", notes: "Learn more about the neighborhood architecture." },
    { day: 2, name: "Wynwood Walls", start: "10:00", end: "12:00", place: "Wynwood Walls, Miami, FL", notes: "Explore the murals and nearby galleries." },
    { day: 2, name: "Little Havana food walk", start: "13:00", end: "15:00", place: "Little Havana, Miami, FL", notes: "Sample Cuban coffee and neighborhood favorites." },
    { day: 3, name: "Bayfront Park", start: "09:30", end: "11:00", place: "Bayfront Park, Miami, FL", notes: "Enjoy one last bayfront walk before leaving." },
  ]),
  trip("charleston", "Charleston historic district", ["Charleston, SC"], 3, 790, "/images/preplanned-charleston.jpg", "A slower weekend of historic streets and Lowcountry flavors.", [
    { day: 0, name: "Waterfront Park", start: "17:00", end: "18:30", place: "Waterfront Park, Charleston, SC", notes: "Walk the harbor and settle into downtown." },
    { day: 1, name: "Historic district walking tour", start: "09:00", end: "11:30", place: "Charleston Historic District, Charleston, SC", notes: "Join a guided tour or follow a self-guided route." },
    { day: 1, name: "Charleston City Market", start: "12:00", end: "14:00", place: "Charleston City Market, Charleston, SC", notes: "Browse local makers and find a lunch stop." },
    { day: 2, name: "The Battery and Rainbow Row", start: "09:00", end: "11:00", place: "The Battery, Charleston, SC", notes: "Walk the waterfront and nearby historic streets." },
    { day: 2, name: "Folly Beach afternoon", start: "13:00", end: "16:00", place: "Folly Beach, SC", notes: "Optional beach outing; allow time for the drive." },
  ]),
];

export const plannedTrip = (id: string | null) => PREPLANNED_TRIPS.find(item => item.id === id);
