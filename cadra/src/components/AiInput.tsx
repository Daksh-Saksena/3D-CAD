import { useState } from "react";
import { generateDesign, editDesign, getAiConfig } from "../cad/aiService";
import { useModelStore } from "../store/modelStore";

export default function AiInput() {
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState("");
  const model = useModelStore((s) => s.model);
  const setModel = useModelStore((s) => s.setModel);
  const generating = useModelStore((s) => s.generating);
  const setGenerating = useModelStore((s) => s.setGenerating);
  const lastPrompt = useModelStore((s) => s.lastPrompt);
  const setLastPrompt = useModelStore((s) => s.setLastPrompt);

  const isEdit = !!lastPrompt;

  const handleSubmit = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    const { apiKey } = getAiConfig();
    if (!apiKey) {
      setFeedback("Set your API key in the settings panel first (top-left).");
      return;
    }

    setGenerating(true);
    setFeedback(isEdit ? "Modifying design..." : "Generating design...");

    try {
      const result = isEdit
        ? await editDesign(trimmed, model)
        : await generateDesign(trimmed);
      setModel(result);
      setLastPrompt(trimmed);
      setFeedback(isEdit ? "Design updated!" : "Design generated!");
      setInput("");
    } catch (err) {
      setFeedback(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div style={containerStyle}>
      {isEdit && (
        <div style={modeIndicatorStyle}>
          <span>Editing mode — describe changes to modify the current model</span>
          <button
            onClick={() => setLastPrompt("")}
            style={newDesignBtnStyle}
            title="Start fresh with a new design"
          >
            New
          </button>
        </div>
      )}
      <div style={inputRowStyle}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !generating && handleSubmit()}
          placeholder={
            isEdit
              ? 'Edit: "make it taller", "add 2 more steps", "change width to 200"'
              : 'Describe a 3D object: "make a cube 50mm" or "staircase with 4 steps"'
          }
          style={inputStyle}
          disabled={generating}
        />
        <button
          onClick={handleSubmit}
          style={{
            ...buttonStyle,
            background: isEdit ? "#e67e22" : "#4a90d9",
            opacity: generating ? 0.6 : 1,
            cursor: generating ? "wait" : "pointer",
          }}
          disabled={generating}
        >
          {generating ? "..." : isEdit ? "Edit" : "Generate"}
        </button>
      </div>
      {feedback && <p style={feedbackStyle}>{feedback}</p>}
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  position: "absolute",
  bottom: 20,
  left: "50%",
  transform: "translateX(-50%)",
  background: "rgba(20, 20, 40, 0.92)",
  borderRadius: 12,
  padding: "12px 16px",
  backdropFilter: "blur(10px)",
  border: "1px solid rgba(255,255,255,0.08)",
  boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
  minWidth: 500,
  maxWidth: 700,
  fontFamily: "'Inter', system-ui, sans-serif",
};

const inputRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: "10px 14px",
  borderRadius: 8,
  border: "1px solid #444",
  background: "#222",
  color: "#fff",
  fontSize: "0.9rem",
  outline: "none",
};

const buttonStyle: React.CSSProperties = {
  padding: "10px 20px",
  borderRadius: 8,
  border: "none",
  background: "#4a90d9",
  color: "#fff",
  fontSize: "0.9rem",
  fontWeight: 600,
};

const feedbackStyle: React.CSSProperties = {
  marginTop: 8,
  fontSize: "0.8rem",
  color: "#aaa",
};

const modeIndicatorStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 8,
  fontSize: "0.75rem",
  color: "#e67e22",
};

const newDesignBtnStyle: React.CSSProperties = {
  padding: "2px 10px",
  borderRadius: 5,
  border: "1px solid #555",
  background: "transparent",
  color: "#aaa",
  cursor: "pointer",
  fontSize: "0.72rem",
};
