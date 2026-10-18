import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { InjectRedis } from './redis/redis.constants';
import Redis from 'ioredis';

@Injectable()
export class AppService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  getHello(): string {
    return 'Jump API';
  }

  async health() {
    await Promise.all([this.dataSource.query('SELECT 1'), this.redis.ping()]);
    return { status: 'ok', service: 'jump-api', postgres: 'up', redis: 'up' };
  }
}
