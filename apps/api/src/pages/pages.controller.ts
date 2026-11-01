import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PagesService } from './pages.service';
interface HtmlResponse {
  status(code: number): HtmlResponse;
  setHeader(name: string, value: string): void;
  removeHeader(name: string): void;
}
@Controller('pages')
@SkipThrottle()
export class PagesController {
  constructor(private readonly pages: PagesService) {}
  private headers(res: HtmlResponse, type: string, indexable = false) {
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    res.setHeader(
      'X-Robots-Tag',
      indexable ? 'index, follow' : 'noindex, nofollow',
    );
  }
  @Get('robots.txt') robots(@Res({ passthrough: true }) res: HtmlResponse) {
    this.headers(res, 'text/plain; charset=utf-8');
    return this.pages.robots();
  }
  @Get('sitemap.xml') async sitemap(
    @Res({ passthrough: true }) res: HtmlResponse,
  ) {
    this.headers(res, 'application/xml; charset=utf-8');
    return this.pages.sitemapIndex();
  }
  @Get('sitemaps/:name') async shard(
    @Param('name') name: string,
    @Res({ passthrough: true }) res: HtmlResponse,
  ) {
    this.headers(res, 'application/xml; charset=utf-8');
    const xml = await this.pages.sitemapShard(name);
    if (!xml) {
      res.status(404);
      return '<?xml version="1.0"?><error>Not found</error>';
    }
    return xml;
  }
  @Get('metadata') async metadata(
    @Query('path') path: string,
    @Res({ passthrough: true }) res: HtmlResponse,
  ) {
    const { body: _body, ...page } = await this.pages.resolve(path ?? '/');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Cache-Control', 'no-store');
    return page;
  }
  @Get('data') async data(
    @Query('path') path: string,
    @Res({ passthrough: true }) res: HtmlResponse,
  ) {
    const page = await this.pages.resolve(path ?? '/');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Cache-Control', 'no-store');
    res.status(page.status);
    return page;
  }
  @Get('html') html(
    @Query('path') path: string,
    @Res({ passthrough: true }) res: HtmlResponse,
  ) {
    return this.render(path ?? '/', res);
  }
  // Retain existing deployment routes while the broader Caddy public route layer is adopted.
  @Get('events/:ref') event(
    @Param('ref') ref: string,
    @Res({ passthrough: true }) res: HtmlResponse,
  ) {
    return this.render('/events/' + ref, res);
  }
  @Get('competitions/:code') competition(
    @Param('code') code: string,
    @Res({ passthrough: true }) res: HtmlResponse,
  ) {
    return this.render('/competitions/' + code, res);
  }
  @Get('clubs/:ref') club(
    @Param('ref') ref: string,
    @Res({ passthrough: true }) res: HtmlResponse,
  ) {
    return this.render('/clubs/' + ref, res);
  }
  private async render(path: string, res: HtmlResponse) {
    try {
      const page = await this.pages.html(path);
      this.headers(res, 'text/html; charset=utf-8', page.indexable);
      res.status(page.status);
      if (page.redirect) res.setHeader('Location', page.redirect);
      // Match the existing public SPA delivery policy; do not apply API-only embedding headers to the web shell.
      for (const name of [
        'Content-Security-Policy',
        'Cross-Origin-Resource-Policy',
        'Cross-Origin-Opener-Policy',
        'X-Frame-Options',
      ])
        res.removeHeader(name);
      return page.html;
    } catch {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      throw new ServiceUnavailableException(
        'Public discovery is temporarily unavailable. Please try again.',
      );
    }
  }
}
