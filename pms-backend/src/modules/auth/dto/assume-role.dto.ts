// pms-backend/src/modules/auth/dto/assume-role.dto.ts
import { IsUUID } from 'class-validator';

export class AssumeRoleDto {
  @IsUUID()
  membershipId!: string; // the selected UserRoleMembership.id
}
