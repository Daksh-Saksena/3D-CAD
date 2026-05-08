import type { Model } from "../store/modelStore";

const FEATURE_DOCS = `
FEATURE TYPES:

=== 2D SKETCH FEATURES (draw profiles on planes) ===

1. "polygon" — A 2D sketch profile with arbitrary vertices.
   params: { "points": [[x1,y1], [x2,y2], ...], "plane": "XY"|"XZ"|"YZ" (default "XY"), "offset": number (default 0) }
   Notes: Points form a CLOSED, NON-SELF-INTERSECTING path on the chosen plane. Do NOT repeat the first point.
   - plane "XY": draw in X,Y coords, extrude goes along Z
   - plane "XZ": draw in X,Z coords, extrude goes along Y
   - plane "YZ": draw in Y,Z coords, extrude goes along X
   - offset: shifts the sketch along the extrude direction

2. "circle" — A 2D circular sketch profile.
   params: { "radius": number, "cx": number (0), "cy": number (0), "plane": "XY"|"XZ"|"YZ" (default "XY"), "offset": number (0) }

3. "rectangle" — A 2D rectangular sketch profile (convenience for polygon).
   params: { "width": number, "height": number, "plane": "XY"|"XZ"|"YZ" (default "XY"), "offset": number (0) }

=== 3D BODY FEATURES (extrude/revolve sketches into 3D) ===

4. "extrude" — Extrude a 2D sketch along its plane's normal direction.
   params: { "depth": number }
   depends_on: "<sketch_id>"
   Notes: The extrude direction is determined by the sketch's plane (XY→Z, XZ→Y, YZ→X).

5. "revolve" — Revolve a 2D sketch profile around an axis to create a solid of revolution.
   params: { "angle": number (default 360, in degrees), "segments": number (default 64) }
   depends_on: "<sketch_id>"
   Notes: Revolves around the Y axis. The sketch's first coordinate = distance from axis, second = height. Great for vases, wine glasses, spindles, etc.

=== CONVENIENCE 3D PRIMITIVES (internally use sketch→extrude/revolve) ===

6. "sphere" — params: { "radius": number, "cx": 0, "cy": 0, "cz": 0 }
   (internally: semicircle revolved 360°)

7. "cylinder" — params: { "radius": number, "height": number, "cx": 0, "cy": 0, "cz": 0 }
   (internally: circle sketch extruded)

8. "cone" — params: { "radiusBottom": number, "radiusTop": number (0=sharp), "height": number, "cx": 0, "cy": 0, "cz": 0 }
   (internally: trapezoid profile revolved)

9. "torus" — params: { "majorRadius": number, "minorRadius": number, "cx": 0, "cy": 0, "cz": 0 }
   (internally: offset circle revolved)

=== BOOLEAN OPERATIONS (combine bodies) ===

10. "hole" — Boolean subtract (cut) from an existing body.
    params: { "profile": "circle"|"<sketch_id>", "radius": number (if circle), "depth": number (default 1000=through-all), "cx": number, "cy": number, "cz": number }
    depends_on: "<body_id to cut from>"

11. "union" — Boolean add (merge) two bodies into one.
    params: { "source": "<body_id to merge>" }
    depends_on: "<target_body_id>"

12. "intersect" — Boolean intersection: keep only the overlapping volume of two bodies.
    params: { "source": "<body_id>" }
    depends_on: "<target_body_id>"
    Notes: Perfect for creating complex shapes from multiple extruded cross-sections. Extrude profiles from different planes and intersect them.

=== MODIFIERS ===

13. "chamfer" — Bevel edges. params: { "radius": number } depends_on: "<body_id>"
14. "fillet" — Round edges. params: { "radius": number } depends_on: "<body_id>"
15. "shell" — Hollow out. params: { "thickness": number } depends_on: "<body_id>"
16. "mirror" — Mirror + union across axis. params: { "axis": "x"|"y"|"z" } depends_on: "<body_id>"
17. "linear_pattern" — Repeat in line. params: { "count": number, "dx": number, "dy": number, "dz": number } depends_on: "<body_id>"

=== PARAMETRIC WORKFLOW ===
The CORRECT approach for complex shapes:
1. Draw 2D cross-section profiles on different planes (XY, XZ, YZ)
2. Extrude each profile along its plane's normal
3. Boolean combine the extruded bodies (union, subtract, intersect)

For complex curved shapes, use "revolve" to spin a profile around an axis.
`;

