export function parsePace(value: string): number {
  const match = value.trim().match(/^(\d{1,2}):([0-5]\d)$/);
  if (!match) {
    throw new Error("Pace must use M:SS format");
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

export function formatPace(seconds: number): string {
  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

export function paceToKmh(seconds: number): number {
  return 3600 / seconds;
}

export function roundTo5(seconds: number): number {
  return Math.round(seconds / 5) * 5;
}

export function roundUp10(seconds: number): number {
  return Math.ceil(seconds / 10) * 10;
}

export function formatDistance(distanceKm: number): string {
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} m`;
  }
  return `${distanceKm.toFixed(1)} km`;
}

export function parseDistance(value: string, unit: string): number {
  const numeric = Number(value.replace(",", "."));
  return unit.toLowerCase().startsWith("m") ? numeric / 1000 : numeric;
}

export function parseDuration(value: string, unit: string): number {
  const numeric = Number(value);
  const normalized = unit.toLowerCase();
  return normalized.startsWith("min") ? numeric * 60 : numeric;
}

export function formatDuration(seconds: number): string {
  if (seconds % 60 === 0) {
    return `${seconds / 60} min`;
  }
  return `${seconds} sec`;
}
