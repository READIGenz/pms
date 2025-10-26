// src/modules/admin/module-settings/module-settings.controller.ts
import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  BadRequestException,
} from '@nestjs/common';
import { AdminModuleSettingsService } from './module-settings.service';

@Controller('admin/module-settings')
export class AdminModuleSettingsController {
  constructor(private readonly service: AdminModuleSettingsService) {}

  @Get(':pid/:mod')
  async getProjectModuleSettings(
    @Param('pid', new ParseUUIDPipe()) projectId: string,
    @Param('mod') mod: string,
  ) {
    this.assertSupportedModule(mod);
    const rec = await this.service.get(projectId, 'WIR');
    if (!rec) throw new NotFoundException('No settings found');
    return rec;
  }

  @Put(':pid/:mod')
  async upsertProjectModuleSettings(
    @Param('pid', new ParseUUIDPipe()) projectId: string,
    @Param('mod') mod: string,
    @Body() body: any,
  ) {
    this.assertSupportedModule(mod);
    return this.service.save(projectId, 'WIR', body?.extra ?? {});
  }

  // Accept BOTH /:mod:reset and /:mod/reset
  @Post(':pid/:mod/reset')
  async resetProjectModuleSettings(
    @Param('pid', new ParseUUIDPipe()) projectId: string,
    @Param('mod') rawMod: string,
  ) {
    const mod = (rawMod || '').split(':')[0]; // handles "WIR" and "WIR:reset"
    this.assertSupportedModule(mod);
    if (!projectId) throw new BadRequestException('projectId is required');
    return this.service.reset(projectId, 'WIR');
  }

  private assertSupportedModule(mod: string) {
    if (mod !== 'WIR') {
      throw new NotFoundException('Module not supported');
    }
  }
}
