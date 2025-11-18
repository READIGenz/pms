// src/modules/admin/ref/checklist/admin.checklists.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseBoolPipe,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AdminChecklistsService } from './admin.checklists.service';
import { CreateRefChecklistDto, UpdateRefChecklistDto } from './checklists.dto';

type Discipline = 'Civil' | 'MEP' | 'Finishes' | 'Architecture';
type Status = 'Active' | 'Draft' | 'Inactive' | 'Archived';

@Controller(['admin/ref/checklists', 'admin/ref/checklistlib'])
export class AdminChecklistsController {
  constructor(private readonly svc: AdminChecklistsService) {}

  @Get('stats')
  stats() {
    // global counts ignoring pagination/filters
    return this.svc.stats();
  }

  @Get()
  list(
    @Query('q') q?: string,
    @Query('discipline') discipline?: Discipline | '',
    @Query('stageLabel') stageLabel?: string,
    @Query('status') status?: Status | '',
    @Query('aiDefault', new ParseBoolPipe({ optional: true })) aiDefault?: boolean,
    @Query('page', new ParseIntPipe()) page = 1,
    @Query('pageSize', new ParseIntPipe()) pageSize = 20,
  ) {
    return this.svc.list({
      q,
      discipline,
      stageLabel,
      status,
      aiDefault,
      page,
      pageSize,
    });
  }

   @Get(':id')
  getOne(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query('includeItems') includeItems?: '0' | '1', ) {
  return this.svc.getOne(id, includeItems === '1');
}

  @Post()
  create(@Body() dto: CreateRefChecklistDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateRefChecklistDto) {
    return this.svc.update(id, dto);
  }

  @Patch(':id/items')
updateItems(
  @Param('id') id: string,
  @Body() body: {
    items: Array<{
      id?: string;
      seq?: number;
      text: string;
      requirement?: 'Mandatory' | 'Optional' | null;
      itemCode?: string | null;
      critical?: boolean | null;
      aiEnabled?: boolean | null;
      aiConfidence?: number | null;
      units?: string | null;
      tolerance?: '<=' | '+-' | '=' | null;
      base?: number | null;
      plus?: number | null;
      minus?: number | null;
      tags?: string[] | null;    // (visual, measurement, evidence, document)
    }>;
  },
) {
  return this.svc.replaceItems(id, body.items || []);
}

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }
}
