type Suggestion = { name: string; address: string; kind?: "guide" };
const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const categories = [
  { names: /shrine|temple|pagoda|sanctuary|神社|寺|廟/u, query: "temple shrine", terms: /shrine|temple|pagoda|sanctuary|神社|寺|廟/u },
  { names: /museum|gallery|博物|美術/u, query: "museum gallery", terms: /museum|gallery|博物|美術/u },
  { names: /park|garden|公園|花園/u, query: "park garden", terms: /park|garden|公園|花園/u },
  { names: /beach|coast|海岸|海灘/u, query: "beach coast", terms: /beach|coast|海岸|海灘/u },
];

/** The anchor can identify a destination, but its venue name never enters a query. */
export function suggestionPhotoSearch(suggestion: Suggestion, destinations: string[], anchorArea: string) {
  const knownAddress = suggestion.address !== "Address needs confirmation from the venue" ? suggestion.address : "";
  const destinationIn = (value: string) => destinations.find(destination => {
    const city = normalize(destination.split(/[,，]/u)[0]);
    return city && (` ${normalize(value)} `).includes(` ${city} `);
  });
  const addressArea = knownAddress.split(/[,，]/u).map(part => part.trim()).filter(part => part && !/\d/u.test(part));
  const location = destinationIn(knownAddress) || (addressArea.length > 1 ? addressArea.slice(-2).join(", ") : "")
    || destinationIn(anchorArea) || (destinations.length === 1 ? destinations[0] : "");
  const category = suggestion.kind === "guide" ? undefined : categories.find(category => category.names.test(normalize(suggestion.name)));
  return {
    exact: suggestion.kind === "guide" ? "" : [suggestion.name, location].filter(Boolean).join(" "),
    category: category ? [category.query, location].filter(Boolean).join(" ") : "",
    area: location ? `${location} city landscape` : "",
    location,
    matchesSubject(metadata: string) {
      const text = normalize(metadata);
      if (category) return category.terms.test(text);
      const words = normalize(suggestion.name).split(" ").filter(word => word.length > 2 && !/^(the|and|visit|explore|tour|venue|restaurant|cafe)$/u.test(word));
      return words.some(word => (` ${text} `).includes(` ${word} `));
    },
    matchesArea(metadata: string) {
      // A city fallback must describe geography, not an unrelated business.
      const text = normalize(metadata);
      return !!location && text.includes(normalize(location.split(/[,，]/u)[0]))
        && /city|skyline|landscape|cityscape|aerial|panorama|mountain|coast|buildings|城市|風景|街景/u.test(text)
        && !/mcdonald|burger|fast food|logo|brand|麥當勞/u.test(text);
    },
  };
}
