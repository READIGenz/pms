// pms-backend/src/project-modules/wir/inspector-runner-save.dto.ts
import { IsArray, IsIn, IsNumber, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class RunnerItemSaveDto {
  @IsUUID()
  itemId!: string;

  @IsOptional()
  @IsIn(['PASS', 'FAIL', 'NA'])
  inspectorStatus?: 'PASS' | 'FAIL' | 'NA';

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsNumber()
  valueNumber?: number;

  @IsOptional()
  @IsString()
  unit?: string;
}

export class InspectorSaveDto {
  @IsIn(['Inspector'])
  actorRole!: 'Inspector';

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RunnerItemSaveDto)
  items!: RunnerItemSaveDto[];
}
