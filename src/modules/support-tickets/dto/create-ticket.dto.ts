import { IsString, IsNotEmpty, IsOptional, IsIn, MaxLength } from 'class-validator';

export class CreateTicketDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    subject: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(5000)
    message: string;

    @IsString()
    @IsOptional()
    @IsIn(['general', 'trip', 'payment', 'technical', 'account'])
    category?: string;

    @IsString()
    @IsOptional()
    @IsIn(['low', 'normal', 'high', 'urgent'])
    priority?: string;
}

