import { Injectable, UnauthorizedException, ConflictException, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { User } from './user.entity';
import { Role } from './role.entity';
import { UserRole } from './user-role.entity';
import { LoginDto, SetupAdminDto } from './auth.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly dataSource: DataSource,
  ) {}

  async getSetupStatus() {
    const adminCount = await this.userRepository.count({
      where: {
        active: true,
        userRoles: {
          active: true,
          role: {
            name: 'ADMIN',
            active: true,
          }
        }
      },
      relations: { userRoles: { role: true } }
    });

    return { initialized: adminCount > 0 };
  }

  async setupAdmin(dto: SetupAdminDto) {
    const status = await this.getSetupStatus();
    if (status.initialized) {
      throw new ConflictException('El sistema ya ha sido inicializado con un administrador.');
    }

    const existingUser = await this.userRepository.findOne({ where: { email: dto.email } });
    if (existingUser) {
      throw new ConflictException('El correo electrónico ya está en uso.');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const role = await queryRunner.manager.findOne(Role, { where: { name: 'ADMIN' } });
      if (!role) {
        throw new InternalServerErrorException('El rol ADMIN no existe en la base de datos. Asegúrese de correr los seeds.');
      }

      const passwordHash = await bcrypt.hash(dto.password, 10);

      const user = queryRunner.manager.create(User, {
        name: dto.name,
        email: dto.email,
        passwordHash,
        active: true,
        mustChangePassword: false,
        temporaryPasswordExpiresAt: null,
        emailVerified: true,
      });

      const savedUser = await queryRunner.manager.save(user);

      const userRole = queryRunner.manager.create(UserRole, {
        userId: savedUser.id,
        roleId: role.id,
        active: true,
      });

      await queryRunner.manager.save(userRole);

      await queryRunner.commitTransaction();

      return { message: 'Administrador creado exitosamente' };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    const user = await this.userRepository.findOne({
      where: { email },
      relations: { userRoles: { role: true } },
    });

    if (!user || !user.active) {
      throw new UnauthorizedException('Correo o contraseña incorrectos');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Correo o contrasea incorrectos');
    }

    if (user.mustChangePassword && user.temporaryPasswordExpiresAt) {
      if (new Date() > user.temporaryPasswordExpiresAt) {
        throw new UnauthorizedException('La contrasea temporal ha expirado. Solicita una nueva.');
      }
      
      // If it's valid temporary login, mark email as verified since they got the code
      if (!user.emailVerified) {
        user.emailVerified = true;
        await this.userRepository.save(user);
      }
    }

    const activeRoles = user.userRoles
      .filter((ur) => ur.active && ur.role && ur.role.active)
      .map((ur) => ur.role.name);

    const payload = {
      sub: user.id,
      email: user.email,
      roles: activeRoles,
      branchId: user.branchId,
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        roles: activeRoles,
        branchId: user.branchId,
        mustChangePassword: user.mustChangePassword,
      },
    };
  }

  async changePassword(userId: number, newPassword: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: { userRoles: { role: true } },
    });
    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    const saltRounds = 10;
    user.passwordHash = await bcrypt.hash(newPassword, saltRounds);
    user.mustChangePassword = false;
    user.temporaryPasswordExpiresAt = null;
    user.emailVerified = true;

    await this.userRepository.save(user);

    const activeRoles = user.userRoles
      .filter((ur) => ur.active && ur.role && ur.role.active)
      .map((ur) => ur.role.name);

    const payload = {
      sub: user.id,
      email: user.email,
      roles: activeRoles,
      branchId: user.branchId,
    };

    const accessToken = this.jwtService.sign(payload);

    return { 
      message: 'Contrasea actualizada correctamente',
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        roles: activeRoles,
        branchId: user.branchId,
        mustChangePassword: user.mustChangePassword,
      }
    };
  }
}
