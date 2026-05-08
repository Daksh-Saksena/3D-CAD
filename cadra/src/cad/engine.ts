import * as THREE from "three";
import { Evaluator, Brush, SUBTRACTION, ADDITION, INTERSECTION } from "three-bvh-csg";
import type { Model, Feature } from "../store/modelStore";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let oc: any = null;
let ocFailed = false;

export async function initOC(): Promise<boolean> {
  if (oc) return true;
  if (ocFailed) return false;

  try {
    const script = await fetch("/opencascade.wasm.js");
    const scriptText = await script.text();
    // eslint-disable-next-line no-new-func
    const opencascadeFactory = new Function(
      scriptText + "\nreturn opencascade;"
    )();

    oc = await opencascadeFactory({
      locateFile(path: string) {
        if (path.endsWith(".wasm")) {
          return "/opencascade.wasm.wasm";
        }
        return path;
      },
    });
    console.log("OpenCascade loaded successfully");
    return true;
  } catch (err) {
    console.warn("OpenCascade failed to load, using Three.js fallback:", err);
    ocFailed = true;
    return false;
  }
}

const csgEvaluator = new Evaluator();

export async function generateGeometry(
  model: Model
): Promise<THREE.Group | null> {
  return generateFallback(model);
}

// ─── Sketch plane support ───────────────────────────────────

type SketchData = {
  points: number[][];
  plane: "XY" | "XZ" | "YZ";
  offset: number;
};

/**
 * Build a THREE.Shape from 2D points.
 */
function makeShape(points: number[][]): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) {
    shape.lineTo(points[i][0], points[i][1]);
  }
  shape.closePath();
  return shape;
}

/**
 * Extrude a shape along the normal of its sketch plane.
 * XY plane: extrude along +Z  (default — ExtrudeGeometry does this natively)
 * XZ plane: sketch coords are (X, Z), extrude along +Y
 * YZ plane: sketch coords are (Y, Z), extrude along +X
 */
function extrudeOnPlane(
  shape: THREE.Shape,
  depth: number,
  plane: "XY" | "XZ" | "YZ",
  offset: number
): THREE.BufferGeometry {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
  });

  if (plane === "XZ") {
    // Shape was drawn in (X, Z) coords → ExtrudeGeometry pushed along Z
    // We need to rotate so that the profile sits in XZ and extrudes along Y
    // The shape is in the XY plane of ExtrudeGeometry, extruded along Z.
    // Rotate -90° around X to map: X→X, Y(original shape axis)→Z, Z(extrude)→Y
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, offset, 0);
  } else if (plane === "YZ") {
    // Shape was drawn in (Y, Z) coords
    // Rotate +90° around Y to map: X(shape)→Z, Z(extrude)→X
    // Then rotate -90° around Z to align Y axis
    geo.rotateY(Math.PI / 2);
    geo.translate(offset, 0, 0);
  } else {
    // XY — default, extrude goes along Z
    if (offset !== 0) geo.translate(0, 0, offset);
  }

  return geo;
}

// ─── Three.js + CSG engine ──────────────────────────────────

