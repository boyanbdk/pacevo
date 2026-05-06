import { expect, test } from "vitest";
import { parseActivityFile, matchImportedActivities } from "./activity-import";
import type { CompletedSession } from "@/lib/plan-storage";
import type { TrainingPlan } from "./types";

const GPX = `<?xml version="1.0"?>
<gpx>
  <trk>
    <name>Morning run</name>
    <trkseg>
      <trkpt lat="42.6977" lon="23.3219"><time>2026-05-05T06:00:00Z</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>140</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>
      <trkpt lat="42.6977" lon="23.3341"><time>2026-05-05T06:05:00Z</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>150</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>
      <trkpt lat="42.6977" lon="23.3463"><time>2026-05-05T06:10:00Z</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>160</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>
    </trkseg>
  </trk>
</gpx>`;

const TCX = `<?xml version="1.0"?>
<TrainingCenterDatabase>
  <Activities>
    <Activity Sport="Running">
      <Id>2026-05-06T06:00:00Z</Id>
      <Lap StartTime="2026-05-06T06:00:00Z">
        <Track>
          <Trackpoint><Time>2026-05-06T06:00:00Z</Time><DistanceMeters>0</DistanceMeters><HeartRateBpm><Value>130</Value></HeartRateBpm></Trackpoint>
          <Trackpoint><Time>2026-05-06T06:20:00Z</Time><DistanceMeters>5000</DistanceMeters><HeartRateBpm><Value>150</Value></HeartRateBpm></Trackpoint>
        </Track>
      </Lap>
    </Activity>
  </Activities>
</TrainingCenterDatabase>`;

function makePlan(): TrainingPlan {
  return {
    meta: {
      goal_race: "10K",
      goal_date: "2026-07-01",
      level: "intermediate",
      inferred_level: "intermediate",
      weeks_total: 1,
      start_date: "2026-05-04",
      vdot: 45,
      vdot_source: "race",
      peak_weekly_km: 40,
      hrmax: 190,
      generated_at: "2026-05-03T00:00:00Z",
      intensity_mode: "pace",
      training_focus: "balanced",
      volume_preference: "steady",
      difficulty_preference: "balanced",
    },
    paces: { E_low: 330, E_high: 390, M: 300, T: 280, I: 260, R: 240 },
    hr_zones: { Z1: [95, 114], Z2: [115, 133], Z3: [134, 152], Z4: [153, 171], Z5: [172, 190] },
    warnings: [],
    weeks: [
      {
        week_index: 0,
        phase: "base",
        is_deload: false,
        total_km: 20,
        long_run_km: 8,
        quality_count: 1,
        acwr: null,
        sessions: [
          {
            day_index: 1,
            date: "2026-05-05",
            type: "easy",
            target_km: 2,
            target_duration_min: 15,
            pace_low_s_km: 330,
            pace_high_s_km: 390,
            hr_zone: "Z2",
            target_rpe: 4,
            description: "Easy",
            rationale: "Base",
            warmup: null,
            main_set: null,
            cooldown: null,
          },
          {
            day_index: 3,
            date: "2026-05-07",
            type: "long",
            target_km: 5,
            target_duration_min: 35,
            pace_low_s_km: 330,
            pace_high_s_km: 390,
            hr_zone: "Z2",
            target_rpe: 4,
            description: "Long",
            rationale: "Base",
            warmup: null,
            main_set: null,
            cooldown: null,
          },
        ],
      },
    ],
  };
}

test("parses GPX distance, duration, date, and heart rate", () => {
  const [activity] = parseActivityFile("run.gpx", GPX);

  expect(activity.source).toBe("gpx");
  expect(activity.name).toBe("Morning run");
  expect(activity.date).toBe("2026-05-05");
  expect(activity.durationMin).toBe(10);
  expect(activity.distanceKm).toBeGreaterThan(1.8);
  expect(activity.avgHR).toBe(150);
  expect(activity.maxHR).toBe(160);
});

test("parses TCX device distance", () => {
  const [activity] = parseActivityFile("run.tcx", TCX);

  expect(activity.source).toBe("tcx");
  expect(activity.date).toBe("2026-05-06");
  expect(activity.distanceKm).toBe(5);
  expect(activity.durationMin).toBe(20);
  expect(activity.avgHR).toBe(140);
});

