import { AlertTriangle, RefreshCw } from "lucide-react";

export function ErrorState({ message = "Something went wrong.", onRetry }) {
  return (
    <div className="state-box">
      <AlertTriangle size={36} color="var(--accent-danger)" />
      <h3>Error</h3>
      <p>{message}</p>
      {onRetry && (
        <button className="btn btn-ghost" onClick={onRetry} style={{ marginTop: 8 }}>
          <RefreshCw size={14} /> Retry
        </button>
      )}
    </div>
  );
}
