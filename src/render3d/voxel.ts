// The voxel view: rooms, props and characters as lit blocks, rendered with
// three.js. The camera looks straight north and 45° down, so world x stays
// screen x and the 2D overlay (effects, text, health bars) lines up with
// Camera.yScale = √½. three.js axes: X = world x, Y = height, Z = world y.

import * as THREE from 'three';
import type { Camera } from '../engine/camera';
import { angleDiff } from '../engine/math';
import type { Actor } from '../game/actor';
import type { Ally } from '../game/artifacts';
import type { Enemy } from '../game/enemies/enemy';
import type { Player } from '../game/player';
import { rewardColor } from '../game/render';
import { DOOR_W, TRAP_SIZE } from '../game/rooms';
import { WEAPON_INFO } from '../game/weapons';
import type { Breakable, Interactable, Trap, World } from '../game/world';

export type VoxelQuality = 'high' | 'balanced';

const B = 40;
const CAM_DIST = 3000;
const WALL_ROWS = 3;
/** Figures are drawn a little larger than their hit size so they read well. */
const FIGURE_SCALE = 1.15;
/** Point lights kept in the scene at all times, so shaders never recompile. */
const LIGHTS = { high: 8, balanced: 1 };

const BOX = new THREE.BoxGeometry(1, 1, 1);
const PLANE = new THREE.PlaneGeometry(1, 1);

/** Soft gradients for unlit glows (drawn once, shared). */
let radialTex: THREE.Texture | null = null;
let riseTex: THREE.Texture | null = null;
function gradientTexture(kind: 'radial' | 'rise'): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = kind === 'radial' ? g.createRadialGradient(32, 32, 0, 32, 32, 32) : g.createLinearGradient(0, 64, 0, 0);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(kind === 'radial' ? 0.45 : 0.3, 'rgba(255,255,255,0.4)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const radialGlow = () => (radialTex ??= gradientTexture('radial'));
const riseGlow = () => (riseTex ??= gradientTexture('rise'));

/**
 * A door in the north wall. Its glow is unlit geometry (a portal in the
 * doorway and a spill of light on the floor) that fades in and out, plus a
 * point light from slots kept for doors, so nothing pops or flickers.
 */
interface DoorView {
  x: number;
  g: THREE.Group;
  bars: THREE.Group;
  portal: THREE.MeshBasicMaterial;
  spill: THREE.MeshBasicMaterial;
  edge: THREE.MeshBasicMaterial;
  trim: THREE.Color;
  color: THREE.Color;
  /** 0..1: how lit the door is (eases toward open-with-a-reward). */
  k: number;
}
const DISC = new THREE.CircleGeometry(1, 18).rotateX(-Math.PI / 2);

function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function shade(hex: string, k: number): THREE.Color {
  return new THREE.Color(hex).multiplyScalar(k);
}

/** Frees the materials (geometry is shared) of everything under `o`. */
function disposeTree(o: THREE.Object3D): void {
  o.traverse((c) => {
    if (c instanceof THREE.InstancedMesh) c.dispose();
    if (c instanceof THREE.Mesh) {
      const m = c.material as THREE.Material | THREE.Material[];
      if (Array.isArray(m)) m.forEach((x) => x.dispose());
      else m.dispose();
    }
  });
}

// ---------------------------------------------------------------- block batches

/** Collects boxes and turns them into one instanced mesh per material. */
class Blocks {
  private items: { m: THREE.Matrix4; c: THREE.Color }[] = [];
  private q = new THREE.Quaternion();

  add(x: number, y: number, z: number, w: number, h: number, d: number, color: THREE.Color | string): void {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), this.q, new THREE.Vector3(w, h, d));
    this.items.push({ m, c: typeof color === 'string' ? new THREE.Color(color) : color });
  }

  build(material: THREE.Material): THREE.InstancedMesh | null {
    if (!this.items.length) return null;
    const mesh = new THREE.InstancedMesh(BOX, material, this.items.length);
    this.items.forEach((it, i) => {
      mesh.setMatrixAt(i, it.m);
      mesh.setColorAt(i, it.c);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    return mesh;
  }
}

// ---------------------------------------------------------------- figures

interface Rig {
  root: THREE.Group;
  body: THREE.Group;
  legs: THREE.Object3D[];
  /** Lower legs (hero only): bend at the knee while striding. */
  knees: THREE.Object3D[];
  /** Turns the legs toward the way you run when it differs from facing. */
  hips: THREE.Object3D | null;
  arms: THREE.Object3D[];
  head: THREE.Object3D | null;
  /** Parts that animate on their own (flames, fuses, lids, orbiting motes). */
  bits: Record<string, THREE.Object3D>;
  mats: THREE.MeshLambertMaterial[];
  shadow: THREE.Mesh;
  unit: number;
  kind: Look['kind'];
  walk: number;
  /** Smoothed hip turn and time (for breathing while idle). */
  turn: number;
  idle: number;
  seen: number;
  weapon: string;
  /** The hero palette this rig was built with (rebuilt when it changes). */
  look?: string;
}

interface Look {
  kind: 'humanoid' | 'quad' | 'floater' | 'blob' | 'spider' | 'serpent' | 'chest' | 'dummy' | 'hydra';
  body: string;
  head?: string;
  limb?: string;
  accent?: string;
  eye?: string;
  bulk?: number;
  robe?: boolean;
  hunch?: boolean;
  horns?: boolean;
  shield?: boolean;
  crest?: boolean;
  staff?: string;
  tail?: boolean;
  heads?: number;
  glow?: string;
}

/** Foes by name. Unknown names fall back to a plain humanoid. */
const LOOKS: Record<string, Look> = {
  Ghoul: { kind: 'humanoid', body: '#4a2a4e', head: '#6a3a6e', limb: '#3a1e3e', eye: '#ffcf4a', hunch: true },
  Numbling: { kind: 'quad', body: '#5a3a30', head: '#d8c8b0', limb: '#2a1418', eye: '#ff4a3a' },
  Brute: { kind: 'humanoid', body: '#5a3a34', head: '#7a4e44', limb: '#3e2a28', accent: '#d8c8a8', eye: '#ff5a3a', bulk: 1.5, hunch: true },
  Wisp: { kind: 'floater', body: '#3a1a24', eye: '#ffb08a', glow: '#ff6a4a' },
  Lobber: { kind: 'humanoid', body: '#3a4a30', head: '#5a6a40', limb: '#2a2a2a', accent: '#2a2a2a', eye: '#ffd04a', bulk: 1.15 },
  Sentinel: { kind: 'humanoid', body: '#2a2238', head: '#7a3a6a', limb: '#2a2238', eye: '#ff6ad0', robe: true, staff: '#ff6ad0' },
  Gorgehorn: { kind: 'quad', body: '#3a3040', head: '#5a4a5a', limb: '#2a2230', accent: '#e8dcc8', eye: '#ff4a3a', horns: true },
  'Gilded Hoplite': { kind: 'humanoid', body: '#c8a040', head: '#d8c070', limb: '#7a5a20', accent: '#e04040', eye: '#ffe0a0', shield: true, crest: true },
  Hissling: { kind: 'blob', body: '#2a3020', head: '#3a4a2a', eye: '#ff4a3a', accent: '#ffd04a' },
  Weaver: { kind: 'spider', body: '#2a2030', head: '#3a2a40', limb: '#4a3a50', eye: '#ff4a6a' },
  Bonecaller: { kind: 'humanoid', body: '#1e2a30', head: '#d8d0c0', limb: '#d8d0c0', eye: '#7dff8a', robe: true, staff: '#7dff8a' },
  Mimic: { kind: 'chest', body: '#6a4020', accent: '#d8a040', eye: '#ff3a3a' },
  'Old Bones': { kind: 'dummy', body: '#6a5040', head: '#e8e0d0', eye: '#2a1a1a' },
  'Maw Head': { kind: 'serpent', body: '#6a3a1a', head: '#7a4a24', eye: '#ff8a2a' },
  'The Many-Maw': { kind: 'hydra', body: '#5a3a20', head: '#6a4428', eye: '#ffe04a' },
  Vexa: { kind: 'humanoid', body: '#2a0e1c', head: '#5a1a2e', limb: '#5a1a2e', accent: '#c8a0a8', eye: '#ff6a8a', bulk: 1.4, tail: true, horns: true },
  Aurex: { kind: 'humanoid', body: '#6a4a2a', head: '#8a5a2a', limb: '#5a3a1a', accent: '#c88a3a', eye: '#ff6a2a', bulk: 1.5 },
  Threefang: { kind: 'quad', body: '#3a2c4a', head: '#4a3a5e', limb: '#241c30', accent: '#ff7a3a', eye: '#ff4a2a', heads: 3, tail: true },
};
const DEFAULT_LOOK: Look = { kind: 'humanoid', body: '#4a4050', head: '#6a6070', eye: '#ffd04a' };
const UNIT: Record<Look['kind'], number> = { humanoid: 56, quad: 30, floater: 50, blob: 34, spider: 26, serpent: 70, chest: 40, dummy: 56, hydra: 120 };

class RigBuilder {
  readonly mats: THREE.MeshLambertMaterial[] = [];
  private cache = new Map<string, THREE.MeshLambertMaterial>();
  constructor(private shadows: boolean) {}

  mat(color: string): THREE.MeshLambertMaterial {
    let m = this.cache.get(color);
    if (!m) {
      m = new THREE.MeshLambertMaterial({ color });
      this.cache.set(color, m);
      this.mats.push(m);
    }
    return m;
  }

  /** A box of size (w, h, d) centred at (x, y, z) in `parent`. */
  box(parent: THREE.Object3D, color: string, w: number, h: number, d: number, x: number, y: number, z: number): THREE.Mesh {
    const m = new THREE.Mesh(BOX, this.mat(color));
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    m.castShadow = this.shadows;
    parent.add(m);
    return m;
  }

  /** An unlit, glowing box (eyes, flames, gems). */
  glow(parent: THREE.Object3D, color: string, w: number, h: number, d: number, x: number, y: number, z: number, opacity = 1): THREE.Mesh {
    const m = new THREE.Mesh(BOX, new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 }));
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }

  /** A joint at (x, y, z) with a limb box hanging below it. */
  limb(parent: THREE.Object3D, color: string, w: number, len: number, d: number, x: number, y: number, z: number): THREE.Group {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    this.box(g, color, w, len, d, 0, -len / 2, 0);
    parent.add(g);
    return g;
  }

  eyes(parent: THREE.Object3D, color: string, y: number, z: number, gap: number, size = 2.6): void {
    this.glow(parent, color, size, size, 1, -gap / 2, y, z);
    this.glow(parent, color, size, size, 1, gap / 2, y, z);
  }
}

