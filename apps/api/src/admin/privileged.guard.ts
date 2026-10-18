import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/current-user.decorator';

@Injectable()
export class PrivilegedGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user: AuthenticatedUser }>();
    if (!request.user || !['admin', 'compliance'].includes(request.user.role)) {
      throw new ForbiddenException('Administrative access required');
    }
    return true;
  }
}
