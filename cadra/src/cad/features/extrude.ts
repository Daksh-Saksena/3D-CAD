import type { Feature } from "../../store/modelStore";

/**
 * Returns the extrusion depth from an extrude feature.
 */
export function getExtrudeDepth(feature: Feature): number {
  return feature.params.depth;
}
