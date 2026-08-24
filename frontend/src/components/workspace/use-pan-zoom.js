"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const MIN_SCALE = 0.5;
const MAX_SCALE = 8;
// Movement beyond this many pixels counts as a drag, not a click. Without it,
// panning would also select whatever node the drag started on.
const DRAG_THRESHOLD_PX = 4;

// Tuned for a trackpad pinch, which fires many events per second with small
// deltas. MAX_STEP caps any single event so one coarse mouse-wheel notch
// cannot jump several hundred percent.
const WHEEL_SENSITIVITY = 0.002;
const MAX_STEP = 1.25;

function parseViewBox(viewBox) {
  const [x, y, width, height] = (viewBox ?? "0 0 100 100").split(" ").map(Number);
  return { x, y, width, height };
}

const distanceBetween = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
const midpointOf = (a, b) => ({
  clientX: (a.clientX + b.clientX) / 2,
  clientY: (a.clientY + b.clientY) / 2,
});

/**
 * Pan and zoom for an SVG, driven by the viewBox.
 *
 * Moving the viewBox rather than applying a transform means zooming anchors on
 * a real point in the drawing, so the thing under the cursor stays under the
 * cursor. A CSS transform would scale about the element's centre instead, which
 * feels wrong the moment you zoom into a corner.
 */
