import { ref } from 'vue';

const MAX_ZOOM = 4;

/**
 * Two-finger zoom for one element. frappe-ui's MobileShell sets
 * `touch-action: none`, which turns off the browser's own pinch zoom
 * (frappe/frappe-ui#1223).
 */
export function usePinchZoom() {
  const zoom = ref(1);
  let pinchStart: { distance: number; zoom: number } | null = null;

  function onTouchStart(event: TouchEvent) {
    if (event.touches.length === 2) {
      pinchStart = { distance: getDistance(event.touches), zoom: zoom.value };
    }
  }

  function onTouchMove(event: TouchEvent) {
    if (!pinchStart || event.touches.length !== 2) {
      return;
    }

    event.preventDefault();
    const ratio = getDistance(event.touches) / pinchStart.distance;
    zoom.value = Math.min(Math.max(pinchStart.zoom * ratio, 1), MAX_ZOOM);
  }

  function onTouchEnd(event: TouchEvent) {
    if (event.touches.length < 2) {
      pinchStart = null;
    }
  }

  return { zoom, onTouchStart, onTouchMove, onTouchEnd };
}

function getDistance(touches: TouchList): number {
  const [first, second] = [touches[0], touches[1]];
  return Math.hypot(
    first.clientX - second.clientX,
    first.clientY - second.clientY
  );
}
