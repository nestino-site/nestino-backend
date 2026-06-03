import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class RequestOtpDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  villaId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  villaName?: string;
}
