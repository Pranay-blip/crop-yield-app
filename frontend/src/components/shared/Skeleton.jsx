export function Skeleton({ w = "100%", h = 20, style = {} }) {
  return <div className="skeleton" style={{ width: w, height: h, ...style }} />;
}

export function CardSkeleton() {
  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Skeleton h={14} w="40%" />
      <Skeleton h={40} />
      <Skeleton h={40} />
      <Skeleton h={40} />
    </div>
  );
}

export function ChartSkeleton({ h = 280 }) {
  return <div className="skeleton" style={{ width: "100%", height: h, borderRadius: "var(--r-lg)" }} />;
}
