import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { OtpModule } from './modules/otp/otp.module';
import { MailModule } from './modules/mail/mail.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    // MongooseModule.forRootAsync({
    //   useFactory: () => ({
    //     uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/arada-driver',
    //     retryWrites: true,
    //     w: 'majority',
    //   }),
    // }),
    AuthModule,
    UsersModule,
    OtpModule,
    MailModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
