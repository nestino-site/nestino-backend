import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { REFRESH_TOKEN_COOKIE } from '../auth.constants';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RateLimitGuard } from '../guards/rate-limit.guard';
import { RequestOtpDto } from '../dto/request-otp.dto';
import { VerifyOtpDto } from '../dto/verify-otp.dto';
import { JwtService } from '../services/jwt.service';
import { OtpService } from '../services/otp.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly otpService: OtpService,
    private readonly jwtService: JwtService,
  ) {}

  @Post('request-otp')
  @UseGuards(RateLimitGuard)
  async requestOtp(@Body() dto: RequestOtpDto): Promise<{ sent: boolean }> {
    return this.otpService.requestOtp(dto);
  }

  @Post('verify-otp')
  @UseGuards(RateLimitGuard)
  async verifyOtp(
    @Body() dto: VerifyOtpDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: boolean }> {
    return this.otpService.verifyOtp(dto, res);
  }

  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: boolean }> {
    const token = req.cookies?.[REFRESH_TOKEN_COOKIE];
    if (!token || typeof token !== 'string') {
      throw new UnauthorizedException('Missing refresh token');
    }
    await this.jwtService.rotateRefreshToken(token, res);
    return { ok: true };
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: boolean }> {
    const userId = req.user?.sub;
    if (!userId) {
      throw new UnauthorizedException();
    }
    await this.jwtService.revokeAllRefreshTokensForUser(userId, res);
    return { ok: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@Req() req: Request): Promise<{ userId: string; email: string; villaId: string }> {
    const u = req.user;
    if (!u) {
      throw new UnauthorizedException();
    }
    return { userId: u.sub, email: u.email, villaId: u.villaId };
  }
}
