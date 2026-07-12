// The EmilCRM brand mark — a custom faceted lightning bolt.
//
// Default: standalone two-tone emerald — a lighter base (#34d399) and a darker
// fold facet (#059669) down the spine for depth. Self-coloured, so it reads on
// any ground (white app surface, dark mode, the landing header) with no tile
// behind it. Sits on a 48×48 grid; size it with a className (h-*/w-*).
//
// Pass `tile` for the green-backed square variant — kept for icons that need a
// solid fill (e.g. an iOS home-screen icon, where transparency turns black).
export function BrandMark({ className, tile = false }: { className?: string; tile?: boolean }) {
  if (tile) {
    return (
      <svg viewBox="0 0 48 48" className={className} fill="none" aria-hidden="true">
        <rect width="48" height="48" rx="13" fill="#059669" />
        <g transform="translate(24 24) scale(.62) translate(-24 -24)">
          <path d="M28 4 13 26.5 22 26.5 20 44 35 21.5 26 21.5Z" fill="#fff" />
          <path d="M28 4 23.5 24 20 44 26 21.5 35 21.5Z" fill="#000" opacity="0.12" />
        </g>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" aria-hidden="true">
      <path d="M28 4 13 26.5 22 26.5 20 44 35 21.5 26 21.5Z" fill="#34d399" />
      <path d="M28 4 23.5 24 20 44 26 21.5 35 21.5Z" fill="#059669" />
    </svg>
  );
}
