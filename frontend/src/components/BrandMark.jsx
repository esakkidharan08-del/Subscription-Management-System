// The mark is a loop with one gap and a dot where it closes: a billing cycle
// coming round. Drawn in ink so the chrome keeps no colour of its own.
export default function BrandMark({ scope }) {
  return (
    <div className="product">
      <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
        <rect width="28" height="28" rx="7" fill="#141414" />
        <path
          d="M19.5 9.2A7 7 0 1 0 21 14"
          fill="none"
          stroke="#fff"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <circle cx="21" cy="14" r="2" fill="#fff" />
      </svg>
      <div>
        <span className="product-name">Brightloop Software</span>
        {scope && <span className="product-scope">{scope}</span>}
      </div>
    </div>
  );
}
