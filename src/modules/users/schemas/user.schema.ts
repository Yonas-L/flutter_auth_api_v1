import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true })
  email: string;

  @Prop()
  phone?: string;

  @Prop()
  name?: string;

  @Prop({ default: 'driver' })
  role: string;

  @Prop({ default: 'active' })
  status: string;
}

export const UserSchema = SchemaFactory.createForClass(User);
