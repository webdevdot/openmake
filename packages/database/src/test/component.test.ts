import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ComponentAttachmentValidationError } from '../repositories/component-repo.js';
import { createTestContext, resetDatabase, type TestContext } from './helpers.js';

describe('ComponentRepo', () => {
  let ctx: TestContext;
  let fileId: string;
  let orgId: string;

  beforeEach(async () => {
    ctx = await createTestContext();
    await resetDatabase();

    const owner = await ctx.db.users.create({
      email: 'componentowner@example.com',
      passwordHash: 'hashed',
      name: 'Owner',
    });
    const org = await ctx.db.orgs.create({ name: 'CompOrg', slug: 'comp-org', ownerId: owner.id });
    orgId = org.id;
    const project = await ctx.db.projects.create({ orgId: org.id, name: 'Project' });
    const file = await ctx.db.files.create({ projectId: project.id, name: 'Comp.design' });
    fileId = file.id;
  });

  afterAll(async () => {
    await ctx?.teardown();
  });

  it('upserts a component by fileId+nodeId', async () => {
    const created = await ctx.db.components.upsertByNode({
      fileId,
      nodeId: 'node-1',
      name: 'Button',
      metadata: { variant: 'primary' },
    });

    const updated = await ctx.db.components.upsertByNode({
      fileId,
      nodeId: 'node-1',
      name: 'Button (renamed)',
      metadata: { variant: 'secondary' },
    });

    expect(updated.id).toBe(created.id);
    expect(updated.name).toBe('Button (renamed)');

    const all = await ctx.db.components.listByFile(fileId);
    expect(all).toHaveLength(1);
  });

  it('rejects attachments with none of skill/agent/workflow set', async () => {
    const component = await ctx.db.components.upsertByNode({
      fileId,
      nodeId: 'node-2',
      name: 'Card',
      metadata: {},
    });

    expect(() => ctx.db.components.createAttachment({ componentId: component.id })).toThrow(
      ComponentAttachmentValidationError,
    );
  });

  it('accepts an attachment with a skill set', async () => {
    const component = await ctx.db.components.upsertByNode({
      fileId,
      nodeId: 'node-3',
      name: 'Card',
      metadata: {},
    });
    const skill = await ctx.db.skills.create({
      orgId,
      name: 'test-skill',
      description: 'desc',
      systemPrompt: 'prompt',
    });

    const attachment = await ctx.db.components.createAttachment({
      componentId: component.id,
      skillId: skill.id,
    });

    expect(attachment.skillId).toBe(skill.id);
    const attachments = await ctx.db.components.listAttachments(component.id);
    expect(attachments).toHaveLength(1);
  });

  it('increments generated code version per component+framework', async () => {
    const component = await ctx.db.components.upsertByNode({
      fileId,
      nodeId: 'node-4',
      name: 'Header',
      metadata: {},
    });

    const v1 = await ctx.db.components.saveGeneratedCode({
      componentId: component.id,
      framework: 'REACT',
      code: 'const Header = () => null;',
      hash: 'hash1',
    });
    const v2 = await ctx.db.components.saveGeneratedCode({
      componentId: component.id,
      framework: 'REACT',
      code: 'const Header = () => <div/>;',
      hash: 'hash2',
    });
    const vueV1 = await ctx.db.components.saveGeneratedCode({
      componentId: component.id,
      framework: 'VUE',
      code: '<template/>',
      hash: 'hash3',
    });

    expect(v1.version).toBe(1);
    expect(v2.version).toBe(2);
    expect(vueV1.version).toBe(1);

    const latest = await ctx.db.components.latestGeneratedCode(component.id, 'REACT');
    expect(latest?.version).toBe(2);
  });

  it('round-trips an embedding and finds it via cosine search', async () => {
    const component = await ctx.db.components.upsertByNode({
      fileId,
      nodeId: 'node-5',
      name: 'Vectorized',
      metadata: {},
    });

    const embedding = Array.from({ length: 1536 }, (_, i) => (i === 0 ? 1 : 0));
    await ctx.db.components.upsertEmbedding(component.id, embedding, 'test-model');

    const results = await ctx.db.components.semanticSearch(embedding, 5);
    expect(results.some((r) => r.componentId === component.id)).toBe(true);

    const exact = results.find((r) => r.componentId === component.id);
    expect(exact?.distance).toBeCloseTo(0, 5);
  });
});
