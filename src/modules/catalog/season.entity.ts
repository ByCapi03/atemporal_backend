import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Collection } from './collection.entity';

@Entity('seasons')
export class Season {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ type: 'date' })
  startDate: string;

  @Column({ type: 'date' })
  endDate: string;

  @Column({ default: true })
  active: boolean;

  @OneToMany(() => Collection, (collection) => collection.season)
  collections: Collection[];
}
