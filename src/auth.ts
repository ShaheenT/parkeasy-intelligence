import { timingSafeEqual } from 'node:crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { config } from './config.js';

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function requireApiKey(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const supplied = request.headers['x-api-key'];
  if (typeof supplied !== 'string' || !config.apiKeys.some(key => safeEqual(supplied, key))) {
    await reply.code(401).send({
      error: { code: 'UNAUTHENTICATED', message: 'A valid API key is required.' }
    });
  }
}
