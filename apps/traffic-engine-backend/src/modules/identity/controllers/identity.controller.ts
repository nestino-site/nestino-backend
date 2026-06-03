import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../decorators/public.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import { LoginDto } from '../dto/login.dto';
import { IdentityAuthService } from '../services/identity-auth.service';
import type { IdentityJwtPayload } from '../types/identity-jwt-payload.type';

@ApiTags('Identity')
@Controller('identity')
export class IdentityController {
  constructor(private readonly identityAuthService: IdentityAuthService) {}

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Login and receive JWT access token' })
  @ApiResponse({ status: 201, description: 'Returns access token and user profile' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  login(@Body() dto: LoginDto) {
    return this.identityAuthService.login(dto.email, dto.password);
  }

  @Get('me')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Get current authenticated user profile' })
  @ApiResponse({ status: 200, description: 'Current user profile' })
  @ApiResponse({ status: 401, description: 'Missing or invalid JWT' })
  me(@CurrentUser() user: IdentityJwtPayload) {
    return this.identityAuthService.getProfile(Number(user.sub));
  }
}
