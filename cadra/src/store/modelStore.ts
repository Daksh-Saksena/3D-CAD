import { create } from "zustand";

export interface FeatureParams {
  [key: string]: number | string | number[][];
}

export interface Feature {
  id: string;
  type:
    | "polygon"
    | "rectangle"
    | "extrude"
    | "circle"
    | "sphere"
    | "cylinder"
    | "hole"
    | "cone"
    | "torus"
    | "chamfer"
    | "fillet"
    | "shell"
    | "mirror"
    | "linear_pattern"
    | "union"
    | "revolve"
    | "intersect";
  params: FeatureParams;
  depends_on?: string;
}

export interface Model {
  features: Feature[];
}

export interface MeasureResult {
  distance: number;
  p1: [number, number, number];
  p2: [number, number, number];
}

interface ModelState {
  model: Model;
  generating: boolean;
  lastPrompt: string;
  measureMode: boolean;
  measureResult: MeasureResult | null;
  updateParam: (featureId: string, key: string, value: number) => void;
  updatePoint: (featureId: string, index: number, axis: 0 | 1, value: number) => void;
  setModel: (model: Model) => void;
  setGenerating: (v: boolean) => void;
  setLastPrompt: (v: string) => void;
  setMeasureMode: (v: boolean) => void;
  setMeasureResult: (v: MeasureResult | null) => void;
}

const DEFAULT_MODEL: Model = {
  features: [
    {
      id: "sketch1",
      type: "polygon",
      params: {
        points: [
          [0, 0],
          [100, 0],
          [100, 50],
          [0, 50],
        ],
      },
    },
    {
      id: "extrude1",
      type: "extrude",
      params: { depth: 30 },
      depends_on: "sketch1",
    },
  ],
};

export const useModelStore = create<ModelState>((set) => ({
  model: DEFAULT_MODEL,
  generating: false,
  lastPrompt: "",
  measureMode: false,
  measureResult: null,

  updateParam: (featureId, key, value) =>
    set((state) => ({
      model: {
        ...state.model,
        features: state.model.features.map((f) =>
          f.id === featureId
            ? { ...f, params: { ...f.params, [key]: value } }
            : f
        ),
      },
    })),

  updatePoint: (featureId, index, axis, value) =>
    set((state) => ({
      model: {
        ...state.model,
        features: state.model.features.map((f) => {
          if (f.id !== featureId) return f;
          const points = (f.params.points as number[][]).map((p) => [...p]);
          points[index][axis] = value;
          return { ...f, params: { ...f.params, points } };
        }),
      },
    })),

  setModel: (model) => set({ model }),
  setGenerating: (generating) => set({ generating }),
  setLastPrompt: (lastPrompt) => set({ lastPrompt }),
  setMeasureMode: (measureMode) => set({ measureMode }),
  setMeasureResult: (measureResult) => set({ measureResult }),
}));
