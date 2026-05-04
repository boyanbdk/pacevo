import type { PlannedSession, TrainingPlan } from "./types";
import type { CompletedSession } from "@/lib/plan-storage";

export type ImportedActivity = {
  id: string;
  source: "gpx" | "tcx";
  fileName: string;
  name: string;
  startedAt: string;
  date: string;
  distanceKm: number;
  durationMin: number;
  avgHR: number | null;
  maxHR: number | null;
};

export type ActivityMatchStatus = "auto" | "suggestion" | "duplicate" | "unmatched";

export type ActivityMatch = {
  activity: ImportedActivity;
  status: ActivityMatchStatus;
  reason: string;
  weekIndex: number | null;
  dayIndex: number | null;
  dateDeltaDays: number | null;
  distanceDeltaKm: number | null;
};

type TrackPoint = {
  lat: number | null;
  lon: number | null;
  time: string | null;
  distanceM: number | null;
  hr: number | null;
};

const KM_PER_RADIAN = 6371;

function textContent(xml: string, tagName: string): string | null {
  const match = xml.match(new RegExp(`<(?:[\\w-]+:)?${tagName}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${tagName}>`, "i"));
  return match?.[1]?.trim() ?? null;
}

function attrValue(xml: string, attrName: string): string | null {
  const match = xml.match(new RegExp(`${attrName}=["']([^"']+)["']`, "i"));
  return match?.[1] ?? null;
}

