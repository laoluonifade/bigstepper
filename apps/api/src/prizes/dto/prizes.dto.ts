import 'reflect-metadata';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';

const COUNTRY = /^[A-Z]{2}$/;

export const PRIZE_KINDS = ['product', 'discount', 'experience'] as const;
export type PrizeKind = (typeof PRIZE_KINDS)[number];

/** One prize tier: what it is and how many winners get it, in finishing order. */
export class PrizeInputDto {
  /** 1 for the first tier (the top finishers), 2 for the next, and so on. */
  @IsInt() @Min(1) @Max(100)
  position: number;

  @IsIn(PRIZE_KINDS)
  kind: PrizeKind;

  @IsString() @Length(2, 120)
  productName: string;

  @IsOptional() @IsString() @MaxLength(600)
  description?: string;

  /** A URL returned by POST /clubs/:id/prize-images. */
  @IsOptional() @IsString() @MaxLength(400)
  imageUrl?: string;

  /** How many winners get this prize. */
  @IsInt() @Min(1) @Max(1000)
  quantity: number;

  /** Rough worth, in the currency's main unit (naira, cedis…), for display. */
  @IsOptional() @IsInt() @Min(0) @Max(100_000_000)
  estimatedValue?: number;

  @IsOptional() @Matches(/^[A-Z]{3}$/)
  currency?: string;

  /** Shown only to a winner once they've claimed: a discount code, where to collect, how to book. */
  @IsOptional() @IsString() @MaxLength(600)
  redeemInstructions?: string;
}

/** The club's prizes on a challenge, and the terms it commits to. */
export class ClubPrizesDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => PrizeInputDto)
  prizes: PrizeInputDto[];

  /** top: prizes go down the final standings. draw: a random draw among everyone who qualifies. */
  @IsIn(['top', 'draw'])
  selection: 'top' | 'draw';

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(60) @Matches(COUNTRY, { each: true })
  deliveryCountries: string[];

  @IsIn(['club', 'jump'])
  fulfilment: 'club' | 'jump';

  @IsIn(['club', 'jump', 'other'])
  shipping: 'club' | 'jump' | 'other';

  /** Fulfilment terms: who pays delivery, how long it takes, anything winners should know. */
  @IsOptional() @IsString() @MaxLength(300)
  shippingNote?: string;

  @IsOptional() @IsString() @MaxLength(600)
  eligibilityNote?: string;

  /** Days a winner has to claim before the prize passes to the next eligible finisher. */
  @IsOptional() @IsInt() @Min(3) @Max(60)
  claimDays?: number;

  /** The club commits to these prizes and to delivering to every listed country. */
  @IsIn([true])
  committed: true;
}

/**
 * A winner's claim. Products need a delivery address; experiences a name and phone; discounts only a
 * name. The service checks the fields the prize needs.
 */
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
