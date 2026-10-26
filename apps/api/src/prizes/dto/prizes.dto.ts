import 'reflect-metadata';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';

const COUNTRY = /^[A-Z]{2}$/;

export const PRIZE_KINDS = ['product', 'discount', 'experience'] as const;
export type PrizeKind = (typeof PRIZE_KINDS)[number];

export class PrizeInputDto {
  @IsInt() @Min(1) @Max(100)
  position: number;

  @IsIn(PRIZE_KINDS)
  kind: PrizeKind;

  @IsString() @Length(2, 120)
  productName: string;

  @IsOptional() @IsString() @MaxLength(600)
  description?: string;

  @IsOptional() @IsString() @MaxLength(400)
  imageUrl?: string;

  @IsInt() @Min(1) @Max(1000)
  quantity: number;

  @IsOptional() @IsInt() @Min(0) @Max(100_000_000)
  estimatedValue?: number;

  @IsOptional() @Matches(/^[A-Z]{3}$/)
  currency?: string;

  @IsOptional() @IsString() @MaxLength(600)
  redeemInstructions?: string;
}

export class ClubPrizesDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => PrizeInputDto)
  prizes: PrizeInputDto[];

  @IsIn(['top', 'draw'])
  selection: 'top' | 'draw';

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(60) @Matches(COUNTRY, { each: true })
  deliveryCountries: string[];

  @IsIn(['club', 'jump'])
  fulfilment: 'club' | 'jump';

  @IsIn(['club', 'jump', 'other'])
  shipping: 'club' | 'jump' | 'other';

  @IsOptional() @IsString() @MaxLength(300)
  shippingNote?: string;

  @IsOptional() @IsString() @MaxLength(600)
  eligibilityNote?: string;

  @IsOptional() @IsInt() @Min(3) @Max(60)
  claimDays?: number;

  @IsIn([true])
  committed: true;
}

export class WinnerDetailsDto {
  @IsString() @Length(2, 120)
  fullName: string;

  @IsOptional() @IsString() @Matches(/^\+?[0-9 ()-]{7,20}$/)
  phone?: string;

  @IsOptional() @IsString() @Length(5, 300)
  address?: string;

  @IsOptional() @IsString() @Length(2, 80)
  city?: string;

  @IsOptional() @IsString() @Length(2, 80)
  region?: string;

  @IsOptional() @Matches(COUNTRY)
  country?: string;

  @IsOptional() @IsString() @MaxLength(300)
  deliveryNotes?: string;
}

export class UpdateAwardDto {
  @IsIn(['READY_FOR_DISPATCH', 'SHIPPED', 'DELIVERED', 'ISSUE'])
  status: 'READY_FOR_DISPATCH' | 'SHIPPED' | 'DELIVERED' | 'ISSUE';

  @IsOptional() @IsString() @MaxLength(300)
  trackingNote?: string;

  @IsOptional() @IsString() @MaxLength(500)
  issueNote?: string;
}
