import { IsString, IsOptional, IsIn, IsUUID } from 'class-validator';

export class UpdateTicketDto {
    @IsString()
    @IsOptional()
    @IsIn(['open', 'in_progress', 'resolved', 'closed'])
    status?: string;

    @IsString()
    @IsOptional()
    @IsIn(['low', 'normal', 'high', 'urgent'])
    priority?: string;

    @IsUUID()
    @IsOptional()
    assigned_to_user_id?: string;
}

