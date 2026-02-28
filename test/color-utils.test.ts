/**
 * @file color-utils.test.ts — Unit Tests for CSS Color to Figma Color Conversion
 *
 * Tests the cssColorToFigma() function which converts CSS color strings
 * (from getComputedStyle) to Figma's {r, g, b, a} format (0–1 range).
 */

import { describe, it, expect } from 'vitest';
import { cssColorToFigma } from '../src/transformer/color-utils.js';

describe('cssColorToFigma', () => {
  // ---- rgba() format (most common from getComputedStyle) ----

  describe('rgba() format', () => {
    it('converts a fully opaque red', () => {
      const result = cssColorToFigma('rgba(255, 0, 0, 1)');
      expect(result).toEqual({ r: 1, g: 0, b: 0, a: 1 });
    });

    it('converts a semi-transparent black', () => {
      const result = cssColorToFigma('rgba(0, 0, 0, 0.5)');
      expect(result).toEqual({ r: 0, g: 0, b: 0, a: 0.5 });
    });

    it('converts a color with intermediate channel values', () => {
      const result = cssColorToFigma('rgba(128, 64, 32, 0.8)');
      expect(result.r).toBeCloseTo(128 / 255, 2);
      expect(result.g).toBeCloseTo(64 / 255, 2);
      expect(result.b).toBeCloseTo(32 / 255, 2);
      expect(result.a).toBe(0.8);
    });

    it('handles transparent (all zeros)', () => {
      const result = cssColorToFigma('rgba(0, 0, 0, 0)');
      expect(result).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    });
  });

  // ---- rgb() format (no alpha) ----

  describe('rgb() format', () => {
    it('converts rgb() with implicit full opacity', () => {
      const result = cssColorToFigma('rgb(0, 128, 255)');
      expect(result.r).toBe(0);
      expect(result.g).toBeCloseTo(128 / 255, 2);
      expect(result.b).toBe(1);
      expect(result.a).toBe(1);
    });

    it('converts pure white', () => {
      const result = cssColorToFigma('rgb(255, 255, 255)');
      expect(result).toEqual({ r: 1, g: 1, b: 1, a: 1 });
    });
  });

  // ---- Hex format ----

  describe('hex format', () => {
    it('converts 6-digit hex', () => {
      const result = cssColorToFigma('#FF0000');
      expect(result).toEqual({ r: 1, g: 0, b: 0, a: 1 });
    });

    it('converts lowercase 6-digit hex', () => {
      const result = cssColorToFigma('#00ff00');
      expect(result).toEqual({ r: 0, g: 1, b: 0, a: 1 });
    });

    it('converts 8-digit hex with alpha', () => {
      const result = cssColorToFigma('#00FF0080');
      expect(result.r).toBe(0);
      expect(result.g).toBe(1);
      expect(result.b).toBe(0);
      expect(result.a).toBeCloseTo(128 / 255, 2);
    });

    it('converts 3-digit shorthand hex', () => {
      const result = cssColorToFigma('#F00');
      expect(result).toEqual({ r: 1, g: 0, b: 0, a: 1 });
    });
  });

  // ---- Named colors ----

  describe('named colors', () => {
    it('converts "transparent"', () => {
      const result = cssColorToFigma('transparent');
      expect(result).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    });

    it('converts "black"', () => {
      const result = cssColorToFigma('black');
      expect(result).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    });

    it('converts "white"', () => {
      const result = cssColorToFigma('white');
      expect(result).toEqual({ r: 1, g: 1, b: 1, a: 1 });
    });
  });

  // ---- Edge cases ----

  describe('edge cases', () => {
    it('returns transparent for empty string', () => {
      const result = cssColorToFigma('');
      expect(result).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    });

    it('returns transparent for unrecognized format', () => {
      const result = cssColorToFigma('not-a-color');
      expect(result).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    });

    it('handles whitespace around the value', () => {
      const result = cssColorToFigma('  rgba(255, 0, 0, 1)  ');
      expect(result).toEqual({ r: 1, g: 0, b: 0, a: 1 });
    });
  });
});
