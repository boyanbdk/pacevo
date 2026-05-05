# Export System Redesign Plan

Date: 2026-05-05

## Context

The current exports are generated through three separate paths:

- Full-plan PDF: `src/lib/export.ts` uses `jsPDF` and hand-placed text.
- Full-plan DOCX: `src/lib/export.ts` uses `docx` tables.
- Week PNG: `src/lib/export.ts` uses `html-to-image` on the live calendar DOM.

The sample artifacts show why this feels weak:

- `/Users/boyanbudakov/Downloads/marathon-training-plan.pdf` is a 3-page dense text export. It has brand color, but it does not preserve the strong calendar experience shown in the app, has little hierarchy, no table structure, no weekly summary rhythm, and low visual polish.
- `/Users/boyanbudakov/Downloads/marathon-training-plan.docx` is readable but generic. It starts at Week 2 in the inspected file, uses plain Word tables, and does not feel like a designed Pacevo artifact.
- `/Users/boyanbudakov/Downloads/10k-week-1.png` captures the app card more successfully, but it is just a viewport-shaped DOM screenshot: very wide, low vertical information density, no export-specific sizing presets, no visible legend, and limited control over social, print, or mobile variants.

The core problem is architectural: each export format owns its own layout decisions. That guarantees drift between PNG, PDF, DOCX, and future formats.

## Product Goal

Create a coherent export system where every output feels like the same Pacevo training plan, adapted correctly for its medium:

- Shareable images for quick visual communication.
- Print-quality PDFs for athletes and coaches.
- Editable DOCX files for handoff and collaboration.
- Data exports for external tools.
- Future-safe structure for email, calendar, and Strava-style integrations.

## Design Direction

Use a shared export presentation model, then render it into format-specific templates.

The export should feel more like a premium training document than a dumped table. The visual language should preserve the current dark Pacevo brand, but the PDF and DOCX need their own layout rules rather than mirroring the app UI blindly.

Recommended export variants:

1. **Week Card PNG**
   - Best for sharing a single week.
   - Presets: `landscape`, `square`, `story`, and `print`.
   - Includes brand line, phase, week range, total distance, seven-day calendar, rest day, and compact session labels.
   - Uses export-only dimensions instead of the current live DOM width.

2. **Full Plan PDF**
   - Best for print and coach review.
   - Includes cover page, plan summary, pace reference, phase overview, week-by-week pages, and appendix.
   - Should use proper pagination, repeated headers, page numbers, and print-safe contrast.
   - Should not be a tiny text-only jsPDF list.

3. **Compact PDF**
   - Best for quick reference.
   - One or two pages where possible.
   - Shows all weeks in a dense matrix: week, phase, total km, key sessions, long run, notes.

4. **DOCX**
   - Best for editing.
   - Uses Word-native styles: Title, Heading 1, Heading 2, table headers, body, notes.
   - Avoids dark full-page styling by default because many DOCX users print or edit in light mode.
   - Includes the same content sections as PDF, but optimized for editability.

5. **CSV / JSON**
   - Best for data portability.
   - CSV rows should be one session per row.
   - JSON should expose the normalized export model with metadata, weeks, sessions, paces, warnings, and generated timestamp.

6. **Calendar Export**
   - Best for execution.
   - Later phase: `.ics` export with one event per planned session.

## Engineering Plan

### Phase 1: Normalize Export Data

Create `src/lib/export-model.ts`.

Responsibilities:

- Convert `TrainingPlan` plus user settings into a stable `PlanExportModel`.
- Include plan metadata, goal, start/end date, generated date, level, total km, weekly totals, phase labels, paces, warnings, and sessions.
- Preserve rest days instead of filtering them out by default.
- Compute display labels once: session type, distance, pace, date, weekday, notes, tags.
- Add explicit `variant` and `audience` fields later if needed.

Suggested types:

```ts
export type ExportFormat = "png" | "pdf" | "docx" | "csv" | "json" | "ics";

export type PlanExportModel = {
  brand: {
    name: string;
    label: string;
    motto: string;
  };
  title: string;
  subtitle: string;
  meta: {
    goalRace: string;
    level: string;
    weeksTotal: number;
    startDate: string;
    endDate: string;
    goalDate: string;
    totalKm: number;
    generatedAt: string;
  };
  paceReference: ExportPaceItem[];
  weeks: ExportWeek[];
  warnings: string[];
};
```

Acceptance criteria:

