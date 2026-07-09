import { Client as MinioClient } from 'minio';
import type { S3Config } from '../config.js';

/** A stored binary asset: its raw bytes plus the content-type to serve it with. */
export interface StoredAsset {
  bytes: Buffer;
  contentType: string;
}

/**
 * Content-addressed store for large binary assets (image pixels). Objects are
 * keyed by `<orgId>/<hash>`, so the same content uploaded twice collapses to
 * one object and org tenancy is baked into the key.
 *
 * The interface exists so routes can be tested against an in-memory fake — the
 * real implementation talks to MinIO/S3, which isn't guaranteed reachable in
 * the DB-backed test environment.
 */
export interface AssetStore {
  /** Create the backing bucket if it doesn't already exist. Safe to call repeatedly. */
  ensureBucket(): Promise<void>;
  /** True if an object exists at `key`. */
  has(key: string): Promise<boolean>;
  /** Store `bytes` at `key` with the given content-type. Overwrites are a no-op-equivalent. */
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;
  /** Fetch the object at `key`, or null if it doesn't exist. */
  get(key: string): Promise<StoredAsset | null>;
}

function parseEndpoint(endpoint: string): { endPoint: string; port: number; useSSL: boolean } {
  const url = new URL(endpoint);
  const useSSL = url.protocol === 'https:';
  const port = url.port ? Number(url.port) : useSSL ? 443 : 80;
  return { endPoint: url.hostname, port, useSSL };
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk instanceof Buffer ? chunk : Buffer.from(chunk as Uint8Array));
  }
  return Buffer.concat(chunks);
}

const CONTENT_TYPE_META = 'Content-Type';

/** MinIO/S3-backed AssetStore. Construction is cheap (no network until a call). */
export class MinioAssetStore implements AssetStore {
  private readonly client: MinioClient;
  private readonly bucket: string;

  constructor(config: S3Config) {
    const { endPoint, port, useSSL } = parseEndpoint(config.endpoint);
    this.client = new MinioClient({
      endPoint,
      port,
      useSSL,
      accessKey: config.accessKey,
      secretKey: config.secretKey,
    });
    this.bucket = config.bucket;
  }

  async ensureBucket(): Promise<void> {
    const exists = await this.client.bucketExists(this.bucket);
    if (!exists) {
      await this.client.makeBucket(this.bucket);
    }
  }

  async has(key: string): Promise<boolean> {
    try {
      await this.client.statObject(this.bucket, key);
      return true;
    } catch (err) {
      if (isNotFound(err)) return false;
      throw err;
    }
  }

  async put(key: string, bytes: Buffer, contentType: string): Promise<void> {
    await this.client.putObject(this.bucket, key, bytes, bytes.length, {
      [CONTENT_TYPE_META]: contentType,
    });
  }

  async get(key: string): Promise<StoredAsset | null> {
    let stat;
    try {
      stat = await this.client.statObject(this.bucket, key);
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
    const stream = await this.client.getObject(this.bucket, key);
    const bytes = await streamToBuffer(stream);
    const contentType =
      stat.metaData?.['content-type'] ?? stat.metaData?.[CONTENT_TYPE_META] ?? 'application/octet-stream';
    return { bytes, contentType };
  }
}

/** True for the various shapes MinIO/S3 use to signal a missing object. */
function isNotFound(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const code = (err as { code?: string }).code;
  const status = (err as { statusCode?: number }).statusCode;
  return code === 'NotFound' || code === 'NoSuchKey' || status === 404;
}

/**
 * In-memory AssetStore for tests. Mirrors the same key semantics as the MinIO
 * store so route tests exercise identical control flow without a live bucket.
 */
export class InMemoryAssetStore implements AssetStore {
  private readonly objects = new Map<string, StoredAsset>();

  async ensureBucket(): Promise<void> {
    // Nothing to provision.
  }

  async has(key: string): Promise<boolean> {
    return this.objects.has(key);
  }

  async put(key: string, bytes: Buffer, contentType: string): Promise<void> {
    this.objects.set(key, { bytes: Buffer.from(bytes), contentType });
  }

  async get(key: string): Promise<StoredAsset | null> {
    const stored = this.objects.get(key);
    if (!stored) return null;
    return { bytes: Buffer.from(stored.bytes), contentType: stored.contentType };
  }
}