const SYSTEM_PROMPT = `You are a parametric CAD assistant. The user describes a 3D object and you generate a feature tree JSON to build it.

RULES:
- You output ONLY valid JSON — no markdown, no explanations, no backticks.
- Coordinates are in millimeters.
- ALWAYS use the parametric workflow: draw 2D sketches on planes → extrude → boolean combine.
- For complex 3D shapes, draw cross-section profiles on MULTIPLE planes (XY, XZ, YZ), extrude each, then intersect/union/subtract them.
- Use "revolve" for round/symmetric objects (vases, bottles, spindles, wheels).
- Convenience primitives (sphere, cylinder, cone, torus) are OK for simple parts but PREFER sketch→extrude for anything complex.
- When creating MULTIPLE shapes side by side (e.g. letters, text, rows of objects), put ALL profiles on the SAME XY plane and offset their POINTS in X coordinates. Do NOT use different planes or the "offset" parameter to position them — "offset" moves along the DEPTH direction, not sideways.

=== TEXT / LETTER RULES ===
When making 3D text/letters:
1. Draw each letter as a polygon on the SAME XY plane. Space letters apart using X offsets in the points.
2. Extrude all letters with the SAME depth along Z. Union them into one body.
3. Letters WITHOUT enclosed spaces (H, I, K, L, T, V, W, X, Y, Z, F, E, N, M, 1, 7) can each be a single polygon.
4. Letters WITH enclosed spaces (O, D, B, P, R, A, Q, 0, 4, 6, 8, 9) need TWO steps: extrude the OUTER shape, then use "hole" to CUT OUT the inner opening.
5. Letter stroke width should be consistent (~8-10mm for 60mm tall letters).
6. Space between letters should be ~10mm.

LETTER POLYGON RECIPES (for ~60mm tall, ~8mm stroke, starting at x=0):
- H: [[0,0],[8,0],[8,26],[32,26],[32,0],[40,0],[40,60],[32,60],[32,34],[8,34],[8,60],[0,60]]
- I: [[0,0],[10,0],[10,60],[0,60]]  (just a bar)
- K: [[0,0],[8,0],[8,22],[28,0],[38,0],[14,28],[38,60],[28,60],[8,38],[8,60],[0,60]]
- L: [[0,0],[30,0],[30,8],[8,8],[8,60],[0,60]]
- T: [[0,52],[40,52],[40,60],[0,60]] for top bar + [[16,0],[24,0],[24,52],[16,52]] for stem — draw as one polygon: [[16,0],[24,0],[24,52],[40,52],[40,60],[0,60],[0,52],[16,52]]
- E: [[0,0],[30,0],[30,8],[8,8],[8,26],[24,26],[24,34],[8,34],[8,52],[30,52],[30,60],[0,60]]
- F: [[0,0],[8,0],[8,26],[24,26],[24,34],[8,34],[8,52],[30,52],[30,60],[0,60]]
- S: [[0,0],[30,0],[30,34],[8,34],[8,26],[0,26],[0,0]] — approximate as: [[0,0],[30,0],[30,8],[8,8],[8,26],[30,26],[30,60],[0,60],[0,52],[22,52],[22,34],[0,34]]
- D: Outer: [[0,0],[24,0],[32,8],[32,52],[24,60],[0,60]] then hole to cut inner: polygon [[8,8],[20,8],[26,14],[26,46],[20,52],[8,52]] subtracted.
- O: Outer: [[0,0],[40,0],[40,60],[0,60]] then hole: [[8,8],[32,8],[32,52],[8,52]] subtracted.
- B: Outer: [[0,0],[28,0],[34,6],[34,26],[28,30],[34,34],[34,54],[28,60],[0,60]] then two holes for upper and lower counters.
- P: [[0,0],[8,0],[8,26],[24,26],[28,30],[28,54],[24,60],[0,60]] then hole for upper counter.
- R: Like P but with a diagonal leg added.
- A: Outer triangle [[0,0],[20,60],[40,0],[32,0],[26,16],[14,16],[8,0]] then hole for counter.
` + FEATURE_DOCS + `
OUTPUT FORMAT:
{
  "features": [
    { "id": "sketch1", "type": "polygon", "params": { "points": [...], "plane": "XY" } },
    { "id": "extrude1", "type": "extrude", "params": { "depth": N }, "depends_on": "sketch1" }
  ]
}

EXAMPLES:

User: "make a cube with side 50mm"
{
  "features": [
    { "id": "sketch1", "type": "polygon", "params": { "points": [[0,0],[50,0],[50,50],[0,50]], "plane": "XY" } },
    { "id": "extrude1", "type": "extrude", "params": { "depth": 50 }, "depends_on": "sketch1" }
  ]
}

User: "T-shaped beam: vertical 20x80, horizontal 60x20, depth 30"
Approach: Draw T-profile on XY, extrude along Z.
{
  "features": [
    { "id": "sketch1", "type": "polygon", "params": { "points": [[-10,0],[10,0],[10,60],[-30,60],[-30,80],[30,80],[30,60],[10,60],[10,0]], "plane": "XY" } },
    { "id": "extrude1", "type": "extrude", "params": { "depth": 30 }, "depends_on": "sketch1" }
  ]
}

User: "cross/plus shape 3D block"
Approach: Draw front profile on XY, side profile on YZ, extrude both, INTERSECT to get the cross shape.
{
  "features": [
    { "id": "front", "type": "polygon", "params": { "points": [[-10,-30],[-10,-10],[-30,-10],[-30,10],[-10,10],[-10,30],[10,30],[10,10],[30,10],[30,-10],[10,-10],[10,-30]], "plane": "XY" } },
    { "id": "extFront", "type": "extrude", "params": { "depth": 60 }, "depends_on": "front" },
    { "id": "side", "type": "polygon", "params": { "points": [[-10,-30],[-10,-10],[-30,-10],[-30,10],[-10,10],[-10,30],[10,30],[10,10],[30,10],[30,-10],[10,-10],[10,-30]], "plane": "YZ" } },
    { "id": "extSide", "type": "extrude", "params": { "depth": 60 }, "depends_on": "side" },
    { "id": "combine", "type": "intersect", "params": { "source": "extSide" }, "depends_on": "extFront" }
  ]
}

User: "wine glass"
Approach: Draw half-profile (stem + bowl + base) and revolve 360°.
{
  "features": [
    { "id": "profile", "type": "polygon", "params": { "points": [[0,0],[25,0],[25,3],[3,3],[3,50],[2,55],[15,80],[15,85],[0,85]], "plane": "XY" } },
    { "id": "body", "type": "revolve", "params": { "angle": 360, "segments": 64 }, "depends_on": "profile" }
  ]
}

User: "plate 100x60, 15mm thick, with a 10mm hole in the center"
{
  "features": [
    { "id": "sketch1", "type": "polygon", "params": { "points": [[0,0],[100,0],[100,60],[0,60]], "plane": "XY" } },
    { "id": "extrude1", "type": "extrude", "params": { "depth": 15 }, "depends_on": "sketch1" },
    { "id": "hole1", "type": "hole", "params": { "profile": "circle", "radius": 10, "cx": 50, "cy": 30, "cz": 0 }, "depends_on": "extrude1" }
  ]
}

User: "bracket: L-shape on XY extruded 20mm, plus triangular rib on XZ"
Approach: Draw L on XY plane, extrude. Draw triangle rib on XZ plane, extrude. Union them.
{
  "features": [
    { "id": "sketchL", "type": "polygon", "params": { "points": [[0,0],[50,0],[50,10],[10,10],[10,40],[0,40]], "plane": "XY" } },
    { "id": "extL", "type": "extrude", "params": { "depth": 20 }, "depends_on": "sketchL" },
    { "id": "sketchRib", "type": "polygon", "params": { "points": [[10,10],[10,35],[45,10]], "plane": "XZ" } },
    { "id": "extRib", "type": "extrude", "params": { "depth": 20 }, "depends_on": "sketchRib" },
    { "id": "join", "type": "union", "params": { "source": "extRib" }, "depends_on": "extL" }
  ]
}

User: "staircase 3 steps, step 20mm wide 15mm tall, depth 40mm"
{
  "features": [
    { "id": "sketch1", "type": "polygon", "params": { "points": [[0,0],[20,0],[20,15],[40,15],[40,30],[60,30],[60,45],[0,45]], "plane": "XY" } },
    { "id": "extrude1", "type": "extrude", "params": { "depth": 40 }, "depends_on": "sketch1" }
  ]
}

User: "hollow box 60x60x60, wall 4mm"
{
  "features": [
    { "id": "sketch1", "type": "polygon", "params": { "points": [[0,0],[60,0],[60,60],[0,60]], "plane": "XY" } },
    { "id": "extrude1", "type": "extrude", "params": { "depth": 60 }, "depends_on": "sketch1" },
    { "id": "shell1", "type": "shell", "params": { "thickness": 4 }, "depends_on": "extrude1" }
  ]
}

User: "make the text HI"
Approach: H is a single polygon (no enclosed space). I is a single bar. All on SAME XY plane. Space between letters = 10mm.
{
  "features": [
    { "id": "sketchH", "type": "polygon", "params": { "points": [[0,0],[8,0],[8,26],[32,26],[32,0],[40,0],[40,60],[32,60],[32,34],[8,34],[8,60],[0,60]], "plane": "XY" } },
    { "id": "extH", "type": "extrude", "params": { "depth": 10 }, "depends_on": "sketchH" },
    { "id": "sketchI", "type": "polygon", "params": { "points": [[50,0],[60,0],[60,60],[50,60]], "plane": "XY" } },
    { "id": "extI", "type": "extrude", "params": { "depth": 10 }, "depends_on": "sketchI" },
    { "id": "join", "type": "union", "params": { "source": "extI" }, "depends_on": "extH" }
  ]
}

User: "make the text DO"
Approach: D has enclosed space — draw outer D shape, extrude. Draw inner D counter as separate sketch, use hole with profile=sketch to cut it out. O is similar: outer rect extruded, inner rect cut. All on same XY plane.
{
  "features": [
    { "id": "skD", "type": "polygon", "params": { "points": [[0,0],[24,0],[32,8],[32,52],[24,60],[0,60]], "plane": "XY" } },
    { "id": "extD", "type": "extrude", "params": { "depth": 10 }, "depends_on": "skD" },
    { "id": "skDinner", "type": "polygon", "params": { "points": [[8,8],[20,8],[26,14],[26,46],[20,52],[8,52]], "plane": "XY" } },
    { "id": "cutD", "type": "hole", "params": { "profile": "skDinner", "depth": 10, "cx": 0, "cy": 0, "cz": 0 }, "depends_on": "extD" },
    { "id": "skO", "type": "polygon", "params": { "points": [[42,0],[82,0],[82,60],[42,60]], "plane": "XY" } },
    { "id": "extO", "type": "extrude", "params": { "depth": 10 }, "depends_on": "skO" },
    { "id": "skOinner", "type": "polygon", "params": { "points": [[50,8],[74,8],[74,52],[50,52]], "plane": "XY" } },
    { "id": "cutO", "type": "hole", "params": { "profile": "skOinner", "depth": 10, "cx": 0, "cy": 0, "cz": 0 }, "depends_on": "extO" },
    { "id": "joinDO", "type": "union", "params": { "source": "extO" }, "depends_on": "extD" }
  ]
}
NOTE: For letters with enclosed spaces (D, O, B, P, A, R, Q, etc.), draw the outer shape AND a separate inner sketch for the counter (hole). Use hole with profile="<inner_sketch_id>" to cut it out. This creates proper hollow letters.

Think step-by-step:
1. What 2D profiles define this shape? On which planes?
2. How deep to extrude each?
3. How to combine them (union, subtract, intersect)?
Choose the simplest approach that produces the correct result.`;

