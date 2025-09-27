import { IsNotEmpty, IsNumber, IsString, IsOptional, Min, IsEnum } from 'class-validator';

export class DepositRequestDto {
  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  amount: number;

  @IsNotEmpty()
  @IsString()
  @IsEnum(['telebirr', 'cbe_birr', 'awash_bank', 'dashen_bank', 'chapa'])
  payment_method: string;
}

export class WithdrawalRequestDto {
  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  amount: number;

  @IsNotEmpty()
  @IsString()
  bank_name: string;

  @IsNotEmpty()
  @IsString()
  account_number: string;

  @IsNotEmpty()
  @IsString()
  account_holder_name: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class TransactionQueryDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @IsNumber()
  @Min(1)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  @IsEnum(['deposit', 'withdrawal', 'payment', 'refund'])
  type?: string;
}
