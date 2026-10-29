import { BadRequestException } from '@nestjs/common';
import { IsLatitude, IsLongitude, IsNumber, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

export class PlaceFieldsDto {
  @IsOptional() @ValidateIf((_, value) => value !== null) @IsString() @MaxLength(120)
  venue?: string | null;

  @IsOptional() @ValidateIf((_, value) => value !== null) @IsString() @MaxLength(200)
  address?: string | null;

  @IsOptional() @ValidateIf((_, value) => value !== null) @IsNumber() @IsLatitude()
  latitude?: number | null;

  @IsOptional() @ValidateIf((_, value) => value !== null) @IsNumber() @IsLongitude()
  longitude?: number | null;
}

export function placeColumns(input: PlaceFieldsDto) {
  const pinned = input.latitude != null && input.longitude != null;
  if ((input.latitude != null) !== (input.longitude != null)) throw new BadRequestException('A location needs both a latitude and a longitude');
  const venue = input.venue?.trim() || null;
  if (venue && !pinned) throw new BadRequestException('Pick the location on the map as well as naming it');
  return {
    venue: pinned ? venue : null,
    address: pinned ? input.address?.trim() || null : null,
    latitude: pinned ? input.latitude! : null,
    longitude: pinned ? input.longitude! : null,
  };
}

export const changesPlace = (input: PlaceFieldsDto) => ['venue', 'address', 'latitude', 'longitude'].some((key) => input[key as keyof PlaceFieldsDto] !== undefined);
