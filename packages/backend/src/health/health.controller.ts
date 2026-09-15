import { Controller, Get } from '@nestjs/common';

/** Unauthenticated liveness probe used by clients and container healthchecks. */
@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok' };
  }
}
