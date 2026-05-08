import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { useModelStore } from "../store/modelStore";
import { generateGeometry, initOC } from "../cad/engine";

// Extract edge segments from a mesh as pairs of Vector3
function extractEdgeSegments(mesh: THREE.Mesh): [THREE.Vector3, THREE.Vector3][] {
  const edges = new THREE.EdgesGeometry(mesh.geometry, 30);
  const pos = edges.getAttribute("position");
  const segments: [THREE.Vector3, THREE.Vector3][] = [];
  for (let i = 0; i < pos.count; i += 2) {
    const a = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
    const b = new THREE.Vector3().fromBufferAttribute(pos, i + 1).applyMatrix4(mesh.matrixWorld);
    segments.push([a, b]);
  }
  edges.dispose();
  return segments;
}

// Find closest point on a line segment to a given point
function closestPointOnSegment(
  p: THREE.Vector3,
  a: THREE.Vector3,
  b: THREE.Vector3
): THREE.Vector3 {
  const ab = new THREE.Vector3().subVectors(b, a);
  const len2 = ab.lengthSq();
  if (len2 < 1e-10) return a.clone();
  const t = Math.max(0, Math.min(1, new THREE.Vector3().subVectors(p, a).dot(ab) / len2));
  return new THREE.Vector3().addVectors(a, ab.multiplyScalar(t));
}

