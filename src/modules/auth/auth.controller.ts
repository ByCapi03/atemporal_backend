import { Controller, Post, Body, HttpCode, HttpStatus, Get } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto, SetupAdminDto } from './auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('setup-status')
  getSetupStatus() {
    return this.authService.getSetupStatus();
  }

  @Post('setup-admin')
  setupAdmin(@Body() setupAdminDto: SetupAdminDto) {
    return this.authService.setupAdmin(setupAdminDto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }
}
