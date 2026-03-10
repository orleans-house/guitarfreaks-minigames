import type { NeckKey } from "./gamepad.ts";

export const BUTTON_COLORS: Record<NeckKey, string> = {
  r: "#ff0000",
  g: "#00ff00",
  b: "#0000ff",
  y: "#ffff00",
  p: "#ff00ff",
};

export const NECK_LABELS: Record<NeckKey, string> = {
  r: "R",
  g: "G",
  b: "B",
  y: "Y",
  p: "P",
};

export function createFullscreenCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  document.body.appendChild(canvas);
  resizeCanvas(canvas);
  window.addEventListener("resize", () => resizeCanvas(canvas));
  return canvas;
}

export function resizeCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

export interface DrawTextOptions {
  size?: number;
  color?: string;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  font?: string;
}

export function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  options?: DrawTextOptions,
): void {
  const size = options?.size ?? 24;
  const color = options?.color ?? "#ffffff";
  const align = options?.align ?? "center";
  const baseline = options?.baseline ?? "middle";
  const font = options?.font ?? "sans-serif";

  ctx.save();
  ctx.font = `${size}px ${font}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillText(text, x, y);
  ctx.restore();
}
