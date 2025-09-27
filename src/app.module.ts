import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { AuthPostgresModule } from './modules/auth/auth-postgres.module';
import { UsersModule } from './modules/users/users.module';
import { DriverProfilesModule } from './modules/driver-profiles/driver-profiles.module';
import { VehiclesModule } from './modules/vehicles/vehicles.module';
import { VehicleTypesModule } from './modules/vehicles/vehicle-types.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { RegistrationModule } from './modules/registration/registration.module';
import { OtpModule } from './modules/otp/otp.module';
import { OtpAfroMessageModule } from './modules/otp/otp-afromessage.module';
import { MailModule } from './modules/mail/mail.module';
import { DatabaseModule } from './modules/database/database.module';
import { SocketModule } from './modules/socket/socket.module';
import { StorageModule } from './modules/storage/storage.module';
import { CloudinaryModule } from './modules/storage/cloudinary.module';
import { TripsModule } from './modules/trips/trips.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AdminModule } from './modules/admin/admin.module';
import { WalletModule } from './modules/wallet/wallet.module';

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
    AuthModule, // Legacy Supabase auth
    AuthPostgresModule, // New PostgreSQL auth
    UsersModule,
    DriverProfilesModule,
    VehiclesModule,
    VehicleTypesModule,
    DocumentsModule,
    RegistrationModule,
    OtpModule,
    OtpAfroMessageModule,
    MailModule,
    SocketModule,
    StorageModule,
    CloudinaryModule,
    TripsModule,
    NotificationsModule,
    AdminModule,
    WalletModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
