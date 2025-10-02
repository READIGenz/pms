import { IsEnum, IsObject } from 'class-validator';

// Mirror Prisma enum values (TypeScript string literal union)
export enum UserRoleDTO {
  Admin = 'Admin',
  Client = 'Client',
  IH_PMT = 'IH_PMT',       // DB enum; mapped to "IH-PMT" at the API edge if you prefer
  Contractor = 'Contractor',
  Consultant = 'Consultant',
  PMC = 'PMC',
  Supplier = 'Supplier',
}

// matrix = { [moduleCode: string]: { view:boolean, raise:boolean, review:boolean, approve:boolean, close:boolean } }
export class UpsertTemplateDto {
  @IsEnum(UserRoleDTO)
  role!: UserRoleDTO;

  @IsObject()
  matrix!: Record<string, { view: boolean; raise: boolean; review: boolean; approve: boolean; close: boolean }>;
}
