import { describe, expect, it } from 'vitest';
import { PluginManifestSchema } from '../src/index.js';

describe('PluginManifestSchema', () => {
  it('accepts a valid manifest', () => {
    const manifest = {
      id: 'com.example.plugin',
      name: 'Example Plugin',
      version: '1.0.0',
      main: 'main.js',
      permissions: ['document:read', 'ui'],
    };
    expect(() => PluginManifestSchema.parse(manifest)).not.toThrow();
  });

  it('rejects a manifest missing required fields', () => {
    const manifest = {
      name: 'Missing id and main',
      version: '1.0.0',
      permissions: [],
    };
    expect(() => PluginManifestSchema.parse(manifest)).toThrow();
  });

  it('rejects an unknown permission', () => {
    const manifest = {
      id: 'com.example.plugin',
      name: 'Example Plugin',
      version: '1.0.0',
      main: 'main.js',
      permissions: ['document:read', 'super-admin'],
    };
    expect(() => PluginManifestSchema.parse(manifest)).toThrow();
  });
});
