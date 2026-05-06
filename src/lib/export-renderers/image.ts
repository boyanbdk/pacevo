import { toPng } from "html-to-image";
import type { PlanExportModel } from "../export-model";

export type PlanWeekImagePreset = "landscape" | "square" | "story" | "print";

const WEEK_IMAGE_PRESETS: Record<PlanWeekImagePreset, {
  width: number;
  height: number;
  columns: number;
  padding: number;
}> = {
  landscape: { width: 1600, height: 900, columns: 7, padding: 48 },
  square: { width: 1200, height: 1200, columns: 2, padding: 44 },
  story: { width: 1080, height: 1920, columns: 1, padding: 54 },
  print: { width: 2400, height: 1600, columns: 7, padding: 72 },
};

const SESSION_EXPORT_COLORS: Record<string, { border: string; bg: string; text: string }> = {
  easy: { border: "#28d2ae", bg: "rgba(40, 210, 174, 0.13)", text: "#28d2ae" },
  long: { border: "#d8ff00", bg: "rgba(216, 255, 0, 0.13)", text: "#d8ff00" },
  tempo: { border: "#ff9f43", bg: "rgba(255, 159, 67, 0.13)", text: "#ffb66b" },
  interval: { border: "#ff6b6b", bg: "rgba(255, 107, 107, 0.13)", text: "#ff8a8a" },
  repetition: { border: "#ff6b6b", bg: "rgba(255, 107, 107, 0.13)", text: "#ff8a8a" },
  marathon_pace: { border: "#a29bfe", bg: "rgba(162, 155, 254, 0.13)", text: "#bbb6ff" },
  recovery: { border: "#74b9ff", bg: "rgba(116, 185, 255, 0.13)", text: "#9dcbff" },
  strides: { border: "#fd79a8", bg: "rgba(253, 121, 168, 0.13)", text: "#ff9dc1" },
  fartlek: { border: "#fdcb6e", bg: "rgba(253, 203, 110, 0.13)", text: "#ffdc95" },
  hills: { border: "#e17055", bg: "rgba(225, 112, 85, 0.13)", text: "#ff8c72" },
  cross: { border: "#6c5ce7", bg: "rgba(108, 92, 231, 0.13)", text: "#9b90ff" },
  race: { border: "#ffd700", bg: "rgba(255, 215, 0, 0.14)", text: "#ffe36b" },
  rest: { border: "#334047", bg: "rgba(255, 255, 255, 0.035)", text: "#a8b1ac" },
};

const EXPORT_DAY_LABELS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

function applyStyles<T extends HTMLElement>(node: T, styles: Partial<CSSStyleDeclaration>): T {
  Object.assign(node.style, styles);
  return node;
}

function textNode(tag: keyof HTMLElementTagNameMap, text: string, styles: Partial<CSSStyleDeclaration> = {}) {
  const node = document.createElement(tag);
  node.textContent = text;
  return applyStyles(node, styles);
}

