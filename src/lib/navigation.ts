export const primaryNavigation = [
  { href: "/", label: "What changed", shortcut: "W" },
  { href: "/pulse", label: "Pulse", shortcut: "P" },
  { href: "/countries", label: "Countries", shortcut: "C" },
  { href: "/indicators", label: "Indicators", shortcut: "I" },
  { href: "/calendar", label: "Calendar", shortcut: "E" },
  { href: "/compare", label: "Compare", shortcut: "K" },
] as const;

export type NavigationHref = (typeof primaryNavigation)[number]["href"];
