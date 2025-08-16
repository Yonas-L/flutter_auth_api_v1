import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type OtpDocument = Otp & Document;

@Schema({ timestamps: true })
export class Otp {
  @Prop({ required: true })
  email: string;

  @Prop({ required: true })
  codeHash: string;

  @Prop({ default: 'email_verification' })
  purpose: string;

  @Prop({ required: true, expires: 0 }) // TTL index - expires based on this field
  expiresAt: Date;

  @Prop({ default: 0 })
  attempts: number;

  @Prop({ default: 3 })
  maxAttempts: number;
}

export const OtpSchema = SchemaFactory.createForClass(Otp);
