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
  /**
   * The view angle. The flat 2D view looks straight down (yaw 0, nothing
   * squashed, height drawn 1:1 as screen-up). The 3D view turns the room by
   * `yaw` and tilts down by `pitch`: ground depth shrinks by sin(pitch)
   * (`yScale`) and height by cos(pitch) (`zScale`).
   */
  yaw = 0;
  yScale = 1;
  zScale = 1;
  private cos = 1;
  private sin = 0;
  /** Extra zoom (the voxel view sits a little closer). */
  viewScale = 1;
  /** Party play: zooms out (below 1) to keep spread-out heroes in view. */
  private fitK = 1;
  private baseZoom = 1;
  ox = 0;
  oy = 0;
  private t = 0;

  /** Sets the view angle; `pitch` null is the flat 2D view. */
  setAngle(yaw: number, pitch: number | null): void {
    this.yaw = pitch === null ? 0 : yaw;
    this.cos = Math.cos(this.yaw);
    this.sin = Math.sin(this.yaw);
    this.yScale = pitch === null ? 1 : Math.sin(pitch);
    this.zScale = pitch === null ? 1 : Math.cos(pitch);
  }

  resize(w: number, h: number): void {
    this.vw = w;
    this.vh = h;
    // Show roughly 1280x760 world units; fill the larger dimension.
    this.zoom = Math.min(w / 1280, h / 760);
    // Small (phone) screens zoom in a little so characters stay readable.
    if (Math.min(w, h) < 560) this.zoom = Math.max(this.zoom, Math.min(w / 1000, h / 600));
    this.baseZoom = Math.max(0.35, this.zoom) * this.viewScale;
    this.zoom = this.baseZoom * this.fitK;
  }

  /** Party play: the zoom-out that keeps every hero in view (1 = none). */
  get fit(): number {
    return this.fitK;
  }
  set fit(k: number) {
    this.fitK = k;
    this.zoom = this.baseZoom * k;
  }

  /** Visible world width/height. */
  get viewW(): number {
    return this.vw / this.zoom;
  }
  get viewH(): number {
    return this.vh / (this.zoom * this.yScale);
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
    if (this.yaw !== 0) {
      // Turned rooms are diamonds on screen: keep the view centred over the floor.
      const ix = Math.min(b.w / 2, 140);
      const iy = Math.min(b.h / 2, 120);
      this.x = clamp(this.x, ix, b.w - ix);
      this.y = clamp(this.y, iy - 60, b.h - iy);
      return;
    }
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
    const zy = z * this.yScale;
    const a = z * this.cos;
    const c = -z * this.sin;
    const b = zy * this.sin;
    const d = zy * this.cos;
    const cx = this.x + this.ox;
    const cy = this.y + this.oy;
    ctx.setTransform(a, b, c, d, (this.vw / 2) * dpr - (a * cx + c * cy), (this.vh / 2) * dpr - (b * cx + d * cy));
  }

  screenToWorld(p: Vec): Vec {
    const rx = (p.x - this.vw / 2) / this.zoom;
    const ry = (p.y - this.vh / 2) / (this.zoom * this.yScale);
    return {
      x: this.cos * rx + this.sin * ry + this.x + this.ox,
      y: -this.sin * rx + this.cos * ry + this.y + this.oy,
    };
  }

  worldToScreen(p: Vec): Vec {
    const dx = p.x - this.x - this.ox;
    const dy = p.y - this.y - this.oy;
    return {
      x: (this.cos * dx - this.sin * dy) * this.zoom + this.vw / 2,
      y: (this.sin * dx + this.cos * dy) * this.zoom * this.yScale + this.vh / 2,
    };
  }

  /**
   * The ground offset that appears straight up on screen by `z` units of
   * height. 2D effects draw a point at height z at (x, y) + z·lift. In the
   * flat view this is (0, -z), the old "y - z".
   */
  get lift(): Vec {
    const k = -this.zScale / this.yScale;
    return { x: this.sin * k, y: this.cos * k };
  }

  /** A screen direction (e.g. "up" on the stick) as a world direction. */
  screenDirToWorld(v: Vec): Vec {
    return { x: this.cos * v.x + this.sin * v.y, y: -this.sin * v.x + this.cos * v.y };
  }
}