function newRig(kind: Look['kind'], unit: number, b: RigBuilder, shadowMat: THREE.Material): Rig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const shadow = new THREE.Mesh(DISC, shadowMat);
  shadow.renderOrder = -1;
  return { root, body, legs: [], knees: [], hips: null, arms: [], head: null, bits: {}, mats: b.mats, shadow, unit, kind, walk: 0, turn: 0, idle: 0, seen: 0, weapon: '' };
}

function buildEnemyRig(look: Look, b: RigBuilder, shadowMat: THREE.Material): Rig {
  const rig = newRig(look.kind, UNIT[look.kind], b, shadowMat);
  const g = rig.body;
  const head = look.head ?? look.body;
  const limb = look.limb ?? look.body;
  const eye = look.eye ?? '#ffd04a';
  switch (look.kind) {
    case 'humanoid': {
      const k = look.bulk ?? 1;
      if (look.robe) {
        b.box(g, look.body, 20 * k, 22, 16, 0, 11, 0);
        b.box(g, shadeHex(look.body, 0.7), 22 * k, 3, 18, 0, 2, 0);
      } else {
        rig.legs.push(b.limb(g, limb, 7 * k, 18, 8, -5 * k, 18, 0), b.limb(g, limb, 7 * k, 18, 8, 5 * k, 18, 0));
      }
      const torso = new THREE.Group();
      torso.position.set(0, 18, 0);
      if (look.hunch) torso.rotation.x = 0.3;
      g.add(torso);
      b.box(torso, look.body, 18 * k, 20, 11 * k, 0, 10, 0);
      if (look.accent && !look.robe) b.box(torso, look.accent, 18.5 * k, 3, 11.5 * k, 0, 2, 0);
      rig.arms.push(b.limb(torso, limb, 6 * k, 18, 6, -(9 * k + 3), 18, 0), b.limb(torso, limb, 6 * k, 18, 6, 9 * k + 3, 18, 0));
      const h = new THREE.Group();
      h.position.set(0, 20, look.hunch ? 3 : 0);
      torso.add(h);
      b.box(h, head, 13, 13, 13, 0, 6.5, 0);
      b.eyes(h, eye, 7, 6.6, 6);
      if (look.horns) {
        b.box(h, look.accent ?? '#d8c8b8', 3, 8, 3, -6, 15, 0).rotation.z = 0.4;
        b.box(h, look.accent ?? '#d8c8b8', 3, 8, 3, 6, 15, 0).rotation.z = -0.4;
      }
      if (look.crest) b.box(h, look.accent ?? '#e04040', 3, 7, 16, 0, 16, -1);
      if (look.accent && look.bulk && look.bulk > 1.3 && !look.horns) {
        // tusks / jaw plate
        b.box(h, look.accent, 3, 4, 2, -4, 1.5, 7);
        b.box(h, look.accent, 3, 4, 2, 4, 1.5, 7);
      }
      if (look.shield) {
        const s = b.box(rig.arms[1], look.body, 3, 24, 20, 4, -12, 3);
        s.add(new THREE.Mesh(BOX, b.mat(look.accent ?? '#e04040'))).scale.set(1.1, 0.25, 0.25);
      }
      if (look.staff) {
        b.box(rig.arms[0], '#3a2a20', 2.5, 50, 2.5, 0, -16, 4);
        rig.bits.orb = b.glow(rig.arms[0], look.staff, 6, 6, 6, 0, 10, 4);
      }
      if (look.tail) {
        const t = new THREE.Group();
        t.position.set(0, 20, -6);
        g.add(t);
        for (let i = 0; i < 5; i++) b.box(t, i === 4 ? (look.accent ?? look.body) : look.body, 6 - i * 0.6, 6 - i * 0.6, 8, 0, i * 5, -6 - i * 6);
        rig.bits.tail = t;
      }
      rig.head = h;
      break;
    }
    case 'quad': {
      const heads = look.heads ?? 1;
      b.box(g, look.body, 18, 14, 32, 0, 17, 0);
      b.box(g, shadeHex(look.body, 1.15), 16, 3, 28, 0, 25, 0);
      for (const [x, z] of [
        [-6, 11],
        [6, 11],
        [-6, -11],
        [6, -11],
      ])
        rig.legs.push(b.limb(g, limb, 5, 11, 5, x, 11, z));
      const head = new THREE.Group();
      head.position.set(0, 20, 16);
      g.add(head);
      for (let i = 0; i < heads; i++) {
        const hx = heads === 1 ? 0 : (i - 1) * 11;
        b.box(head, look.head ?? look.body, 11, 11, 14, hx, 4, 6);
        b.box(head, shadeHex(look.head ?? look.body, 0.8), 7, 5, 6, hx, 0, 14);
        b.eyes(head, eye, 6, 13.1, 5, 2.2);
        if (look.horns) {
          b.box(head, look.accent ?? '#e8dcc8', 3, 3, 10, hx - 5, 10, 10).rotation.x = -0.5;
          b.box(head, look.accent ?? '#e8dcc8', 3, 3, 10, hx + 5, 10, 10).rotation.x = -0.5;
        }
      }
      if (heads > 1) rig.bits.fire = b.glow(head, look.accent ?? '#ff7a3a', 30, 2, 4, 0, -2, 18, 0.8);
      if (look.tail) b.box(g, look.body, 4, 4, 14, 0, 22, -20).rotation.x = 0.6;
      rig.head = head;
      break;
    }
    case 'floater': {
      const core = new THREE.Group();
      core.position.y = 34;
      g.add(core);
      b.box(core, look.body, 16, 18, 14, 0, 0, 0);
      b.box(core, shadeHex(look.body, 0.8), 12, 8, 10, 0, -12, 0);
      b.eyes(core, look.eye ?? '#ffb08a', 3, 7.1, 6);
      rig.bits.core = core;
      const motes = new THREE.Group();
      motes.position.y = 34;
      g.add(motes);
      for (let i = 0; i < 4; i++) b.glow(motes, look.glow ?? '#ff6a4a', 4, 4, 4, Math.cos((i / 4) * Math.PI * 2) * 16, 0, Math.sin((i / 4) * Math.PI * 2) * 16);
      rig.bits.motes = motes;
      break;
    }
    case 'blob': {
      const core = new THREE.Group();
      g.add(core);
      b.box(core, look.body, 26, 22, 24, 0, 11, 0);
      b.box(core, look.head ?? look.body, 20, 8, 20, 0, 25, 0);
      b.eyes(core, eye, 14, 12.1, 9, 3.2);
      b.box(core, '#1a1a14', 2, 7, 2, 0, 32, 0);
      rig.bits.fuse = b.glow(core, look.accent ?? '#ffd04a', 4, 4, 4, 0, 37, 0);
      rig.bits.core = core;
      for (const [x, z] of [
        [-8, 6],
        [8, 6],
        [-8, -6],
        [8, -6],
      ])
        rig.legs.push(b.limb(g, look.body, 5, 4, 5, x, 4, z));
      break;
    }
    case 'spider': {
      b.box(g, look.body, 22, 16, 24, 0, 16, -10);
      b.box(g, look.head ?? look.body, 14, 11, 13, 0, 13, 8);
      b.eyes(g, eye, 15, 14.6, 6, 2.4);
      b.eyes(g, eye, 12, 14.6, 3, 1.8);
      for (let i = 0; i < 4; i++) {
        for (const s of [-1, 1]) {
          const leg = new THREE.Group();
          leg.position.set(s * 6, 14, 6 - i * 5);
          leg.rotation.y = s * (0.5 - i * 0.3);
          g.add(leg);
          b.box(leg, limb, 20, 3, 3, s * 10, 4, 0).rotation.z = s * 0.4;
          b.box(leg, limb, 3, 16, 3, s * 19, -4, 0);
          rig.legs.push(leg);
        }
      }
      break;
    }
    case 'serpent':
    case 'hydra': {
      const big = look.kind === 'hydra';
      if (big) {
        b.box(g, look.body, 90, 34, 70, 0, 17, -10);
        b.box(g, shadeHex(look.body, 1.2), 70, 14, 54, 0, 40, -10);
      } else {
        b.box(g, shadeHex(look.body, 0.8), 34, 8, 34, 0, 4, 0);
      }
      const neck = new THREE.Group();
      neck.position.y = big ? 40 : 6;
      g.add(neck);
      const segs = big ? 6 : 5;
      const seg = big ? 18 : 13;
      for (let i = 0; i < segs; i++) b.box(neck, i % 2 ? look.body : shadeHex(look.body, 1.15), seg, seg, seg, 0, i * seg * 0.85 + seg / 2, i * 1.5);
      const head = new THREE.Group();
      head.position.set(0, segs * seg * 0.85 + seg * 0.4, 8);
      neck.add(head);
      const hs = big ? 1.5 : 1;
      b.box(head, look.head ?? look.body, 22 * hs, 14 * hs, 26 * hs, 0, 0, 6 * hs);
      b.box(head, shadeHex(look.head ?? look.body, 0.75), 18 * hs, 5 * hs, 18 * hs, 0, -9 * hs, 10 * hs);
      b.eyes(head, eye, 4 * hs, 19.2 * hs, 12 * hs, 3.4 * hs);
      b.box(head, '#e8e0d0', 2, 4, 2, -6 * hs, -5 * hs, 18 * hs);
      b.box(head, '#e8e0d0', 2, 4, 2, 6 * hs, -5 * hs, 18 * hs);
      rig.head = head;
      rig.bits.neck = neck;
      break;
    }
    case 'chest': {
      b.box(g, look.body, 50, 24, 34, 0, 12, 0);
      b.box(g, look.accent ?? '#d8a040', 51, 3, 35, 0, 22, 0);
      for (let i = -2; i <= 2; i++) b.box(g, '#f0e8d8', 4, 5, 2, i * 9, 26, 15);
      b.glow(g, '#5a0a10', 44, 2, 28, 0, 24.5, 0);
      const lid = new THREE.Group();
      lid.position.set(0, 25, -17);
      g.add(lid);
      b.box(lid, shadeHex(look.body, 1.15), 50, 12, 34, 0, 6, 17);
      b.box(lid, look.accent ?? '#d8a040', 8, 8, 2, 0, 3, 34.5);
      for (let i = -2; i <= 2; i++) b.box(lid, '#f0e8d8', 4, 5, 2, i * 9 + 4, -1, 32);
      b.eyes(lid, eye, 6, 34.3, 20, 3.5);
      rig.bits.lid = lid;
      break;
    }
    case 'dummy': {
      b.box(g, look.body, 6, 34, 6, 0, 17, 0);
      b.box(g, '#4a3a2a', 24, 4, 24, 0, 2, 0);
      b.box(g, '#8a6a4a', 20, 18, 10, 0, 34, 0);
      b.box(g, look.body, 40, 4, 4, 0, 38, 0);
      const h = new THREE.Group();
      h.position.y = 44;
      g.add(h);
      b.box(h, look.head ?? '#e8e0d0', 12, 12, 12, 0, 6, 0);
      b.box(h, look.eye ?? '#2a1a1a', 3, 3, 1, -3, 7, 6.2);
      b.box(h, look.eye ?? '#2a1a1a', 3, 3, 1, 3, 7, 6.2);
      rig.head = h;
      break;
    }
  }
  return rig;
}

