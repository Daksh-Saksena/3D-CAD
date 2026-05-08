import type { Feature } from "../../store/modelStore";

/**
 * Creates a rectangular wire (closed 2D profile) from feature params.
 * Returns an array of [x, y] corner points for the rectangle, centered at origin.
 */
export function createRectangleProfile(
  feature: Feature
): { width: number; height: number } {
  const { width, height } = feature.params;
  return { width, height };
}
