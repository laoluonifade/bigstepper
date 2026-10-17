import { Injectable } from '@nestjs/common';

@Injectable()
export class AuthService {
  // TODO: Implement register, login, JWT or session
  async register(email: string, password: string) {
    return { message: 'Register endpoint ready', email };
  }

  async login(email: string, password: string) {
    return { message: 'Login endpoint ready', email };
  }
}
