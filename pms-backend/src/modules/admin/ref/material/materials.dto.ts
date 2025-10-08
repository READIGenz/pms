import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';

export class CreateRefMaterialDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  code?: string | null;

  @IsNotEmpty()
  @IsString()
  @MaxLength(240)
  name!: string;

  @IsOptional()
  @IsString()
  discipline?: string | null; // UI string (e.g., "MEP.ELE"); map in service if enum used

  @IsOptional()
  @IsString()
  category?: string | null;

  @IsOptional()
  @IsString()
  manufacturer?: string | null;

  @IsOptional()
  @IsString()
  model?: string | null;

  @IsOptional()
  @IsArray()
  @Type(() => String)
  standards?: string[];

  @IsOptional()
  @IsString()
  fireRating?: string | null;

  @IsOptional()
  @IsArray()
  @Type(() => String)
  keyProps?: string[];

  @IsOptional()
  @IsArray()
  @Type(() => String)
  aliases?: string[];

  @IsOptional()
  // JSON blob
  properties?: any;

  // NEW: human-facing semver label the service parses into parts
  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d+){0,2}$/, {
    message: 'versionLabel must be "1", "1.2", or "1.2.3".',
  })
  versionLabel?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsString()
  status?: 'Active' | 'Draft' | 'Inactive' | 'Archived';
}

export class UpdateRefMaterialDto extends PartialType(CreateRefMaterialDto) {}
