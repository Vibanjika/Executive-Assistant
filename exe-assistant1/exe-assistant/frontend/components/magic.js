export function ShimmerButton({ children, ...props }) {
  return (
    <button className="shimmer-btn" {...props}>
      <span>{children}</span>
    </button>
  );
}
export function BorderBeam() {
  return <div className="beam" aria-hidden="true" />;
}
