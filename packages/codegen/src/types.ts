import type { CodegenFramework, DesignContext } from '@openmake/shared';

export interface GeneratedFile {
  path: string;
  content: string;
}

export interface Generator {
  framework: CodegenFramework;
  generate(ctx: DesignContext): GeneratedFile[];
}
