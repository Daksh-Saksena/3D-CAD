import { useState } from "react";
import { useModelStore } from "../store/modelStore";
import { setAiConfig, getAiConfig } from "../cad/aiService";

export default function Controls() {
  const model = useModelStore((s) => s.model);
  const lastPrompt = useModelStore((s) => s.lastPrompt);
  const updateParam = useModelStore((s) => s.updateParam);
  const updatePoint = useModelStore((s) => s.updatePoint);

  const [showSettings, setShowSettings] = useState(!getAiConfig().apiKey);
  const [apiKey, setApiKey] = useState(getAiConfig().apiKey);
  const [provider, setProvider] = useState<"openai" | "anthropic" | "gemini">(
    getAiConfig().provider
  );

  const saveSettings = () => {
    setAiConfig(apiKey, provider);
    setShowSettings(false);
  };

  return (
    <div style={panelStyle}>
      <h2 style={titleStyle}>Cadra</h2>
      <p style={subtitleStyle}>AI Parametric CAD</p>

      {/* Settings toggle */}
      <button
        onClick={() => setShowSettings(!showSettings)}
        style={settingsToggleStyle}
      >
        {showSettings ? "Hide Settings" : "Settings"}
      </button>

      {/* API Key Settings */}
      {showSettings && (
        <div style={sectionStyle}>
          <h3 style={sectionTitleStyle}>AI Provider</h3>
          <select
            value={provider}
            onChange={(e) =>
              setProvider(e.target.value as "openai" | "anthropic" | "gemini")
            }
            style={selectStyle}
          >
            <option value="openai">OpenAI (GPT-4o)</option>
            <option value="anthropic">Anthropic (Claude)</option>
            <option value="gemini">Google (Gemini)</option>
          </select>

          <h3 style={{ ...sectionTitleStyle, marginTop: 10 }}>API Key</h3>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Paste your API key"
            style={keyInputStyle}
          />
          <button onClick={saveSettings} style={saveButtonStyle}>
            Save
          </button>
        </div>
      )}

      {/* Current prompt */}
      {lastPrompt && (
        <div style={sectionStyle}>
          <h3 style={sectionTitleStyle}>Last Prompt</h3>
          <p style={promptTextStyle}>"{lastPrompt}"</p>
        </div>
      )}

      {/* Feature Tree */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>Feature Tree</h3>
        {model.features.map((feature) => (
          <div key={feature.id} style={featureItemStyle}>
            <div style={featureHeaderStyle}>
              <span style={featureTypeStyle}>{feature.type}</span>
              <span style={featureIdStyle}>{feature.id}</span>
            </div>
            {Object.entries(feature.params).map(([key, value]) => {
              if (key === "points") return null;
              if (typeof value === "string") {
                return (
                  <div key={key} style={paramRowStyle}>
                    <label style={labelStyle}>{key}</label>
                    <span style={{ fontSize: "0.78rem", color: "#999" }}>
                      {value}
                    </span>
                  </div>
                );
              }
              if (typeof value !== "number") return null;
              const allowNegative =
                key === "cx" ||
                key === "cy" ||
                key === "cz" ||
                key === "dx" ||
                key === "dy" ||
                key === "dz";
              const allowZero =
                key === "radiusTop" || key === "dx" || key === "dy" || key === "dz";
              return (
                <div key={key} style={paramRowStyle}>
                  <label style={labelStyle}>{key}</label>
                  <input
                    type="number"
                    value={value}
                    step={1}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v) && (allowNegative || allowZero ? v >= 0 || allowNegative : v > 0))
                        updateParam(feature.id, key, v);
                    }}
                    style={numInputStyle}
                  />
                  <span style={unitStyle}>mm</span>
                </div>
              );
            })}
            {feature.type === "polygon" && feature.params.points && (
              <PointsEditor
                featureId={feature.id}
                points={feature.params.points as number[][]}
                updatePoint={updatePoint}
              />
            )}
            {feature.depends_on && (
              <p style={pointsInfoStyle}>depends on: {feature.depends_on}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Points Editor ─────────────────────

function PointsEditor({
  featureId,
  points,
  updatePoint,
}: {
  featureId: string;
  points: number[][];
  updatePoint: (id: string, idx: number, axis: 0 | 1, val: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{ marginTop: 4 }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={pointsToggleStyle}
      >
        {expanded ? "▾" : "▸"} {points.length} vertices
      </button>
      {expanded && (
        <div style={pointsGridStyle}>
          {points.map((pt, i) => (
            <div key={i} style={pointRowStyle}>
              <span style={pointIndexStyle}>{i}</span>
              <input
                type="number"
                value={pt[0]}
                step={1}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v)) updatePoint(featureId, i, 0, v);
                }}
                style={pointInputStyle}
              />
              <input
                type="number"
                value={pt[1]}
                step={1}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v)) updatePoint(featureId, i, 1, v);
                }}
                style={pointInputStyle}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Styles ────────────────────────────

const panelStyle: React.CSSProperties = {
  position: "absolute",
  top: 16,
  left: 16,
  background: "rgba(20, 20, 40, 0.92)",
  borderRadius: 12,
  padding: "20px 24px",
  color: "#eee",
  fontFamily: "'Inter', system-ui, sans-serif",
  minWidth: 240,
  maxWidth: 280,
  maxHeight: "calc(100vh - 120px)",
  overflowY: "auto",
  backdropFilter: "blur(10px)",
  border: "1px solid rgba(255,255,255,0.08)",
  boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "1.4rem",
  fontWeight: 700,
  letterSpacing: "0.04em",
};

const subtitleStyle: React.CSSProperties = {
  margin: "2px 0 12px",
  fontSize: "0.75rem",
  color: "#888",
  textTransform: "uppercase",
  letterSpacing: "0.1em",
};

const settingsToggleStyle: React.CSSProperties = {
  padding: "4px 12px",
  borderRadius: 6,
  border: "1px solid #555",
  background: "transparent",
  color: "#aaa",
  cursor: "pointer",
  fontSize: "0.75rem",
  marginBottom: 12,
};

const sectionStyle: React.CSSProperties = {
  marginBottom: 14,
};

const sectionTitleStyle: React.CSSProperties = {
  margin: "0 0 6px",
  fontSize: "0.8rem",
  color: "#aaa",
  fontWeight: 600,
};

const selectStyle: React.CSSProperties = {
  width: "100%",
  padding: "6px 8px",
  borderRadius: 6,
  border: "1px solid #444",
  background: "#222",
  color: "#fff",
  fontSize: "0.82rem",
  outline: "none",
};

const keyInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "6px 8px",
  borderRadius: 6,
  border: "1px solid #444",
  background: "#222",
  color: "#fff",
  fontSize: "0.82rem",
  outline: "none",
  marginBottom: 8,
  boxSizing: "border-box",
};

const saveButtonStyle: React.CSSProperties = {
  padding: "5px 14px",
  borderRadius: 6,
  border: "none",
  background: "#4a90d9",
  color: "#fff",
  cursor: "pointer",
  fontSize: "0.8rem",
  fontWeight: 600,
};

const promptTextStyle: React.CSSProperties = {
  fontSize: "0.78rem",
  color: "#999",
  fontStyle: "italic",
  margin: 0,
  lineHeight: 1.4,
};

const featureItemStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  borderRadius: 8,
  padding: "8px 10px",
  marginBottom: 6,
  border: "1px solid rgba(255,255,255,0.06)",
};

const featureHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 4,
};

const featureTypeStyle: React.CSSProperties = {
  fontSize: "0.78rem",
  fontWeight: 600,
  color: "#4a90d9",
  textTransform: "uppercase",
};

const featureIdStyle: React.CSSProperties = {
  fontSize: "0.7rem",
  color: "#666",
};

const paramRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  marginTop: 4,
};

