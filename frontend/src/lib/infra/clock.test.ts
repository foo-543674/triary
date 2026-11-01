import { describe, expect, it } from 'vitest';
import { createFixedClock } from './clock';

describe('createFixedClock', () => {
  it('always answers the pinned instant and its local date', () => {
    const clock = createFixedClock(new Date(2026, 9, 31, 8, 30));
    expect(clock.now().getTime()).toBe(new Date(2026, 9, 31, 8, 30).getTime());
    expect(clock.today()).toBe('2026-10-31');
  });

  it('hands out copies so callers cannot move the clock', () => {
    const clock = createFixedClock(new Date(2026, 9, 31));
    clock.now().setFullYear(2000);
    expect(clock.today()).toBe('2026-10-31');
    expect(clock.now().getFullYear()).toBe(2026);
  });
});
