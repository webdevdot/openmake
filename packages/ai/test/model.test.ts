import { describe, expect, it } from 'vitest';
import { resolveModel, type ModelConfig } from '../src/model.js';

describe('resolveModel', () => {
  it('resolves a LOCAL provider without throwing, defaulting to the local OpenAI-compatible endpoint', () => {
    const config: ModelConfig = { provider: 'LOCAL', model: 'llama3' };
    expect(() => resolveModel(config)).not.toThrow();
  });

  it('resolves a LOCAL provider with a custom baseUrl', () => {
    const config: ModelConfig = {
      provider: 'LOCAL',
      model: 'llama3',
      baseUrl: 'http://localhost:1234/v1',
    };
    expect(() => resolveModel(config)).not.toThrow();
  });

  it('throws a clear error for an unknown provider kind', () => {
    const config = { provider: 'UNKNOWN', model: 'whatever' } as unknown as ModelConfig;
    expect(() => resolveModel(config)).toThrow(/unknown ai provider/i);
  });
});
