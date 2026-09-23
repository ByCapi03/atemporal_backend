import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { User } from './user.entity';
import { Role } from './role.entity';

@Entity('user_roles')
@Unique(['userId', 'roleId'])
export class UserRole {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column()
  roleId: number;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn()
  assignedAt: Date;

  @ManyToOne(() => User, (user) => user.userRoles)
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => Role, (role) => role.userRoles)
  @JoinColumn({ name: 'roleId' })
  role: Role;
}
