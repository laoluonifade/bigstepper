import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Like JwtAuthGuard, but lets signed-out (or expired) visitors through with no user instead of a 401. */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<T>(_error: unknown, user: T): T {
    return (user || null) as T;
  }
}
