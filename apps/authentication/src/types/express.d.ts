import type { AuthUserPayload } from '../modules/auth/auth.types';

declare global {
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface Request {
      user?: AuthUserPayload;
    }
  }
}

export {};