const EDIT_SYSTEM_PROMPT = `You are a parametric CAD assistant. The user has an existing 3D model (represented as a feature tree JSON) and wants to modify it.

RULES:
- You receive the CURRENT model as JSON and a modification request.
- You output ONLY the COMPLETE UPDATED feature tree JSON — no markdown, no explanations, no backticks.
- Preserve all existing features unless the user asks to remove them.
- Apply the requested changes: resize, add/remove features, change dimensions, add holes, etc.
- All coordinates are in millimeters.
` + FEATURE_DOCS + `
OUTPUT FORMAT (always the full updated model):
{
  "features": [ ... ]
}

Think carefully about what the user wants changed, apply it to the existing model, and return the complete updated feature tree.`;

let apiKey = "";
let provider: "openai" | "anthropic" | "gemini" = "openai";

export function setAiConfig(key: string, prov: "openai" | "anthropic" | "gemini") {
  apiKey = key;
  provider = prov;
}

export function getAiConfig() {
  return { apiKey, provider };
}

export async function generateDesign(prompt: string): Promise<Model> {
  if (!apiKey) {
    throw new Error("API key not set. Configure it in the settings panel.");
  }

  const responseText = await callLLM(SYSTEM_PROMPT, prompt);
  return parseModelResponse(responseText);
}

