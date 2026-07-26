import { Controller, Get, Inject } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";

import { HealthService, type HealthStatus } from "./health.service.js";

@ApiTags("system")
@Controller("health")
@SkipThrottle()
export class HealthController {
  constructor(
    @Inject(HealthService) private readonly healthService: HealthService,
  ) {}

  @Get()
  @ApiOkResponse({ description: "API process is ready to accept requests." })
  getHealth(): HealthStatus {
    return this.healthService.getStatus();
  }
}
