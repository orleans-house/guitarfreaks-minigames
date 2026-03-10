import type { Scene, SceneManager } from "../core/scene.ts";
import {
  GamepadInput,
  ALL_ACTIONS,
  ACTION_LABELS,
  loadMapping,
  saveMapping,
  type ActionName,
  type ButtonMapping,
} from "../core/gamepad.ts";
import { drawText } from "../core/canvas.ts";

type Phase = "list" | "waiting";

const LIST_START_Y = 160;
const LIST_LINE_HEIGHT = 42;

export class ConfigScene implements Scene {
  private phase: Phase = "list";
  private cursor = 0;
  private mapping: ButtonMapping;
  private waitingAction: ActionName | null = null;
  private prevButtons: boolean[] = [];
  private waitDelay = 0;
  private clickHandler: ((e: MouseEvent) => void) | null = null;

  constructor(
    private input: GamepadInput,
    private scenes: SceneManager,
    private onBack: () => void,
  ) {
    this.mapping = loadMapping();
  }

  enter(): void {
    this.phase = "list";
    this.cursor = 0;
    this.mapping = loadMapping();
    this.waitingAction = null;

    this.clickHandler = (e: MouseEvent) => {
      const canvas = e.target as HTMLCanvasElement;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const y = (e.clientY - rect.top) * scaleY;
      const x = (e.clientX - rect.left) * scaleX;
      const w = canvas.width;

      if (this.phase === "list") {
        const totalItems = ALL_ACTIONS.length + 1;
        for (let i = 0; i < totalItems; i++) {
          const ey = LIST_START_Y + i * LIST_LINE_HEIGHT;
          if (x >= w / 2 - 280 && x <= w / 2 + 280 && y >= ey - 16 && y <= ey + 18) {
            if (i < ALL_ACTIONS.length) {
              this.waitingAction = ALL_ACTIONS[i];
              this.phase = "waiting";
              this.waitDelay = 300;
            } else {
              this.onBack();
            }
            break;
          }
        }
      }
    };
    document.querySelector("canvas")?.addEventListener("click", this.clickHandler);
  }

  update(dt: number): void {
    if (this.phase === "waiting") {
      this.waitDelay -= dt;

      const gamepads = navigator.getGamepads();
      for (const gp of gamepads) {
        if (!gp) continue;
        const current: boolean[] = [];
        let justPressed: number | null = null;
        for (let i = 0; i < gp.buttons.length; i++) {
          const pressed = gp.buttons[i]?.pressed ?? false;
          current.push(pressed);
          if (pressed && !this.prevButtons[i] && justPressed === null && this.waitDelay <= 0) {
            justPressed = i;
          }
        }
        this.prevButtons = current;

        if (justPressed !== null && this.waitingAction) {
          this.mapping[this.waitingAction] = justPressed;
          saveMapping(this.mapping);
          this.input.reloadMapping();
          this.phase = "list";
          this.waitingAction = null;
        }
        break;
      }
      return;
    }

    // List phase: use raw gamepad reading
    const gamepads = navigator.getGamepads();
    for (const gp of gamepads) {
      if (!gp) continue;

      const pickUpIdx = this.mapping.pick_up;
      const pickDownIdx = this.mapping.pick_down;
      const startIdx = this.mapping.start;
      const selectIdx = this.mapping.select;

      const current: boolean[] = [];
      for (let i = 0; i < gp.buttons.length; i++) {
        current.push(gp.buttons[i]?.pressed ?? false);
      }

      const totalItems = ALL_ACTIONS.length + 1;

      if (current[pickDownIdx] && !this.prevButtons[pickDownIdx]) {
        this.cursor = (this.cursor + 1) % totalItems;
      }
      if (current[pickUpIdx] && !this.prevButtons[pickUpIdx]) {
        this.cursor = (this.cursor - 1 + totalItems) % totalItems;
      }

      if (current[startIdx] && !this.prevButtons[startIdx]) {
        if (this.cursor < ALL_ACTIONS.length) {
          this.waitingAction = ALL_ACTIONS[this.cursor];
          this.phase = "waiting";
          this.waitDelay = 300;
        } else {
          this.onBack();
        }
      }

      if (current[selectIdx] && !this.prevButtons[selectIdx]) {
        this.onBack();
      }

      this.prevButtons = current;
      break;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;

    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, w, h);

    drawText(ctx, "コントローラー設定", w / 2, 60, {
      size: 40,
      color: "#ffffff",
    });

    drawText(ctx, "クリックまたはSTARTで割り当て  |  SELECTで戻る", w / 2, 110, {
      size: 16,
      color: "#888888",
    });

    if (this.phase === "waiting" && this.waitingAction) {
      drawText(ctx, ACTION_LABELS[this.waitingAction], w / 2, h / 2 - 40, {
        size: 36,
        color: "#ffdd44",
      });
      drawText(ctx, "割り当てるボタンを押してください...", w / 2, h / 2 + 20, {
        size: 24,
        color: "#cccccc",
      });
      return;
    }

    const totalItems = ALL_ACTIONS.length + 1;

    for (let i = 0; i < totalItems; i++) {
      const y = LIST_START_Y + i * LIST_LINE_HEIGHT;
      const isSelected = i === this.cursor;

      if (isSelected) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
        ctx.beginPath();
        ctx.roundRect(w / 2 - 280, y - 16, 560, 34, 6);
        ctx.fill();

        drawText(ctx, ">", w / 2 - 260, y, {
          size: 24,
          color: "#ffdd44",
          align: "left",
        });
      }

      if (i < ALL_ACTIONS.length) {
        const action = ALL_ACTIONS[i];
        drawText(ctx, ACTION_LABELS[action], w / 2 - 230, y, {
          size: 22,
          color: isSelected ? "#ffffff" : "#cccccc",
          align: "left",
        });
        drawText(ctx, `Button ${this.mapping[action]}`, w / 2 + 240, y, {
          size: 22,
          color: isSelected ? "#ffdd44" : "#888888",
          align: "right",
        });
      } else {
        drawText(ctx, "戻る", w / 2 - 230, y, {
          size: 22,
          color: isSelected ? "#ffffff" : "#cccccc",
          align: "left",
        });
      }
    }
  }

  exit(): void {
    if (this.clickHandler) {
      document.querySelector("canvas")?.removeEventListener("click", this.clickHandler);
      this.clickHandler = null;
    }
  }
}