export async function renderPlanWeekCardPngBlob(
  model: PlanExportModel,
  weekIndex: number,
  preset: PlanWeekImagePreset = "landscape",
): Promise<{ blob: Blob; weekNumber: number; preset: PlanWeekImagePreset }> {
  const week = model.weeks[weekIndex];
  if (!week) {
    throw new Error(`Cannot export missing week index ${weekIndex}.`);
  }

  const config = WEEK_IMAGE_PRESETS[preset];
  const isTall = config.columns === 1;
  const isWide = config.columns === 7;
  const node = applyStyles(document.createElement("div"), {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: `${config.width}px`,
    height: `${config.height}px`,
    boxSizing: "border-box",
    display: "grid",
    gridTemplateRows: "auto 1fr auto",
    gap: isTall ? "34px" : "28px",
    padding: `${config.padding}px`,
    overflow: "hidden",
    background: "#11171b",
    border: "2px solid rgba(40, 210, 174, 0.55)",
    borderRadius: "20px",
    color: "#f5f7f2",
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    letterSpacing: "0",
  });

  const header = applyStyles(document.createElement("header"), {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: "28px",
    borderBottom: "1px solid rgba(255, 255, 255, 0.12)",
    paddingBottom: isTall ? "28px" : "22px",
  });

  const headerMain = applyStyles(document.createElement("div"), { display: "grid", gap: "12px" });
  headerMain.append(
    textNode("div", model.brand.label, {
      color: "#d8ff00",
      fontSize: isTall ? "28px" : "24px",
      fontWeight: "900",
    }),
    textNode("div", week.label.toUpperCase(), {
      color: "#d8ff00",
      fontSize: isTall ? "34px" : "30px",
      fontWeight: "900",
    }),
    textNode("h1", `Week ${week.number} | ${week.dateRange} | ${week.totalDistance}`, {
      margin: "0",
      color: "#f5f7f2",
      fontSize: isTall ? "54px" : isWide ? "46px" : "48px",
      lineHeight: "1.05",
      fontWeight: "900",
    }),
  );

  const meta = applyStyles(document.createElement("div"), {
    display: "grid",
    justifyItems: "end",
    gap: "8px",
    color: "#a8b1ac",
    fontSize: isTall ? "24px" : "20px",
    fontWeight: "800",
    whiteSpace: "nowrap",
  });
  meta.append(
    textNode("span", model.meta.goalRace),
    textNode("span", `${model.meta.level} | ${model.meta.weeksTotal} weeks`),
  );

  header.append(headerMain, meta);
  node.append(header);

  const grid = applyStyles(document.createElement("main"), {
    display: "grid",
    gridTemplateColumns: `repeat(${config.columns}, minmax(0, 1fr))`,
    gap: isTall ? "18px" : "16px",
    alignContent: "stretch",
    minHeight: "0",
  });

  for (const session of [...week.sessions].sort((a, b) => a.dayIndex - b.dayIndex)) {
    const colors = SESSION_EXPORT_COLORS[session.type] ?? SESSION_EXPORT_COLORS.rest;
    const card = applyStyles(document.createElement("section"), {
      display: "grid",
      gridTemplateRows: "auto 1fr auto",
      gap: isTall ? "12px" : "18px",
      minWidth: "0",
      minHeight: "0",
      padding: isTall ? "20px 24px" : "22px",
      border: `2px solid ${colors.border}`,
      borderRadius: "18px",
      background: colors.bg,
      boxSizing: "border-box",
      overflow: "hidden",
    });

    const day = applyStyles(document.createElement("div"), {
      display: "flex",
      alignItems: "baseline",
      justifyContent: "space-between",
      gap: "12px",
      color: "#a8b1ac",
      fontSize: isTall ? "24px" : "22px",
      fontWeight: "900",
    });
    day.append(
      textNode("span", EXPORT_DAY_LABELS[session.dayIndex - 1] ?? "DAY"),
      textNode("span", session.shortDate, { color: "#f5f7f2", whiteSpace: "nowrap" }),
    );

    const body = applyStyles(document.createElement("div"), {
      display: "grid",
      alignContent: "start",
      gap: isTall ? "10px" : "18px",
      minWidth: "0",
    });
    body.append(
      textNode("strong", session.label, {
        color: colors.text,
        fontSize: isTall ? "34px" : isWide ? "28px" : "32px",
        lineHeight: "1.05",
        fontWeight: "900",
        overflowWrap: "anywhere",
      }),
    );
    if (session.distance) {
      body.append(textNode("span", session.distance, {
        color: "#a8b1ac",
        fontSize: isTall ? "28px" : "25px",
        fontWeight: "750",
      }));
    }
    if (session.pace) {
      body.append(textNode("span", session.pace, {
        color: "#f5f7f2",
        fontSize: isTall ? "22px" : "18px",
        fontWeight: "750",
      }));
    }

    const footer = textNode("p", session.isRest ? "Rest" : session.description, {
      margin: "0",
      color: "#a8b1ac",
      fontSize: isTall ? "20px" : "15px",
      lineHeight: "1.35",
      overflow: "hidden",
    });

    card.append(day, body, footer);
    grid.append(card);
  }

  node.append(grid);

  const footer = applyStyles(document.createElement("footer"), {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "20px",
    color: "#a8b1ac",
    fontSize: isTall ? "20px" : "16px",
    fontWeight: "700",
  });
  footer.append(
    textNode("span", model.brand.motto),
    textNode("span", `${week.phase} | ${week.totalDistance} | Long ${week.longRunDistance || "-"}`),
  );
  node.append(footer);

  document.body.appendChild(node);
  try {
    const dataUrl = await toPng(node, {
      cacheBust: true,
      pixelRatio: 1,
      backgroundColor: "#11171b",
      width: config.width,
      height: config.height,
    });
    const response = await fetch(dataUrl);
    return { blob: await response.blob(), weekNumber: week.number, preset };
  } finally {
    node.remove();
  }
}
