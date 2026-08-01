import L from 'leaflet';
import markerIconUrl from 'leaflet/dist/images/marker-icon.png';
import markerIcon2xUrl from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadowUrl from 'leaflet/dist/images/marker-shadow.png';

/**
 * Leaflet's default marker icon references image paths relative to its own
 * CSS file, which doesn't resolve correctly once bundled by Vite -- without
 * this, markers render as broken image icons. Re-pointing the default icon
 * at Vite-resolved asset URLs is the standard fix; importing this module
 * (for its side effect) once is enough for every `<Marker>` in the app.
 */
L.Icon.Default.mergeOptions({
  iconUrl: markerIconUrl,
  iconRetinaUrl: markerIcon2xUrl,
  shadowUrl: markerShadowUrl,
});
