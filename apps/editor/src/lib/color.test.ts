import { describe, expect, it } from 'vitest';
import { colorToHex, hexToColor } from './color.js';

describe('color conversion', () => {
  it('hexToColor parses 6-digit hex', () => {
    expect(hexToColor('#ff0000')).toEqual({ r: 1, g: 0, b: 0, a: 1 });
    expect(hexToColor('00ff00')).toEqual({ r: 0, g: 1, b: 0, a: 1 });
  });

  it('hexToColor parses 3-digit shorthand hex', () => {
    expect(hexToColor('#f00')).toEqual({ r: 1, g: 0, b: 0, a: 1 });
  });

  it('hexToColor parses 8-digit hex with alpha', () => {
    const result = hexToColor('#0000ff80');
    expect(result?.r).toBe(0);
    expect(result?.b).toBe(1);
    expect(result?.a).toBeCloseTo(0.5, 1);
  });

  it('hexToColor returns null for invalid input', () => {
    expect(hexToColor('not-a-color')).toBeNull();
    expect(hexToColor('#12')).toBeNull();
  });

  it('colorToHex formats floats back to a 6-digit hex string', () => {
    expect(colorToHex({ r: 1, g: 0, b: 0, a: 1 })).toBe('#ff0000');
    expect(colorToHex({ r: 0, g: 0, b: 0, a: 1 })).toBe('#000000');
  });

  it('round-trips hex -> color -> hex', () => {
    const hex = '#3a7bd5';
    const color = hexToColor(hex)!;
    expect(colorToHex(color)).toBe(hex);
  });
});
