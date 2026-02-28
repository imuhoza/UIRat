/**
 * @file box-shadow-parser.test.ts — Unit Tests for CSS Box-Shadow Parser
 *
 * Tests the parseBoxShadows() function which converts CSS box-shadow strings
 * (as returned by getComputedStyle) into structured CIRBoxShadow objects.
 */

import { describe, it, expect } from 'vitest';
import { parseBoxShadows } from '../src/serializer/box-shadow-parser.js';

describe('parseBoxShadows', () => {
  // ---- No shadow cases ----

  describe('no shadow', () => {
    it('returns empty array for "none"', () => {
      expect(parseBoxShadows('none')).toEqual([]);
    });

    it('returns empty array for empty string', () => {
      expect(parseBoxShadows('')).toEqual([]);
    });
  });

  // ---- Single shadow ----

  describe('single shadow', () => {
    it('parses a basic drop shadow with rgba color', () => {
      const result = parseBoxShadows('rgba(0, 0, 0, 0.1) 0px 4px 6px -1px');
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        inset: false,
        offsetX: 0,
        offsetY: 4,
        blurRadius: 6,
        spreadRadius: -1,
        color: 'rgba(0, 0, 0, 0.1)',
      });
    });

    it('parses a shadow with zero blur and spread', () => {
      const result = parseBoxShadows('rgba(0, 0, 0, 0.5) 2px 3px 0px 0px');
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        inset: false,
        offsetX: 2,
        offsetY: 3,
        blurRadius: 0,
        spreadRadius: 0,
        color: 'rgba(0, 0, 0, 0.5)',
      });
    });

    it('parses a shadow with only offset and blur (no spread)', () => {
      const result = parseBoxShadows('rgba(0, 0, 0, 0.2) 0px 2px 4px');
      expect(result).toHaveLength(1);
      expect(result[0]!.offsetX).toBe(0);
      expect(result[0]!.offsetY).toBe(2);
      expect(result[0]!.blurRadius).toBe(4);
      expect(result[0]!.spreadRadius).toBe(0);
    });
  });

  // ---- Inset shadows ----

  describe('inset shadow', () => {
    it('detects the inset keyword', () => {
      const result = parseBoxShadows('inset rgba(0, 0, 0, 0.3) 0px 2px 4px 0px');
      expect(result).toHaveLength(1);
      expect(result[0]!.inset).toBe(true);
    });

    it('handles inset with negative offsets', () => {
      const result = parseBoxShadows('rgba(0, 0, 0, 0.1) -2px -3px 5px inset');
      expect(result).toHaveLength(1);
      expect(result[0]!.inset).toBe(true);
      expect(result[0]!.offsetX).toBe(-2);
      expect(result[0]!.offsetY).toBe(-3);
    });
  });

  // ---- Multiple shadows ----

  describe('multiple shadows', () => {
    it('parses two comma-separated shadows', () => {
      const input =
        'rgba(0, 0, 0, 0.1) 0px 4px 6px -1px, rgba(0, 0, 0, 0.06) 0px 2px 4px -1px';
      const result = parseBoxShadows(input);
      expect(result).toHaveLength(2);

      expect(result[0]!.offsetY).toBe(4);
      expect(result[0]!.blurRadius).toBe(6);
      expect(result[0]!.color).toBe('rgba(0, 0, 0, 0.1)');

      expect(result[1]!.offsetY).toBe(2);
      expect(result[1]!.blurRadius).toBe(4);
      expect(result[1]!.color).toBe('rgba(0, 0, 0, 0.06)');
    });

    it('parses mix of inset and non-inset', () => {
      const input =
        'rgba(0, 0, 0, 0.2) 0px 4px 8px, inset rgba(255, 255, 255, 0.5) 0px 1px 2px';
      const result = parseBoxShadows(input);
      expect(result).toHaveLength(2);
      expect(result[0]!.inset).toBe(false);
      expect(result[1]!.inset).toBe(true);
    });
  });

  // ---- Hex color shadows ----

  describe('hex color shadows', () => {
    it('parses shadow with hex color', () => {
      const result = parseBoxShadows('#00000033 0px 4px 8px');
      expect(result).toHaveLength(1);
      expect(result[0]!.color).toBe('#00000033');
      expect(result[0]!.blurRadius).toBe(8);
    });
  });
});
