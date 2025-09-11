import { IsBoolean, IsEmail, IsOptional, IsString, Matches } from 'class-validator';

export class CreateUserDto {
  @IsOptional() @IsString()
  code?: string;                       // optional manual override

  @IsString()
  role!: string;

  @IsString()
  name!: string;

  @IsOptional() @IsString()
  city?: string;

  @IsOptional() @IsEmail()
  email?: string;

  // digits only (e.g. "91", "1", "971")
  @IsOptional() @Matches(/^\d+$/)
  countryCode?: string;

  // 10-digit local, not starting with 0
  @IsOptional() @Matches(/^[1-9][0-9]{9}$/)
  phone?: string;

  @IsOptional() @IsBoolean()
  isSuperAdmin?: boolean;
}