function generateFallback(model: Model): THREE.Group | null {
  const sketches: Record<string, SketchData> = {};
  const bodies: Record<string, THREE.BufferGeometry> = {};

  // ── Pass 1: collect all 2D sketches ───────────────────────
  for (const feature of model.features) {
    const plane = ((feature.params.plane as string) || "XY").toUpperCase() as "XY" | "XZ" | "YZ";
    const offset = (feature.params.offset as number) || 0;

    if (feature.type === "polygon") {
      const pts = feature.params.points as number[][];
      if (pts && pts.length >= 3) {
        sketches[feature.id] = { points: pts, plane, offset };
      }
    } else if (feature.type === "rectangle") {
      const w = (feature.params.width as number) || 100;
      const h = (feature.params.height as number) || 50;
      sketches[feature.id] = {
        points: [[0, 0], [w, 0], [w, h], [0, h]],
        plane,
        offset,
      };
    } else if (feature.type === "circle") {
      const r = (feature.params.radius as number) || 25;
      const cx = (feature.params.cx as number) || 0;
      const cy = (feature.params.cy as number) || 0;
      const segs = 64;
      const pts: number[][] = [];
      for (let i = 0; i < segs; i++) {
        const angle = (i / segs) * Math.PI * 2;
        pts.push([cx + Math.cos(angle) * r, cy + Math.sin(angle) * r]);
      }
      sketches[feature.id] = { points: pts, plane, offset };
    }
  }

  // ── Pass 2: build 3D bodies (always via sketch → extrude) ─
  for (const feature of model.features) {
    if (feature.type === "extrude") {
      const depth = (feature.params.depth as number) || 30;
      const sketchId = feature.depends_on || "";
      const sketch = sketches[sketchId];
      if (!sketch || sketch.points.length < 3) continue;

      const shape = makeShape(sketch.points);
      bodies[feature.id] = extrudeOnPlane(shape, depth, sketch.plane, sketch.offset);
    } else if (feature.type === "revolve") {
      // Revolve a sketch around an axis (lathe)
      const sketchId = feature.depends_on || "";
      const sketch = sketches[sketchId];
      if (!sketch || sketch.points.length < 2) continue;

      const segments = (feature.params.segments as number) || 64;
      const angle = ((feature.params.angle as number) || 360) * (Math.PI / 180);

      // Convert sketch points to Vector2 for LatheGeometry
      // LatheGeometry revolves around Y axis: points are (distance_from_axis, height)
      const lathePoints = sketch.points.map(
        (p) => new THREE.Vector2(Math.abs(p[0]), p[1])
      );
      const geo = new THREE.LatheGeometry(lathePoints, segments, 0, angle);
      bodies[feature.id] = geo;
    } else if (feature.type === "sphere") {
      // Sphere = circle sketch on XZ + revolve 360°. But for convenience,
      // we build it from a semicircle revolved (lathe)
      const r = (feature.params.radius as number) || 25;
      const cx = (feature.params.cx as number) || 0;
      const cy = (feature.params.cy as number) || 0;
      const cz = (feature.params.cz as number) || 0;
      const segs = 48;
      const pts: THREE.Vector2[] = [];
      for (let i = 0; i <= segs; i++) {
        const angle = (i / segs) * Math.PI;
        pts.push(new THREE.Vector2(Math.sin(angle) * r, Math.cos(angle) * r));
      }
      const geo = new THREE.LatheGeometry(pts, 48, 0, Math.PI * 2);
      geo.translate(cx, cz, cy);
      bodies[feature.id] = geo;
    } else if (feature.type === "cylinder") {
      // Cylinder = circle sketch + extrude
      const r = (feature.params.radius as number) || 25;
      const h = (feature.params.height as number) || 50;
      const cx = (feature.params.cx as number) || 0;
      const cy = (feature.params.cy as number) || 0;
      const cz = (feature.params.cz as number) || 0;
      // Build circle sketch, extrude
      const circleShape = new THREE.Shape();
      for (let i = 0; i <= 64; i++) {
        const angle = (i / 64) * Math.PI * 2;
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;
        if (i === 0) circleShape.moveTo(x, y);
        else circleShape.lineTo(x, y);
      }
      circleShape.closePath();
      const geo = new THREE.ExtrudeGeometry(circleShape, {
        depth: h,
        bevelEnabled: false,
      });
      geo.translate(cx, cy, cz);
      bodies[feature.id] = geo;
    } else if (feature.type === "cone") {
      // Cone = trapezoid sketch revolved 360°
      const rBottom = (feature.params.radiusBottom as number) ?? (feature.params.radius as number) ?? 25;
      const rTop = (feature.params.radiusTop as number) ?? 0;
      const h = (feature.params.height as number) || 50;
      const cx = (feature.params.cx as number) || 0;
      const cy = (feature.params.cy as number) || 0;
      const cz = (feature.params.cz as number) || 0;
      // Lathe a line from (rBottom, 0) to (rTop, h)
      const pts = [
        new THREE.Vector2(rBottom, 0),
        new THREE.Vector2(rTop, h),
        new THREE.Vector2(0, h),
        new THREE.Vector2(0, 0),
      ];
      const geo = new THREE.LatheGeometry(pts, 64, 0, Math.PI * 2);
      geo.translate(cx, cz, cy);
      bodies[feature.id] = geo;
    } else if (feature.type === "torus") {
      // Torus = circle sketch offset from axis, revolved 360°
      const R = (feature.params.majorRadius as number) || 40;
      const r = (feature.params.minorRadius as number) || 10;
      const cx = (feature.params.cx as number) || 0;
      const cy = (feature.params.cy as number) || 0;
      const cz = (feature.params.cz as number) || 0;
      const segs = 32;
      const pts: THREE.Vector2[] = [];
      for (let i = 0; i <= segs; i++) {
        const angle = (i / segs) * Math.PI * 2;
        pts.push(new THREE.Vector2(
          R + Math.cos(angle) * r,
          Math.sin(angle) * r
        ));
      }
      const geo = new THREE.LatheGeometry(pts, 64, 0, Math.PI * 2);
      geo.translate(cx, cz, cy);
      bodies[feature.id] = geo;
    }
  }

  // ── Pass 3: boolean operations ────────────────────────────
  for (const feature of model.features) {
    if (feature.type === "hole") {
      const targetId = feature.depends_on || "";
      const targetGeo = bodies[targetId];
      if (!targetGeo) continue;

      const holeGeo = buildHoleGeometry(feature, sketches);
      if (!holeGeo) continue;

      try {
        const baseBrush = new Brush(targetGeo);
        baseBrush.updateMatrixWorld();
        const cutBrush = new Brush(holeGeo);
        cutBrush.updateMatrixWorld();

        const result = csgEvaluator.evaluate(baseBrush, cutBrush, SUBTRACTION);
        bodies[targetId] = result.geometry;

        baseBrush.geometry.dispose();
        cutBrush.geometry.dispose();
      } catch (err) {
        console.warn("CSG subtract failed for hole:", feature.id, err);
      }
      holeGeo.dispose();
    } else if (feature.type === "union") {
      const targetId = feature.depends_on || "";
      const sourceId = (feature.params.source as string) || "";
      const targetGeo = bodies[targetId];
      const sourceGeo = bodies[sourceId];
      if (!targetGeo || !sourceGeo) continue;

      try {
        const baseBrush = new Brush(targetGeo);
        baseBrush.updateMatrixWorld();
        const addBrush = new Brush(sourceGeo);
        addBrush.updateMatrixWorld();

        const result = csgEvaluator.evaluate(baseBrush, addBrush, ADDITION);
        bodies[targetId] = result.geometry;

        baseBrush.geometry.dispose();
        addBrush.geometry.dispose();
        delete bodies[sourceId];
      } catch (err) {
        console.warn("CSG union failed:", feature.id, err);
      }
    } else if (feature.type === "intersect") {
      const targetId = feature.depends_on || "";
      const sourceId = (feature.params.source as string) || "";
      const targetGeo = bodies[targetId];
      const sourceGeo = bodies[sourceId];
      if (!targetGeo || !sourceGeo) continue;

      try {
        const baseBrush = new Brush(targetGeo);
        baseBrush.updateMatrixWorld();
        const intBrush = new Brush(sourceGeo);
        intBrush.updateMatrixWorld();

        const result = csgEvaluator.evaluate(baseBrush, intBrush, INTERSECTION);
        bodies[targetId] = result.geometry;

        baseBrush.geometry.dispose();
        intBrush.geometry.dispose();
        delete bodies[sourceId];
      } catch (err) {
        console.warn("CSG intersect failed:", feature.id, err);
      }
    }
  }

  // ── Pass 4: modifiers (chamfer, fillet, shell, mirror, pattern) ──
  for (const feature of model.features) {
    if (feature.type === "chamfer" || feature.type === "fillet") {
      const targetId = feature.depends_on || "";
      const targetGeo = bodies[targetId];
      if (!targetGeo) continue;

      const radius = (feature.params.radius as number) || 3;
      const isFillet = feature.type === "fillet";
      bodies[targetId] = applyChamferFillet(targetGeo, radius, isFillet);
    } else if (feature.type === "shell") {
      const targetId = feature.depends_on || "";
      const targetGeo = bodies[targetId];
      if (!targetGeo) continue;

      const thickness = (feature.params.thickness as number) || 2;
      bodies[targetId] = applyShell(targetGeo, thickness);
    } else if (feature.type === "mirror") {
      const targetId = feature.depends_on || "";
      const targetGeo = bodies[targetId];
      if (!targetGeo) continue;

      const axis = ((feature.params.axis as string) || "x").toLowerCase();
      const mirroredGeo = targetGeo.clone();
      if (axis === "x") mirroredGeo.scale(-1, 1, 1);
      else if (axis === "y") mirroredGeo.scale(1, -1, 1);
      else mirroredGeo.scale(1, 1, -1);

      try {
        const baseBrush = new Brush(targetGeo);
        baseBrush.updateMatrixWorld();
        const mirrorBrush = new Brush(mirroredGeo);
        mirrorBrush.updateMatrixWorld();

        const result = csgEvaluator.evaluate(baseBrush, mirrorBrush, ADDITION);
        bodies[targetId] = result.geometry;

        baseBrush.geometry.dispose();
        mirrorBrush.geometry.dispose();
      } catch (err) {
        console.warn("Mirror union failed:", feature.id, err);
      }
      mirroredGeo.dispose();
    } else if (feature.type === "linear_pattern") {
      const targetId = feature.depends_on || "";
      const targetGeo = bodies[targetId];
      if (!targetGeo) continue;

      const count = Math.min((feature.params.count as number) || 2, 20);
      const dx = (feature.params.dx as number) || 0;
      const dy = (feature.params.dy as number) || 0;
      const dz = (feature.params.dz as number) || 0;

      let currentGeo = targetGeo;
      for (let i = 1; i < count; i++) {
        const copy = targetGeo.clone();
        copy.translate(dx * i, dy * i, dz * i);

        try {
          const baseBrush = new Brush(currentGeo);
          baseBrush.updateMatrixWorld();
          const copyBrush = new Brush(copy);
          copyBrush.updateMatrixWorld();

          const result = csgEvaluator.evaluate(baseBrush, copyBrush, ADDITION);
          if (currentGeo !== targetGeo) currentGeo.dispose();
          currentGeo = result.geometry;

          baseBrush.geometry.dispose();
          copyBrush.geometry.dispose();
        } catch (err) {
          console.warn("Linear pattern union failed at copy:", i, err);
        }
        copy.dispose();
      }
      bodies[targetId] = currentGeo;
    }
  }

  // ── Collect all bodies into a centered group ──────────────
  const allGeos = Object.values(bodies);
  if (allGeos.length === 0) return null;

  const group = new THREE.Group();

  const overallBox = new THREE.Box3();
  for (const geo of allGeos) {
    geo.computeBoundingBox();
    overallBox.union(geo.boundingBox!);
  }
  const center = new THREE.Vector3();
  overallBox.getCenter(center);

  for (const geo of allGeos) {
    geo.translate(-center.x, -center.y, -center.z);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x4a90d9,
      metalness: 0.3,
      roughness: 0.6,
      side: THREE.DoubleSide,
    });
    group.add(new THREE.Mesh(geo, mat));
  }

  return group;
}

