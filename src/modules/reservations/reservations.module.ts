import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';

import { Reservation } from './reservation.entity';
import { ReservationItem } from './reservation-item.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Reservation, ReservationItem])
  ],
  controllers: [ReservationsController],
  providers: [ReservationsService],
  exports: [ReservationsService]
})
export class ReservationsModule {}
