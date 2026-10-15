import { fx, TAU } from './math';

export type ParticleKind = 'dot' | 'spark' | 'ring' | 'smoke' | 'ember' | 'text' | 'slash' | 'shard';

export interface Particle {
  kind: ParticleKind;
  x: number;
  y: number;
  /** Height above ground (draws upward). */
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  size: number;
  size2: number;
  color: string;
  drag: number;
  gravity: number;
  additive: boolean;
  text?: string;
  angle: number;
  spin: number;
}

export class Particles {
  list: Particle[] = [];
  /** Camera.lift: where height goes on the ground plane ((0, -1) in the flat view). */
  liftX = 0;
  liftY = -1;
  /** Zoom × pixel ratio when the view is turned or squashed, so text is drawn upright; 0 otherwise. */
  uprightScale = 0;
  private cap = 1400;

  spawn(p: Partial<Particle> & { x: number; y: number }): Particle {
    const q: Particle = {
      kind: 'dot',
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      life: 0.5,
      max: p.life ?? 0.5,
      size: 3,
      size2: 0,
      color: '#fff',
      drag: 3,
      gravity: 0,
      additive: true,
      angle: 0,
      spin: 0,
      ...p,
    };
    q.max = q.life;
    if (this.list.length >= this.cap) this.list.shift();
    this.list.push(q);
    return q;
  }

  burst(x: number, y: number, color: string, n: number, speed = 220, opts: Partial<Particle> = {}): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const s = speed * (0.35 + Math.random() * 0.65);
      this.spawn({
        kind: 'spark',
        x,
        y,
        z: 18,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        vz: fx.range(-40, 120),
        gravity: 300,
        life: fx.range(0.25, 0.55),
        size: fx.range(1.5, 3),
        color,
        drag: 4,
        ...opts,
      });
    }
  }

  directional(x: number, y: number, angle: number, spread: number, color: string, n: number, speed = 300, opts: Partial<Particle> = {}): void {
    for (let i = 0; i < n; i++) {
      const a = angle + fx.range(-spread, spread);
      const s = speed * (0.4 + Math.random() * 0.6);
      this.spawn({
        kind: 'spark',
        x,
        y,
        z: 20,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        vz: fx.range(0, 140),
        gravity: 420,
        life: fx.range(0.2, 0.45),
        size: fx.range(1.5, 3),
        color,
        drag: 5,
        ...opts,
      });
    }
  }

  ring(x: number, y: number, color: string, radius: number, life = 0.35, width = 4): void {
    this.spawn({ kind: 'ring', x, y, size: 4, size2: radius, life, color, drag: 0, angle: width });
  }

  /** Floating text `h` units above the ground point (x, y). */
  text(x: number, y: number, h: number, text: string, color: string, size = 18): void {
    this.spawn({
      kind: 'text',
      x: x + fx.range(-10, 10),
      y,
      z: 40 + h,
      vx: fx.range(-30, 30),
      vy: 0,
      vz: 160,
      gravity: 380,
      drag: 1.5,
      life: 0.8,
      size,
      color,
      text,
      additive: false,
    });
  }

  update(dt: number): void {
    const l = this.list;
    let w = 0;
    for (let i = 0; i < l.length; i++) {
      const p = l[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      const d = Math.exp(-p.drag * dt);
      p.vx *= d;
      p.vy *= d;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vz -= p.gravity * dt;
      p.z += p.vz * dt;
      if (p.z < 0 && p.kind !== 'smoke') {
        p.z = 0;
        p.vz *= -0.3;
      }
      p.angle += p.spin * dt;
      l[w++] = p;
    }
    l.length = w;
  }

  draw(ctx: CanvasRenderingContext2D, layer: 'ground' | 'air'): void {
    const lx = this.liftX;
    const ly = this.liftY;
    for (const p of this.list) {
      const ground = p.kind === 'ring' || p.kind === 'smoke';
      const X = p.x + p.z * lx;
      const Y = p.y + p.z * ly;
      if ((layer === 'ground') !== ground) continue;
      const t = p.life / p.max;
      ctx.globalCompositeOperation = p.additive ? 'lighter' : 'source-over';
      switch (p.kind) {
        case 'dot':
        case 'ember': {
          ctx.globalAlpha = Math.min(1, t * 2);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(X, Y, p.size * (p.kind === 'ember' ? t : 1), 0, TAU);
          ctx.fill();
          break;
        }
        case 'spark': {
          ctx.globalAlpha = Math.min(1, t * 2);
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(X, Y);
          ctx.lineTo(X - (p.vx + p.vz * lx) * 0.04, Y - (p.vy + p.vz * ly) * 0.04);
          ctx.stroke();
          break;
        }
        case 'ring': {
          const r = p.size + (p.size2 - p.size) * (1 - t * t);
          ctx.globalAlpha = t;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.angle * t + 0.5;
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, r, r * 0.92, 0, 0, TAU);
          ctx.stroke();
          break;
        }
        case 'smoke': {
          ctx.globalAlpha = t * 0.35;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(X, Y, p.size * (1.6 - t * 0.6), 0, TAU);
          ctx.fill();
          break;
        }
        case 'slash': {
          ctx.globalAlpha = t;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size * t;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(X - Math.cos(p.angle) * p.size2, Y - Math.sin(p.angle) * p.size2);
          ctx.lineTo(X + Math.cos(p.angle) * p.size2, Y + Math.sin(p.angle) * p.size2);
          ctx.stroke();
          break;
        }
        case 'shard': {
          ctx.globalAlpha = Math.min(1, t * 2);
          ctx.fillStyle = p.color;
          ctx.save();
          ctx.translate(X, Y);
          ctx.rotate(p.angle);
          ctx.fillRect(-p.size, -p.size * 0.4, p.size * 2, p.size * 0.8);
          ctx.restore();
          break;
        }
        case 'text': {
          ctx.globalAlpha = Math.min(1, t * 3);
          const pop = 1 + Math.max(0, (t - 0.8) * 3);
          ctx.font = `700 ${Math.round(p.size * pop)}px "Cinzel", Georgia, serif`;
          ctx.textAlign = 'center';
          ctx.lineWidth = 4;
          ctx.strokeStyle = 'rgba(0,0,0,0.85)';
          ctx.save();
          if (this.uprightScale) {
            // Unturned and unsquashed, at the point's place on screen.
            const m = ctx.getTransform();
            const k = this.uprightScale;
            ctx.setTransform(k, 0, 0, k, m.a * X + m.c * Y + m.e, m.b * X + m.d * Y + m.f);
          } else ctx.translate(X, Y);
          ctx.strokeText(p.text ?? '', 0, 0);
          ctx.fillStyle = p.color;
          ctx.fillText(p.text ?? '', 0, 0);
          ctx.restore();
          break;
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  clear(): void {
    this.list.length = 0;
  }
}