function numeric(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function localDate(iso: string): string {
  const date = new Date(iso);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function daysBetween(a: string, b: string): number {
  const first = new Date(`${a}T12:00:00`);
  const second = new Date(`${b}T12:00:00`);
  return Math.round((first.getTime() - second.getTime()) / 86400000);
}

function haversineKm(a: TrackPoint, b: TrackPoint): number {
  if (a.lat === null || a.lon === null || b.lat === null || b.lon === null) return 0;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const dLat = lat2 - lat1;
  const dLon = (b.lon - a.lon) * Math.PI / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * KM_PER_RADIAN * Math.asin(Math.sqrt(h));
}

function distanceFromCoordinates(points: TrackPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineKm(points[i - 1], points[i]);
  }
  return total;
}

function summarizeHeartRate(points: TrackPoint[]): { avgHR: number | null; maxHR: number | null } {
  const values = points
    .map((point) => point.hr)
    .filter((hr): hr is number => hr !== null && Number.isFinite(hr));
  if (values.length === 0) return { avgHR: null, maxHR: null };
  return {
    avgHR: Math.round(values.reduce((sum, hr) => sum + hr, 0) / values.length),
    maxHR: Math.max(...values),
  };
}

function activityFromPoints(
  source: "gpx" | "tcx",
  fileName: string,
  name: string | null,
  points: TrackPoint[],
): ImportedActivity | null {
  const timed = points.filter((point) => point.time);
  if (timed.length < 2) return null;

  const firstTime = timed[0].time!;
  const lastTime = timed[timed.length - 1].time!;
  const durationMin = Math.round(((new Date(lastTime).getTime() - new Date(firstTime).getTime()) / 60000) * 10) / 10;
  if (!Number.isFinite(durationMin) || durationMin <= 0) return null;

  const distanceFromDevice = [...points]
    .reverse()
    .map((point) => point.distanceM)
    .find((distance): distance is number => distance !== null && distance > 0);
  const distanceKm = distanceFromDevice
    ? distanceFromDevice / 1000
    : distanceFromCoordinates(points);
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return null;

  const hr = summarizeHeartRate(points);
  const roundedKm = Math.round(distanceKm * 100) / 100;

  return {
    id: `${source}:${fileName}:${firstTime}:${roundedKm}`,
    source,
    fileName,
    name: name?.trim() || fileName,
    startedAt: firstTime,
    date: localDate(firstTime),
    distanceKm: roundedKm,
    durationMin,
    avgHR: hr.avgHR,
    maxHR: hr.maxHR,
  };
}

function parseGpx(fileName: string, xml: string): ImportedActivity[] {
  const trkptPattern = /<trkpt\b[^>]*>[\s\S]*?<\/trkpt>/gi;
  const points: TrackPoint[] = [...xml.matchAll(trkptPattern)].map((match) => {
    const block = match[0];
    return {
      lat: numeric(attrValue(block, "lat")),
      lon: numeric(attrValue(block, "lon")),
      time: textContent(block, "time"),
      distanceM: null,
      hr: numeric(textContent(block, "hr")),
    };
  });

  const activity = activityFromPoints("gpx", fileName, textContent(xml, "name"), points);
  return activity ? [activity] : [];
}

function parseTcx(fileName: string, xml: string): ImportedActivity[] {
  const activityPattern = /<Activity\b[^>]*>[\s\S]*?<\/Activity>/gi;
  return [...xml.matchAll(activityPattern)]
    .map((activityMatch, index) => {
      const activityXml = activityMatch[0];
      const trackpointPattern = /<Trackpoint\b[^>]*>[\s\S]*?<\/Trackpoint>/gi;
      const points: TrackPoint[] = [...activityXml.matchAll(trackpointPattern)].map((match) => {
        const block = match[0];
        return {
          lat: numeric(textContent(block, "LatitudeDegrees")),
          lon: numeric(textContent(block, "LongitudeDegrees")),
          time: textContent(block, "Time"),
          distanceM: numeric(textContent(block, "DistanceMeters")),
          hr: numeric(textContent(block, "Value")),
        };
      });
      return activityFromPoints("tcx", fileName, textContent(activityXml, "Id") ?? `Activity ${index + 1}`, points);
    })
    .filter((activity): activity is ImportedActivity => activity !== null);
}

export function parseActivityFile(fileName: string, contents: string): ImportedActivity[] {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (ext === "gpx") return parseGpx(fileName, contents);
  if (ext === "tcx") return parseTcx(fileName, contents);
  throw new Error("Only GPX and TCX activity files are supported in this local import.");
}

function plannedSessions(plan: TrainingPlan): Array<{ weekIndex: number; session: PlannedSession }> {
  return plan.weeks.flatMap((week) =>
    week.sessions
      .filter((session) => session.type !== "rest")
      .map((session) => ({ weekIndex: week.week_index, session })),
  );
}

function distanceFits(activityKm: number, targetKm: number | null): boolean {
  if (targetKm === null || targetKm === 0) return true;
  return Math.abs(activityKm - targetKm) <= Math.max(2, targetKm * 0.35);
}

function completionKey(weekIndex: number, dayIndex: number): string {
  return `${weekIndex}-${dayIndex}`;
}

export function matchImportedActivities(
  plan: TrainingPlan,
  activities: ImportedActivity[],
  completed: CompletedSession[],
): ActivityMatch[] {
  const completedKeys = new Set(completed.map((session) => completionKey(session.weekIndex, session.dayIndex)));
  const sessions = plannedSessions(plan);

  return activities.map((activity) => {
    const ranked = sessions
      .map(({ weekIndex, session }) => {
        const dateDelta = Math.abs(daysBetween(activity.date, session.date));
        const distanceDelta = session.target_km === null
          ? null
          : Math.round((activity.distanceKm - session.target_km) * 10) / 10;
        const distancePenalty = distanceDelta === null ? 0 : Math.abs(distanceDelta) / Math.max(1, session.target_km ?? 1);
        return { weekIndex, session, dateDelta, distanceDelta, score: dateDelta * 10 + distancePenalty };
      })
      .sort((a, b) => a.score - b.score);

    const best = ranked[0];
    if (!best) {
      return {
        activity,
        status: "unmatched",
        reason: "No planned running sessions exist for this plan.",
        weekIndex: null,
        dayIndex: null,
        dateDeltaDays: null,
        distanceDeltaKm: null,
      };
    }

    const isLogged = completedKeys.has(completionKey(best.weekIndex, best.session.day_index));
    if (isLogged && best.dateDelta === 0) {
      return {
        activity,
        status: "duplicate",
        reason: "That planned session is already logged.",
        weekIndex: best.weekIndex,
        dayIndex: best.session.day_index,
        dateDeltaDays: best.dateDelta,
        distanceDeltaKm: best.distanceDelta,
      };
    }

    const fitsDistance = distanceFits(activity.distanceKm, best.session.target_km);
    if (best.dateDelta === 0 && fitsDistance && !isLogged) {
      return {
        activity,
        status: "auto",
        reason: "Same planned date and distance is close enough to import automatically.",
        weekIndex: best.weekIndex,
        dayIndex: best.session.day_index,
        dateDeltaDays: best.dateDelta,
        distanceDeltaKm: best.distanceDelta,
      };
    }

    if (best.dateDelta <= 3 && fitsDistance && !isLogged) {
      return {
        activity,
        status: "suggestion",
        reason: "Date differs from the plan, so review before importing.",
        weekIndex: best.weekIndex,
        dayIndex: best.session.day_index,
        dateDeltaDays: best.dateDelta,
        distanceDeltaKm: best.distanceDelta,
      };
    }

    return {
      activity,
      status: "unmatched",
      reason: "No unlogged planned session within 3 days has a close distance match.",
      weekIndex: null,
      dayIndex: null,
      dateDeltaDays: null,
      distanceDeltaKm: null,
    };
  });
}
