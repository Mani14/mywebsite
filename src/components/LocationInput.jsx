import { AnimatePresence, motion } from 'framer-motion';
import { LocateFixed, MapPin } from 'lucide-react';
import { useRef, useState } from 'react';
import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useTheme } from '../hooks/useTheme';
import { dotIcon, reverseGeocode, searchPlaces, TILE_ATTRIBUTION, TILE_URLS } from '../utils/mapTiles';
import '../styles/LocationInput.css';

const SEARCH_DEBOUNCE_MS = 600;
const MIN_QUERY_LENGTH = 3;
const DEFAULT_CENTER = [20.5937, 78.9629]; // India — a reasonable default given this app's userbase
const DEFAULT_ZOOM = 5;

// Reports every click's lat/lng up to the parent — has no visual output of its
// own, it just taps into the surrounding MapContainer's events.
function ClickCapture({ onPick }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

// One location per person, settable three ways: type-to-search (Nominatim),
// "Use My Current Location" (browser Geolocation + reverse geocode), or
// "Point to Map" (click a spot on an embedded mini map). All three converge on
// the same onChange({ location, locationLat, locationLng }) shape.
export default function LocationInput({ value, lat, lng, onChange }) {
  const [query, setQuery] = useState(value || '');
  const [results, setResults] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showMap, setShowMap] = useState(false);
  const debounceRef = useRef(null);
  const theme = useTheme();

  const runSearch = (text) => {
    clearTimeout(debounceRef.current);
    if (text.trim().length < MIN_QUERY_LENGTH) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        setResults(await searchPlaces(text.trim()));
      } catch {
        setError('Could not search locations — check your connection.');
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);
  };

  const handleTextChange = (text) => {
    setQuery(text);
    setIsOpen(true);
    // Editing the text after a coordinate was set means it may no longer
    // describe that point — drop the stale coordinates rather than leave a
    // pin at a place the text doesn't match anymore.
    onChange({ location: text, locationLat: null, locationLng: null });
    runSearch(text);
  };

  const selectResult = (result) => {
    setQuery(result.display_name);
    setResults([]);
    setIsOpen(false);
    onChange({ location: result.display_name, locationLat: parseFloat(result.lat), locationLng: parseFloat(result.lon) });
  };

  const applyPoint = async (pickedLat, pickedLng) => {
    setLoading(true);
    setError('');
    try {
      const text = await reverseGeocode(pickedLat, pickedLng);
      setQuery(text);
      onChange({ location: text, locationLat: pickedLat, locationLng: pickedLng });
    } catch {
      setError('Got the coordinates, but could not look up an address for them.');
      onChange({ location: query, locationLat: pickedLat, locationLng: pickedLng });
    } finally {
      setLoading(false);
    }
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by this browser.');
      return;
    }
    setLoading(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => applyPoint(pos.coords.latitude, pos.coords.longitude),
      (err) => {
        setLoading(false);
        setError(
          err.code === err.PERMISSION_DENIED
            ? 'Location access was denied — allow it in your browser settings to use this.'
            : 'Could not determine your current location.'
        );
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const pickOnMap = (pickedLat, pickedLng) => {
    setShowMap(false);
    applyPoint(pickedLat, pickedLng);
  };

  const hasCoords = lat != null && lng != null;

  return (
    <div className="location-input">
      <div className="location-input-search">
        <input
          type="text"
          value={query}
          onChange={(e) => handleTextChange(e.target.value)}
          onFocus={() => setIsOpen(true)}
          onBlur={() => setTimeout(() => setIsOpen(false), 150)}
          placeholder="Search a place…"
        />
        <AnimatePresence>
          {isOpen && results.length > 0 && (
            <motion.ul
              className="location-input-results glass-surface"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
            >
              {results.map((r) => (
                <li key={r.place_id}>
                  {/* onMouseDown (not onClick) fires before the input's blur closes
                      the dropdown, same trick SearchBar.jsx uses. */}
                  <button type="button" onMouseDown={(e) => { e.preventDefault(); selectResult(r); }}>
                    {r.display_name}
                  </button>
                </li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>
      </div>

      <div className="location-input-actions">
        <button type="button" onClick={useCurrentLocation} disabled={loading}>
          <LocateFixed size={13} /> Use My Current Location
        </button>
        <button type="button" onClick={() => setShowMap((v) => !v)}>
          <MapPin size={13} /> {showMap ? 'Close Map' : 'Point to Map'}
        </button>
      </div>

      {error && <p className="location-input-error">{error}</p>}
      {hasCoords && !error && <p className="location-input-hint">Pinned at {lat.toFixed(4)}, {lng.toFixed(4)}</p>}

      {showMap && (
        <div className="location-input-map">
          <MapContainer
            center={hasCoords ? [lat, lng] : DEFAULT_CENTER}
            zoom={hasCoords ? 12 : DEFAULT_ZOOM}
            style={{ height: '180px', width: '100%' }}
          >
            <TileLayer url={TILE_URLS[theme] || TILE_URLS.light} attribution={TILE_ATTRIBUTION} />
            {hasCoords && <Marker position={[lat, lng]} icon={dotIcon('var(--color-focus)')} />}
            <ClickCapture onPick={pickOnMap} />
          </MapContainer>
          <p className="location-input-map-hint">Click anywhere on the map to set the location.</p>
        </div>
      )}
    </div>
  );
}