test("same-date close matches are automatic but date mismatches are suggestions", () => {
  const plan = makePlan();
  const activities = [
    parseActivityFile("same-date.gpx", GPX)[0],
    parseActivityFile("shifted.tcx", TCX)[0],
  ];

  const matches = matchImportedActivities(plan, activities, []);

  expect(matches[0].status).toBe("auto");
  expect(matches[0].weekIndex).toBe(0);
  expect(matches[0].dayIndex).toBe(1);
  expect(matches[1].status).toBe("suggestion");
  expect(matches[1].reason).toMatch(/review/i);
});

test("matching returns zero-based storage week index even when plan weeks are one-based", () => {
  const plan: TrainingPlan = {
    ...makePlan(),
    weeks: [
      { ...makePlan().weeks[0], week_index: 1, sessions: [] },
      {
        ...makePlan().weeks[0],
        week_index: 2,
        sessions: makePlan().weeks[0].sessions.map((session) => ({
          ...session,
          date: session.day_index === 1 ? "2026-05-05" : "2026-05-07",
        })),
      },
    ],
  };
  const activity = parseActivityFile("same-date.gpx", GPX)[0];

  const [match] = matchImportedActivities(plan, [activity], []);

  expect(match.status).toBe("auto");
  expect(match.weekIndex).toBe(1);
  expect(match.dayIndex).toBe(1);
  expect(plan.weeks[match.weekIndex!].sessions.some((session) => session.date === activity.date)).toBe(true);
});

test("already logged same-date sessions are marked as duplicates", () => {
  const activity = parseActivityFile("run.gpx", GPX)[0];
  const completed: CompletedSession[] = [{
    id: "existing",
    planId: "plan",
    weekIndex: 0,
    dayIndex: 1,
    date: "2026-05-05",
    actualKm: 2,
    actualDurationMin: 10,
    avgHR: null,
    maxHR: null,
    rpe: null,
    note: "",
    source: "manual",
    createdAt: "2026-05-05T07:00:00Z",
  }];

  const [match] = matchImportedActivities(makePlan(), [activity], completed);

  expect(match.status).toBe("duplicate");
});

test("already imported file activities use generic duplicate copy", () => {
  const activity = parseActivityFile("run.gpx", GPX)[0];
  const completed: CompletedSession[] = [{
    id: "existing",
    planId: "plan",
    weekIndex: 0,
    dayIndex: 1,
    date: "2026-05-05",
    actualKm: 2,
    actualDurationMin: 10,
    avgHR: null,
    maxHR: null,
    rpe: null,
    note: "",
    source: "file_import",
    activityId: activity.id,
    createdAt: "2026-05-05T07:00:00Z",
  }];

  const [match] = matchImportedActivities(makePlan(), [activity], completed);

  expect(match.status).toBe("duplicate");
  expect(match.reason).toBe("That activity is already imported.");
});

test("already imported Strava provider activities are exact duplicates", () => {
  const activity = {
    id: "strava:999",
    providerActivityId: "999",
    source: "strava" as const,
    fileName: "Strava",
    name: "Morning run",
    startedAt: "2026-05-08T06:00:00Z",
    date: "2026-05-08",
    distanceKm: 9,
    durationMin: 45,
    avgHR: null,
    maxHR: null,
  };
  const completed: CompletedSession[] = [{
    id: "existing",
    planId: "plan",
    weekIndex: 0,
    dayIndex: 3,
    date: "2026-05-07",
    actualKm: 5,
    actualDurationMin: 30,
    avgHR: null,
    maxHR: null,
    rpe: null,
    note: "",
    source: "strava",
    providerActivityId: "999",
    createdAt: "2026-05-07T07:00:00Z",
  }];

  const [match] = matchImportedActivities(makePlan(), [activity], completed);

  expect(match.status).toBe("duplicate");
  expect(match.weekIndex).toBe(0);
  expect(match.dayIndex).toBe(3);
  expect(match.reason).toMatch(/already imported/i);
});
