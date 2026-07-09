import { createHash } from 'node:crypto';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { buildTestApp, type TestApp } from './helpers.js';
import { resetDatabase } from './db-setup.js';
import { MAX_ASSET_BODY_BYTES } from '../routes/files.js';

function sha256Hex(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** A valid-format hex SHA-256 that is (almost certainly) not any real payload's hash. */
const ZERO_HASH = '0'.repeat(64);

describe('image assets', () => {
  let ctx: TestApp;
  let accessToken: string; // owner (EDITOR+)
  let viewerToken: string; // VIEWER-role member
  let outsiderToken: string; // non-member
  let fileId: string;

  beforeAll(async () => {
    ctx = await buildTestApp();
    await resetDatabase();

    const registerRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'assets-owner@example.com', password: 'supersecretpassword', name: 'Owner' },
    });
    accessToken = registerRes.json().accessToken;

    const outsiderRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'assets-out@example.com', password: 'supersecretpassword', name: 'Outsider' },
    });
    outsiderToken = outsiderRes.json().accessToken;

    const orgsRes = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/orgs',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const orgId = orgsRes.json().orgs[0].id;

    const projectsRes = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/orgs/${orgId}/projects`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const projectId = projectsRes.json().projects[0].id;

    const viewerRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'assets-viewer@example.com', password: 'supersecretpassword', name: 'Viewer' },
    });
    viewerToken = viewerRes.json().accessToken;
    await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/members`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { email: 'assets-viewer@example.com', role: 'VIEWER' },
    });

    const createRes = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/files`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: 'Assets File' },
    });
    fileId = createRes.json().file.id;
  });

  afterAll(async () => {
    await ctx.teardown();
  });

  it('uploads image bytes and streams them back with the right content-type', async () => {
    const bytes = Buffer.from('fake-png-pixel-payload-round-trip');
    const hash = sha256Hex(bytes);

    const putRes = await ctx.app.inject({
      method: 'PUT',
      url: `/api/v1/files/${fileId}/assets/${hash}`,
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'image/png' },
      payload: bytes,
    });
    expect(putRes.statusCode).toBe(200);
    expect(putRes.json()).toMatchObject({ hash, deduplicated: false });

    const getRes = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/files/${fileId}/assets/${hash}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.headers['content-type']).toContain('image/png');
    expect(Buffer.from(getRes.rawPayload).equals(bytes)).toBe(true);
  });

  it('is idempotent: re-uploading the same hash is a deduplicated 200 no-op', async () => {
    const bytes = Buffer.from('dedupe-me-please');
    const hash = sha256Hex(bytes);
    const url = `/api/v1/files/${fileId}/assets/${hash}`;
    const headers = { authorization: `Bearer ${accessToken}`, 'content-type': 'image/jpeg' };

    const first = await ctx.app.inject({ method: 'PUT', url, headers, payload: bytes });
    expect(first.statusCode).toBe(200);
    expect(first.json().deduplicated).toBe(false);

    const second = await ctx.app.inject({ method: 'PUT', url, headers, payload: bytes });
    expect(second.statusCode).toBe(200);
    expect(second.json().deduplicated).toBe(true);
  });

  it('rejects a body whose SHA-256 does not match the :hash path (integrity)', async () => {
    const bytes = Buffer.from('the-real-bytes');
    const res = await ctx.app.inject({
      method: 'PUT',
      url: `/api/v1/files/${fileId}/assets/${ZERO_HASH}`,
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'image/png' },
      payload: bytes,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('HASH_MISMATCH');
  });

  it('rejects a non-image content-type with 400', async () => {
    const res = await ctx.app.inject({
      method: 'PUT',
      url: `/api/v1/files/${fileId}/assets/${ZERO_HASH}`,
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      payload: { not: 'an image' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_CONTENT_TYPE');
  });

  it('rejects an oversize body with 413', async () => {
    const big = Buffer.alloc(MAX_ASSET_BODY_BYTES + 1, 1);
    const res = await ctx.app.inject({
      method: 'PUT',
      url: `/api/v1/files/${fileId}/assets/${ZERO_HASH}`,
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'image/png' },
      payload: big,
    });
    expect(res.statusCode).toBe(413);
  });

  it('returns 404 for an asset that was never uploaded', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/files/${fileId}/assets/${ZERO_HASH}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejects a malformed (non-hex) hash with 400', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/files/${fileId}/assets/not-a-valid-hash`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it('forbids a VIEWER from uploading (EDITOR+ only) but allows them to read', async () => {
    const bytes = Buffer.from('viewer-cannot-write');
    const hash = sha256Hex(bytes);
    const url = `/api/v1/files/${fileId}/assets/${hash}`;

    const viewerPut = await ctx.app.inject({
      method: 'PUT',
      url,
      headers: { authorization: `Bearer ${viewerToken}`, 'content-type': 'image/png' },
      payload: bytes,
    });
    expect(viewerPut.statusCode).toBe(403);

    // Owner uploads it, then the VIEWER can GET it.
    await ctx.app.inject({
      method: 'PUT',
      url,
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'image/png' },
      payload: bytes,
    });
    const viewerGet = await ctx.app.inject({
      method: 'GET',
      url,
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    expect(viewerGet.statusCode).toBe(200);
    expect(Buffer.from(viewerGet.rawPayload).equals(bytes)).toBe(true);
  });

  it('hides the file from a non-member on both upload and read (404)', async () => {
    const bytes = Buffer.from('outsider-payload');
    const hash = sha256Hex(bytes);
    const url = `/api/v1/files/${fileId}/assets/${hash}`;

    const put = await ctx.app.inject({
      method: 'PUT',
      url,
      headers: { authorization: `Bearer ${outsiderToken}`, 'content-type': 'image/png' },
      payload: bytes,
    });
    expect(put.statusCode).toBe(404);

    const get = await ctx.app.inject({
      method: 'GET',
      url,
      headers: { authorization: `Bearer ${outsiderToken}` },
    });
    expect(get.statusCode).toBe(404);
  });
});
