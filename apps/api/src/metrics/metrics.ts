import { collectDefaultMetrics, Counter, Histogram, Registry } from 'prom-client';

export const registry = new Registry();
collectDefaultMetrics({ register: registry });

const requestSeconds = new Histogram({
  name: 'jump_http_request_duration_seconds',
  help: 'Time to answer each request, by route and status (499 when the phone hung up first)',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30],
  registers: [registry],
});

export const runEvents = new Counter({
  name: 'jump_run_events_total',
  help: 'Run finishing and GPS upload outcomes',
  labelNames: ['event'],
  registers: [registry],
});

export const gpsPoints = new Counter({
  name: 'jump_gps_points_received_total',
  help: 'GPS points received from phones, before duplicates are dropped',
  registers: [registry],
});

type Request = { method: string; baseUrl: string; route?: { path?: string } };
type Response = { statusCode: number; on(event: 'finish' | 'close', listener: () => void): unknown };

function routeOf(request: Request) {
  const route = request.route?.path;
  return route ? `${request.baseUrl}${route}` : 'unmatched';
}

export function httpMetrics(request: Request, response: Response, next: () => void) {
  const stop = requestSeconds.startTimer();
  let answered = false;
  response.on('finish', () => {
    answered = true;
    stop({ method: request.method, route: routeOf(request), status: String(response.statusCode) });
  });
  response.on('close', () => {
    if (!answered) stop({ method: request.method, route: routeOf(request), status: '499' });
  });
  next();
}
