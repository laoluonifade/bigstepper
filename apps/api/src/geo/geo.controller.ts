import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { IsLatitude, IsLongitude } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GeoService } from './geo.service';

class PlaceQuery {
  @Type(() => Number) @IsLatitude()
  lat: number;

  @Type(() => Number) @IsLongitude()
  lon: number;
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
}
