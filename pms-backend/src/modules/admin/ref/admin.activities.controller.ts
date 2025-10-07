// src/modules/admin/ref/admin.activities.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AdminActivitiesService } from './admin.activities.service';
import { CreateRefActivityDto, UpdateRefActivityDto } from './dtos';

type Discipline = 'Civil' | 'MEP' | 'Finishes';
type Status = 'Active' | 'Draft' | 'Inactive' | 'Archived';

// Mount the same handlers on BOTH paths to avoid 404s from legacy/typo routes
@Controller(['admin/ref/activities', 'admin/ref/activitylib'])
export class AdminActivitiesController {
  constructor(private readonly svc: AdminActivitiesService) {}

  @Get()
  list(
    @Query('q') q?: string,
    @Query('discipline') discipline?: Discipline | '',
    @Query('stageLabel') stageLabel?: string,
    @Query('status') status?: Status | '',
    @Query('page', ParseIntPipe) page = 1,
    @Query('pageSize', ParseIntPipe) pageSize = 20,
  ) {
    return this.svc.list({ q, discipline, stageLabel, status, page, pageSize });
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.svc.getOne(id);
  }

  @Post()
  create(@Body() dto: CreateRefActivityDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateRefActivityDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }
}
