"use client";

import { Download, FileImage, FileText } from "lucide-react";
import { exportCardImage, exportWorkoutDocx, exportWorkoutPdf } from "@/lib/export";
import type { AdjustedWorkout } from "@/domain/workout-schema";

export function ExportMenu({
  workout,
  cardRef
}: {
  workout: AdjustedWorkout;
  cardRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="button-row">
      <button
        className="button"
        onClick={() => cardRef.current && exportCardImage(cardRef.current, workout.title)}
      >
        <FileImage size={17} />
        PNG
      </button>
      <button className="button" onClick={() => exportWorkoutPdf(workout)}>
        <FileText size={17} />
        PDF
      </button>
      <button className="button" onClick={() => exportWorkoutDocx(workout)}>
        <Download size={17} />
        DOCX
      </button>
    </div>
  );
}