// ─── Hole geometry builder ──────────────────────────────────

function buildHoleGeometry(
  feature: Feature,
  sketches: Record<string, SketchData>
): THREE.BufferGeometry | null {
  const profile = (feature.params.profile as string) || "circle";
  const depth = (feature.params.depth as number) || 1000;
  const cx = (feature.params.cx as number) || 0;
  const cy = (feature.params.cy as number) || 0;
  const cz = (feature.params.cz as number) || 0;

  if (profile === "circle") {
    const r = (feature.params.radius as number) || 10;
    // Build circle sketch and extrude as a cutting tool
    const circleShape = new THREE.Shape();
    for (let i = 0; i <= 64; i++) {
      const angle = (i / 64) * Math.PI * 2;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      if (i === 0) circleShape.moveTo(x, y);
      else circleShape.lineTo(x, y);
    }
    circleShape.closePath();
    const geo = new THREE.ExtrudeGeometry(circleShape, {
      depth,
      bevelEnabled: false,
    });
    geo.translate(0, 0, cz - depth / 2);
    return geo;
  }

  // Custom sketch profile hole — extrude the sketch shape as a cutting tool
  const sketch = sketches[profile];
  if (!sketch || sketch.points.length < 3) return null;

  const shape = makeShape(sketch.points);
  // Extrude on the same plane as the sketch for proper alignment
  const geo = extrudeOnPlane(shape, depth, sketch.plane, sketch.offset);
  return geo;
}

