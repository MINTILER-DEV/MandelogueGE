import { Script } from "@mge/core";

type RendererLike = {
  bounds(): { height: number; width: number };
};

export default class PlayerController extends Script {
  speed = 220;

  override update(dt: number): void {
    let velocityX = 0;
    let velocityY = 0;

    if (this.input.keyDown("ArrowLeft") || this.input.keyDown("KeyA")) {
      velocityX -= this.speed;
    }

    if (this.input.keyDown("ArrowRight") || this.input.keyDown("KeyD")) {
      velocityX += this.speed;
    }

    if (this.input.keyDown("ArrowUp") || this.input.keyDown("KeyW")) {
      velocityY -= this.speed;
    }

    if (this.input.keyDown("ArrowDown") || this.input.keyDown("KeyS")) {
      velocityY += this.speed;
    }

    this.transform.x += velocityX * dt;
    this.transform.y += velocityY * dt;

    const renderer = this.requireService<RendererLike>("renderer");
    const bounds = renderer.bounds();
    this.transform.x = Math.max(16, Math.min(this.transform.x, bounds.width - 72));
    this.transform.y = Math.max(16, Math.min(this.transform.y, bounds.height - 72));
  }
}
