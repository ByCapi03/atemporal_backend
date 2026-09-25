import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppGateway } from './app.gateway';
import { AuthModule } from '../../modules/auth/auth.module';
import { User } from '../../modules/auth/user.entity';

@Global()
@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([User])],
  providers: [AppGateway],
  exports: [AppGateway],
})
export class WebsocketModule {}