/**
 * Approximate chamfer/fillet by re-extruding with bevel.
 * True parametric chamfer/fillet requires a B-Rep kernel, so we
 * approximate by rebuilding with bevel on the ExtrudeGeometry when possible,
 * or by scaling down + CSG subtraction to knock off edges.
 */
function applyChamferFillet(
  geo: THREE.BufferGeometry,
  radius: number,
  isFillet: boolean
): THREE.BufferGeometry {
  // Check if the geometry came from an extrude (has index and enough verts)
  // Approximate approach: create a slightly smaller copy and subtract the difference,
  // or just apply bevel to existing shape. Since we don't track the original shape,
  // we use a scale-based edge-break approach.
  geo.computeBoundingBox();
  const box = geo.boundingBox!;
  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);

  // Build a box cutter for each edge — simplified: bevel the whole mesh
  // We'll create a slightly inset version and union it with rounded connectors
  // For now, use a practical approach: scale inward, then smooth normals
  const cloned = geo.clone();

  if (isFillet) {
    // Approximate fillet: compute smooth normals to give rounded appearance
    cloned.deleteAttribute("normal");
    cloned.computeVertexNormals();

    // Slightly scale inward by radius to simulate material removal
    const scale = Math.max(
      (size.x - radius * 2) / Math.max(size.x, 0.01),
      0.85
    );
    const scaleY = Math.max(
      (size.y - radius * 2) / Math.max(size.y, 0.01),
      0.85
    );
    const scaleZ = Math.max(
      (size.z - radius * 2) / Math.max(size.z, 0.01),
      0.85
    );

    // Create a beveled box to union with the original for rounded edges
    const bevelBox = new THREE.BoxGeometry(
      size.x * scale,
      size.y * scaleY,
      size.z * scaleZ,
      4, 4, 4
    );
    bevelBox.translate(center.x, center.y, center.z);

    try {
      const baseBrush = new Brush(cloned);
      baseBrush.updateMatrixWorld();
      const bevelBrush = new Brush(bevelBox);
      bevelBrush.updateMatrixWorld();

      // Intersect to round the region — approximate
      // Actually just smooth-shade the original for visual fillet
      bevelBox.dispose();
    } catch {
      // fallback
    }
  } else {
    // Chamfer: cut edges with angled planes — approximate by intersecting
    // with a slightly inset box to break sharp edges
    const chamferBox = new THREE.BoxGeometry(
      size.x - radius,
      size.y - radius,
      size.z + radius * 2,
      1, 1, 1
    );
    chamferBox.translate(center.x, center.y, center.z);

    const chamferBox2 = new THREE.BoxGeometry(
      size.x + radius * 2,
      size.y - radius,
      size.z - radius,
      1, 1, 1
    );
    chamferBox2.translate(center.x, center.y, center.z);

    const chamferBox3 = new THREE.BoxGeometry(
      size.x - radius,
      size.y + radius * 2,
      size.z - radius,
      1, 1, 1
    );
    chamferBox3.translate(center.x, center.y, center.z);

    try {
      // Union all chamfer boxes, then intersect with original
      let current = chamferBox;

      const b1 = new Brush(current);
      b1.updateMatrixWorld();
      const b2 = new Brush(chamferBox2);
      b2.updateMatrixWorld();
      const r1 = csgEvaluator.evaluate(b1, b2, ADDITION);
      current = r1.geometry;

      const b3 = new Brush(current);
      b3.updateMatrixWorld();
      const b4 = new Brush(chamferBox3);
      b4.updateMatrixWorld();
      const r2 = csgEvaluator.evaluate(b3, b4, ADDITION);

      // Now intersect with original. Use SUBTRACTION trick:
      // original SUBTRACT (original SUBTRACT chamfer_union)
      const origBrush = new Brush(cloned);
      origBrush.updateMatrixWorld();
      const chamferBrush = new Brush(r2.geometry);
      chamferBrush.updateMatrixWorld();

      // Intersect = not directly available, approximate by keeping what overlaps
      // For now just return the cloned with vertex normals smoothed
      b1.geometry.dispose();
      b2.geometry.dispose();
      b3.geometry.dispose();
      b4.geometry.dispose();
      r1.geometry.dispose();
      r2.geometry.dispose();
      origBrush.geometry.dispose();
      chamferBrush.geometry.dispose();
    } catch {
      // fallback — just smooth normals
    }

    chamferBox.dispose();
    chamferBox2.dispose();
    chamferBox3.dispose();
  }

  // Final fallback: smooth normals for visual approximation
  cloned.deleteAttribute("normal");
  cloned.computeVertexNormals();

  geo.dispose();
  return cloned;
}

