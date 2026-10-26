import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsDateString,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';

export class GpsSampleDto {
  @IsInt()
  @Min(0)
  sequence: number;

  @IsLatitude()
  latitude: number;

  @IsLongitude()
  longitude: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  accuracy?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  stepCount?: number;

  @IsDateString()
  recordedAt: string;
}

export class AddSamplesDto {
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => GpsSampleDto)
  samples: GpsSampleDto[];
}
