import React, { Fragment } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { createAgentIcon, createTargetIcon } from "./leafletSetup";
import type { FleetTask, FleetFoodRequest, FleetFoodListing } from "../../types/admin";

interface FleetMapProps {
  fleetTasks: FleetTask[];
}

/** Safely extract the first food_request from a fleet task. */
function getFirstRequest(task: FleetTask): FleetFoodRequest | null {
  if (!task.food_requests) return null;
  return Array.isArray(task.food_requests) ? task.food_requests[0] ?? null : task.food_requests;
}

/** Safely extract the first food_listing from a food_request. */
function getFirstListing(req: FleetFoodRequest): FleetFoodListing | null {
  if (!req.food_listings) return null;
  return Array.isArray(req.food_listings) ? req.food_listings[0] ?? null : req.food_listings;
}

/** Get the volunteer's lat/lng from a fleet task, handling single-object or array join shapes. */
function getVolunteerLocation(task: FleetTask): { lat: number; lng: number } | null {
  const vol = Array.isArray(task.volunteer) ? task.volunteer[0] : task.volunteer;
  if (!vol?.location_lat || !vol?.location_lng) return null;
  return { lat: vol.location_lat, lng: vol.location_lng };
}

const FleetMap: React.FC<FleetMapProps> = React.memo(function FleetMap({ fleetTasks }) {
  return (
    <MapContainer
      center={[20.5937, 78.9629]}
      zoom={5}
      style={{ height: "100%", width: "100%", zIndex: 0 }}
      zoomControl={true}
      attributionControl={false}
    >
      <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
      {fleetTasks.map((task) => {
        const volLoc = getVolunteerLocation(task);
        const req = getFirstRequest(task);

        if (!volLoc || !req) return null;

        const list = getFirstListing(req);
        const vol = Array.isArray(task.volunteer) ? task.volunteer[0] : task.volunteer;

        const src: [number, number] = [volLoc.lat, volLoc.lng];
        const pick = list?.pickup_lat && list?.pickup_lng
          ? [list.pickup_lat, list.pickup_lng] as [number, number]
          : null;
        const drop = req.drop_lat && req.drop_lng
          ? [req.drop_lat, req.drop_lng] as [number, number]
          : null;

        return (
          <Fragment key={task.id}>
            <Marker position={src} icon={createAgentIcon()}>
              <Popup><strong>Agent GPS</strong><br/>{vol?.full_name}</Popup>
            </Marker>
            {task.status !== 'picked_up' && pick && (
              <Fragment>
                <Marker position={pick} icon={createTargetIcon('#f59e0b')} />
                <Polyline positions={[src, pick]} color="#f59e0b" weight={2} dashArray="5, 10" />
              </Fragment>
            )}
            {task.status === 'picked_up' && drop && (
              <Fragment>
                <Marker position={drop} icon={createTargetIcon('#10b981')} />
                <Polyline positions={[src, drop]} color="#10b981" weight={2} dashArray="5, 10" />
              </Fragment>
            )}
          </Fragment>
        );
      })}
    </MapContainer>
  );
});

export default FleetMap;
