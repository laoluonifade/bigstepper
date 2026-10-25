import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  health() {
    return this.appService.health();
  }

  /** Public headline numbers for the brands page: totals only, nothing about any one person. */
  @Get('stats')
  stats() {
    return this.appService.publicStats();
  }
}
