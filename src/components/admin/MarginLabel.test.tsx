import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import MarginLabel from './MarginLabel';

afterEach(cleanup);

describe('MarginLabel', () => {
  it.each([35, 35.01, 75])('marks %s percent green, including exactly 35', margin => {
    render(<MarginLabel margin={margin}>Margin</MarginLabel>);
    expect(screen.getByText('Margin').className).toContain('text-green-800');
    expect(screen.getByText('Good')).toBeTruthy();
  });

  it.each([34.99, 0, -10])('marks %s percent red without rounding up', margin => {
    render(<MarginLabel margin={margin}>Margin</MarginLabel>);
    expect(screen.getByText('Margin').className).toContain('text-red-800');
    expect(screen.getByText('Below 35%')).toBeTruthy();
  });

  it.each([null, undefined, NaN, Infinity])('keeps unavailable margin %s neutral', margin => {
    render(<MarginLabel margin={margin}>Margin</MarginLabel>);
    expect(screen.getByText('Margin').className).toContain('text-cocoa/60');
    expect(screen.getByText('Not calculated')).toBeTruthy();
  });

  it('gradually strengthens the red tint as margin falls, clamping at zero', () => {
    const { rerender } = render(<MarginLabel margin={34.99}>Margin</MarginLabel>);
    const alpha = () => Number(screen.getByText('Margin').style.backgroundColor.match(/,\s*([\d.]+)\)$/)?.[1]);
    const nearThreshold = alpha();
    rerender(<MarginLabel margin={20}>Margin</MarginLabel>);
    const middle = alpha();
    rerender(<MarginLabel margin={0}>Margin</MarginLabel>);
    const lowest = alpha();
    expect(nearThreshold).toBeGreaterThan(0);
    expect(middle).toBeGreaterThan(nearThreshold);
    expect(lowest).toBeGreaterThan(middle);
    expect(lowest).toBeLessThan(1);
    rerender(<MarginLabel margin={-100}>Margin</MarginLabel>);
    expect(alpha()).toBe(lowest);
    rerender(<MarginLabel margin={35}>Margin</MarginLabel>);
    expect(screen.getByText('Margin').style.backgroundColor).toBe('');
  });
});
