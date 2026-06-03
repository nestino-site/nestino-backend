import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { IdentityJwtService } from '../services/identity-jwt.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: IdentityJwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const user = await this.jwtService.verifyFromRequest(req);
    if (!user) {
      throw new UnauthorizedException('Invalid or missing access token');
    }
    req.user = user;
    return true;
  }
}
