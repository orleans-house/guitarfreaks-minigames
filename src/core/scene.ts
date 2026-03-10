export interface Scene {
  enter(): void;
  update(dt: number): void;
  draw(ctx: CanvasRenderingContext2D): void;
  exit(): void;
}

export class SceneManager {
  private current: Scene | null = null;

  changeScene(next: Scene): void {
    if (this.current) {
      this.current.exit();
    }
    this.current = next;
    this.current.enter();
  }

  tick(dt: number, ctx: CanvasRenderingContext2D): void {
    if (this.current) {
      this.current.update(dt);
      this.current.draw(ctx);
    }
  }
}
