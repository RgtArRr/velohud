/** Shared geodesic constants (single source for telemetry + nav math). */

/** Mean Earth radius in meters (haversine). */
export const EARTH_RADIUS_M = 6371000;

/** Meters per degree of latitude (WGS-84 meridional approximation). */
export const METERS_PER_DEG_LAT = 110540;

/** Meters per degree of longitude at the equator (scale by cos(lat) elsewhere). */
export const METERS_PER_DEG_LON = 111320;
