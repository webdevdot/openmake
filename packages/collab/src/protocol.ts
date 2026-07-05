import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

/**
 * Binary message framing shared by client and server. Each message starts
 * with a varUint messageType, followed by a payload whose shape depends on
 * the type. Sync payloads follow the y-protocols/sync convention
 * (SyncStep1 / SyncStep2 / Update); awareness payloads follow
 * y-protocols/awareness.
 */
export const MESSAGE_SYNC = 0;
export const MESSAGE_AWARENESS = 1;

/** Start a new outgoing message and write its type. */
export function createMessage(type: number): encoding.Encoder {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, type);
  return encoder;
}

/** Read the leading messageType varUint, leaving the decoder positioned at the payload. */
export function readMessageType(decoder: decoding.Decoder): number {
  return decoding.readVarUint(decoder);
}

export function toDecoder(data: Uint8Array): decoding.Decoder {
  return decoding.createDecoder(data);
}

export function toBuffer(encoder: encoding.Encoder): Uint8Array {
  return encoding.toUint8Array(encoder);
}