function shadeHex(hex: string, k: number): string {
  return `#${shade(hex, k).getHexString()}`;
}

function buildHeroRig(p: Player, b: RigBuilder, shadowMat: THREE.Material): Rig {
  const pal = p.palette;
  const rig = newRig('humanoid', 56, b, shadowMat);
  const g = rig.body;
  // Legs: a thigh and a shin with a boot, jointed at the knee, on hips that
  // turn toward the way you run.
  const hips = new THREE.Group();
  hips.position.y = 16;
  g.add(hips);
  rig.hips = hips;
  const boot = shadeHex(pal.tunic, 0.55);
  for (const x of [-4, 4]) {
    const thigh = b.limb(hips, pal.tunic, 6, 8.5, 7, x, 0, 0);
    const knee = b.limb(thigh, pal.tunic, 5.6, 8, 6.6, 0, -8, 0);
    b.box(knee, boot, 6.2, 3, 8.6, 0, -6.5, 1);
    rig.legs.push(thigh);
    rig.knees.push(knee);
  }
  const torso = new THREE.Group();
  torso.position.y = 16;
  g.add(torso);
  rig.bits.torso = torso;
  b.box(torso, pal.tunic, 15, 18, 9, 0, 9, 0);
  b.box(torso, pal.trim, 15.5, 2.5, 9.5, 0, 2, 0);
  // Cape: hangs from the shoulders and streams out behind you when you run.
  const cape = new THREE.Group();
  cape.position.set(0, 19, -6);
  torso.add(cape);
  rig.bits.cape = cape;
  b.box(cape, pal.cloak, 17, 26, 3, 0, -13, 0);
  b.box(cape, pal.trim, 17.5, 2.5, 3.5, 0, -25, 0);
  b.box(torso, pal.cloak, 18, 4, 11, 0, 17, -0.5);
  rig.arms.push(b.limb(torso, pal.skin, 5, 16, 5, -10.5, 17, 0), b.limb(torso, pal.skin, 5, 16, 5, 10.5, 17, 0));
  // The Vanguard's tower shield rides on the off arm.
  if (p.hero.guard === 'shield') {
    const sh = b.box(rig.arms[1], '#6a4a24', 3, 26, 18, 3.5, -12, 3);
    sh.castShadow = true;
    b.box(rig.arms[1], pal.trim, 3.4, 4, 18.4, 3.6, -2, 3);
    b.box(rig.arms[1], '#c8a050', 3.6, 6, 6, 4, -12, 3);
  }
  const h = new THREE.Group();
  h.position.y = 19;
  torso.add(h);
  b.box(h, pal.skin, 12, 12, 12, 0, 6, 0);
  b.box(h, pal.hair, 12.6, 4, 12.6, 0, 11, -0.3);
  b.box(h, pal.hair, 12.6, 9, 3, 0, 7.5, -5);
  b.eyes(h, pal.crown === 'horns' ? '#d090ff' : '#3a2018', 6.5, 6.1, 5, 2.2);
  switch (pal.crown) {
    case 'flame': {
      const fl = new THREE.Group();
      fl.position.y = 13;
      h.add(fl);
      for (let i = -2; i <= 2; i++) b.glow(fl, i % 2 ? '#ff5a2a' : '#ffb04a', 2.6, 6 - Math.abs(i), 2.6, i * 2.6, 3, 0);
      rig.bits.flame = fl;
      break;
    }
    case 'hood':
      b.box(h, pal.cloak, 14, 14, 14, 0, 7, -1.5).scale.set(14, 14, 11);
      b.box(h, pal.cloak, 15, 3, 15, 0, 13.5, -0.5);
      b.glow(h, pal.glow, 2, 2, 2, 0, 15.5, 7);
      break;
    case 'helm':
      b.box(h, '#b07a30', 13.4, 6, 13.4, 0, 10, 0);
      b.box(h, '#c2263a', 2.5, 6, 14, 0, 15, -1);
      break;
    case 'circlet':
      b.glow(h, pal.glow, 13.2, 1.5, 13.2, 0, 11, 0, 0.9);
      b.glow(h, pal.glow, 3, 3, 1, 0, 13, 6.8);
      break;
    case 'horns':
      b.box(h, '#2a1438', 3, 9, 3, -5, 15, 0).rotation.z = 0.45;
      b.box(h, '#2a1438', 3, 9, 3, 5, 15, 0).rotation.z = -0.45;
      b.glow(h, pal.glow, 2, 2, 2, -7, 19.5, 0);
      b.glow(h, pal.glow, 2, 2, 2, 7, 19.5, 0);
      break;
    case 'halo': {
      const halo = new THREE.Group();
      halo.position.y = 18;
      h.add(halo);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        b.glow(halo, pal.glow, 2.5, 1.5, 2.5, Math.cos(a) * 7, 0, Math.sin(a) * 7);
      }
      rig.bits.halo = halo;
      break;
    }
  }
  rig.head = h;
  return rig;
}

/** Hangs the hero's current weapon on the rig. */
function equipWeapon(rig: Rig, id: string, b: RigBuilder): void {
  for (const k of ['weapon', 'offhand']) {
    const o = rig.bits[k];
    if (o) o.parent?.remove(o);
    delete rig.bits[k];
  }
  rig.weapon = id;
  const col = WEAPON_INFO[id as keyof typeof WEAPON_INFO]?.color ?? '#d8d8e8';
  const hand = rig.arms[0];
  const w = new THREE.Group();
  w.position.set(0, -15, 0);
  hand.add(w);
  rig.bits.weapon = w;
  switch (id) {
    case 'sword':
      b.box(w, '#3a2a24', 2.5, 2.5, 7, 0, 0, 0);
      b.box(w, '#8a7a6a', 9, 2, 2.5, 0, 0, 4);
      b.box(w, '#c8c8d8', 2, 3.5, 30, 0, 0, 19);
      b.glow(w, col, 1, 1.5, 28, 0, 2, 19, 0.85);
      break;
    case 'spear':
      b.box(w, '#6a4630', 2.4, 2.4, 80, 0, 0, 14);
      b.box(w, col, 4, 4, 12, 0, 0, 58);
      b.box(w, '#d8d8e8', 5, 1.2, 2, 0, 0, 51);
      break;
    case 'bow': {
      const bow = new THREE.Group();
      rig.arms[1].add(bow);
      bow.position.set(0, -15, 2);
      b.box(bow, '#5a3a24', 2.5, 30, 2.5, 0, 0, 0);
      b.box(bow, '#5a3a24', 2.5, 8, 2.5, 0, 17, -3).rotation.x = -0.5;
      b.box(bow, '#5a3a24', 2.5, 8, 2.5, 0, -17, -3).rotation.x = 0.5;
      b.glow(bow, col, 0.8, 38, 0.8, 0, 0, -6, 0.8);
      rig.bits.offhand = bow;
      break;
    }
    case 'fists': {
      b.box(w, col, 8, 8, 8, 0, 1, 0);
      const off = new THREE.Group();
      rig.arms[1].add(off);
      off.position.set(0, -15, 0);
      b.box(off, col, 8, 8, 8, 0, 1, 0);
      rig.bits.offhand = off;
      break;
    }
    case 'scythe':
      b.box(w, '#3a2a30', 2.4, 64, 2.4, 0, 14, 0);
      b.box(w, '#c8c0d8', 2, 5, 26, 0, 44, 11).rotation.x = 0.25;
      b.glow(w, col, 1, 2, 22, 0, 41, 11, 0.85).rotation.x = 0.25;
      break;
    case 'katana': {
      // A long, slim blade with a round guard.
      b.box(w, '#20202a', 2.2, 2.2, 10, 0, 0, 1);
      b.box(w, '#c8a050', 6, 1.2, 6, 0, 0, 6.5);
      const blade = new THREE.Group();
      blade.position.set(0, 0, 7);
      blade.rotation.x = -0.08;
      w.add(blade);
      b.box(blade, '#e8f0ff', 1.1, 3, 38, 0, 0.4, 19);
      b.glow(blade, col, 0.6, 0.8, 34, 0, 2, 19, 0.8);
      break;
    }
    case 'blunderbuss':
      b.box(w, '#5a3a24', 3.4, 5, 11, 0, -1.5, -3);
      b.box(w, '#b08a4a', 3.6, 3.6, 22, 0, 1, 12);
      b.box(w, '#c8a050', 6.4, 6.4, 3, 0, 1, 24);
      b.glow(w, col, 3, 3, 1, 0, 1, 25.6, 0.7);
      break;
    case 'nunchaku': {
      b.box(w, '#3a2a20', 2.6, 2.6, 13, 0, 0, 5);
      b.glow(w, col, 0.8, 0.8, 4, 0, 0, 13, 0.9);
      const tail = new THREE.Group();
      tail.position.set(0, 0, 15);
      w.add(tail);
      b.box(tail, '#3a2a20', 2.6, 2.6, 13, 0, 0, 6.5);
      rig.bits.tailStick = tail;
      break;
    }
  }
}

function buildAllyRig(a: Ally, b: RigBuilder, shadowMat: THREE.Material): Rig {
  if (a.kind === 'wolf') return buildEnemyRig({ kind: 'quad', body: '#5a4a8a', head: '#7a6aaa', limb: '#3a2a6a', eye: '#e0d8ff', tail: true }, b, shadowMat);
  const rig = newRig('floater', 50, b, shadowMat);
  const core = new THREE.Group();
  core.position.y = 40;
  rig.body.add(core);
  b.box(core, '#2a3a4a', 12, 3, 12, 0, 9, 0);
  b.box(core, '#2a3a4a', 12, 3, 12, 0, -9, 0);
  b.glow(core, '#7fe8ff', 9, 15, 9, 0, 0, 0);
  rig.bits.core = core;
  return rig;
}

