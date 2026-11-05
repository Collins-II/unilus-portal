"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { campuses, campusFor, insideCampus, type CampusId } from "@/lib/campus/geography";

export type MapPoint = { latitude: number; longitude: number };
type Props = {
  value: MapPoint | null;
  locations: MapPoint[];
  disabled?: boolean;
  campusId: CampusId;
  onChange: (point: MapPoint) => void;
};

export default function LocationPicker({ value, locations, campusId, disabled = false, onChange }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const change = useRef(onChange);
  const locked = useRef(disabled);
  const selectedCampus = campuses.find((campus) => campus.id === campusId)!;
  const activeCampus = useRef(selectedCampus);
  const [selectionError, setSelectionError] = useState("");
  const [tileError, setTileError] = useState(false);
  const locationRequest = useRef(0);
  const [pendingLocation, setPendingLocation] = useState<{ campus: CampusId; request: number } | null>(null);
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  const locating = pendingLocation?.campus === campusId && !disabled;
  useEffect(() => {
    const request = locationRequest;
    return () => { request.current++; };
  }, [campusId, disabled]);
  useEffect(() => { change.current = onChange; locked.current = disabled; }, [onChange, disabled]);
  const select = useRef((point: MapPoint) => {
    if (!insideCampus(point, activeCampus.current)) { setSelectionError("Select a point inside the selected campus navigation scope."); return false; }
    setSelectionError(""); setLocationAccuracy(null); change.current(point); return true;
  });
  function useCurrentLocation() {
    setSelectionError(""); setLocationAccuracy(null);
    if (!window.isSecureContext) {
      setSelectionError("Current location requires HTTPS or localhost. Enter verified coordinates manually.");
      return;
    }
    if (!navigator.geolocation) {
      setSelectionError("This browser does not support current location. Enter verified coordinates manually.");
      return;
    }
    const request = ++locationRequest.current;
    const campus = selectedCampus;
    setPendingLocation({ campus: campus.id, request });
    navigator.geolocation.getCurrentPosition((position) => {
      if (!map.current) return;
      setPendingLocation((pending) => pending?.request === request ? null : pending);
      if (request !== locationRequest.current || locked.current) return;
      const point = { latitude: Number(position.coords.latitude.toFixed(6)), longitude: Number(position.coords.longitude.toFixed(6)) };
      if (!insideCampus(point, campus)) {
        setSelectionError(`Your current location is outside the ${campus.name} navigation scope. Switch to the correct campus or enter independently verified room coordinates inside its supported map area.`);
        return;
      }
      if (select.current(point)) {
        setLocationAccuracy(Math.round(position.coords.accuracy));
        map.current.setView([point.latitude, point.longitude], 18);
      }
    }, (error) => {
      if (!map.current) return;
      setPendingLocation((pending) => pending?.request === request ? null : pending);
      if (request !== locationRequest.current || locked.current) return;
      setSelectionError(error.code === 1 ? "Location permission was denied. Allow location access in your browser settings or enter verified coordinates manually."
        : error.code === 3 ? "Finding your location timed out. Try again or enter verified coordinates manually."
          : "Your current location is unavailable. Check device location settings, try again or enter verified coordinates manually.");
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  }
  useEffect(() => {
    if (!container.current) return;
    const next = L.map(container.current, { scrollWheelZoom: false, maxBoundsViscosity: 1, minZoom: 15 });
    map.current = next;
    const tiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    }).addTo(next);
    tiles.on("tileerror", () => setTileError(true));
    next.on("click", (event: L.LeafletMouseEvent) => {
      if (!locked.current) select.current({ latitude: Number(event.latlng.lat.toFixed(6)), longitude: Number(event.latlng.lng.toFixed(6)) });
    });
    const resize = new ResizeObserver(() => next.invalidateSize());
    resize.observe(container.current);
    return () => { resize.disconnect(); next.remove(); map.current = null; marker.current = null; };
  }, []);
  useEffect(() => {
    activeCampus.current = selectedCampus;
    const next = map.current;
    if (!next) return;
    next.setMinZoom(0);
    next.setMaxBounds(selectedCampus.bounds);
    next.fitBounds(selectedCampus.bounds, { padding: [5, 5] });
    next.setMinZoom(next.getBoundsZoom(selectedCampus.bounds, true));
    if (!selectedCampus.polygon.length) return;
    const outline = L.polygon(selectedCampus.polygon.map(([longitude, latitude]) => [latitude, longitude]), { color: "#1769c2", fillOpacity: 0.08, interactive: false }).addTo(next);
    const mask = L.polygon([
      [[-90, -180], [-90, 180], [90, 180], [90, -180]],
      selectedCampus.polygon.map(([longitude, latitude]): L.LatLngTuple => [latitude, longitude]),
    ], { stroke: false, fillColor: "#f1f5f9", fillOpacity: 0.92, interactive: false }).addTo(next);
    return () => { outline.remove(); mask.remove(); };
  }, [selectedCampus]);
  useEffect(() => {
    const next = map.current;
    if (!next) return;
    if (!value || !insideCampus(value, selectedCampus)) { marker.current?.remove(); marker.current = null; return; }
    const latLng: L.LatLngTuple = [value.latitude, value.longitude];
    if (!marker.current) {
      const pin = L.marker(latLng, {
        draggable: !disabled,
        icon: L.divIcon({ className: "campus-map-pin", iconSize: [22, 22], iconAnchor: [11, 11] }),
        title: "Selected room location",
      }).addTo(next);
      let beforeDrag = pin.getLatLng();
      pin.on("dragstart", () => { beforeDrag = pin.getLatLng(); });
      pin.on("dragend", () => {
        if (locked.current) return;
        const point = pin.getLatLng();
        if (!select.current({ latitude: Number(point.lat.toFixed(6)), longitude: Number(point.lng.toFixed(6)) })) pin.setLatLng(beforeDrag);
      });
      marker.current = pin;
    } else marker.current.setLatLng(latLng);
    if (disabled) marker.current.dragging?.disable();
    else marker.current.dragging?.enable();
    if (!next.getBounds().contains(latLng)) next.panTo(latLng);
  }, [value, disabled, selectedCampus]);

  return <section className="location-picker" aria-label="Room location picker">
    <div className="location-picker-heading"><strong>{selectedCampus.name}</strong><p>{selectedCampus.scopeKind === "approximate" ? `Approximate view area near ${selectedCampus.address}, not a verified campus boundary. Verify every room pin independently before saving.` : "Choose a point inside the blue UNILUS navigation outline. Manual coordinates are also scope-validated; this is not a surveyed boundary."}</p></div>
    <div ref={container} className="location-picker-map" aria-label="Interactive campus map" />
    {tileError && <p role="alert" className="location-picker-warning">Some map tiles could not load. You can still enter verified coordinates manually.</p>}
    {selectionError && <p role="alert" className="location-picker-warning">{selectionError}</p>}
    {value && !campusFor(value) && <p role="alert" className="location-picker-warning">This location is outside the supported UNILUS navigation scopes. Verify and correct its coordinates before saving.</p>}
    {locationAccuracy !== null && <p role="status" className="location-picker-warning">Device location accuracy: approximately {locationAccuracy} metres. Verify the pin matches the room before saving.</p>}
    <div className="location-picker-actions">
      <button type="button" className="secondary-button" disabled={disabled || locating} onClick={useCurrentLocation}>{locating ? "Finding current location..." : "Use current location"}</button>
      <button type="button" className="secondary-button" disabled={disabled} onClick={() => {
        const centre = map.current?.getCenter();
        if (centre) select.current({ latitude: Number(centre.lat.toFixed(6)), longitude: Number(centre.lng.toFixed(6)) });
      }}>Set pin to map centre</button>
      {locations.some((point) => insideCampus(point, selectedCampus)) && <button type="button" className="text-link" onClick={() => map.current?.fitBounds(locations.filter((point) => insideCampus(point, selectedCampus)).map((point) => [point.latitude, point.longitude] as L.LatLngTuple), { maxZoom: 17, padding: [30, 30] })}>Show campus locations</button>}
      <span role="status">{value ? `${value.latitude.toFixed(6)}, ${value.longitude.toFixed(6)}` : "No location selected"}</span>
    </div>
  </section>;
}
