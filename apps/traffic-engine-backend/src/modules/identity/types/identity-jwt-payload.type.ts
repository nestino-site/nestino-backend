import { PlatformRole } from '@prisma/client';

export interface IdentityJwtPayload {
  sub: string;
  email: string;
  role: PlatformRole;
}
