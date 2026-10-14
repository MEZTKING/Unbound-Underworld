import { clamp, damp, type Vec } from './math';

export class Camera {
  x = 0;
  y = 0;
  /** World units → CSS pixels. */
  zoom = 1;
  /** Viewport size in CSS pixels. */
  vw = 1280;
  vh = 720;
  private trauma = 0;
  private kickX = 0;
  private kickY = 0;
  shakeScale = 1;
  ox = 0;
  oy = 0;
  private t = 0;

  resize(w: number, h: number): void {
    this.vw = w;
    this.vh = h;
    // Show roughly 1280x760 world units; fill the larger dimension.
    this.zoom = Math.min(w / 1280, h / 760);
    this.zoom = Math.max(0.35, this.zoom);
  }

  /** Visible world width/height. */
  get viewW(): number {
    return this.vw / this.zoom;
  }
  get viewH(): number {
    return this.vh / this.zoom;
  }

  shake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  kick(dir: Vec, amount: number): void {
    this.kickX += dir.x * amount;
    this.kickY += dir.y * amount;
  }

  snap(target: Vec, bounds?: { w: number; h: number }): void {
    this.x = target.x;
    this.y = target.y;
    if (bounds) this.clampTo(bounds);
  }

  follow(target: Vec, dt: number, bounds: { w: number; h: number }, lead: Vec = { x: 0, y: 0 }): void {
    this.x = damp(this.x, target.x + lead.x, 6, dt);
    this.y = damp(this.y, target.y + lead.y, 6, dt);
    this.clampTo(bounds);
    this.t += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const s = this.trauma * this.trauma * 22 * this.shakeScale;
    this.ox = (Math.sin(this.t * 71.3) + Math.sin(this.t * 37.9) * 0.5) * s + this.kickX;
    this.oy = (Math.cos(this.t * 63.1) + Math.cos(this.t * 29.3) * 0.5) * s + this.kickY;
    this.kickX = damp(this.kickX, 0, 18, dt);
    this.kickY = damp(this.kickY, 0, 18, dt);
  }

  private clampTo(b: { w: number; h: number }): void {
    const pad = 160;
    const hw = this.viewW / 2;
    const hh = this.viewH / 2;
    const minX = -pad + hw;
    const maxX = b.w + pad - hw;
    const minY = -pad * 1.6 + hh;
    const maxY = b.h + pad - hh;
    this.x = minX > maxX ? b.w / 2 : clamp(this.x, minX, maxX);
    this.y = minY > maxY ? b.h / 2 - pad * 0.3 : clamp(this.y, minY, maxY);
  }

  apply(ctx: CanvasRenderingContext2D, dpr: number): void {
    const z = this.zoom * dpr;
    ctx.setTransform(z, 0, 0, z, (this.vw / 2) * dpr - (this.x + this.ox) * z, (this.vh / 2) * dpr - (this.y + this.oy) * z);
  }

  screenToWorld(p: Vec): Vec {
    return {
      x: (p.x - this.vw / 2) / this.zoom + this.x + this.ox,
      y: (p.y - this.vh / 2) / this.zoom + this.y + this.oy,
    };
  }

  worldToScreen(p: Vec): Vec {
    return {
      x: (p.x - this.x - this.ox) * this.zoom + this.vw / 2,
      y: (p.y - this.y - this.oy) * this.zoom + this.vh / 2,
    };
  }
}