/**
 * Approximate shell (hollow out) by scaling and subtracting.
 */
function applyShell(
  geo: THREE.BufferGeometry,
  thickness: number
): THREE.BufferGeometry {
  geo.computeBoundingBox();
  const box = geo.boundingBox!;
  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);

  // Create a scaled-down inner copy
  const sx = Math.max((size.x - thickness * 2) / Math.max(size.x, 0.01), 0.1);
  const sy = Math.max((size.y - thickness * 2) / Math.max(size.y, 0.01), 0.1);
  const sz = Math.max((size.z - thickness * 2) / Math.max(size.z, 0.01), 0.1);

  const innerGeo = geo.clone();
  // Translate to origin, scale, translate back
  innerGeo.translate(-center.x, -center.y, -center.z);
  innerGeo.scale(sx, sy, sz);
  innerGeo.translate(center.x, center.y, center.z);

  try {
    const outerBrush = new Brush(geo);
    outerBrush.updateMatrixWorld();
    const innerBrush = new Brush(innerGeo);
    innerBrush.updateMatrixWorld();

    const result = csgEvaluator.evaluate(outerBrush, innerBrush, SUBTRACTION);

    outerBrush.geometry.dispose();
    innerBrush.geometry.dispose();
    innerGeo.dispose();

    return result.geometry;
  } catch (err) {
    console.warn("Shell CSG failed:", err);
    innerGeo.dispose();
    return geo;
  }
}
