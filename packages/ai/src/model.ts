import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogle } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateObject, generateText, type LanguageModel } from 'ai';
import type { z } from 'zod';

export type AiProviderKind = 'OPENAI' | 'ANTHROPIC' | 'GOOGLE' | 'LOCAL';

export interface ModelConfig {
  provider: AiProviderKind;
  model: string;
  apiKey?: string;
  baseUrl?: string;
}

export interface GenerateOptions {
  system?: string;
  prompt: string;
  schema?: z.ZodType;
  maxOutputTokens?: number;
  temperature?: number;
}

export interface ModelPort {
  generateText(opts: GenerateOptions): Promise<{ text: string }>;
  generateObject<T>(opts: GenerateOptions & { schema: z.ZodType<T> }): Promise<{ object: T }>;
}

const DEFAULT_LOCAL_BASE_URL = 'http://localhost:11434/v1';

function resolveLanguageModel(config: ModelConfig): LanguageModel {
  switch (config.provider) {
    case 'OPENAI':
      return createOpenAI({ apiKey: config.apiKey, baseURL: config.baseUrl })(config.model);
    case 'ANTHROPIC':
      return createAnthropic({ apiKey: config.apiKey, baseURL: config.baseUrl })(config.model);
    case 'GOOGLE':
      return createGoogle({ apiKey: config.apiKey, baseURL: config.baseUrl })(config.model);
    case 'LOCAL':
      return createOpenAICompatible({
        name: 'local',
        apiKey: config.apiKey,
        baseURL: config.baseUrl ?? DEFAULT_LOCAL_BASE_URL,
      })(config.model);
    default: {
      const exhaustive: never = config.provider;
      throw new Error(`Unknown AI provider: ${String(exhaustive)}`);
    }
  }
}

class AiSdkModelPort implements ModelPort {
  constructor(private readonly languageModel: LanguageModel) {}

  async generateText(opts: GenerateOptions): Promise<{ text: string }> {
    const { text } = await generateText({
      model: this.languageModel,
      system: opts.system,
      prompt: opts.prompt,
      maxOutputTokens: opts.maxOutputTokens,
      temperature: opts.temperature,
    });
    return { text };
  }

  async generateObject<T>(
    opts: GenerateOptions & { schema: z.ZodType<T> },
  ): Promise<{ object: T }> {
    const { object } = await generateObject({
      model: this.languageModel,
      system: opts.system,
      prompt: opts.prompt,
      schema: opts.schema,
      maxOutputTokens: opts.maxOutputTokens,
      temperature: opts.temperature,
    });
    return { object };
  }
}

/** AI SDK adapter: routes to the OpenAI/Anthropic/Google SDKs, or an OpenAI-compatible
 * endpoint (e.g. Ollama) for LOCAL. */
export function resolveModel(config: ModelConfig): ModelPort {
  return new AiSdkModelPort(resolveLanguageModel(config));
}
