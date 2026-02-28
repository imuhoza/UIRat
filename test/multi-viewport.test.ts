/**
 * @file multi-viewport.test.ts — Tests for Viewport Configuration
 *
 * Pure function tests — no mocks needed.
 */

import { describe, it, expect } from 'vitest';
import { parseViewportSpec } from '../src/crawler/viewport-config.js';

describe('parseViewportSpec', () => {
  // Named presets
  it('parses "desktop" preset', () => {
    const result = parseViewportSpec('desktop');
    expect(result).toEqual([{ name: 'desktop', width: 1440, height: 900 }]);
  });

  it('parses "tablet" preset', () => {
    const result = parseViewportSpec('tablet');
    expect(result).toEqual([{ name: 'tablet', width: 768, height: 1024 }]);
  });

  it('parses "mobile" preset', () => {
    const result = parseViewportSpec('mobile');
    expect(result).toEqual([{ name: 'mobile', width: 375, height: 812 }]);
  });

  // Comma-separated presets
  it('parses comma-separated presets', () => {
    const result = parseViewportSpec('desktop,tablet,mobile');
    expect(result).toHaveLength(3);
    expect(result[0]!.name).toBe('desktop');
    expect(result[1]!.name).toBe('tablet');
    expect(result[2]!.name).toBe('mobile');
  });

  // Custom WxH format
  it('parses custom WxH format', () => {
    const result = parseViewportSpec('1920x1080');
    expect(result).toEqual([{ name: '1920x1080', width: 1920, height: 1080 }]);
  });

  // Mixed format
  it('parses mixed presets and custom dimensions', () => {
    const result = parseViewportSpec('desktop,768x1024,mobile');
    expect(result).toHaveLength(3);
    expect(result[0]!.width).toBe(1440);
    expect(result[1]!.width).toBe(768);
    expect(result[2]!.width).toBe(375);
  });

  // Case insensitivity
  it('handles case-insensitive preset names', () => {
    const result = parseViewportSpec('Desktop,TABLET,Mobile');
    expect(result).toHaveLength(3);
    expect(result[0]!.width).toBe(1440);
    expect(result[1]!.width).toBe(768);
    expect(result[2]!.width).toBe(375);
  });

  // Whitespace handling
  it('trims whitespace around segments', () => {
    const result = parseViewportSpec(' desktop , tablet ');
    expect(result).toHaveLength(2);
  });

  // Error cases
  it('throws on empty spec', () => {
    expect(() => parseViewportSpec('')).toThrow('cannot be empty');
  });

  it('throws on unknown preset name', () => {
    expect(() => parseViewportSpec('widescreen')).toThrow('Unknown viewport preset');
  });

  it('throws on invalid WxH format', () => {
    expect(() => parseViewportSpec('abcxdef')).toThrow('must be positive integers');
  });

  it('throws on negative dimensions', () => {
    expect(() => parseViewportSpec('-100x900')).toThrow('must be positive integers');
  });

  it('throws on zero dimensions', () => {
    expect(() => parseViewportSpec('0x0')).toThrow('must be positive integers');
  });

  it('throws on incomplete WxH (missing height)', () => {
    expect(() => parseViewportSpec('1440x')).toThrow('must be positive integers');
  });
});
