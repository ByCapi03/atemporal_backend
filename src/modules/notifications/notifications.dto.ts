/**
 * NOTIFICATIONS DTO
 * Data Transfer Objects: Define la estructura esperada cuando un dispositivo
 * (móvil o web) envía su token push (FCM) para registrarse.
 */
import { IsString, IsNotEmpty } from 'class-validator';

export class RegisterDeviceDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsString()
  @IsNotEmpty()
  platform: string; // 'WEB', 'MOBILE'
}
