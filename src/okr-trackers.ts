/** The four OKR tracker pages under Admin. Each person builds theirs in their own file inside src/okr/. */
export const OKR_TRACKERS = [
  { owner: "Daniel", page: 21 },
  { owner: "Ivy", page: 22 },
  { owner: "Seth", page: 23 },
  { owner: "Drew", page: 24 },
] as const;

/** Add and remove the emails that can open the Admin pages. */
export const ADMIN_ACCESS_PAGE = 25;

export const okrLabel = (owner: string) => `${owner}’s OKR tracker`;
