import { Injectable } from "@nestjs/common";

export interface HealthStatus {
  service: "api";
  status: "ok";
  timestamp: string;
}

@Injectable()
export class HealthService {
  getStatus(now: Date = new Date()): HealthStatus {
    return {
      service: "api",
      status: "ok",
      timestamp: now.toISOString(),
    };
  }
}
