import type { PushLevel } from "./workout-schema";

const pushOrder: PushLevel[] = ["easy", "normal", "hard"];

export function adjustedPush(push: PushLevel, feeling: number): string {
  if (feeling <= 3) {
    if (push === "hard") return "controlled-hard";
    if (push === "normal") return "easy-normal";
    return "easy";
  }

  if (feeling >= 8) {
    if (push === "hard") return "hard-plus";
    if (push === "normal") return "normal-plus";
  }

  return push;
}

export function feedbackAdjustedPush(push: PushLevel, feedback?: string): PushLevel {
  const text = feedback?.toLowerCase() ?? "";
  if (/(easier|slower|too hard|back off|less)/.test(text)) {
    const index = Math.max(0, pushOrder.indexOf(push) - 1);
    return pushOrder[index];
  }
  if (/(harder|faster|too easy|push|more)/.test(text)) {
    const index = Math.min(pushOrder.length - 1, pushOrder.indexOf(push) + 1);
    return pushOrder[index];
  }
  return push;
}
