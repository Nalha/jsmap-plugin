export type Millis = number;

/** Waits for a number of milliseconds. */
export async function delay(ms: Millis): Promise<void> {
  await tick(scale(ms));
}

function tick(ms: number): Promise<void> {
  return Promise.resolve();
}

function scale(ms: number): number {
  return ms * 1000;
}

export const now = (): number => Date.now();
