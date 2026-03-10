import { createFullscreenCanvas } from "./core/canvas.ts";
import { GamepadInput } from "./core/gamepad.ts";
import { SceneManager } from "./core/scene.ts";
import { MenuScene } from "./scenes/menu.ts";

function main(): void {
  const canvas = createFullscreenCanvas();
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to get 2D context");
  }

  const input = new GamepadInput();
  const scenes = new SceneManager();

  // Start with menu scene
  scenes.changeScene(new MenuScene(input, scenes));

  let lastTime = performance.now();

  function loop(now: number): void {
    const dt = now - lastTime;
    lastTime = now;

    // Poll gamepad every frame
    input.poll();

    // Clear canvas
    ctx!.clearRect(0, 0, canvas.width, canvas.height);

    // Update and draw current scene
    scenes.tick(dt, ctx!);

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}

main();
