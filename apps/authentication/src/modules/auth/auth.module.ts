import { Module } from '@nestjs/common';
import { AuthController } from './controllers/auth.controller';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RateLimitGuard } from './guards/rate-limit.guard';
import { EmailService } from './services/email.service';
import { JwtService } from './services/jwt.service';
import { OtpService } from './services/otp.service';

@Module({
  controllers: [AuthController],
  providers: [OtpService, EmailService, JwtService, RateLimitGuard, JwtAuthGuard],
  exports: [JwtService],
})
export class AuthModule {}
