import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './controllers/auth.controller';
import { UsersController } from './controllers/users.controller';
import { RolesController } from './controllers/roles.controller';
import { AuthService } from './services/auth.service';
import { UsersService } from './services/users.service';
import { RolesService } from './services/roles.service';

import { User } from './entities/users/user.entity';
import { Role } from './entities/roles/role.entity';
import { UserRole } from './entities/users/user-role.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Role, UserRole])
  ],
  controllers: [AuthController, UsersController, RolesController],
  providers: [AuthService, UsersService, RolesService],
})
export class AuthModule {}
