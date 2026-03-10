import type { Scene, SceneManager } from "../core/scene.ts";
import type { GamepadInput, NeckKey } from "../core/gamepad.ts";
import { drawText } from "../core/canvas.ts";
import { getHighScore } from "../core/score.ts";
import { SimonSaysGame } from "../games/simon-says.ts";
import { SpeedTypingGame } from "../games/speed-typing.ts";
import { TrillBattleGame } from "../games/trill-battle.ts";

interface GameEntry {
  id: string;
  name: string;
  available: boolean;
  factory: (() => Scene) | null;
}

export class MenuScene implements Scene {
  private cursor = 0;
  private games: GameEntry[];

  constructor(
    private input: GamepadInput,
    private scenes: SceneManager,
  ) {
    this.games = [
      {
        id: "simon-says",
        name: "Simon Says",
        available: true,
        factory: () => new SimonSaysGame(this.input, () => this.returnToMenu()),
      },
      {
        id: "speed-typing",
        name: "Speed Typing",
        available: true,
        factory: () => new SpeedTypingGame(this.input, () => this.returnToMenu()),
      },
      {
        id: "trill-battle",
        name: "Trill Battle",
        available: true,
        factory: () => new TrillBattleGame(this.input, () => this.returnToMenu()),
      },
    ];
  }

  enter(): void {
    this.cursor = 0;
  }

  update(_dt: number): void {
    if (this.input.isPickDownJustPressed()) {
      this.cursor = (this.cursor + 1) % this.games.length;
    }
    if (this.input.isPickUpJustPressed()) {
      this.cursor =
        (this.cursor - 1 + this.games.length) % this.games.length;
    }

    // Any neck button to select
    const justPressed = this.input.getNeckJustPressed();
    const anyPressed = (Object.keys(justPressed) as NeckKey[]).some(
      (k) => justPressed[k],
    );

    if (anyPressed) {
      const selected = this.games[this.cursor];
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
    drawText(ctx, "Pick Up/Down: カーソル移動  |  ネックボタン: 決定", w / 2, h - 40, {
      size: 16,
      color: "#888888",
    });

    // Game list
    const startY = 220;
    const lineHeight = 60;

    for (let i = 0; i < this.games.length; i++) {
      const game = this.games[i];
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

      // Coming Soon or High Score
      if (!game.available) {
        drawText(ctx, "Coming Soon", w / 2 + 240, y, {
          size: 18,
          color: "#666666",
          align: "right",
        });
      } else {
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
    // Nothing to clean up
  }
}
