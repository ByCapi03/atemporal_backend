import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request } from '@nestjs/common';
import { AccessService } from './access.service';
import { CreateUserDto, UpdateUserDto, CreateRoleDto, UpdateRoleDto } from './access.dto';
import { AuthGuard } from '../../common/guards/auth.guard';

@UseGuards(AuthGuard)
@Controller('users')
export class AccessController {
  constructor(private readonly accessService: AccessService) {}

  @Post()
  createUser(@Body() createUserDto: CreateUserDto, @Request() req: any) {
    return this.accessService.createUser(createUserDto, req.user);
  }

  @Get()
  findAllUsers(@Request() req: any) {
    return this.accessService.findAllUsers(req.user);
  }

  @Get(':id')
  findOneUser(@Param('id') id: string) {
    return this.accessService.findOneUser(+id);
  }

  @Patch(':id')
  updateUser(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.accessService.updateUser(+id, updateUserDto);
  }

  @Delete(':id')
  removeUser(@Param('id') id: string) {
    return this.accessService.removeUser(+id);
  }

  @Post('roles')
  createRole(@Body() createRoleDto: CreateRoleDto) {
    return this.accessService.createRole(createRoleDto);
  }

  @Get('roles')
  findAllRoles() {
    return this.accessService.findAllRoles();
  }

  @Get('roles/:id')
  findOneRole(@Param('id') id: string) {
    return this.accessService.findOneRole(+id);
  }

  @Patch('roles/:id')
  updateRole(@Param('id') id: string, @Body() updateRoleDto: UpdateRoleDto) {
    return this.accessService.updateRole(+id, updateRoleDto);
  }

  @Delete('roles/:id')
  removeRole(@Param('id') id: string) {
    return this.accessService.removeRole(+id);
  }
}
