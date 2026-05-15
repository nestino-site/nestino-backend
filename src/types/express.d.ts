import type { IdentityJwtPayload } from '../modules/identity/types/identity-jwt-payload.type';

declare global {
  namespace Express {
    interface Request {
      user?: IdentityJwtPayload;
      siteId?: number;
    }
  }
}

export {};