- Unit tests cover Week 1 inclusion, rest day preservation, easy pace hiding/showing, long run labels, deload labels, and missing pace handling.
- Existing PDF and DOCX helpers consume the model instead of raw `TrainingPlan`.

### Phase 2: Build Export Templates

Create format-specific renderers:

- `src/lib/export-renderers/pdf.ts`
- `src/lib/export-renderers/docx.ts`
- `src/lib/export-renderers/data.ts`
- `src/lib/export-renderers/image.ts`

Keep `src/lib/export.ts` as the public facade used by React components.

PDF renderer:

- Consider moving from low-level jsPDF text placement to HTML-based rendering if the app can support it cleanly.
- If staying with jsPDF, introduce layout primitives: page, section, heading, table, badge, session row, footer.
- Add deterministic pagination tests around week boundaries.

DOCX renderer:

- Define document styles centrally.
- Use consistent column widths.
- Add a plan summary section before week tables.
- Include rest days optionally, controlled by export settings.
- Avoid using em dashes or special symbols where plain ASCII works better in Word.

Image renderer:

- Do not export the live calendar node directly.
- Render a dedicated `ExportWeekCard` component into an offscreen export container.
- Give each preset fixed dimensions:
  - Landscape: 1600 x 900
  - Square: 1200 x 1200
  - Story: 1080 x 1920
  - Print: 2400 x 1600
- Capture that controlled node with `html-to-image`.

### Phase 3: Add Export UI

Replace the current three-button export row with an export dialog.

Controls:

- Format: PNG, PDF, DOCX, CSV, JSON, later ICS.
- Scope: current week, all weeks, selected week range.
- Layout: detailed, compact, coach review.
- Theme: dark brand, light print.
- Image preset: landscape, square, story, print.
- Content toggles: rest days, paces, HR zones, rationale, warnings, completed/logged markers.

Default choices:

- Current week PNG: landscape.
- Full plan PDF: detailed, light print unless the user selects dark brand.
- DOCX: editable light document.
- CSV/JSON: all sessions.

### Phase 4: Quality Bar And Verification

Add tests and visual checks:

- Unit tests for export model generation.
- Snapshot-style text tests for PDF/DOCX content order.
- Browser screenshot checks for each PNG preset at desktop and mobile widths.
- File smoke tests that generated PDF, DOCX, CSV, and JSON are non-empty and include Week 1.

Manual review checklist:

- Week 1 appears when the plan starts at Week 1.
- Rest days appear or hide according to the selected setting.
- Long runs, hills, tempo, intervals, and easy days are visually distinct.
- Text never overlaps inside day cards.
- Exported image dimensions match the selected preset.
- PDF page breaks never split a week header from its first session.
- DOCX opens cleanly in Word/Pages/Google Docs.

## Recommended Implementation Order

1. Build `PlanExportModel` and tests.
2. Refactor existing PDF and DOCX exports to use the model without changing UI.
3. Add CSV and JSON exports because they are low-risk and validate the model.
4. Build the export-only week card component and preset PNG flow.
5. Replace export buttons with a dialog.
6. Redesign the PDF layout.
7. Redesign the DOCX layout.
8. Add `.ics` calendar export.

## Specific Fixes For Current Artifacts

PDF:

- Add a cover/header section with total distance, date range, goal date, and level.
- Use tables or card-like rows instead of raw text lines.
- Include rest days or make their exclusion explicit.
- Add phase summary and weekly rhythm.
- Improve page density without making it feel like a terminal dump.

DOCX:

- Fix week inclusion so exports cannot accidentally start at Week 2 unless the user requested a range.
- Add native Word styles and margins.
- Add summary and phase sections before weekly details.
- Add optional rest days.
- Keep notes readable and avoid cramped five-column tables for long descriptions.

PNG:

- Use an export-only layout instead of current responsive DOM.
- Add sizing presets.
- Add a compact legend when useful.
- Make day cards scale predictably so seven-day weeks do not become overly wide and shallow.

## Open Decisions

- Whether PDF generation should remain client-only or move to a server/API route for stronger rendering.
- Whether the default PDF theme should be dark brand or light print.
- Whether the export dialog should remember the user's last settings.
- Whether completed-session/logged markers should be included in exports by default.

## Success Definition

The export system is successful when a user can export the same plan as PNG, PDF, DOCX, CSV, or JSON and recognize one consistent Pacevo document system across all of them. Each format should be useful in its native context, not just technically downloadable.
