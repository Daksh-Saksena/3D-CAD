/**
 * AI Command Parser for Cadra.
 *
 * Parses natural language commands like:
 *   "make height 120mm"
 *   "set width to 200"
 *   "depth 50"
 *
 * Returns a structured command object.
 */

export interface ParsedCommand {
  action: "update";
  target: string; // e.g. "sketch1.height"
  value: number;
}

// Map of recognized parameter keywords → [featureId, paramKey]
const PARAM_MAP: Record<string, [string, string]> = {
  width: ["sketch1", "width"],
  height: ["sketch1", "height"],
  depth: ["extrude1", "depth"],
};

/**
 * Parse a natural language command into a structured command.
 * Returns null if the command can't be parsed.
 */
export function parseCommand(input: string): ParsedCommand | null {
  const text = input.toLowerCase().trim();

  // Match patterns like:
  //   "set width to 120"
  //   "make height 200mm"
  //   "width 150"
  //   "change depth to 50"
  const regex =
    /(?:set|make|change|update)?\s*(width|height|depth)\s*(?:to|=|:)?\s*(\d+(?:\.\d+)?)\s*(?:mm)?/i;

  const match = text.match(regex);
  if (!match) return null;

  const paramName = match[1].toLowerCase();
  const value = parseFloat(match[2]);

  if (isNaN(value) || value <= 0) return null;

  const mapping = PARAM_MAP[paramName];
  if (!mapping) return null;

  const [featureId, paramKey] = mapping;

  return {
    action: "update",
    target: `${featureId}.${paramKey}`,
    value,
  };
}
