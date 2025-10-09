// src/modules/admin/ref/activity/dtos.ts
import { IsArray, IsEnum, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateRefActivityDto {
  @IsOptional() @IsString() code?: string | null; // optional unique
  @IsString() title!: string;
  @IsEnum({ Civil: 'Civil', MEP: 'MEP', Finishes: 'Finishes' }) discipline!: 'Civil' | 'MEP' | 'Finishes';
  @IsOptional() @IsString() stageLabel?: string | null;
  @IsOptional() @IsArray() @IsString({ each: true }) phase?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) element?: string[];
  @IsArray() system: string[] = [];
  @IsArray() nature: string[] = [];
  @IsArray() method: string[] = [];
  @IsOptional() @IsInt() @Min(1) @Max(9999) version?: number = 1;
  @IsOptional() versionLabel?: string | null;
  @IsOptional() @IsString() notes?: string | null;
  @IsOptional() @IsIn(['Active', 'Draft', 'Inactive', 'Archived']) status?: 'Active' | 'Draft' | 'Inactive' | 'Archived' = 'Draft';
}

export class UpdateRefActivityDto extends CreateRefActivityDto {}
