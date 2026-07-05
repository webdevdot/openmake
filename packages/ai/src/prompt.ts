import type { DesignContext } from '@openmake/shared';

export interface SkillSpecLike {
  systemPrompt: string;
}

export interface PromptLayers {
  basePrompt?: string;
  skill?: SkillSpecLike;
  projectContext?: string;
  designContext?: DesignContext;
  framework?: string;
  userRequest: string;
}

const DEFAULT_BASE_PROMPT =
  'You are a senior design-tool AI, collaborating on an openmake document. ' +
  'Ground every response in the provided design context and respect the existing structure of the document.';

/**
 * Dynamic Prompt Assembly: layers a system prompt (base + skill + project
 * context + framework directive) and a user prompt (compact design context
 * JSON + request), in a fixed, deterministic order.
 */
export function assemblePrompt(layers: PromptLayers): { system: string; prompt: string } {
  const systemParts: string[] = [layers.basePrompt ?? DEFAULT_BASE_PROMPT];

  if (layers.skill) systemParts.push(layers.skill.systemPrompt);
  if (layers.projectContext) systemParts.push(layers.projectContext);
  if (layers.framework) systemParts.push(`Target framework: ${layers.framework}.`);

  const promptParts: string[] = [];
  if (layers.designContext) {
    promptParts.push(`Design context:\n${JSON.stringify(compact(layers.designContext))}`);
  }
  promptParts.push(layers.userRequest);

  return {
    system: systemParts.join('\n\n'),
    prompt: promptParts.join('\n\n'),
  };
}

/** Recursively strips empty strings, empty arrays/objects, null, and undefined. */
function compact(value: unknown): unknown {
  if (Array.isArray(value)) {
    const items = value.map(compact).filter((item) => !isEmpty(item));
    return items;
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      const compacted = compact(val);
      if (!isEmpty(compacted)) result[key] = compacted;
    }
    return result;
  }
  return value;
}

function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}
