import { randomBytes } from 'node:crypto';
console.log(`PEI_API_KEYS=${randomBytes(48).toString('base64url')}`);
