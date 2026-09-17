import { Module } from '@nestjs/common';
import { AuthController } from './controllers/auth.controller';
import { RolesController } from './controllers/roles.controller';
import { UsersController } from './controllers/users.controller';
import { AuthService } from './services/auth.service';
import { RolesService } from './services/roles.service';
import { UsersService } from './services/users.service';

@Module({
  controllers: [AuthController, RolesController, UsersController],
  providers: [AuthService, RolesService, UsersService],
})
export class AuthModule {}
