import { describe, expect, it } from 'vitest';
import { consumeProgrammaticScroll, setScrollTopWithoutEcho } from '../useScrollSync';

describe('scroll synchronization feedback guard', () => {
  it('consumes the scroll event caused by a programmatic position update', () => {
    const element = { scrollTop: 0 };
    const expectedScrollRef = { current: null };

    expect(setScrollTopWithoutEcho(element, expectedScrollRef, 120)).toBe(true);
    expect(element.scrollTop).toBe(120);
    expect(expectedScrollRef.current).toBe(120);

    expect(consumeProgrammaticScroll(element, expectedScrollRef)).toBe(true);
    expect(expectedScrollRef.current).toBeNull();
  });

  it('does not assign a new position when the target is already aligned', () => {
    const element = { scrollTop: 42 };
    const expectedScrollRef = { current: null };

    expect(setScrollTopWithoutEcho(element, expectedScrollRef, 42)).toBe(false);
    expect(expectedScrollRef.current).toBeNull();
  });

  it('treats an interrupted programmatic scroll as a user scroll', () => {
    const element = { scrollTop: 120 };
    const expectedScrollRef = { current: 120 };

    // The user moves the panel before the queued programmatic event is handled.
    element.scrollTop = 95;

    expect(consumeProgrammaticScroll(element, expectedScrollRef)).toBe(false);
    expect(expectedScrollRef.current).toBeNull();
  });

  it('accepts sub-pixel browser rounding when consuming a scroll echo', () => {
    const element = { scrollTop: 120.5 };
    const expectedScrollRef = { current: 120 };

    expect(consumeProgrammaticScroll(element, expectedScrollRef)).toBe(true);
    expect(expectedScrollRef.current).toBeNull();
  });
});
