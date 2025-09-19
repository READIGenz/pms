import { IsString, Length } from 'class-validator';

export class VerifyOtpDto {
  @IsString()
  login!: string; // email or phone

  @IsString()
  @Length(6, 6, { message: 'OTP must be 6 digits' })
  code!: string;  // "000000" in dev
}
