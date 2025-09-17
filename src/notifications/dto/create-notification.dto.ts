import { IsString, IsUUID, IsOptional, IsBoolean, IsNumber, IsObject, IsDateString } from 'class-validator';

export class CreateNotificationDto {
    @IsUUID()
    user_id: string;

    @IsString()
    title: string;

    @IsString()
    body: string;

    @IsString()
    @IsOptional()
    type?: string = 'general';

    @IsObject()
    @IsOptional()
    metadata?: Record<string, any>;

    @IsBoolean()
    @IsOptional()
    is_read?: boolean = false;

    @IsDateString()
    @IsOptional()
    read_at?: Date;

    @IsString()
    @IsOptional()
    notification_type?: string = 'general';

    @IsUUID()
    @IsOptional()
    reference_id?: string;

    @IsString()
    @IsOptional()
    reference_type?: string;

    @IsString()
    @IsOptional()
    priority?: string = 'normal';

    @IsString()
    @IsOptional()
    action_url?: string;

    @IsDateString()
    @IsOptional()
    expires_at?: Date;

    @IsString()
    @IsOptional()
    notification_category?: string = 'general';

    @IsBoolean()
    @IsOptional()
    is_silent?: boolean = false;

    @IsDateString()
    @IsOptional()
    scheduled_at?: Date;

    @IsDateString()
    @IsOptional()
    sent_at?: Date;

    @IsString()
    @IsOptional()
    delivery_status?: string = 'pending';
}
