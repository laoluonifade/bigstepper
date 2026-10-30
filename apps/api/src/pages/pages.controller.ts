import { Controller, Get, Header, Param } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PagesService } from './pages.service';

@Controller('pages')
@SkipThrottle()
export class PagesController {
  constructor(private readonly pages: PagesService) {}

  @Get('events/:ref')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=300')
  event(@Param('ref') ref: string) {
    return /^[a-z0-9-]{1,100}$/i.test(ref) ? this.pages.event(ref) : this.pages.event('');
  }

  @Get('competitions/:code')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=300')
  competition(@Param('code') code: string) {
    return /^[a-z0-9]{4,16}$/i.test(code) ? this.pages.competition(code) : this.pages.competition('');
  }
}
