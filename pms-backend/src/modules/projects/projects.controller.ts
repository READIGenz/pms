/**
 * projects.controller.ts
 * ----------------------
 * Endpoints:
 *  - GET /my/projects             -> user-visible projects (cards)
 *  - GET /projects/:id/modules    -> role-based module list for selected project
 */
import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { AuthGuard } from '../../common/guards/auth.guard';

@Controller()
@UseGuards(AuthGuard)
export class ProjectsController {
  constructor(private readonly svc: ProjectsService) {}

  @Get('my/projects')
  myProjects(@Req() req: any) {
    return this.svc.myProjects(req.user.id);
  }

  @Get('projects/:id/modules')
  modules(@Req() req: any, @Param('id') id: string) {
    return this.svc.myModulesForProject(req.user.id, id);
  }
}
