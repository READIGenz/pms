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
import { AdminMaterialsService } from './admin.materials.service';
import { CreateRefMaterialDto, UpdateRefMaterialDto } from './materials.dto';

// Match UI options; your Prisma enum Discipline can be a superset.
type Discipline =
  | 'Civil'
  | 'Architecture'
  | 'MEP.ELE'
  | 'MEP.PHE'
  | 'MEP.HVC'
  | 'Finishes';

type Status = 'Active' | 'Draft' | 'Inactive' | 'Archived';

@Controller(['admin/ref/materials', 'admin/ref/materiallib'])
export class AdminMaterialsController {
  constructor(private readonly svc: AdminMaterialsService) {}

  @Get('stats')
  stats() {
    return this.svc.stats();
  }

  @Get()
  list(
    @Query('q') q?: string,
    @Query('discipline') discipline?: Discipline | '',
    @Query('category') category?: string | '',
    @Query('status') status?: Status | '',
    @Query('page', ParseIntPipe) page = 1,
    @Query('pageSize', ParseIntPipe) pageSize = 20,
  ) {
    return this.svc.list({ q, discipline, category, status, page, pageSize });
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.svc.getOne(id);
  }

  @Post()
  create(@Body() dto: CreateRefMaterialDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateRefMaterialDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }
}
