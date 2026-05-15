import { Body, Controller, Get, Post } from '@nestjs/common';
import { Public } from '../decorators/public.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import { LoginDto } from '../dto/login.dto';
import { IdentityAuthService } from '../services/identity-auth.service';
import type { IdentityJwtPayload } from '../types/identity-jwt-payload.type';

@Controller('identity')
export class IdentityController {
  constructor(private readonly identityAuthService: IdentityAuthService) {}

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.identityAuthService.login(dto.email, dto.password);
  }

  @Get('me')
  me(@CurrentUser() user: IdentityJwtPayload) {
    return this.identityAuthService.getProfile(Number(user.sub));
  }
}
