import { Inject } from '@nestjs/common';

export const REDIS = Symbol('REDIS');
export const InjectRedis = () => Inject(REDIS);
