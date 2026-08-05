// Filled "tree of life" silhouette (bushy canopy + trunk that forks into roots),
// in currentColor so it inherits the emblem tile's color. A solid silhouette reads
// far better than thin line art at small logo sizes.
export default function BrandLogo({ size = 22 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="currentColor"
      aria-hidden="true"
    >
      {/* canopy — overlapping circles read as full foliage */}
      <circle cx="32" cy="20" r="15" />
      <circle cx="19" cy="24" r="9" />
      <circle cx="45" cy="24" r="9" />
      <circle cx="25" cy="12" r="8" />
      <circle cx="39" cy="12" r="8" />
      <circle cx="32" cy="28" r="10" />
      {/* trunk splitting into two main roots */}
      <path d="M30 26c0 8-1 15-4 24-1 3 2 4 3 1 1.5-5 2.5-9 3-14 .5 5 1.5 9 3 14 1 3 4 2 3-1-3-9-4-16-4-24z" />
      {/* side roots */}
      <path d="M28 46c-3 3-6 4-9 4-2 0-2 3 0 3 4 0 8-2 11-5z" />
      <path d="M36 46c3 3 6 4 9 4 2 0 2 3 0 3-4 0-8-2-11-5z" />
    </svg>
  );
}

