import { IsBoolean, IsInt, IsObject, IsOptional, IsString, Min } from 'class-validator';

export class UpsertModuleSettingsDto {
  @IsOptional() @IsBoolean()
  enabled?: boolean;

  @IsOptional() @IsString()
  autoCodePrefix?: string | null;

  @IsOptional() @IsBoolean()
  requireEvidence?: boolean | null;

  @IsOptional() @IsBoolean()
  requireGeoEvidence?: boolean | null;

  @IsOptional() @IsInt() @Min(0)
  requireMinPhotos?: number | null;

  @IsOptional() @IsBoolean()
  allowAWC?: boolean | null;

  @IsOptional() @IsInt() @Min(0)
  slaHours?: number | null;

  @IsOptional() @IsObject()
  extra?: Record<string, any> | null;
}
