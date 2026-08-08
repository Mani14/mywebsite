import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { getFullName } from '../utils/familyUtils';
import { useTheme } from '../hooks/useTheme';
import { dotIcon, TILE_ATTRIBUTION, TILE_URLS } from '../utils/mapTiles';
import Modal from './Modal';
import '../styles/FamilyMap.css';

const DEFAULT_CENTER = [20.5937, 78.9629]; // India — shown only when nobody has a pinned location yet
const DEFAULT_ZOOM = 4;

const GENDER_COLOR_VAR = {
  male: 'var(--color-male)',
  female: 'var(--color-female)',
  other: 'var(--color-other)',
};

// Fits the map to every pin's bounds once, the first time there are any — a
// ref (not state) so this doesn't re-fit and yank the view on every render,
// only ever right after the panel opens with data to show.
function FitBounds({ points }) {
  const map = useMap();
  const didFit = useRef(false);

  useEffect(() => {
    if (didFit.current || points.length === 0) return;
    didFit.current = true;
    if (points.length === 1) map.setView(points[0], 12);
    else map.fitBounds(points, { padding: [30, 30] });
  }, [map, points]);

  return null;
}

export default function FamilyMap({ persons, isOpen, onClose, onSelect }) {
  const theme = useTheme();
  const peopleWithCoords = useMemo(
    () => Object.values(persons).filter((p) => p.locationLat != null && p.locationLng != null),
    [persons]
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Family Map" width="720px" className="family-map-panel">
      <h2>Family Map</h2>
      {peopleWithCoords.length === 0 ? (
        <p className="family-map-empty">
          Nobody has a pinned location yet — add one from a person's profile (Edit → Location) to see them here.
        </p>
      ) : (
        <div className="family-map-canvas">
          <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} style={{ height: '480px', width: '100%' }}>
            <TileLayer url={TILE_URLS[theme] || TILE_URLS.light} attribution={TILE_ATTRIBUTION} />
            <FitBounds points={peopleWithCoords.map((p) => [p.locationLat, p.locationLng])} />
            {peopleWithCoords.map((p) => (
              <Marker
                key={p.id}
                position={[p.locationLat, p.locationLng]}
                icon={dotIcon(GENDER_COLOR_VAR[p.gender] || GENDER_COLOR_VAR.other)}
              >
                <Popup>
                  <span className="family-map-popup-name">{getFullName(p)}</span>
                  <br />
                  <span className="family-map-popup-location">{p.location}</span>
                  <br />
                  <button
                    type="button"
                    className="family-map-popup-view"
                    onClick={() => {
                      onSelect(p.id);
                      onClose();
                    }}
                  >
                    View Details
                  </button>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      )}
    </Modal>
  );
}
