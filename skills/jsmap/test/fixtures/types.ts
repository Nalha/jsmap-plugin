import type { Store } from './core.js';

interface Point {
  x: number;
  y: number;
}

type Vector = Point & { z: number };

enum Direction {
  North,
  South,
}

/** Combines two points into one. */
export function combine(a: Point, b: Point): Point {
  return { x: scale(a.x, 2), y: scale(b.y, 2) };
}

function scale(value: number, factor: number): number {
  return value * factor;
}

export const clamp = (n: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, n));

export class Grid<T extends Point> {
  private cells: T[] = [];
  constructor(private width: number, readonly height: number) {}
  add(cell: T, options?: { silent: boolean }): void {
    scale(this.width, 1);
  }
  static empty(): Grid<Point> {
    return new Grid(0, 0);
  }
}

export function overloaded(x: number): number;
export function overloaded(x: string): string;
export function overloaded(x: unknown): unknown {
  return x;
}
