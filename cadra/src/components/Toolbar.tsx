import { useModelStore } from "../store/modelStore";

export default function Toolbar() {
  const measureMode = useModelStore((s) => s.measureMode);
  const setMeasureMode = useModelStore((s) => s.setMeasureMode);
  const measureResult = useModelStore((s) => s.measureResult);
  const setMeasureResult = useModelStore((s) => s.setMeasureResult);

  return (
    <div style={toolbarStyle}>
      <button
        onClick={() => setMeasureMode(!measureMode)}
        style={{
          ...btnStyle,
          background: measureMode ? "rgba(255,68,68,0.25)" : "transparent",
          borderColor: measureMode ? "#ff4444" : "#555",
          color: measureMode ? "#ff4444" : "#ccc",
        }}
        title="Measure distance between two points"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z" />
          <path d="m14.5 12.5 2-2" />
          <path d="m11.5 9.5 2-2" />
          <path d="m8.5 6.5 2-2" />
          <path d="m17.5 15.5 2-2" />
        </svg>
        <span style={{ marginLeft: 6, fontSize: "0.75rem" }}>Measure</span>
      </button>

      {measureMode && !measureResult && (
        <div style={hintStyle}>Click two points or edges</div>
      )}

      {measureResult && (
        <div style={resultStyle}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 700, color: "#ff4444", fontSize: "1rem" }}>
              {measureResult.distance.toFixed(2)} mm
            </span>
            <button
              onClick={() => setMeasureResult(null)}
              style={clearBtnStyle}
            >
              ✕
            </button>
          </div>
          <div style={{ color: "#888", fontSize: "0.65rem", marginTop: 4 }}>
            P1: ({measureResult.p1.map((v) => v.toFixed(1)).join(", ")})
          </div>
          <div style={{ color: "#888", fontSize: "0.65rem" }}>
            P2: ({measureResult.p2.map((v) => v.toFixed(1)).join(", ")})
          </div>
        </div>
      )}
    </div>
  );
}

const toolbarStyle: React.CSSProperties = {
  position: "absolute",
  top: 16,
  right: 220,
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontFamily: "'Inter', system-ui, sans-serif",
};

const btnStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  padding: "6px 12px",
  borderRadius: 8,
  border: "1px solid #555",
  cursor: "pointer",
  fontSize: "0.8rem",
  backdropFilter: "blur(10px)",
  background: "rgba(20,20,40,0.9)",
};

const hintStyle: React.CSSProperties = {
  background: "rgba(20,20,40,0.9)",
  color: "#ff4444",
  padding: "6px 12px",
  borderRadius: 8,
  fontSize: "0.7rem",
  border: "1px solid rgba(255,68,68,0.3)",
};

const resultStyle: React.CSSProperties = {
  background: "rgba(20,20,40,0.95)",
  padding: "8px 12px",
  borderRadius: 8,
  fontSize: "0.8rem",
  border: "1px solid rgba(255,68,68,0.3)",
  minWidth: 160,
};

const clearBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#888",
  cursor: "pointer",
  fontSize: "0.9rem",
  padding: "0 4px",
};
