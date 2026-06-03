import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { RedisService } from '../../../common/redis/redis.service';
import { RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_SEC } from '../auth.constants';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(private readonly redis: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const body = req.body as { email?: string; villaId?: string };
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const villaId = typeof body.villaId === 'string' ? body.villaId.trim() : '';
    if (!email || !villaId) {
      throw new BadRequestException('email and villaId are required');
    }

    const key = `rate-limit:otp:${villaId}:${email}`;
    const count = await this.redis.client.incr(key);
    if (count === 1) {
      await this.redis.client.expire(key, RATE_LIMIT_WINDOW_SEC);
    }
    if (count > RATE_LIMIT_MAX) {
      throw new HttpException(
        `Too many OTP requests. Try again in ${Math.ceil(RATE_LIMIT_WINDOW_SEC / 60)} minutes.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
