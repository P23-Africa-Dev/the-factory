/**
 * A DOM-element marker for the classic Google Maps JS API, built on
 * `google.maps.OverlayView`. Unlike `google.maps.Marker` icons (images/SVG data
 * URLs that cannot load external avatar photos), this hosts arbitrary DOM, so
 * Google shows the same avatar marker as Mapbox.
 */

type LatLngLiteral = { lat: number; lng: number };

type OverlayProjection = {
  fromLatLngToDivPixel: (latLng: unknown) => { x: number; y: number } | null;
};

type OverlayViewBase = {
  setMap: (map: unknown) => void;
  getPanes: () => { overlayMouseTarget: HTMLElement } | null;
  getProjection: () => OverlayProjection | null;
};

type GoogleMapsLike = {
  OverlayView: new () => OverlayViewBase;
  LatLng: new (lat: number, lng: number) => unknown;
};

export type GoogleHtmlMarker = {
  setPosition: (position: LatLngLiteral) => void;
  setMap: (map: unknown | null) => void;
  setZIndex: (z: number) => void;
  element: HTMLElement;
};

export function createGoogleHtmlMarker(
  maps: GoogleMapsLike,
  options: { map: unknown; position: LatLngLiteral; element: HTMLElement; zIndex?: number },
): GoogleHtmlMarker {
  const Base = maps.OverlayView as unknown as new () => OverlayViewBase;
  let position = options.position;
  const wrapper = document.createElement("div");
  wrapper.style.position = "absolute";
  wrapper.style.transform = "translate(-50%, -50%)";
  wrapper.style.zIndex = String(options.zIndex ?? 20);
  wrapper.appendChild(options.element);

  class HtmlMarker extends Base {
    onAdd() {
      this.getPanes()?.overlayMouseTarget.appendChild(wrapper);
    }

    draw() {
      const projection = this.getProjection();
      if (!projection) return;
      const point = projection.fromLatLngToDivPixel(new maps.LatLng(position.lat, position.lng));
      if (!point) return;
      wrapper.style.left = `${point.x}px`;
      wrapper.style.top = `${point.y}px`;
    }

    onRemove() {
      wrapper.remove();
    }
  }

  const overlay = new HtmlMarker() as OverlayViewBase & { draw: () => void };
  overlay.setMap(options.map);

  return {
    element: wrapper,
    setPosition(next) {
      position = next;
      overlay.draw();
    },
    setMap(map) {
      overlay.setMap(map);
    },
    setZIndex(z) {
      wrapper.style.zIndex = String(z);
    },
  };
}
