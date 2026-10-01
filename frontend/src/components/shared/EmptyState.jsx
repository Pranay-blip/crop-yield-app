export function EmptyState({ icon = "📊", title, description }) {
  return (
    <div className="state-box">
      <span style={{ fontSize: "2.5rem" }}>{icon}</span>
      {title && <h3>{title}</h3>}
      {description && <p>{description}</p>}
    </div>
  );
}