const labelStyle: React.CSSProperties = {
  width: 48,
  fontSize: "0.78rem",
  color: "#ccc",
};

const numInputStyle: React.CSSProperties = {
  width: 70,
  padding: "3px 6px",
  borderRadius: 5,
  border: "1px solid #444",
  background: "#222",
  color: "#fff",
  fontSize: "0.82rem",
  outline: "none",
};

const unitStyle: React.CSSProperties = {
  fontSize: "0.7rem",
  color: "#666",
};

const pointsInfoStyle: React.CSSProperties = {
  fontSize: "0.72rem",
  color: "#777",
  margin: "4px 0 0",
};

const pointsToggleStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#888",
  cursor: "pointer",
  fontSize: "0.72rem",
  padding: "2px 0",
};

const pointsGridStyle: React.CSSProperties = {
  marginTop: 4,
  maxHeight: 160,
  overflowY: "auto",
};

const pointRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  marginBottom: 2,
};

const pointIndexStyle: React.CSSProperties = {
  width: 16,
  fontSize: "0.65rem",
  color: "#555",
  textAlign: "right",
};

const pointInputStyle: React.CSSProperties = {
  width: 52,
  padding: "2px 4px",
  borderRadius: 4,
  border: "1px solid #444",
  background: "#222",
  color: "#fff",
  fontSize: "0.75rem",
  outline: "none",
};
