import { Injectable, UnauthorizedException, ConflictException, InternalServerErrorException, NotFoundException, BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { User } from './user.entity';
import { Role } from './role.entity';
import { UserRole } from './user-role.entity';
import { Client } from '../clients/client.entity';
import { MailService } from '../../common/mail.service';
import { LoginDto, SetupAdminDto } from './auth.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
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
      throw new UnauthorizedException('Correo o contraseña incorrectos');
    }

    if (user.mustChangePassword && user.temporaryPasswordExpiresAt) {
      if (new Date() > user.temporaryPasswordExpiresAt) {
        throw new UnauthorizedException('La contraseña temporal ha expirado. Solicita una nueva.');
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

  async registerClient(registerDto: any) {
    const { name, lastName, password, phone } = registerDto;
    const email = (registerDto.email as string).trim().toLowerCase();

    // Case C: User with that email already exists → duplicate
    const existingUser = await this.userRepository.findOne({ where: { email } });
    if (existingUser) {
      throw new ConflictException('El correo electrónico ya está en uso');
    }

    // Case B: Client exists WITHOUT digital account (userId = null)
    // This happens when they were registered at a POS terminal
    const existingClient = await this.clientRepository.findOne({ where: { email } });
    if (existingClient && existingClient.userId === null) {
      throw new HttpException(
        {
          code: 'CLIENT_EXISTS_WITHOUT_DIGITAL_ACCOUNT',
          message: 'Ya eres cliente de nuestra tienda. Debes activar tu cuenta digital.',
        },
        HttpStatus.CONFLICT,
      );
    }

    if (existingClient && existingClient.userId !== null) {
      throw new ConflictException('El correo electrónico ya está en uso');
    }

    // Case A: Brand new customer — create User + UserRole CLIENTE + Client
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const role = await queryRunner.manager.findOne(Role, { where: { name: 'CLIENTE' } });
      if (!role) throw new InternalServerErrorException('Rol CLIENTE no encontrado');

      const passwordHash = await bcrypt.hash(password, 10);
      const user = queryRunner.manager.create(User, {
        name: `${name}${lastName ? ' ' + lastName : ''}`,
        email,
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

      // Create Client entity linked to User
      const client = queryRunner.manager.create(Client, {
        name,
        lastName: lastName || '',
        email,
        phone: phone?.trim() || null,
        userId: savedUser.id,
        active: true,
        activationCodeHash: null,
        activationCodeExpiresAt: null,
      });
      await queryRunner.manager.save(Client, client);

      await queryRunner.commitTransaction();

      // Return tokens
      return this.login({ email, password });
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async requestAccountActivation(email: string) {
    const normalizedEmail = email.trim().toLowerCase();

    const client = await this.clientRepository.findOne({ where: { email: normalizedEmail } });
    if (!client) {
      throw new NotFoundException('No existe un cliente registrado con este correo.');
    }
    if (!client.active) {
      throw new BadRequestException('La cuenta de cliente está inactiva.');
    }
    if (client.userId !== null) {
      throw new ConflictException('Este cliente ya tiene una cuenta digital activa. Usa el login normal.');
    }

    // Generate 6-digit numeric code
    const code = crypto.randomInt(100000, 999999).toString();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 15);

    client.activationCodeHash = codeHash;
    client.activationCodeExpiresAt = expiresAt;
    await this.clientRepository.save(client);

    // Send email with original code
    await this.mailService.sendActivationCode(normalizedEmail, client.name, code);

    return { message: 'Código de activación enviado a tu correo. Válido por 15 minutos.' };
  }

  async activateAccount(email: string, code: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();

    const client = await this.clientRepository.findOne({ where: { email: normalizedEmail } });
    if (!client) {
      throw new NotFoundException('No existe un cliente registrado con este correo.');
    }
    if (client.userId !== null) {
      throw new ConflictException('Este cliente ya tiene una cuenta digital activa.');
    }
    if (!client.activationCodeHash || !client.activationCodeExpiresAt) {
      throw new BadRequestException('No hay un código de activación solicitado. Solicita uno primero.');
    }
    if (new Date() > client.activationCodeExpiresAt) {
      throw new BadRequestException('El código de activación ha expirado. Solicita uno nuevo.');
    }

    const isCodeValid = await bcrypt.compare(code, client.activationCodeHash);
    if (!isCodeValid) {
      throw new BadRequestException('Código de activación incorrecto.');
    }

    // Verify no User with that email exists yet
    const existingUser = await this.userRepository.findOne({ where: { email: normalizedEmail } });
    if (existingUser) {
      throw new ConflictException('Ya existe una cuenta con este correo.');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const role = await queryRunner.manager.findOne(Role, { where: { name: 'CLIENTE' } });
      if (!role) throw new InternalServerErrorException('Rol CLIENTE no encontrado');

      const passwordHash = await bcrypt.hash(password, 10);
      const user = queryRunner.manager.create(User, {
        name: `${client.name} ${client.lastName}`.trim(),
        email: normalizedEmail,
        passwordHash,
        active: true,
        mustChangePassword: false,
        temporaryPasswordExpiresAt: null,
        emailVerified: true,
      } as any);
      const savedUser = await queryRunner.manager.save(user);

      const userRole = queryRunner.manager.create(UserRole, {
        userId: savedUser.id,
        roleId: role.id,
        active: true,
      });
      await queryRunner.manager.save(userRole);

      // Link existing Client to new User — preserves all past POS sales
      client.userId = savedUser.id;
      client.activationCodeHash = null;
      client.activationCodeExpiresAt = null;
      await queryRunner.manager.save(Client, client);

      await queryRunner.commitTransaction();

      return { message: 'Cuenta activada correctamente. Ahora puedes iniciar sesión.' };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
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
      message: 'Contraseña actualizada correctamente',
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
