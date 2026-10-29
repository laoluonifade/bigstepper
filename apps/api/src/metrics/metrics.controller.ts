import { Controller, Get, Headers, NotFoundException, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import { timingSafeEqual } from 'node:crypto';
import { registry } from './metrics';

@Controller('metrics')
@SkipThrottle()
export class MetricsController {
  constructor(private readonly config: ConfigService) {}

  @Get()
  async metrics(@Headers('authorization') authorization: string | undefined, @Res() response: { setHeader(name: string, value: string): void; send(body: string): void }) {
    const token = this.config.get<string>('METRICS_TOKEN');
    const given = Buffer.from(authorization ?? '');
    const expected = Buffer.from(`Bearer ${token ?? ''}`);
    if (!token || given.length !== expected.length || !timingSafeEqual(given, expected)) throw new NotFoundException();
    response.setHeader('Content-Type', registry.contentType);
    response.send(await registry.metrics());
  }
}
