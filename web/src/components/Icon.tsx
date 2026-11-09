const paths: Record<string, string> = {
  back: "M15 18l-6-6 6-6",
  target: "M12 3v3M12 18v3M3 12h3M18 12h3M12 8a4 4 0 100 8 4 4 0 000-8z",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  vertices: "M5 19L9 5l10 4-4 10z M5 19h.01M9 5h.01M19 9h.01M15 19h.01",
  "plus-pin": "M12 21s-6-5.5-6-11a6 6 0 1112 0c0 5.5-6 11-6 11z M12 7v6M9 10h6",
  move: "M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3",
  table: "M4 5h16v14H4z M4 10h16M4 15h16M10 5v14",
  file: "M14 3H6v18h12V7z M14 3v4h4 M9 13h6M9 17h6",
  polygon: "M12 3l8 6-3 11H7L4 9z",
  draw: "M4 20l4-1 11-11-3-3L5 16z M14 6l3 3",
  keyboard: "M3 6h18v12H3z M7 10h.01M11 10h.01M15 10h.01M7 14h10",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 9a3 3 0 100 6 3 3 0 000-6z",
  "eye-off": "M3 3l18 18 M10.6 6.1A9.8 9.8 0 0112 6c6 0 10 6 10 6a17 17 0 01-3.2 3.8M6.3 7.6A17 17 0 002 12s4 6 10 6a9.6 9.6 0 004.3-1",
  upload: "M12 16V4M7 9l5-5 5 5M4 20h16",
  download: "M12 4v12M7 11l5 5 5-5M4 20h16",
  search: "M11 4a7 7 0 100 14 7 7 0 000-14z M21 21l-4.3-4.3",
  phone: "M8 2h8a2 2 0 012 2v16a2 2 0 01-2 2H8a2 2 0 01-2-2V4a2 2 0 012-2z M11 18h2",
  check: "M5 12l5 5L20 7",
  github: "M9 19c-4 1.5-4-2-6-2.5M15 21v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 00-1.3-3.2 4.2 4.2 0 00-.1-3.2s-1-.3-3.4 1.3a11.7 11.7 0 00-6.2 0C6.6 2.8 5.6 3.1 5.6 3.1a4.2 4.2 0 00-.1 3.2A4.6 4.6 0 004.2 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21",
};

export function Icon({ name, className = "h-5 w-5" }: { name: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {paths[name]?.split(" M").map((d, i) => <path key={i} d={i === 0 ? d : "M" + d} />)}
    </svg>
  );
}
