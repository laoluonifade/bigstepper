import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/current-user.decorator';

@Injectable()
export class AdminOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user: AuthenticatedUser }>();
    // An admin signed in to the runner app isn't signed in to the admin console.
    if (request.user?.role !== 'admin' || request.user.scope !== 'admin') {
      throw new ForbiddenException('Administrator access required');
    }
    return true;
  }
}
