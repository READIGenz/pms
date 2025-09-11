/**
 * health.controller.ts
 * --------------------
 * Basic liveness endpoint for smoke checks.
 */
import { Controller, Get } from '@nestjs/common';

@Controller('healthz')
export class HealthController {
  @Get()
  ping() {
    return { ok: true, ts: new Date().toISOString() };
  }
}
