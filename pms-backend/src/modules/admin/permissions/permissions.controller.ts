// src/modules/admin/permissions/permissions.controller.ts
import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { AdminPermissionsService } from './permissions.service';
import { UpsertTemplateDto } from './dto/template.dto';

@Controller('admin/permissions/templates')
export class AdminPermissionsController {
  constructor(private svc: AdminPermissionsService) {}

  @Get()
  list() {
    return this.svc.listTemplates();
  }

  @Get(':role')
  getByRole(@Param('role') role: string) {
    return this.svc.getByRole(role);
  }

  // Full replace for a role (idempotent)
  @Put(':role')
  upsert(@Param('role') role: string, @Body() body: Omit<UpsertTemplateDto, 'role'>) {
    return this.svc.upsert({ role: role as any, matrix: body.matrix });
  }
}
