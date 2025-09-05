import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { DriverProfilesModule } from './modules/driver-profiles/driver-profiles.module';
import { VehiclesModule } from './modules/vehicles/vehicles.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { OtpModule } from './modules/otp/otp.module';
import { MailModule } from './modules/mail/mail.module';
import { DatabaseModule } from './modules/database/database.module';
import { SocketModule } from './modules/socket/socket.module';

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
    DatabaseModule,
    AuthModule,
    UsersModule,
    DriverProfilesModule,
    VehiclesModule,
    DocumentsModule,
    OtpModule,
    MailModule,
    SocketModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
