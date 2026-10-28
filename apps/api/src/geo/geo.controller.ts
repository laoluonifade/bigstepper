import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { IsLatitude, IsLongitude, IsOptional, IsString, Length } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GeoService } from './geo.service';

class PlaceQuery {
  @Type(() => Number) @IsLatitude()
  lat: number;

  @Type(() => Number) @IsLongitude()
  lon: number;
}

class SearchQuery {
  @IsString() @Length(2, 120)
  q: string;

  @IsOptional() @Type(() => Number) @IsLatitude()
  lat?: number;

  @IsOptional() @Type(() => Number) @IsLongitude()
  lon?: number;
}

@Controller('geo')
@UseGuards(JwtAuthGuard)
export class GeoController {
  constructor(private readonly geo: GeoService) {}

  @Get('place')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  place(@Query() query: PlaceQuery) {
    return this.geo.placeName(query.lat, query.lon);
  }

  @Get('search')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  search(@Query() query: SearchQuery) {
    return this.geo.search(query.q.trim(), query.lat !== undefined && query.lon !== undefined ? { latitude: query.lat, longitude: query.lon } : undefined);
  }
}