// ---------------------------------------------------------------- the renderer

export class VoxelRenderer {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 9000);
  private hemi = new THREE.HemisphereLight(0xffffff, 0x222222, 1.5);
  private sun = new THREE.DirectionalLight(0xffe8d0, 1.1);
  /** Soft light from the camera side, so faces turned toward you aren't black. */
  private fill = new THREE.DirectionalLight(0xc8c0ff, 0.7);
  private lights: THREE.PointLight[] = [];
  private room = new THREE.Group();
  private props = new THREE.Group();
  private actors = new THREE.Group();
  private world: World | null = null;
  private roomKey = '';
  private rigs = new Map<Actor, Rig>();
  private interactables = new Map<Interactable, THREE.Group>();
  private breakables = new Map<Breakable, THREE.Group>();
  private traps = new Map<Trap, { g: THREE.Group; spikes: THREE.Mesh[]; plate: THREE.MeshLambertMaterial }>();
  private doors: DoorView[] = [];
  /** Fade weight per static light, so lights ease in and out instead of popping. */
  private staticW: number[] = [];
  private lava: THREE.MeshBasicMaterial | null = null;
  private flames: THREE.Object3D[] = [];
  private staticLights: { x: number; y: number; z: number; color: string; r: number; k: number }[] = [];
  private shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.38, depthWrite: false });
  private frame = 0;
  private lastT = 0;
  private size = { w: 0, h: 0, zoom: 0 };
  quality: VoxelQuality;

  constructor(canvas: HTMLCanvasElement, quality: VoxelQuality) {
    this.quality = quality;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: quality === 'high', powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x07050a, 1);
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.fill.position.set(0, 1, 1.4);
    this.scene.add(this.hemi, this.sun, this.sun.target, this.fill, this.room, this.props, this.actors);
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 1.5;
    this.setQuality(quality);
  }

  setQuality(q: VoxelQuality): void {
    const rebuild = q !== this.quality || !this.lights.length;
    this.quality = q;
    const high = q === 'high';
    this.renderer.shadowMap.enabled = high;
    this.sun.castShadow = high;
    for (const l of this.lights) this.scene.remove(l);
    this.lights = [];
    for (let i = 0; i < LIGHTS[q]; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 300, 0);
      this.lights.push(l);
      this.scene.add(l);
    }
    if (this.size.w) this.resize(this.size.w, this.size.h, this.dpr);
    // Shadow casting and the blob shadows are set up per room and per figure.
    if (rebuild) this.reset();
  }

  private dpr = 1;
  resize(w: number, h: number, dpr: number): void {
    this.dpr = dpr;
    this.size.w = w;
    this.size.h = h;
    this.renderer.setPixelRatio(this.quality === 'high' ? Math.min(dpr, 2) : Math.min(dpr, 1));
    this.renderer.setSize(w, h, false);
    this.size.zoom = 0;
  }

  /** Drops everything built so it is rebuilt for the current quality. */
  private reset(): void {
    this.clearRoom();
    for (const r of this.rigs.values()) this.dropRig(r);
    this.rigs.clear();
    this.roomKey = '';
  }

  dispose(): void {
    this.reset();
    this.renderer.dispose();
  }

  // ---------------------------------------------------------------- room

  private clearRoom(): void {
    for (const g of [this.room, this.props]) {
      for (const c of [...g.children]) {
        g.remove(c);
        disposeTree(c);
      }
    }
    this.interactables.clear();
    this.breakables.clear();
    this.traps.clear();
    this.doors = [];
    this.flames = [];
    this.lava = null;
    this.staticLights = [];
    this.staticW = [];
  }

  private buildRoom(w: World): void {
    this.clearRoom();
    const l = w.room;
    const bio = w.biome;
    const high = this.quality === 'high';
    const seed = l.seed;
    const lit = new THREE.MeshLambertMaterial();
    const floor = new Blocks();
    const lava = new Blocks();
    const walls = new Blocks();
    const deco = new Blocks();
    const glowDeco = new Blocks();
    // The 2D palette's wall colours are near black; lift them for lit blocks.
    const stone = (k: number) => new THREE.Color(bio.wall).lerp(new THREE.Color(bio.wallTop), 0.6).multiplyScalar(1.9 * k);
    const capStone = (k: number) => shade(bio.wallTop, 2 * k);
    const cols = Math.ceil(l.w / B);
    const rows = Math.ceil(l.h / B);

    // Floor: one block per cell, two-tone in 2×2 tiles, with gaps for grout.
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const x = i * B + B / 2;
        const z = j * B + B / 2;
        const g = w.groundAt(x, z);
        if (g === 'pit') continue;
        const r = hash(i >> 1, j >> 1, seed);
        const jitter = 0.96 + hash(i, j, seed + 7) * 0.08;
        if (g === 'lava') {
          const hot = hash(i, j, seed + 11);
          lava.add(x, -16, z, B, 20, B, hot > 0.85 ? new THREE.Color('#ffb03a') : shade(hot > 0.4 ? '#e8501a' : '#b8300e', 0.85 + hash(i, j, seed) * 0.3));
          continue;
        }
        const raised = hash(i, j, seed + 3) > 0.96 ? 3 : 0;
        floor.add(x, -20 + raised / 2, z, B, 40 + raised, B, shade(r < 0.5 ? bio.floorA : bio.floorB, jitter * 1.3));
      }
    }
    // Biome scatter: tufts, bones, crystals or motes.
    for (let i = 0; i < 46; i++) {
      const x = 30 + hash(i, 1, seed) * (l.w - 60);
      const z = 30 + hash(i, 2, seed) * (l.h - 60);
      if (w.groundAt(x, z) !== 'floor') continue;
      const s = 4 + hash(i, 3, seed) * 4;
      if (bio.id === 'elysium') {
        deco.add(x, s / 2, z, 3, s, 3, '#5aa86a');
        deco.add(x + 4, s / 2 + 1, z + 2, 3, s + 2, 3, '#7ac88a');
        if (i % 3 === 0) glowDeco.add(x + 2, s + 3, z + 1, 3, 3, 3, '#f0e6a0');
      } else if (bio.id === 'asphodel') {
        deco.add(x, 1.5, z, 10, 3, 3, '#c8c0a8');
        if (i % 3 === 0) glowDeco.add(x + 8, 1, z + 6, 6, 2, 3, '#ff7a2a');
      } else if (bio.id === 'tartarus') {
        deco.add(x, 2, z, s + 4, 4, s, shade(bio.floorA, 0.7));
        if (i % 4 === 0) glowDeco.add(x, s / 2 + 2, z, 4, s + 4, 4, '#ff4a5a');
      } else {
        glowDeco.add(x, 2 + hash(i, 4, seed) * 8, z, 3, 3, 3, '#b0a0ff');
      }
    }

    // Walls: tall to the north and sides, a low ledge to the south.
    // A wall block is left out if any part of it would reach into a doorway; the
    // door's posts fill the rest of the gap.
    const doorGap = (x: number) => w.doors.some((d) => Math.abs(x - d.x) < DOOR_W / 2 + B / 2);
    const wallCol = (x: number, z: number, rowsUp: number, cap: boolean) => {
      for (let k = 0; k < rowsUp; k++) {
        const tint = 0.85 + hash(Math.round(x), Math.round(z) + k * 13, seed) * 0.3;
        walls.add(x, k * B + B / 2, z, B, B, B, k === rowsUp - 1 ? capStone(tint * 0.9) : stone(tint));
      }
      if (cap) walls.add(x, rowsUp * B + 4, z, B, 8, B, capStone(1.15));
    };
    for (let x = -B * 1.5; x < l.w + B * 2; x += B) {
      for (const z of [-B * 1.5, -B / 2]) {
        if (x > 0 && x < l.w && doorGap(x)) continue;
        // Pilasters every four blocks stand a little taller.
        const pil = z === -B / 2 && Math.round((x - B / 2) / B) % 4 === 0 && x > 0 && x < l.w;
        wallCol(x, z, WALL_ROWS + (pil ? 1 : 0), true);
      }
    }
    // The camera looks from the south-east, so the east wall is low like the south one.
    for (let z = B / 2; z < l.h + B; z += B) {
      for (const x of [-B * 1.5, -B / 2]) wallCol(x, z, WALL_ROWS, true);
      for (const x of [l.w + B / 2, l.w + B * 1.5]) wallCol(x, z, 1, false);
    }
    for (let x = -B / 2; x < l.w + B; x += B) {
      if (Math.abs(x - l.entrance.x) < 50) continue;
      for (const z of [l.h + B / 2, l.h + B * 1.5]) wallCol(x, z, 1, false);
    }
    // Glowing trim where the walls meet the floor.
    const trim = new Blocks();
    // Kept just clear of the wall faces and the floor: shared faces flicker (z-fighting).
    let from = 0;
    for (const x of [...w.doors.map((d) => d.x)].sort((a, b) => a - b).concat(l.w + DOOR_W)) {
      const to = Math.min(l.w, x - DOOR_W / 2);
      if (to > from) trim.add((from + to) / 2, 3.5, 1.2, to - from, 6, 2, bio.trim);
      from = x + DOOR_W / 2;
    }
    trim.add(1.2, 3.5, l.h / 2, 2, 6, l.h, bio.trim);
    trim.add(l.w - 1.2, 3.5, l.h / 2, 2, 6, l.h, bio.trim);

    // Obstacles: stacked blocks, pillars and urns.
    const obst = new Blocks();
    for (const o of l.obstacles) {
      if (o.type === 'rect') {
        const H = o.style === 'block' ? 2 : 1;
        for (let x = o.x + B / 2; x < o.x + o.w; x += B) {
          for (let z = o.y + B / 2; z < o.y + o.h; z += B) {
            for (let k = 0; k < H; k++) {
              const top = k === H - 1;
              obst.add(x, k * B + B / 2, z, B - 1, B, B - 1, top ? capStone(0.9 + hash(x, z + k, seed) * 0.2) : stone(0.9 + hash(x, z + k, seed) * 0.2));
            }
          }
        }
      } else if (o.style === 'pillar') {
        const s = o.r * 1.7;
        for (let k = 0; k < 3; k++) obst.add(o.x, k * B + B / 2, o.y, s, B, s, stone(0.95 + k * 0.06));
        obst.add(o.x, 3 * B + 5, o.y, s + 8, 10, s + 8, capStone(1.1));
        obst.add(o.x, 5, o.y, s + 8, 10, s + 8, capStone(1));
        trim.add(o.x, 3 * B - 6, o.y, s + 1, 3, s + 1, bio.trim);
      } else {
        obst.add(o.x, 12, o.y, o.r * 1.5, 24, o.r * 1.5, '#7a4830');
        obst.add(o.x, 28, o.y, o.r, 8, o.r, '#9a6040');
        trim.add(o.x, 14, o.y, o.r * 1.5 + 1, 3, o.r * 1.5 + 1, bio.trim);
      }
    }

    const add = (m: THREE.InstancedMesh | null, cast: boolean, receive: boolean) => {
      if (!m) return;
      m.castShadow = cast && high;
      m.receiveShadow = receive && high;
      this.room.add(m);
    };
    add(floor.build(lit), false, true);
    add(walls.build(new THREE.MeshLambertMaterial()), true, true);
    add(obst.build(new THREE.MeshLambertMaterial()), true, true);
    add(deco.build(new THREE.MeshLambertMaterial()), false, true);
    add(glowDeco.build(new THREE.MeshBasicMaterial()), false, false);
    add(trim.build(new THREE.MeshBasicMaterial()), false, false);
    this.lava = new THREE.MeshBasicMaterial();
    add(lava.build(this.lava), false, false);

    // Braziers: a stone bowl with a flickering flame and a real light in High.
    for (const br of l.braziers) {
      const g = new THREE.Group();
      g.position.set(br.x, 0, br.y);
      const stoneM = new THREE.MeshLambertMaterial({ color: capStone(1) });
      const base = new THREE.Mesh(BOX, stoneM);
      base.scale.set(18, 34, 18);
      base.position.y = 17;
      const bowl = new THREE.Mesh(BOX, stoneM);
      bowl.scale.set(30, 8, 30);
      bowl.position.y = 38;
      base.castShadow = bowl.castShadow = high;
      const flame = new THREE.Group();
      flame.position.y = 42;
      for (const [c, s, y] of [
        ['#ff5a1a', 20, 6],
        ['#ffa03a', 13, 14],
        ['#ffe08a', 7, 21],
      ] as const) {
        const f = new THREE.Mesh(BOX, new THREE.MeshBasicMaterial({ color: c }));
        f.scale.set(s, s, s);
        f.position.y = y;
        flame.add(f);
      }
      g.add(base, bowl, flame);
      this.props.add(g);
      this.flames.push(flame);
      this.staticLights.push({ x: br.x, y: br.y, z: 80, color: '#ff8c46', r: 340, k: 2.2 });
    }
    for (const h of l.hazards) {
      if (h.kind !== 'lava') continue;
      const s = h.shape;
      const cx = s.type === 'rect' ? s.x + s.w / 2 : s.x;
      const cy = s.type === 'rect' ? s.y + s.h / 2 : s.y;
      const r = s.type === 'rect' ? Math.max(s.w, s.h) : s.r * 2.2;
      this.staticLights.push({ x: cx, y: cy, z: 30, color: '#ff6a28', r: r + 80, k: 1.6 });
    }

    // Doors in the north wall.
    for (const d of w.doors) this.doors.push(this.buildDoor(d.x, bio.trim, capStone(1.2), high));

    // Sun and its shadow camera cover the whole room.
    const cx = l.w / 2;
    const cz = l.h / 2;
    this.sun.target.position.set(cx, 0, cz);
    this.sun.position.set(cx - 800, 1800, cz - 500);
    const ext = Math.hypot(l.w, l.h) / 2 + 220;
    const sc = this.sun.shadow.camera;
    sc.left = -ext;
    sc.right = ext;
    sc.top = ext;
    sc.bottom = -ext;
    sc.near = 100;
    sc.far = 5000;
    sc.updateProjectionMatrix();
    this.sun.shadow.needsUpdate = true;
    const amb = new THREE.Color(bio.ambient);
    this.hemi.color.copy(amb).lerp(new THREE.Color('#ffffff'), 0.35);
    this.hemi.groundColor.copy(amb).multiplyScalar(0.45);
  }

  // ---------------------------------------------------------------- props

  private interactableModel(it: Interactable): THREE.Group {
    const b = new RigBuilder(this.quality === 'high');
    const g = new THREE.Group();
    g.position.set(it.x, 0, it.y);
    const t = g;
    switch (it.kind) {
      case 'chest': {
        b.box(t, '#6a4020', 52, 26, 34, 0, 13, 0);
        b.box(t, '#d8a040', 53, 4, 35, 0, 18, 0);
        const lid = new THREE.Group();
        lid.position.set(0, 26, -17);
        t.add(lid);
        b.box(lid, '#7a4a26', 52, 12, 34, 0, 6, 17);
        b.box(lid, '#d8a040', 8, 9, 2, 0, 2, 34.5);
        g.userData.lid = lid;
        g.userData.sparkle = b.glow(t, '#ffd890', 40, 2, 26, 0, 27, 0, 0.6);
        break;
      }
      case 'fountain': {
        b.box(t, '#4a4a5a', 100, 16, 60, 0, 8, 0);
        b.box(t, '#3a3a48', 86, 2, 46, 0, 16.5, 0);
        g.userData.water = b.glow(t, '#3ab8ff', 82, 2, 42, 0, 17, 0, 0.85);
        b.box(t, '#5a5a6a', 14, 50, 14, 0, 25, 0);
        b.box(t, '#6a6a7a', 26, 6, 26, 0, 52, 0);
        g.userData.spout = b.glow(t, '#9ae4ff', 6, 10, 6, 0, 60, 0, 0.8);
        break;
      }
      case 'shop': {
        b.box(t, '#2a2230', 52, 34, 40, 0, 17, 0);
        b.box(t, '#4a3a50', 60, 6, 46, 0, 37, 0);
        b.box(t, '#6a5470', 61, 2, 47, 0, 30, 0);
        break;
      }
      case 'npc': {
        b.box(t, '#1a1420', 34, 64, 24, 0, 32, 0);
        b.box(t, '#2a2030', 38, 6, 28, 0, 3, 0);
        b.box(t, '#0a0810', 22, 22, 22, 0, 74, 0);
        b.box(t, '#1a1420', 26, 6, 26, 0, 86, -1);
        b.eyes(t, '#ffd04a', 74, 11.1, 8, 3);
        b.box(t, '#6a5a40', 3, 104, 3, 24, 52, 6);
        g.userData.lantern = b.glow(t, '#78ffa0', 9, 11, 9, 24, 108, 6);
        break;
      }
      case 'station':
        this.stationModel(it, b, t);
        break;
    }
    this.props.add(g);
    return g;
  }

  private stationModel(it: Interactable, b: RigBuilder, t: THREE.Group): void {
    switch (it.id) {
      case 'mirror':
        b.box(t, '#c8a050', 74, 124, 10, 0, 66, 0);
        b.glow(t, '#9a60e0', 60, 108, 2, 0, 66, 5.5, 0.9);
        b.box(t, '#3a2a24', 80, 6, 18, 0, 3, 0);
        break;
      case 'smith': {
        // Furnace, anvil and the Blacksmith himself.
        b.box(t, '#2a1e1a', 44, 90, 34, -34, 45, -6);
        b.box(t, '#3a2a24', 50, 8, 40, -34, 94, -6);
        b.glow(t, '#ff8a3a', 24, 18, 2, -34, 30, 11.5, 0.95);
        b.box(t, '#4a4a56', 40, 10, 18, 22, 26, 4);
        b.box(t, '#4a4a56', 18, 16, 14, 22, 13, 4);
        b.box(t, '#3e3e48', 34, 6, 22, 22, 3, 4);
        b.box(t, '#5a3a2a', 18, 30, 14, 50, 22, -8);
        b.box(t, '#d8a888', 12, 12, 12, 50, 44, -8);
        b.box(t, '#8a8a96', 4, 4, 18, 40, 34, 2).rotation.x = -0.5;
        break;
      }
      case 'artifacts':
        b.box(t, '#2a3238', 100, 56, 40, 0, 28, 0);
        b.box(t, '#3a4a52', 104, 6, 44, 0, 59, 0);
        ['#7dff8a', '#ffe45c', '#7fe8ff'].forEach((c, i) => b.glow(t, c, 12, 12, 12, -30 + i * 30, 70, 0));
        break;
      case 'chronicle':
        b.box(t, '#3a2a24', 14, 52, 14, 0, 26, 0);
        b.box(t, '#5a4030', 64, 8, 34, 0, 55, 0).rotation.x = 0.3;
        b.box(t, '#e8dcc0', 54, 3, 26, 0, 60, 2).rotation.x = 0.3;
        b.box(t, '#3a2a24', 30, 6, 30, 0, 3, 0);
        break;
      case 'heroes': {
        b.box(t, '#3a2a30', 60, 22, 40, 0, 11, 0);
        b.box(t, '#4a3840', 68, 6, 46, 0, 25, 0);
        const ghost = new THREE.Group();
        ghost.position.y = 28;
        t.add(ghost);
        b.glow(ghost, '#ff8c6e', 22, 36, 12, 0, 18, 0, 0.5);
        b.glow(ghost, '#ff8c6e', 14, 14, 14, 0, 44, 0, 0.5);
        t.userData.ghost = ghost;
        break;
      }
      case 'ascension':
        b.box(t, '#2a2630', 52, 92, 26, 0, 46, 0);
        b.box(t, '#3a3440', 40, 10, 22, 0, 97, 0);
        [
          [-10, 74],
          [6, 82],
          [12, 60],
          [-4, 50],
          [-12, 32],
          [8, 28],
        ].forEach(([x, y]) => b.glow(t, '#ffeca0', 4, 4, 2, x, y, 13.5));
        break;
      case 'pact':
        b.box(t, '#2a0e14', 60, 56, 30, 0, 28, 0);
        b.glow(t, '#ff4a5a', 62, 3, 32, 0, 56, 0);
        b.glow(t, '#ff4a5a', 62, 3, 32, 0, 2, 0);
        b.glow(t, '#ff4a5a', 16, 14, 2, 0, 32, 15.5);
        b.box(t, '#2a0e14', 4, 4, 2, -4, 33, 16.6);
        b.box(t, '#2a0e14', 4, 4, 2, 4, 33, 16.6);
        break;
      default:
        b.box(t, '#3a2a30', 30, 20, 30, 0, 10, 0);
        b.glow(t, it.color ?? '#ffd890', 22, 22, 22, 0, 36, 0);
    }
  }

  private breakableModel(br: Breakable): THREE.Group {
    const b = new RigBuilder(this.quality === 'high');
    const g = new THREE.Group();
    g.position.set(br.x, 0, br.y);
    b.box(g, '#7a4a34', 22, 22, 22, 0, 11, 0);
    b.box(g, '#8a5a40', 26, 8, 26, 0, 13, 0);
    b.box(g, '#9a6a4a', 12, 8, 12, 0, 26, 0);
    b.box(g, '#3a2018', 14, 2, 14, 0, 30.5, 0);
    this.props.add(g);
    return g;
  }

  private trapModel(tr: Trap): { g: THREE.Group; spikes: THREE.Mesh[]; plate: THREE.MeshLambertMaterial } {
    const g = new THREE.Group();
    g.position.set(tr.x, 0, tr.y);
    const plate = new THREE.MeshLambertMaterial({ color: '#2a2024' });
    const base = new THREE.Mesh(BOX, plate);
    base.scale.set(TRAP_SIZE, 3, TRAP_SIZE);
    base.position.y = 1.5;
    g.add(base);
    const spikeM = new THREE.MeshLambertMaterial({ color: '#d8d0d0' });
    const spikes: THREE.Mesh[] = [];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const s = new THREE.Mesh(BOX, spikeM);
        s.position.set(-18 + i * 18, 0, -16 + j * 16);
        s.scale.set(4, 1, 4);
        s.visible = false;
        g.add(s);
        spikes.push(s);
      }
    }
    this.props.add(g);
    return { g, spikes, plate };
  }

  // ---------------------------------------------------------------- actors

  private rigFor(a: Actor, w: World): Rig {
    let rig = this.rigs.get(a);
    if (rig) return rig;
    const b = new RigBuilder(this.quality === 'high');
    const hero = w.players.find((p) => p === a);
    if (hero) {
      rig = buildHeroRig(hero, b, this.shadowMat);
      rig.look = JSON.stringify(hero.palette);
    } else if ((a as Ally).kind === 'wolf' || (a as Ally).kind === 'lantern') {
      rig = buildAllyRig(a as Ally, b, this.shadowMat);
    } else {
      const e = a as Enemy;
      rig = buildEnemyRig(LOOKS[e.name] ?? DEFAULT_LOOK, b, this.shadowMat);
      if (e.isElite || e.eliteMod) for (const m of rig.mats) m.userData.elite = true;
    }
    (rig as Rig & { builder?: RigBuilder }).builder = b;
    rig.shadow.visible = this.quality !== 'high';
    this.actors.add(rig.root, rig.shadow);
    this.rigs.set(a, rig);
    return rig;
  }

  private dropRig(r: Rig): void {
    this.actors.remove(r.root, r.shadow);
    disposeTree(r.root);
  }

  /** Common pose: position, facing, walk cycle and hit flash. */
  private pose(rig: Rig, a: Actor, dt: number, sizeH: number): void {
    const s = (sizeH / rig.unit) * FIGURE_SCALE;
    rig.root.position.set(a.x, 0, a.y);
    rig.root.rotation.set(0, Math.PI / 2 - a.facing, 0);
    rig.body.scale.setScalar(s);
    rig.body.position.set(0, 0, 0);
    rig.body.rotation.set(0, 0, 0);
    const speed = Math.hypot(a.vx, a.vy);
    rig.idle += dt;
    if (rig.knees.length) this.stride(rig, a, dt, speed);
    else {
      rig.walk += dt * Math.min(speed, 400) * 0.055;
      const amp = Math.min(1, speed / 120) * 0.7;
      rig.legs.forEach((l, i) => {
        if (rig.kind === 'spider') l.rotation.x = Math.sin(rig.walk * 1.5 + i) * amp * 0.5;
        else l.rotation.x = Math.sin(rig.walk + (i % 2 ? Math.PI : 0) + (i >= 2 ? Math.PI : 0)) * amp;
      });
      rig.arms.forEach((l, i) => {
        l.rotation.set(Math.sin(rig.walk + (i ? 0 : Math.PI)) * amp * 0.8, 0, 0);
      });
      if (speed > 20) {
        // Two bumps a stride, and a lean into the run for upright walkers.
        rig.body.position.y = Math.abs(Math.cos(rig.walk)) * 2 * amp;
        if (rig.kind === 'humanoid') rig.body.rotation.x = 0.12 * amp;
      }
    }
    const f = a.flash > 0 && !a.dead ? 1 : 0;
    for (const m of rig.mats) {
      if (f) m.emissive.setRGB(1, 1, 1);
      else if (m.userData.elite) m.emissive.set('#2a0a40');
      else m.emissive.setRGB(0, 0, 0);
    }
    rig.shadow.position.set(a.x, 0.6, a.y);
    rig.shadow.scale.setScalar(a.r * 1.15);
  }

  /**
   * The hero's stride: thighs swing, knees fold on the back-swing, the hips
   * turn toward the way you run (backpedalling when it's behind you), and the
   * body leans in, bobs twice a step and twists against the legs. Idle, the
   * hero breathes.
   */
  private stride(rig: Rig, a: Actor, dt: number, speed: number): void {
    const run = Math.min(1, speed / 260);
    const amp = Math.min(1, speed / 90);
    // Which way the legs go relative to where the hero faces.
    let rel = speed > 20 ? angleDiff(a.facing, Math.atan2(a.vy, a.vx)) : 0;
    let dir = 1;
    if (rel > Math.PI / 2) (rel -= Math.PI), (dir = -1);
    else if (rel < -Math.PI / 2) (rel += Math.PI), (dir = -1);
    rig.turn += (-rel - rig.turn) * Math.min(1, dt * 14);
    if (rig.hips) rig.hips.rotation.y = rig.turn;
    rig.walk += dt * Math.min(speed, 420) * 0.042 * dir;
    const ph = rig.walk;
    const reach = 0.5 + run * 0.3;
    rig.legs.forEach((l, i) => {
      const p = ph + (i ? Math.PI : 0);
      l.rotation.set(Math.sin(p) * reach * amp, 0, 0);
      // Knees fold as the foot lifts and swings through, and give a little on landing.
      const lift = Math.max(0, -Math.cos(p));
      rig.knees[i].rotation.set((lift * (0.5 + run * 0.6) + 0.06) * amp, 0, 0);
    });
    rig.arms.forEach((l, i) => {
      l.rotation.set(Math.sin(ph + (i ? 0 : Math.PI)) * (0.45 + run * 0.35) * amp, 0, i ? 0.08 : -0.08);
    });
    const torso = rig.bits.torso;
    if (torso) {
      torso.rotation.set(0, Math.sin(ph) * 0.14 * amp, 0);
      torso.scale.set(1, 1, 1);
    }
    const cape = rig.bits.cape;
    if (speed > 20) {
      rig.body.position.y = Math.abs(Math.cos(ph)) * (0.8 + run * 1.2) * amp;
      rig.body.rotation.x = (0.04 + run * 0.08) * amp * Math.cos(rel) * (dir > 0 ? 1 : -0.5);
      if (cape) cape.rotation.x = (0.1 + run * 0.25) * amp + Math.sin(ph * 2) * 0.05 * amp;
    } else {
      const b = Math.sin(rig.idle * 2.2);
      if (torso) torso.scale.set(1 + b * 0.012, 1 + b * 0.018, 1 + b * 0.012);
      rig.arms.forEach((l, i) => (l.rotation.z = (i ? 1 : -1) * (0.06 + b * 0.03)));
      if (cape) cape.rotation.x = 0.04 + Math.sin(rig.idle * 1.3) * 0.03;
    }
  }

  private poseEnemy(rig: Rig, e: Enemy, dt: number, t: number): void {
    this.pose(rig, e, dt, e.height);
    const st = e.state;
    const tense = /wind|aim|charge|tell|prep|summon|telegraph|fuse|rear/.test(st);
    const strike = /attack|slam|swing|lunge|bite|lash|fire|shoot|throw|hop|dash|spin|stomp|laser/.test(st);
    if (rig.arms.length) {
      if (tense) rig.arms.forEach((a) => (a.rotation.x = -2.5));
      else if (strike) rig.arms.forEach((a, i) => (a.rotation.x = -1.5 + (i ? 0.2 : -0.2)));
    }
    if (rig.bits.orb) rig.bits.orb.scale.setScalar(6 * (1 + Math.sin(t * 6) * 0.2));
    if (rig.bits.tail) rig.bits.tail.rotation.x = -0.4 + Math.sin(t * 3) * 0.2 - (strike ? 0.8 : 0);
    if (rig.bits.core && rig.kind === 'floater') rig.bits.core.position.y = 34 + Math.sin(t * 3) * 4;
    if (rig.bits.motes) rig.bits.motes.rotation.y = t * 2;
    if (rig.bits.fuse) {
      const lit = st === 'fuse';
      rig.bits.fuse.visible = !lit || Math.floor(t * 14) % 2 === 0;
      const k = lit ? 1 + Math.min(1, e.stateT) * 0.25 : 1;
      rig.bits.core!.scale.set(k, k, k);
    }
    if (rig.bits.lid) {
      const open = st === 'hop' ? 0.6 + Math.sin(e.stateT * 20) * 0.25 : 0.15 + Math.sin(t * 6) * 0.1;
      rig.bits.lid.rotation.x = -open;
    }
    if (rig.bits.neck) {
      rig.bits.neck.rotation.x = Math.sin(t * 1.6) * 0.08 + (strike ? 0.5 : tense ? -0.25 : 0);
      rig.bits.neck.rotation.z = Math.sin(t * 1.1) * 0.08;
    }
    if (rig.bits.fire) rig.bits.fire.visible = strike || Math.sin(t * 9) > 0.6;
    if (rig.kind === 'dummy') rig.body.rotation.z = Math.sin(t * 20) * e.flash * 1.2;
    if (e.flying || rig.kind === 'floater') rig.body.position.y += 6;
    // Rise out of the floor when spawning; flatten away when slain.
    if (e.spawning) {
      const k = Math.max(0, e.spawnT / 0.9);
      rig.root.position.y = -e.height * k;
      rig.body.scale.multiplyScalar(1 - k * 0.3);
    }
    if (e.dead) {
      const k = Math.min(1, e.deathT / 0.6);
      rig.body.scale.y *= Math.max(0.02, 1 - k);
      rig.body.scale.x *= 1 + k * 0.6;
      rig.body.scale.z *= 1 + k * 0.6;
      rig.root.visible = k < 1;
    } else rig.root.visible = true;
    rig.shadow.visible = this.quality !== 'high' && !e.dead;
  }

  private posePlayer(rig: Rig, p: Player, w: World, dt: number): void {
    const weapon = p.weapon;
    if (rig.weapon !== weapon.id) equipWeapon(rig, weapon.id, (rig as Rig & { builder: RigBuilder }).builder);
    this.pose(rig, p, dt, 56);
    const t = w.time;
    rig.root.position.y = p.z;
    rig.root.visible = !(p.iframes > 0 && p.state !== 'dash' && Math.floor(p.t * 20) % 2 === 0);
    const [armR, armL] = rig.arms;
    const wpn = rig.bits.weapon;
    if (wpn) wpn.rotation.set(0.35, 0, 0);
    if (rig.bits.tailStick) rig.bits.tailStick.rotation.x = 0.9 + Math.sin(t * 3) * 0.1;
    if (rig.bits.flame) {
      rig.bits.flame.scale.y = 0.8 + Math.sin(t * 14) * 0.25;
      rig.bits.flame.rotation.y = t * 2;
    }
    if (rig.bits.halo) rig.bits.halo.rotation.y = t;
    if (p.state === 'action' && p.action) {
      const d = p.action.def;
      const total = d.windup + d.active + d.recover || 1;
      const k = Math.min(1, p.action.t / total);
      const wk = d.windup / total;
      const swing = k < wk ? 0 : Math.min(1, (k - wk) / Math.max(0.05, d.active / total + 0.08));
      switch (weapon.id) {
        case 'bow':
        case 'blunderbuss':
          armR.rotation.x = -Math.PI / 2;
          armL.rotation.x = -Math.PI / 2;
          armR.rotation.y = 0.3;
          break;
        case 'nunchaku':
          armR.rotation.x = -1.4 + Math.sin(p.action.t * 40) * 0.8;
          armR.rotation.z = -0.3;
          if (rig.bits.tailStick) rig.bits.tailStick.rotation.x = Math.sin(p.action.t * 50) * 1.4;
          break;
        case 'spear':
          armR.rotation.x = -Math.PI / 2 + 0.2;
          if (wpn) wpn.rotation.x = Math.PI / 2 - 0.2;
          if (wpn) wpn.position.z = k < wk ? -10 : 14 * swing;
          break;
        case 'fists': {
          const n = Math.floor(p.action.t * 12) % 2;
          rig.arms[n].rotation.x = -Math.PI / 2;
          break;
        }
        default:
          // A horizontal slash: wind the body back, then sweep across.
          armR.rotation.x = -1.6;
          armR.rotation.z = -0.4;
          rig.body.rotation.y = k < wk ? 1.0 * (k / Math.max(0.01, wk)) : 1.0 - swing * 2.2;
          if (wpn) wpn.rotation.x = 1.2;
      }
    } else if (wpn && weapon.id === 'spear') wpn.position.z = 0;
    // Guarding: arms (and the shield) come up in front.
    if (p.blocking || p.guardBreakT > 0) {
      armL.rotation.set(-1.25, 0, 0.45);
      armR.rotation.set(-1.0, 0, -0.3);
      if (p.guardBreakT > 0) rig.body.rotation.x = -0.25;
    }
    if (weapon.id === 'spear' && wpn) wpn.visible = !('thrown' in weapon && weapon.thrown);
    switch (p.state) {
      case 'dash': {
        // Lean the way the dash goes, measured from where the hero faces:
        // forward into a forward dash, back on a backstep, sideways on a sidestep.
        const d = angleDiff(p.facing, Math.atan2(p.dashDir.y, p.dashDir.x));
        const fwd = Math.cos(d);
        const side = Math.sin(d);
        const back = fwd < -0.2;
        rig.body.rotation.x = fwd > 0 ? 0.45 * fwd : 0.35 * fwd;
        rig.body.rotation.z = 0.3 * side;
        rig.legs.forEach((l, i) => (l.rotation.x = back ? (i ? -0.7 : 0.3) : (i ? 0.8 : -0.4) * Math.max(0.3, fwd)));
        rig.knees.forEach((k, i) => (k.rotation.x = back ? (i ? 0.4 : 0.8) : i ? 0.9 : 0.3));
        rig.arms.forEach((a) => (a.rotation.x = back ? -0.7 : 0.9 * Math.max(0.3, fwd)));
        if (rig.bits.cape) rig.bits.cape.rotation.x = back ? 0.15 : 0.4 + 0.7 * Math.max(0, fwd);
        break;
      }
      case 'slam':
        rig.arms.forEach((a) => (a.rotation.x = -2.8));
        break;
      case 'falling': {
        const k = Math.max(0, p.fallT / 0.55);
        rig.body.scale.multiplyScalar(k);
        rig.root.position.y = -(1 - k) * 60;
        break;
      }
      case 'dead':
        rig.body.rotation.x = -Math.PI / 2;
        rig.body.position.y = 6;
        break;
    }
    if (p.airborne && p.state !== 'slam') {
      rig.legs.forEach((l, i) => (l.rotation.x = i ? -0.7 : 0.2));
      rig.knees.forEach((k, i) => (k.rotation.x = i ? 1.1 : 0.7));
    }
    rig.shadow.scale.setScalar(17 * (1 - Math.min(0.5, p.z / 120)));
  }

  private poseAlly(rig: Rig, a: Ally, dt: number, t: number): void {
    this.pose(rig, a, dt, a.kind === 'wolf' ? 26 : 50);
    const fade = Math.min(1, a.ttl * 2);
    rig.body.scale.multiplyScalar(fade);
    if (a.kind === 'lantern') {
      if (rig.bits.core) rig.bits.core.position.y = 40 + Math.sin(t * 4) * 4;
      rig.root.rotation.y = t;
    }
    if (a.bite > 0 && rig.head) rig.head.rotation.x = 0.4;
  }

  // ---------------------------------------------------------------- frame

  /**
   * One door, built so no two surfaces share a plane (shared faces flicker):
   * stone posts and a lintel standing proud of the wall, a dark void behind,
   * then (back to front) the glowing portal, the edge trims sunk into the
   * posts, the bars, and a spill of light on the floor in front.
   */
  private buildDoor(x: number, trimColor: string, stoneColor: THREE.ColorRepresentation, high: boolean): DoorView {
    const g = new THREE.Group();
    g.position.set(x, 0, -B);
    const half = DOOR_W / 2;
    const postW = B + 14;
    // From the back of the wall (z = -B) to 8 units proud of its face (z = B + 8).
    const depth = 2 * B + 8;
    const zMid = depth / 2 - B;
    const frame = new THREE.MeshLambertMaterial({ color: stoneColor });
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(BOX, frame);
      post.scale.set(postW, 152, depth);
      post.position.set(sx * (half + postW / 2), 76, zMid);
      post.castShadow = high;
      g.add(post);
    }
    const lintel = new THREE.Mesh(BOX, frame);
    lintel.scale.set(DOOR_W + 2 * postW, 28, depth);
    lintel.position.set(0, 152 + 14 - 2, zMid);
    lintel.castShadow = high;
    g.add(lintel);
    // The dark beyond: sunk well behind everything else in the opening.
    const voidM = new THREE.Mesh(BOX, new THREE.MeshBasicMaterial({ color: '#040206' }));
    voidM.scale.set(DOOR_W + 4, 156, 10);
    voidM.position.set(0, 76, -B + 4);
    g.add(voidM);
    // The portal: a vertical glow across the opening, brightest at the floor.
    const portalM = new THREE.MeshBasicMaterial({ map: riseGlow(), color: 0x000000, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const portal = new THREE.Mesh(PLANE, portalM);
    portal.scale.set(DOOR_W - 6, 148, 1);
    portal.position.set(0, 74, 14);
    portal.renderOrder = 3;
    g.add(portal);
    // Glowing edges, half sunk into the posts so only their inner faces show.
    const edgeM = new THREE.MeshBasicMaterial({ color: trimColor });
    for (const sx of [-1, 1]) {
      const edge = new THREE.Mesh(BOX, edgeM);
      edge.scale.set(5, 146, depth - 6);
      edge.position.set(sx * (half + 0.5), 75, zMid - 1);
      g.add(edge);
    }
    const top = new THREE.Mesh(BOX, edgeM);
    top.scale.set(DOOR_W + 1, 5, depth - 6);
    top.position.set(0, 150.5, zMid - 1);
    g.add(top);
    // Bars, in front of the portal and clear of every other surface.
    const bars = new THREE.Group();
    const barM = new THREE.MeshLambertMaterial({ color: '#5a4a50' });
    for (let i = -2; i <= 2; i++) {
      const bar = new THREE.Mesh(BOX, barM);
      bar.scale.set(5, 140, 5);
      bar.position.set(i * 22, 70, B - 4);
      bars.add(bar);
    }
    const cross = new THREE.Mesh(BOX, barM);
    cross.scale.set(DOOR_W - 2, 6, 5);
    cross.position.set(0, 96, B - 4);
    bars.add(cross);
    g.add(bars);
    // Light spilling onto the floor in front of the door.
    const spillM = new THREE.MeshBasicMaterial({ map: radialGlow(), color: 0x000000, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const spill = new THREE.Mesh(PLANE, spillM);
    spill.rotation.x = -Math.PI / 2;
    spill.scale.set(DOOR_W * 2.4, 220, 1);
    spill.position.set(0, 1.5, B + 70);
    spill.renderOrder = 3;
    g.add(spill);
    this.props.add(g);
    return { x, g, bars, portal: portalM, spill: spillM, edge: edgeM, trim: new THREE.Color(trimColor), color: new THREE.Color(), k: 0 };
  }

  render(w: World, cam: Camera): void {
    const now = performance.now() / 1000;
    const dt = Math.min(0.05, Math.max(0, now - this.lastT));
    this.lastT = now;
    this.frame++;
    const key = `${w.room.seed}:${w.room.w}:${w.room.h}:${w.doors.map((d) => d.x).join(',')}`;
    if (w !== this.world || key !== this.roomKey) {
      if (w !== this.world) {
        for (const [a, r] of this.rigs) if (!w.players.some((p) => p === a)) this.dropRig(r), this.rigs.delete(a);
      }
      this.world = w;
      this.roomKey = key;
      this.buildRoom(w);
    }
    const t = w.time;
    const high = this.quality === 'high';

    // Camera: straight north, 45° down; frustum matches the 2D camera exactly.
    if (this.size.zoom !== cam.zoom || this.size.w !== cam.vw || this.size.h !== cam.vh) {
      const hw = cam.vw / (2 * cam.zoom);
      const hh = cam.vh / (2 * cam.zoom);
      this.camera.left = -hw;
      this.camera.right = hw;
      this.camera.top = hh;
      this.camera.bottom = -hh;
      this.camera.updateProjectionMatrix();
      this.size.zoom = cam.zoom;
    }
    const tx = cam.x + cam.ox;
    const tz = cam.y + cam.oy;
    // Same angle as the 2D camera: turned by yaw, looking down by pitch.
    const pitch = Math.asin(Math.min(1, cam.yScale));
    const sy = Math.sin(cam.yaw);
    const cy = Math.cos(cam.yaw);
    const flat = Math.cos(pitch) * CAM_DIST;
    this.camera.position.set(tx + sy * flat, Math.sin(pitch) * CAM_DIST, tz + cy * flat);
    this.camera.lookAt(tx, 0, tz);
    this.fill.position.set(sy * 1.4, 1, cy * 1.4);

    // Props
    if (this.lava) this.lava.color.setScalar(0.8 + Math.sin(t * 2) * 0.1);
    for (const f of this.flames) {
      f.scale.set(1, 0.85 + Math.sin(t * 13 + f.parent!.position.x) * 0.15, 1);
      f.rotation.y = t * 1.5;
    }
    // Doors: the glow eases in when a door opens on a reward, out when it closes.
    for (const d of this.doors) {
      const door = w.doors.find((x) => x.x === d.x);
      const open = !!door?.open;
      d.bars.visible = !open;
      const lit = open && !!door?.reward;
      d.k += ((lit ? 1 : 0) - d.k) * Math.min(1, dt * 5);
      if (door?.reward) d.color.set(rewardColor(door.reward));
      const pulse = 0.9 + Math.sin(t * 2 + d.x * 0.01) * 0.1;
      d.portal.color.copy(d.color).multiplyScalar(0.5 * d.k * pulse);
      d.spill.color.copy(d.color).multiplyScalar(0.4 * d.k * pulse);
      d.edge.color.copy(d.trim).lerp(d.color, d.k);
      d.portal.visible = d.spill.visible = d.k > 0.01;
    }
    for (const it of w.interactables) {
      let g = this.interactables.get(it);
      if (!g) {
        g = this.interactableModel(it);
        this.interactables.set(it, g);
      }
      g.position.set(it.x, 0, it.y);
      const u = g.userData;
      if (u.lid) (u.lid as THREE.Object3D).rotation.x = it.used ? -1.2 : 0;
      if (u.sparkle) (u.sparkle as THREE.Object3D).visible = !it.used;
      if (u.water) ((u.water as THREE.Mesh).material as THREE.MeshBasicMaterial).color.set(it.used ? '#2a3a4a' : '#3ab8ff');
      if (u.spout) (u.spout as THREE.Object3D).visible = !it.used;
      if (u.ghost) (u.ghost as THREE.Object3D).position.y = 28 + Math.sin(t * 2) * 3;
    }
    for (const [it, g] of this.interactables) {
      if (!w.interactables.includes(it)) {
        this.props.remove(g);
        disposeTree(g);
        this.interactables.delete(it);
      }
    }
    for (const br of w.breakables) {
      let g = this.breakables.get(br);
      if (!g) {
        g = this.breakableModel(br);
        this.breakables.set(br, g);
      }
      g.visible = !br.dead;
    }
    for (const tr of w.traps) {
      let m = this.traps.get(tr);
      if (!m) {
        m = this.trapModel(tr);
        this.traps.set(tr, m);
      }
      const up = tr.state === 'up' ? 1 : tr.state === 'armed' ? 0.2 : 0;
      m.plate.color.set(tr.state === 'armed' ? '#5a2024' : '#2a2024');
      for (const s of m.spikes) {
        s.visible = up > 0;
        s.scale.y = 22 * up;
        s.position.y = 11 * up;
      }
    }

    // Actors
    this.frame++;
    const seen = this.frame;
    for (const h of w.players) {
      const old = this.rigs.get(h);
      if (old && old.look !== JSON.stringify(h.palette)) {
        this.dropRig(old);
        this.rigs.delete(h);
      }
      const pr = this.rigFor(h, w);
      pr.seen = seen;
      w.as(h, () => this.posePlayer(pr, h, w, dt));
    }
    for (const e of w.enemies) {
      const r = this.rigFor(e, w);
      r.seen = seen;
      this.poseEnemy(r, e, dt, t + e.id);
    }
    for (const a of w.allies) {
      const r = this.rigFor(a, w);
      r.seen = seen;
      this.poseAlly(r, a, dt, t);
    }
    for (const [a, r] of this.rigs) {
      if (r.seen !== seen) {
        this.dropRig(r);
        this.rigs.delete(a);
      }
    }

    // Lights: the hero's lantern, then the nearest braziers and lava, then flashes.
    const L = this.lights;
    let n = 0;
    const put = (x: number, y: number, z: number, color: string, r: number, k: number) => {
      if (n >= L.length) return;
      const l = L[n++];
      l.position.set(x, z, y);
      l.color.set(color);
      l.distance = r;
      l.intensity = k;
    };
    for (const h of w.players) put(h.x, h.y, 70 + h.z, '#ffc8a0', high ? 480 : 520, (high ? 1.6 : 1.9) * (h.state === 'dead' ? 0.5 : 1));
    if (high) {
      // Doors keep their own slots right after the hero, so flashes and
      // braziers never take their light away.
      for (const d of this.doors) if (d.k > 0.01) put(d.x, 30, 70, `#${d.color.getHexString()}`, 300, 1.3 * d.k);
      // Braziers and lava: the nearest few, eased in and out so walking
      // around never makes a light pop on or off.
      const free = Math.max(0, L.length - n - 1);
      const want = new Set(
        this.staticLights
          .map((s, i) => ({ i, d: Math.hypot(s.x - tx, s.y - tz) }))
          .sort((a, b) => a.d - b.d)
          .slice(0, free)
          .map((x) => x.i),
      );
      const W = this.staticW;
      this.staticLights.forEach((_, i) => (W[i] = Math.max(0, Math.min(1, (W[i] ?? 0) + (want.has(i) ? dt : -dt) * 2.5))));
      const shown = this.staticLights
        .map((s, i) => ({ s, w: W[i] }))
        .filter((x) => x.w > 0)
        .sort((a, b) => b.w - a.w)
        .slice(0, free);
      for (const { s, w: k } of shown) put(s.x, s.y, s.z, s.color, s.r, s.k * k * (0.95 + Math.sin(t * 3 + s.x) * 0.05));
      for (const e of w.enemies) if (e.isBoss && !e.dead) put(e.x, e.y, e.height * 0.6, '#ff5a5a', 320, 1.2);
      const fl = [...w.flashes].sort((a, b) => b.r - a.r);
      for (const f of fl) put(f.x, f.y, 40, f.color, f.r * 1.2, 2.5 * (1 - f.t / f.dur));
    }
    while (n < L.length) L[n++].intensity = 0;
    this.sun.intensity = high ? 1.8 : 1.6;
    this.hemi.intensity = high ? 1.3 : 1.6;
    this.fill.intensity = 0.9;

    this.renderer.render(this.scene, this.camera);
  }
}

/**
 * The hero on the appearance screen, built from the same voxel model the 3D
 * view draws and seen from the game camera's angle. It turns slowly (drag to
 * turn it yourself) and stops when its canvas leaves the page.
 */
export class HeroPreview {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.OrthographicCamera;
  private rig: Rig | null = null;
  private look = '';
  private facing = Math.PI / 4;
  private drag: number | null = null;
  private last = performance.now();
  private raf = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private player: Player,
    yaw: number,
    pitch: number,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    const w = canvas.clientWidth || canvas.width;
    const h = canvas.clientHeight || canvas.height;
    this.renderer.setSize(w, h, false);
    // Frame the whole figure: about 80 units tall, centred on its middle.
    const halfH = 46;
    const halfW = (halfH * w) / h;
    this.camera = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 1, 3000);
    const flat = Math.cos(pitch) * 800;
    this.camera.position.set(Math.sin(yaw) * flat, 34 + Math.sin(pitch) * 800, Math.cos(yaw) * flat);
    this.camera.lookAt(0, 34, 0);
    // The game's lights: sky and ground, a warm sun, a cool fill from the camera side.
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x222222, 1.6));
    const sun = new THREE.DirectionalLight(0xffe8d0, 1.6);
    sun.position.set(-0.6, 1, 0.4);
    const fill = new THREE.DirectionalLight(0xc8c0ff, 0.9);
    fill.position.set(Math.sin(yaw) * 1.4, 1, Math.cos(yaw) * 1.4);
    this.scene.add(sun, fill);
    canvas.addEventListener('pointerdown', (e) => {
      this.drag = e.clientX;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (this.drag === null) return;
      this.facing -= (e.clientX - this.drag) * 0.02;
      this.drag = e.clientX;
    });
    canvas.addEventListener('pointerup', () => (this.drag = null));
    this.loop();
  }

  private build(): void {
    const look = JSON.stringify(this.player.palette) + this.player.weapon.id;
    if (this.rig && look === this.look) return;
    if (this.rig) {
      this.scene.remove(this.rig.root);
      disposeTree(this.rig.root);
    }
    const b = new RigBuilder(false);
    const rig = buildHeroRig(this.player, b, new THREE.MeshBasicMaterial({ visible: false }));
    equipWeapon(rig, this.player.weapon.id, b);
    rig.body.scale.setScalar((56 / rig.unit) * FIGURE_SCALE);
    if (rig.bits.weapon) rig.bits.weapon.rotation.set(0.35, 0, 0);
    this.scene.add(rig.root);
    this.rig = rig;
    this.look = look;
  }

  private loop = (): void => {
    if (!this.canvas.isConnected) {
      this.dispose();
      return;
    }
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.build();
    const rig = this.rig!;
    if (this.drag === null) this.facing += dt * 0.5;
    rig.root.rotation.set(0, Math.PI / 2 - this.facing, 0);
    // Breathing, as in the game's idle pose.
    rig.idle += dt;
    const k = Math.sin(rig.idle * 2.2);
    if (rig.bits.torso) rig.bits.torso.scale.set(1 + k * 0.012, 1 + k * 0.018, 1 + k * 0.012);
    rig.arms.forEach((a, i) => (a.rotation.z = (i ? 1 : -1) * (0.06 + k * 0.03)));
    if (rig.bits.cape) rig.bits.cape.rotation.x = 0.04 + Math.sin(rig.idle * 1.3) * 0.03;
    if (rig.bits.flame) {
      rig.bits.flame.scale.y = 0.8 + Math.sin(rig.idle * 14) * 0.25;
      rig.bits.flame.rotation.y = rig.idle * 2;
    }
    if (rig.bits.halo) rig.bits.halo.rotation.y = rig.idle;
    this.renderer.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(this.loop);
  };

  dispose(): void {
    cancelAnimationFrame(this.raf);
    if (this.rig) disposeTree(this.rig.root);
    this.renderer.dispose();
  }
}
