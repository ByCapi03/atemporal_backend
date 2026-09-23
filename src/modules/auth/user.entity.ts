import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany, ManyToOne, JoinColumn } from 'typeorm';
import { UserRole } from './user-role.entity';
import { Branch } from '../branches/branch.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ unique: true })
  email: string;

  @Column()
  passwordHash: string;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ nullable: true })
  branchId: number;

  @ManyToOne(() => Branch, (branch) => branch.users)
  @JoinColumn({ name: 'branchId' })
  branch: Branch;

  @OneToMany(() => UserRole, (userRole) => userRole.user)
  userRoles: UserRole[];
}
