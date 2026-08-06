// A parent couple + elbow connector branching down to two children — the exact
// same visual language as the tree canvas itself (TreeNode's couple pairs,
// ConnectorLines' elbow joints), just miniaturised, so the mark reads as "this app"
// rather than a generic tree clip-art silhouette.
export default function BrandLogo({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <path
        d="M28 16 L36 16 M32 24 L32 34 M20 34 L44 34 M20 34 L20 41 M44 34 L44 41"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <circle cx="20" cy="16" r="8" fill="currentColor" />
      <circle cx="44" cy="16" r="8" fill="currentColor" />
      <circle cx="20" cy="48" r="7" fill="currentColor" />
      <circle cx="44" cy="48" r="7" fill="currentColor" />
    </svg>
  );
}

