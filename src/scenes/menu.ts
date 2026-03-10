import type { Scene, SceneManager } from "../core/scene.ts";
import type { GamepadInput } from "../core/gamepad.ts";
import { drawText } from "../core/canvas.ts";
import { getHighScore } from "../core/score.ts";
import { SimonSaysGame } from "../games/simon-says.ts";
import { SpeedTypingGame } from "../games/speed-typing.ts";
import { TrillBattleGame } from "../games/trill-battle.ts";
import { ConfigScene } from "./config.ts";

interface MenuEntry {
  id: string;
  name: string;
  available: boolean;
  factory: (() => Scene) | null;
  isGame: boolean;
}

const START_Y = 220;
const LINE_HEIGHT = 60;

export class MenuScene implements Scene {
  private cursor = 0;
  private entries: MenuEntry[];
  private clickHandler: ((e: MouseEvent) => void) | null = null;

  constructor(
    private input: GamepadInput,
    private scenes: SceneManager,
  ) {
    this.entries = [
      {
        id: "simon-says",
        name: "Simon Says",
        available: true,
        isGame: true,
        factory: () => new SimonSaysGame(this.input, () => this.returnToMenu()),
      },
      {
        id: "speed-typing",
        name: "Speed Typing",
        available: true,
        isGame: true,
        factory: () => new SpeedTypingGame(this.input, () => this.returnToMenu()),
      },
      {
        id: "trill-battle",
        name: "Trill Battle",
        available: true,
        isGame: true,
        factory: () => new TrillBattleGame(this.input, () => this.returnToMenu()),
      },
      {
        id: "config",
        name: "コントローラー設定",
        available: true,
        isGame: false,
        factory: () => new ConfigScene(this.input, this.scenes, () => this.returnToMenu()),
      },
    ];
  }

  enter(): void {
    this.cursor = 0;
    this.clickHandler = (e: MouseEvent) => {
      const canvas = e.target as HTMLCanvasElement;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;
      const w = canvas.width;

      for (let i = 0; i < this.entries.length; i++) {
        const ey = START_Y + i * LINE_HEIGHT;
        if (x >= w / 2 - 280 && x <= w / 2 + 280 && y >= ey - 22 && y <= ey + 22) {
          const entry = this.entries[i];
          if (entry.available && entry.factory) {
            this.scenes.changeScene(entry.factory());
          }
          break;
        }
      }
    };
    document.querySelector("canvas")?.addEventListener("click", this.clickHandler);
  }

  update(_dt: number): void {
    if (this.input.isPickDownJustPressed()) {
      this.cursor = (this.cursor + 1) % this.entries.length;
    }
    if (this.input.isPickUpJustPressed()) {
      this.cursor =
        (this.cursor - 1 + this.entries.length) % this.entries.length;
    }

    // START button to select
    if (this.input.isStartJustPressed()) {
      const selected = this.entries[this.cursor];
      if (selected.available && selected.factory) {
        this.scenes.changeScene(selected.factory());
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;

    // Background
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, w, h);

    // Title
    drawText(ctx, "GuitarFreaks Mini-Games", w / 2, 80, {
      size: 48,
      color: "#ffffff",
    });

    // Controller status
    if (!this.input.isConnected()) {
      drawText(ctx, "コントローラーを接続してください", w / 2, 140, {
        size: 20,
        color: "#ff6666",
      });
    } else {
      drawText(ctx, "コントローラー接続済み", w / 2, 140, {
        size: 20,
        color: "#66ff66",
      });
    }

    // Instructions
    drawText(ctx, "Pick Up/Down: カーソル移動  |  START: 決定", w / 2, h - 40, {
      size: 16,
      color: "#888888",
    });

    // Game list
    const startY = START_Y;
    const lineHeight = LINE_HEIGHT;

    for (let i = 0; i < this.entries.length; i++) {
      const game = this.entries[i];
      const y = startY + i * lineHeight;
      const isSelected = i === this.cursor;

      // Highlight bar
      if (isSelected) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
        ctx.beginPath();
        ctx.roundRect(w / 2 - 280, y - 22, 560, 44, 8);
        ctx.fill();
      }

      // Cursor indicator
      if (isSelected) {
        drawText(ctx, ">", w / 2 - 250, y, {
          size: 28,
          color: "#ffdd44",
          align: "left",
        });
      }

      // Game name
      const nameColor = game.available
        ? isSelected
          ? "#ffffff"
          : "#cccccc"
        : "#666666";
      drawText(ctx, game.name, w / 2 - 220, y, {
        size: 28,
        color: nameColor,
        align: "left",
      });

      // High Score (games only)
      if (game.isGame && game.available) {
        const highScore = getHighScore(game.id);
        if (highScore > 0) {
          drawText(ctx, `HI: ${highScore}`, w / 2 + 240, y, {
            size: 18,
            color: "#ffdd44",
            align: "right",
          });
        }
      }
    }
  }

  private returnToMenu(): void {
    this.scenes.changeScene(new MenuScene(this.input, this.scenes));
  }

  exit(): void {
    if (this.clickHandler) {
      document.querySelector("canvas")?.removeEventListener("click", this.clickHandler);
      this.clickHandler = null;
    }
  }
}
