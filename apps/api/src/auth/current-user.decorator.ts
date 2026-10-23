import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthenticatedUser {
  id: string;
  email: string;
  sessionId: string;
  role: 'runner' | 'admin' | 'compliance';
  /** Which app the session belongs to; admin endpoints only take 'admin'. */
  scope: 'app' | 'admin';
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<{ user: AuthenticatedUser }>();
    return request.user;
  },
);
