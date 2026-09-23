import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards, Request, Get } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto, SetupAdminDto, ChangePasswordDto, RegisterClientDto, RequestActivationDto, ActivateAccountDto } from './auth.dto';
import { AuthGuard } from '../../common/guards/auth.guard';

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

  @Post('register')
  register(@Body() registerDto: RegisterClientDto) {
    return this.authService.registerClient(registerDto);
  }

  @Post('request-account-activation')
  @HttpCode(HttpStatus.OK)
  requestAccountActivation(@Body() dto: RequestActivationDto) {
    return this.authService.requestAccountActivation(dto.email);
  }

  @Post('activate-account')
  @HttpCode(HttpStatus.OK)
  activateAccount(@Body() dto: ActivateAccountDto) {
    return this.authService.activateAccount(dto.email, dto.code, dto.password);
  }

  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('change-password')
  changePassword(@Request() req: any, @Body() changePasswordDto: ChangePasswordDto) {
    return this.authService.changePassword(req.user.sub, changePasswordDto.newPassword);
  }
}