export function usePanZoom(baseViewBox) {
  const svgRef = useRef(null);
  const base = useMemo(() => parseViewBox(baseViewBox), [baseViewBox]);
  const [view, setView] = useState(base);

  // A new graph replaces the layout entirely; keeping the old pan would leave
  // the user looking at empty space.
  useEffect(() => setView(base), [base]);

  const gesture = useRef({ panning: false, moved: false, origin: null, pinchDistance: 0 });
  const [panning, setPanning] = useState(false);

  const scale = base.width / view.width;

  /** Client coordinates → SVG user space, exactly, whatever the CSS sizing. */
  const toUserSpace = useCallback((clientX, clientY) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const matrix = svg.getScreenCTM();
    if (!matrix) return null;
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    return point.matrixTransform(matrix.inverse());
  }, []);

  const zoomBy = useCallback(
    (factor, clientX, clientY) => {
      setView((current) => {
        const nextScale = Math.min(
          Math.max((base.width / current.width) * factor, MIN_SCALE),
          MAX_SCALE,
        );
        const width = base.width / nextScale;
        const height = base.height / nextScale;

        const anchor = toUserSpace(clientX, clientY);
        if (!anchor) {
          // No anchor available: zoom about the centre.
          return {
            x: current.x + (current.width - width) / 2,
            y: current.y + (current.height - height) / 2,
            width,
            height,
          };
        }

        // Keep the anchor at the same fractional position in the viewport.
        const ratioX = (anchor.x - current.x) / current.width;
        const ratioY = (anchor.y - current.y) / current.height;
        return {
          x: anchor.x - ratioX * width,
          y: anchor.y - ratioY * height,
          width,
          height,
        };
      });
    },
    [base, toUserSpace],
  );

  const reset = useCallback(() => setView(base), [base]);

  const zoomIn = useCallback(() => zoomBy(1.3), [zoomBy]);
  const zoomOut = useCallback(() => zoomBy(1 / 1.3), [zoomBy]);

  /* ── Wheel and trackpad pinch ──────────────────────────────────────────── */

  // Registered manually because React's synthetic wheel listener is passive,
  // and a passive listener cannot preventDefault the browser's page zoom.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;

    const onWheel = (event) => {
      // A trackpad pinch arrives as a wheel event with ctrlKey set. A plain
      // wheel is left alone so the surrounding panel still scrolls normally.
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();

      // A pinch emits a rapid stream of small deltas, so the per-event factor
      // has to stay near 1 or the zoom runs away. The clamp guards against the
      // single large delta that a mouse wheel or a synthetic event produces.
      const factor = Math.exp(-event.deltaY * WHEEL_SENSITIVITY);
      zoomBy(Math.min(Math.max(factor, 1 / MAX_STEP), MAX_STEP), event.clientX, event.clientY);
    };

    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  /* ── Drag to pan ───────────────────────────────────────────────────────── */

  const onPointerDown = useCallback(
    (event) => {
      if (event.pointerType === "touch" && event.isPrimary === false) return;
      const origin = toUserSpace(event.clientX, event.clientY);
      if (!origin) return;

      // Deliberately no setPointerCapture here. Capturing on the SVG retargets
      // the resulting `click` to the SVG itself, so a node's own click handler
      // never runs and selecting a module silently stops working. Capture is
      // taken in onPointerMove instead, once this is definitely a drag.
      gesture.current = {
        ...gesture.current,
        panning: true,
        moved: false,
        captured: false,
        origin,
      };
      setPanning(true);
    },
    [toUserSpace],
  );

  const onPointerMove = useCallback(
    (event) => {
      if (!gesture.current.panning) return;
      const point = toUserSpace(event.clientX, event.clientY);
      if (!point || !gesture.current.origin) return;

      const dx = point.x - gesture.current.origin.x;
      const dy = point.y - gesture.current.origin.y;

      const pixelsPerUnit = (svgRef.current?.clientWidth ?? 1) / view.width;
      if (Math.hypot(dx, dy) * pixelsPerUnit > DRAG_THRESHOLD_PX) {
        gesture.current.moved = true;
        // Now that it is a drag, capture so it keeps working past the edge.
        if (!gesture.current.captured) {
          event.currentTarget.setPointerCapture?.(event.pointerId);
          gesture.current.captured = true;
        }
      }

      setView((current) => ({ ...current, x: current.x - dx, y: current.y - dy }));
    },
    [toUserSpace, view.width],
  );

  const endPan = useCallback((event) => {
    if (!gesture.current.panning) return;
    gesture.current.panning = false;
    setPanning(false);
    if (gesture.current.captured) {
      event?.currentTarget?.releasePointerCapture?.(event.pointerId);
      gesture.current.captured = false;
    }
  }, []);

  /* ── Two-finger pinch on touch ─────────────────────────────────────────── */

  const onTouchStart = useCallback((event) => {
    if (event.touches.length !== 2) return;
    gesture.current.pinchDistance = distanceBetween(event.touches[0], event.touches[1]);
    gesture.current.panning = false;
    setPanning(false);
  }, []);

  const onTouchMove = useCallback(
    (event) => {
      if (event.touches.length !== 2 || !gesture.current.pinchDistance) return;
      event.preventDefault();

      const distance = distanceBetween(event.touches[0], event.touches[1]);
      const midpoint = midpointOf(event.touches[0], event.touches[1]);
      zoomBy(distance / gesture.current.pinchDistance, midpoint.clientX, midpoint.clientY);
      gesture.current.pinchDistance = distance;
    },
    [zoomBy],
  );

  const onTouchEnd = useCallback((event) => {
    if (event.touches.length < 2) gesture.current.pinchDistance = 0;
  }, []);

  /** True when the last pointer sequence was a drag, so a click can be ignored. */
  const consumedDrag = useCallback(() => {
    const { moved } = gesture.current;
    gesture.current.moved = false;
    return moved;
  }, []);

  return {
    svgRef,
    viewBox: `${view.x} ${view.y} ${view.width} ${view.height}`,
    scale,
    panning,
    canZoomIn: scale < MAX_SCALE - 0.001,
    canZoomOut: scale > MIN_SCALE + 0.001,
    isDefault: Math.abs(scale - 1) < 0.001 && view.x === base.x && view.y === base.y,
    zoomIn,
    zoomOut,
    reset,
    consumedDrag,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endPan,
      onPointerCancel: endPan,
      onPointerLeave: endPan,
      onTouchStart,
      onTouchMove,
      onTouchEnd,
    },
  };
}
