import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('notifications')
export class Notification {
    @PrimaryGeneratedColumn('identity')
    id: number;

    @Column({ type: 'uuid' })
    user_id: string;

    @Column({ type: 'text' })
    title: string;

    @Column({ type: 'text' })
    body: string;

    @Column({ type: 'text', default: 'general' })
    type: string;

    @Column({ type: 'jsonb', nullable: true })
    metadata: Record<string, any>;

    @Column({ type: 'boolean', default: false })
    is_read: boolean;

    @Column({ type: 'timestamp with time zone', nullable: true })
    read_at: Date;

    @CreateDateColumn({ type: 'timestamp with time zone' })
    created_at: Date;

    @Column({ type: 'text', default: 'general' })
    notification_type: string;

    @Column({ type: 'uuid', nullable: true })
    reference_id: string;

    @Column({ type: 'text', nullable: true })
    reference_type: string;

    @Column({ type: 'text', default: 'normal' })
    priority: string;

    @Column({ type: 'text', nullable: true })
    action_url: string;

    @Column({ type: 'timestamp with time zone', nullable: true })
    expires_at: Date;

    @Column({ type: 'text', default: 'general' })
    notification_category: string;

    @Column({ type: 'boolean', default: false })
    is_silent: boolean;

    @Column({ type: 'timestamp with time zone', nullable: true })
    scheduled_at: Date;

    @Column({ type: 'timestamp with time zone', nullable: true })
    sent_at: Date;

    @Column({ type: 'text', default: 'pending' })
    delivery_status: string;
}
