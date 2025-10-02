import { IsEnum, IsObject, IsString } from 'class-validator';

export enum UserRoleDTO {
  Admin = 'Admin',
  Client = 'Client',
  IH_PMT = 'IH_PMT',
  Contractor = 'Contractor',
  Consultant = 'Consultant',
  PMC = 'PMC',
  Supplier = 'Supplier',
}

export class UpsertProjectOverrideDto {
  @IsString()
  projectId!: string; // UUID

  @IsEnum(UserRoleDTO)
  role!: UserRoleDTO;

  // { [moduleCode]: { view, raise, review, approve, close } }
  @IsObject()
  matrix!: Record<string, { view: boolean; raise: boolean; review: boolean; approve: boolean; close: boolean }>;
}