export default function Canvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const modelGroupRef = useRef<THREE.Group | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const frameIdRef = useRef<number>(0);

  // Edge data
  const edgeLinesRef = useRef<THREE.LineSegments | null>(null);
  const edgeSegmentsRef = useRef<[THREE.Vector3, THREE.Vector3][]>([]);
  const highlightLineRef = useRef<THREE.Line | null>(null);

  // Measurement refs
  const measureGroupRef = useRef<THREE.Group>(new THREE.Group());
  const measurePointsRef = useRef<THREE.Vector3[]>([]);

  const model = useModelStore((s) => s.model);
  const measureMode = useModelStore((s) => s.measureMode);
  const setMeasureResult = useModelStore((s) => s.setMeasureResult);
  const [ocReady, setOcReady] = useState(false);
  const [loading, setLoading] = useState(true);

  // Initialize Three.js scene
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      50,
      container.clientWidth / container.clientHeight,
      0.1,
      10000
    );
    camera.position.set(150, 100, 150);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controlsRef.current = controls;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(200, 300, 200);
    scene.add(dirLight);

    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
    dirLight2.position.set(-100, -100, -100);
    scene.add(dirLight2);

    // Grid helper
    const grid = new THREE.GridHelper(400, 40, 0x444444, 0x333333);
    grid.rotation.x = 0; // XZ plane
    scene.add(grid);

    // Measurement overlay group
    scene.add(measureGroupRef.current);

    // Animation loop
    function animate() {
      frameIdRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    // Resize handler
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(frameIdRef.current);
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  // Initialize OpenCascade (non-blocking — fallback works immediately)
  useEffect(() => {
    initOC().then((success) => {
      setOcReady(true);
      setLoading(false);
      if (!success) console.log("Using Three.js fallback geometry");
    });
  }, []);

  // Regenerate geometry when model changes
  useEffect(() => {
    if (!sceneRef.current) return;

    let cancelled = false;

    async function rebuild() {
      const group = await generateGeometry(model);
      if (cancelled) return;

      const scene = sceneRef.current!;

      // Remove old model group and edge lines
      if (modelGroupRef.current) {
        modelGroupRef.current.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            (child.material as THREE.Material).dispose();
          }
        });
        scene.remove(modelGroupRef.current);
        modelGroupRef.current = null;
      }
      if (edgeLinesRef.current) {
        edgeLinesRef.current.geometry.dispose();
        (edgeLinesRef.current.material as THREE.Material).dispose();
        scene.remove(edgeLinesRef.current);
        edgeLinesRef.current = null;
      }
      edgeSegmentsRef.current = [];

      if (group) {
        scene.add(group);
        modelGroupRef.current = group;

        // Extract and render edges
        const allSegments: [THREE.Vector3, THREE.Vector3][] = [];
        const edgePoints: THREE.Vector3[] = [];
        group.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            const segs = extractEdgeSegments(child);
            allSegments.push(...segs);
            for (const [a, b] of segs) {
              edgePoints.push(a, b);
            }
          }
        });
        edgeSegmentsRef.current = allSegments;

        if (edgePoints.length > 0) {
          const edgeGeo = new THREE.BufferGeometry().setFromPoints(edgePoints);
          const edgeMat = new THREE.LineBasicMaterial({
            color: 0x888888,
            transparent: true,
            opacity: 0.4,
          });
          const edgeLines = new THREE.LineSegments(edgeGeo, edgeMat);
          scene.add(edgeLines);
          edgeLinesRef.current = edgeLines;
        }
      }
    }

    rebuild();

    return () => {
      cancelled = true;
    };
  }, [model, ocReady]);

  // Clear measurement visuals
  const clearMeasure = useCallback(() => {
    const group = measureGroupRef.current;
    while (group.children.length) {
      const child = group.children[0];
      if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
      group.remove(child);
    }
    measurePointsRef.current = [];
    setMeasureResult(null);
  }, [setMeasureResult]);

  // Remove highlight line helper
  const removeHighlight = useCallback(() => {
    if (highlightLineRef.current) {
      const scene = sceneRef.current;
      if (scene) {
        highlightLineRef.current.geometry.dispose();
        (highlightLineRef.current.material as THREE.Material).dispose();
        scene.remove(highlightLineRef.current);
      }
      highlightLineRef.current = null;
    }
  }, []);

  // Clear measurement when mode is turned off
  useEffect(() => {
    if (!measureMode) {
      clearMeasure();
      removeHighlight();
    }
  }, [measureMode, clearMeasure, removeHighlight]);

  // Find nearest edge to a screen point, returns segment index and snap point
  const findNearestEdge = useCallback(
    (mouse: THREE.Vector2): { idx: number; snapPoint: THREE.Vector3; dist: number } | null => {
      const camera = cameraRef.current;
      const renderer = rendererRef.current;
      if (!camera || !renderer) return null;

      const segments = edgeSegmentsRef.current;
      if (segments.length === 0) return null;

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, camera);

      // Project each edge midpoint/closest point to screen and find nearest
      let bestIdx = -1;
      let bestDist = Infinity;
      let bestSnap = new THREE.Vector3();

      // Get a point on the model surface first to know the depth
      const meshes: THREE.Mesh[] = [];
      modelGroupRef.current?.traverse((child) => {
        if (child instanceof THREE.Mesh) meshes.push(child);
      });
      const intersects = raycaster.intersectObjects(meshes, false);
      const surfacePoint = intersects.length > 0 ? intersects[0].point : null;

      for (let i = 0; i < segments.length; i++) {
        const [a, b] = segments[i];

        // Find closest point on this edge segment to the ray
        let snapPoint: THREE.Vector3;
        if (surfacePoint) {
          snapPoint = closestPointOnSegment(surfacePoint, a, b);
        } else {
          // No surface hit — use ray closest approach
          const rayDir = raycaster.ray.direction.clone();
          const rayOrigin = raycaster.ray.origin.clone();
          const segDir = new THREE.Vector3().subVectors(b, a);
          const segLen = segDir.length();
          if (segLen < 1e-10) continue;
          segDir.normalize();

          const w0 = new THREE.Vector3().subVectors(rayOrigin, a);
          const dd = rayDir.dot(segDir);
          const d1 = rayDir.dot(w0);
          const d2 = segDir.dot(w0);
          const denom = 1 - dd * dd;
          if (Math.abs(denom) < 1e-10) continue;
          const t2 = (d1 * dd - d2) / denom;
          const tc = Math.max(0, Math.min(segLen, t2));
          snapPoint = new THREE.Vector3().addVectors(a, segDir.multiplyScalar(tc));
        }

        // Project snap point to screen and measure pixel distance
        const projected = snapPoint.clone().project(camera);
        const screenDist = Math.sqrt(
          (projected.x - mouse.x) ** 2 + (projected.y - mouse.y) ** 2
        );

        if (screenDist < bestDist) {
          bestDist = screenDist;
          bestIdx = i;
          bestSnap = snapPoint;
        }
      }

      // Threshold in NDC space (~30px at typical resolution)
      if (bestIdx >= 0 && bestDist < 0.08) {
        return { idx: bestIdx, snapPoint: bestSnap, dist: bestDist };
      }
      return null;
    },
    []
  );

  // Hover handler — highlight nearest edge
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !measureMode) return;

    const handleMouseMove = (e: MouseEvent) => {
      const renderer = rendererRef.current;
      if (!renderer) return;

      const rect = renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );

      removeHighlight();

      const nearest = findNearestEdge(mouse);
      if (nearest) {
        const [a, b] = edgeSegmentsRef.current[nearest.idx];
        const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
        const mat = new THREE.LineBasicMaterial({
          color: 0xff4444,
          depthTest: false,
          linewidth: 3,
        });
        const line = new THREE.Line(geo, mat);
        line.renderOrder = 998;
        sceneRef.current?.add(line);
        highlightLineRef.current = line;
      }
    };

    container.addEventListener("mousemove", handleMouseMove);
    return () => {
      container.removeEventListener("mousemove", handleMouseMove);
      removeHighlight();
    };
  }, [measureMode, findNearestEdge, removeHighlight]);

  // Click handler — snap to edge
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !measureMode) return;

    const handleClick = (e: MouseEvent) => {
      const renderer = rendererRef.current;
      if (!renderer) return;

      const rect = renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );

      // Try edge snap first, fallback to surface point
      let point: THREE.Vector3 | null = null;
      const nearest = findNearestEdge(mouse);
      if (nearest) {
        point = nearest.snapPoint;
      } else {
        // Fallback: raycast to surface
        const camera = cameraRef.current;
        const modelGroup = modelGroupRef.current;
        if (!camera || !modelGroup) return;

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, camera);
        const meshes: THREE.Mesh[] = [];
        modelGroup.traverse((child) => {
          if (child instanceof THREE.Mesh) meshes.push(child);
        });
        const intersects = raycaster.intersectObjects(meshes, false);
        if (intersects.length > 0) point = intersects[0].point.clone();
      }

      if (!point) return;

      const pts = measurePointsRef.current;
      const group = measureGroupRef.current;

      // Add marker sphere at snap point
      const markerGeo = new THREE.SphereGeometry(1.5, 16, 12);
      const markerMat = new THREE.MeshBasicMaterial({ color: 0xff4444, depthTest: false });
      const marker = new THREE.Mesh(markerGeo, markerMat);
      marker.renderOrder = 999;
      marker.position.copy(point);
      group.add(marker);

      pts.push(point);

      if (pts.length === 2) {
        // Draw measurement line
        const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
        const lineMat = new THREE.LineBasicMaterial({
          color: 0xff4444,
          depthTest: false,
          linewidth: 2,
        });
        const line = new THREE.Line(lineGeo, lineMat);
        line.renderOrder = 999;
        group.add(line);

        const distance = pts[0].distanceTo(pts[1]);
        setMeasureResult({
          distance,
          p1: [pts[0].x, pts[0].y, pts[0].z],
          p2: [pts[1].x, pts[1].y, pts[1].z],
        });

        measurePointsRef.current = [];
      }
    };

    container.addEventListener("click", handleClick);
    return () => container.removeEventListener("click", handleClick);
  }, [measureMode, findNearestEdge, setMeasureResult]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "100%",
          cursor: measureMode ? "crosshair" : "default",
        }}
      />
      {loading && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            color: "#fff",
            fontSize: "1.2rem",
            fontFamily: "monospace",
          }}
        >
          Loading OpenCascade...
        </div>
      )}
    </div>
  );
}
