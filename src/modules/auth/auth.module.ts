import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AccessController } from './access.controller';
import { AccessService } from './access.service';

import { User } from './user.entity';
import { Role } from './role.entity';
import { UserRole } from './user-role.entity';
import { Client } from '../clients/client.entity';
import { MailService } from '../../common/mail.service';
import { AuthGuard } from '../../common/guards/auth.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Role, UserRole, Client]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'defaultSecret',
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRES_IN', '8h') as any,
        },
      }),
    }),
  ],
  controllers: [AuthController, AccessController],
  providers: [AuthService, AccessService, MailService, AuthGuard],
  exports: [AuthService, AccessService, MailService, JwtModule, AuthGuard],
})
export class AuthModule {}
