import { Injectable, BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './user.entity';
import { Role } from './role.entity';
import { UserRole } from './user-role.entity';
import { CreateUserDto, UpdateUserDto, CreateRoleDto, UpdateRoleDto } from './access.dto';

@Injectable()
export class AccessService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(UserRole)
    private readonly userRoleRepository: Repository<UserRole>,
    private readonly dataSource: DataSource,
  ) {}

  async createUser(createUserDto: CreateUserDto, currentUser: any) {
    const { name, email, password, roleName, branchId, active } = createUserDto;

    // RBAC Validation
    const isCurrentUserAdmin = currentUser.roles.includes('ADMIN');
    const isCurrentUserEncargado = currentUser.roles.includes('ENCARGADO');

    if (isCurrentUserEncargado) {
      if (roleName !== 'CAJERO') {
        throw new UnauthorizedException('ENCARGADO can only create CAJERO users');
      }
      if (branchId !== currentUser.branchId) {
        throw new UnauthorizedException('ENCARGADO can only create users for their own branch');
      }
    } else if (!isCurrentUserAdmin) {
      throw new UnauthorizedException('Insufficient permissions to create users');
    }

    if ((roleName === 'ENCARGADO' || roleName === 'CAJERO') && !branchId) {
      throw new BadRequestException(`${roleName} must have a branch assigned`);
    }

    // Check if user already exists
    const existingUser = await this.userRepository.findOneBy({ email });
    if (existingUser) {
      throw new BadRequestException('Email already in use');
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Transaction
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Get role
      const role = await queryRunner.manager.findOneBy(Role, { name: roleName });
      if (!role) {
        throw new NotFoundException(`Role ${roleName} not found`);
      }

      // Create User
      const user = queryRunner.manager.create(User, {
        name,
        email,
        passwordHash,
        branchId: branchId || undefined,
        active: active !== undefined ? active : true,
      });
      const savedUser = await queryRunner.manager.save(user);

      // Create UserRole
      const userRole = queryRunner.manager.create(UserRole, {
        user: savedUser,
        role: role,
      });
      await queryRunner.manager.save(userRole);

      await queryRunner.commitTransaction();

      // Return user without password
      const { passwordHash: _, ...result } = savedUser;
      return result;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async findAllUsers(currentUser: any) {
    const isCurrentUserAdmin = currentUser.roles.includes('ADMIN');
    
    let whereClause = {};
    if (!isCurrentUserAdmin) {
      // Only show users of the same branch
      whereClause = { branchId: currentUser.branchId };
    }

    const users = await this.userRepository.find({
      where: whereClause,
      relations: { userRoles: { role: true }, branch: true },
      order: { id: 'ASC' },
    });

    return users.map(user => {
      const { passwordHash, ...safeUser } = user;
      return safeUser;
    });
  }

  async findOneUser(id: number) {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: { userRoles: { role: true }, branch: true },
    });
    if (!user) throw new NotFoundException('User not found');
    const { passwordHash, ...safeUser } = user;
    return safeUser;
  }

  async updateUser(id: number, updateUserDto: UpdateUserDto) {
    const user = await this.userRepository.findOneBy({ id });
    if (!user) throw new NotFoundException('User not found');
    
    // Partial update logic here if needed (skipping for now)
    return `This action updates a #${id} user`;
  }

  async removeUser(id: number) {
    const user = await this.userRepository.findOneBy({ id });
    if (!user) throw new NotFoundException('User not found');
    user.active = false;
    await this.userRepository.save(user);
    return { success: true, message: `User ${id} deactivated` };
  }

  createRole(createRoleDto: CreateRoleDto) {
    return 'This action adds a new role';
  }

  findAllRoles() {
    return this.roleRepository.find();
  }

  findOneRole(id: number) {
    return `This action returns a #${id} role`;
  }

  updateRole(id: number, updateRoleDto: UpdateRoleDto) {
    return `This action updates a #${id} role`;
  }

  removeRole(id: number) {
    return `This action removes a #${id} role`;
  }
}
