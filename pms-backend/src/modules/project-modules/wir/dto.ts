// pms-backend/src/modules/project-modules/wir/dto.ts
import {
  IsOptional,
  IsIn,
  IsString,
  IsISO8601,
  IsArray,
  IsBoolean,
  Length,
  isInt,
  IsInt
} from 'class-validator';
import { Type } from 'class-transformer';

export type InspectorRecommendation = 'APPROVE' | 'APPROVE_WITH_COMMENTS' | 'REJECT';

export type WirStatus =
  | 'Draft'
  | 'Submitted'
  | 'Recommended'
  | 'Approved'
  | 'Rejected'
  | 'Returned';

export type Discipline = 'Civil' | 'MEP' | 'Finishes';

export class CreateWirDto {
  // FE sends these (from CreateWIR.tsx)

  @IsOptional()
  @IsIn(['Draft', 'Submitted', 'Recommended', 'Approved', 'Rejected', 'Returned'])
  status?: WirStatus; // default Draft

  @IsOptional()
  @IsIn(['Civil', 'MEP', 'Finishes'])
  discipline?: Discipline; // Prisma Wir.discipline

  @IsOptional()
  @IsString() // (FE sends UUID; keep loose if you log into history.meta)
  activityId?: string; // not in schema; logged into history.meta

  @IsOptional()
  @IsISO8601()
  plannedAt?: string; // ISO "YYYY-MM-DDTHH:MM:SS"

  // --- NEW: keep header parity with UpdateWirHeaderDto ---
  @IsOptional()
  @IsString()
  @Length(0, 200)
  title?: string;              // <— add this

  @IsOptional()
  @IsString()
  @Length(0, 200)
  location?: string; // saved to Wir.description (site location notes)
 
  @IsOptional()
  @IsString()
  cityTown?: string;

   @IsOptional()
  @IsString()
  @Length(0, 200)
  description?: string;        // already present (good)

    @IsOptional()
  @IsString()
  stateName?: string;          // <— add this
  
  @IsOptional()
  @IsString()
  @Length(0, 200)
  workInspection?: string; // saved to Wir.title (<=200 chars)

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Type(() => String)
  refChecklistIds?: string[]; // RefChecklist ids OR codes (we resolve ids)

  @IsOptional()
  @IsBoolean()
  materializeItemsFromRef?: boolean; // when true, create WirItem[] from RefChecklistItem[]

  // loose FE bag (dateText, timeText, attachmentsMeta, etc.)
  @IsOptional()
  clientHints?: Record<string, any>;
}

export class UpdateWirHeaderDto {
  // keep existing header fields…
  @IsOptional()
  @IsIn(['Draft', 'Submitted', 'Recommended', 'Approved', 'Rejected', 'Returned'])
  status?: WirStatus;

  @IsOptional()
  @IsIn(['Civil', 'MEP', 'Finishes'])
  discipline?: Discipline;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  description?: string;

  @IsOptional()
  @IsString()
  cityTown?: string;

  @IsOptional()
  @IsISO8601()
  forDate?: string; // ISO

  @IsOptional()
  @IsString()
  forTime?: string; // "HH:MM"

  @IsOptional()
  @IsString()
  stateName?: string;

  @IsOptional()
  @IsString()
  inspectorId?: string | null;

  @IsOptional()
  @IsString()
  contractorId?: string | null;

  @IsOptional()
  @IsString()
  hodId?: string | null;

   // Allow FE to explicitly set Current BIC (user) on header patch
  @IsOptional()
  @IsString()
  bicUserId?: string | null;

  // Pass-through of inspector recommendation when FE carries it forward for HOD flow
  @IsOptional()
  @IsIn(['APPROVE', 'APPROVE_WITH_COMMENTS', 'REJECT'])
  inspectorRecommendation?: InspectorRecommendation | null;

  // Allow FE to set version in specific flows (e.g., enforce 1 on first submit/recommend)
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  version?: number;

  @IsOptional()
  @IsISO8601()
  rescheduleForDate?: string | null;

  @IsOptional()
  @IsString()
  rescheduleForTime?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  rescheduleReason?: string | null;

  // -------- FE draft fields (so PATCH during Draft doesn’t get stripped) --------

  @IsOptional()
  @IsString()
  activityId?: string;

  @IsOptional()
  @IsISO8601()
  plannedAt?: string;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  location?: string;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  workInspection?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Type(() => String)
  refChecklistIds?: string[];

  @IsOptional()
  @IsBoolean()
  materializeItemsFromRef?: boolean;

  // --- HOD finalization header fields ---
  @IsOptional()
  @IsIn(['APPROVE', 'REJECT'])
  hodOutcome?: 'APPROVE' | 'REJECT' | null;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  hodRemarks?: string | null;

  @IsOptional()
  @IsISO8601()
  hodDecidedAt?: string | null;

  @IsOptional()
  clientHints?: Record<string, any>;
}

export class AttachChecklistsDto {
  @IsArray()
  @IsString({ each: true })
  @Type(() => String)
  refChecklistIds: string[] = [];

  @IsOptional()
  @IsBoolean()
  materializeItemsFromRef?: boolean;
}

export class RollForwardDto {
  // Optional explicit list of itemIds to carry forward; if absent we use FAIL/NCR
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Type(() => String)
  itemIds?: string[];

  // Optional new planned date/time for the next version
  @IsOptional()
  @IsISO8601()
  plannedAt?: string;

  // Optional new title/description
  @IsOptional()
  @IsString()
  @Length(0, 200)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  description?: string;
}

// WIR Dispatch
export class DispatchWirDto {
  @IsOptional()
  inspectorId!: string;                // selected PMC inspector (required)
  
  @IsOptional()
  materializeIfNeeded?: boolean = true; // default true: do copy-on-dispatch if not done
}