export type OutputFormat = "treadmill-time" | "treadmill-distance" | "general";
export type RunContext = "free-run" | "treadmill";
export type PushLevel = "easy" | "normal" | "hard";
export type DisplayStyle = "table" | "steps";
export type ActivityType = "running";

export type WorkoutStepType = "warmup" | "interval" | "rest" | "cooldown" | "run";

export type WorkoutStep = {
  id: string;
  type: WorkoutStepType;
  label: string;
  reps?: number;
  distanceKm?: number;
  durationSeconds?: number;
  targetPace?: string;
  paceWindow?: [string, string];
  restSeconds?: number;
};

export type ParsedWorkout = {
  title: string;
  activityType: ActivityType;
  sourceSummary: string;
  steps: WorkoutStep[];
  uncertaintyFlags: string[];
};

export type TailoringInputs = {
  runContext: RunContext;
  outputFormat: OutputFormat;
  easyPace: string;
  cooldownPace: string;
  restWalkSpeed?: number;
  feeling: number;
  push: PushLevel;
};

export type AdjustedStep = {
  id: string;
  kind: string;
  label: string;
  target: string;
  detail: string;
  pace?: string;
  speedKmh?: number;
  durationSeconds?: number;
  distanceLabel?: string;
  repeatIndex?: number;
};

export type AdjustedWorkout = {
  title: string;
  lane: string;
  inputs: TailoringInputs;
  summary: string;
  steps: AdjustedStep[];
  notes: string[];
  generatedAt: string;
};

export type WorkoutAdjustment = {
  id: string;
  inputs: TailoringInputs;
  adjustedWorkout: AdjustedWorkout;
  displayStyle: DisplayStyle;
  feedbackPrompt?: string;
  revisionNumber: number;
  createdAt: string;
};

export type SavedWorkout = {
  id: string;
  title: string;
  sourceType: "image" | "text";
  sourceText: string;
  sourceImageDataUrl?: string;
  parsedWorkout: ParsedWorkout;
  adjustments: WorkoutAdjustment[];
  createdAt: string;
  updatedAt: string;
};

export type UserSettings = {
  defaultEasyPace: string;
  defaultCooldownPace: string;
  defaultRestWalkSpeed: number;
  preferredOutputMode: OutputFormat;
  preferredDisplayStyle: DisplayStyle;
  brandTheme: "volt";
  intensityMode: "pace" | "rpe" | "hr";
};
