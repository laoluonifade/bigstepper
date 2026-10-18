import { RedisOptions } from 'ioredis';

export function redisConnectionOptions(connectionUrl: string): RedisOptions {
  const url = new URL(connectionUrl);
  const database = url.pathname.slice(1);

  return {
    host: url.hostname,
    port: Number(url.port || (url.protocol === 'rediss:' ? 6380 : 6379)),
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: database ? Number(database) : 0,
    tls: url.protocol === 'rediss:' ? {} : undefined,
  };
}
