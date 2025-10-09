// src/modules/admin/ref/checklist/checklists.dtos.ts
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

/* ------------------------ Checklist DTOs ------------------------ */

export class CreateRefChecklistDto {
  // prisma has `code: String @unique`; UI sometimes sends "" -> allow null/empty
  @IsOptional() @IsString()
  code?: string | null;

  @IsString()
  title!: string;

  // Add Architecture if you’ve enabled it in your app
  @IsEnum({ Civil: 'Civil', MEP: 'MEP', Finishes: 'Finishes', Architecture: 'Architecture' })
  discipline!: 'Civil' | 'MEP' | 'Finishes' ;

  @IsOptional() @IsString()
  stageLabel?: string | null;

  @IsOptional() @IsArray() @IsString({ each: true })
  tags?: string[];

  @IsOptional() @IsIn(['Active', 'Draft', 'Inactive', 'Archived'])
  status?: 'Active' | 'Draft' | 'Inactive' | 'Archived' = 'Draft';

  // legacy numeric (still in schema)
  @IsOptional() @IsInt() @Min(1) @Max(9999)
  version?: number = 1;

  // NEW semver label: 1 / 1.2 / 1.2.3
  @IsOptional()
  @Matches(/^\d+(?:\.\d+){0,2}$/, { message: 'versionLabel must be 1, 1.2, or 1.2.3' })
  versionLabel?: string | null;

  // NEW AI toggle
  @IsOptional() @IsBoolean()
  aiDefault?: boolean = false;
}

export class UpdateRefChecklistDto extends CreateRefChecklistDto {}