export async function editDesign(prompt: string, currentModel: Model): Promise<Model> {
  if (!apiKey) {
    throw new Error("API key not set. Configure it in the settings panel.");
  }

  const editPrompt = `CURRENT MODEL:\n${JSON.stringify(currentModel, null, 2)}\n\nMODIFICATION REQUEST: ${prompt}`;
  const responseText = await callLLM(EDIT_SYSTEM_PROMPT, editPrompt);
  return parseModelResponse(responseText);
}

function parseModelResponse(responseText: string): Model {
  const jsonStr = extractJSON(responseText);
  const parsed = JSON.parse(jsonStr);

  if (!parsed.features || !Array.isArray(parsed.features)) {
    throw new Error("AI response missing 'features' array");
  }

  for (const f of parsed.features) {
    if (!f.id || !f.type) {
      throw new Error("Each feature needs 'id' and 'type'");
    }
  }

  return parsed as Model;
}

async function callLLM(systemPrompt: string, userPrompt: string): Promise<string> {
  if (provider === "openai") {
    return callOpenAI(systemPrompt, userPrompt);
  } else if (provider === "anthropic") {
    return callAnthropic(systemPrompt, userPrompt);
  } else if (provider === "gemini") {
    return callGemini(systemPrompt, userPrompt);
  }
  throw new Error(`Unknown provider: ${provider}`);
}

async function callOpenAI(systemPrompt: string, userPrompt: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 4096,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error: ${res.status} — ${err}`);
  }

  const data = await res.json();
  return data.choices[0].message.content;
}

async function callAnthropic(systemPrompt: string, userPrompt: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error: ${res.status} — ${err}`);
  }

  const data = await res.json();
  return data.content[0].text;
}

async function callGemini(systemPrompt: string, userPrompt: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: systemPrompt + "\n\nUser request: " + userPrompt },
            ],
          },
        ],
        generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error: ${res.status} — ${err}`);
  }

  const data = await res.json();
  return data.candidates[0].content.parts[0].text;
}

function extractJSON(text: string): string {
  // Try to find JSON in markdown code blocks
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) return codeBlockMatch[1].trim();

  // Try to find raw JSON object
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) return jsonMatch[0];

  return text.trim();
}
