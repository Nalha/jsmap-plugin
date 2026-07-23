import assert = require('node:assert');

namespace Shapes {
  export function area(radius: number): number {
    return radius * radius;
  }
}

/** Formats a shape's area as a label. */
function render(name: string, radius: number): string {
  assert.ok(radius > 0);
  return `${name}: ${Shapes.area(radius)}`;
}

export = render;
