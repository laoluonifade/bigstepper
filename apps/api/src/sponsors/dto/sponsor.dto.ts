import 'reflect-metadata';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsEmail, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';

const COUNTRY = /^[A-Z]{2}$/;

export class ApplySponsorDto {
  @IsIn(['brand', 'club'])
  kind: 'brand' | 'club';

  @IsString() @Length(2, 120)
  name: string;

  /** A run club sponsoring as itself; the applicant must manage it. */
  @IsOptional() @IsUUID()
  clubId?: string;

  @IsOptional() @IsString() @MaxLength(200)
  website?: string;

  @IsOptional() @IsString() @MaxLength(600)
  description?: string;

  @IsEmail()
  contactEmail: string;

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(60) @Matches(COUNTRY, { each: true })
  deliveryCountries: string[];
}

export class UpdateSponsorDto {
  @IsOptional() @IsString() @Length(2, 120)
  name?: string;

  @IsOptional() @IsString() @MaxLength(200)
  website?: string;

  @IsOptional() @IsString() @MaxLength(600)
  description?: string;

  @IsOptional() @IsEmail()
  contactEmail?: string;

  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(60) @Matches(COUNTRY, { each: true })
  deliveryCountries?: string[];
}

export class AddSponsorMemberDto {
  @IsEmail()
  email: string;
}

/** The prize for one winning position. */
export class PrizeInputDto {
  @IsInt() @Min(1) @Max(100)
  position: number;

  @IsString() @Length(2, 120)
  productName: string;

  @IsOptional() @IsString() @MaxLength(600)
  description?: string;

  /** A URL returned by POST /sponsors/:id/images. */
  @IsOptional() @IsString() @MaxLength(400)
  imageUrl?: string;

  @IsInt() @Min(1) @Max(1000)
  quantity: number;

  /** Rough worth, in the currency's main unit (naira, cedis…), for display. */
  @IsOptional() @IsInt() @Min(0) @Max(100_000_000)
  estimatedValue?: number;

  @IsOptional() @Matches(/^[A-Z]{3}$/)
  currency?: string;
}

/** Product prizes on a competition being created. */
export class ProductPrizesDto {
  @IsUUID()
  sponsorId: string;

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => PrizeInputDto)
  prizes: PrizeInputDto[];

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(60) @Matches(COUNTRY, { each: true })
  deliveryCountries: string[];

  @IsIn(['sponsor', 'jump'])
  fulfilment: 'sponsor' | 'jump';

  @IsIn(['sponsor', 'jump', 'other'])
  shipping: 'sponsor' | 'jump' | 'other';

  @IsOptional() @IsString() @MaxLength(300)
  shippingNote?: string;

  @IsOptional() @IsString() @MaxLength(600)
  eligibilityNote?: string;

  @IsOptional() @IsInt() @Min(3) @Max(60)
  claimDays?: number;

  /** The sponsor commits to these prizes and to delivering to every listed country. */
  @IsIn([true])
  committed: true;
}

export class WinnerDetailsDto {
  @IsString() @Length(2, 120)
  fullName: string;

  @IsString() @Matches(/^\+?[0-9 ()-]{7,20}$/)
  phone: string;

  @IsString() @Length(5, 300)
  address: string;

  @IsString() @Length(2, 80)
  city: string;

  @IsString() @Length(2, 80)
  region: string;

  @Matches(COUNTRY)
  country: string;

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
