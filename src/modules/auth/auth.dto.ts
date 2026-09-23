import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'El correo electrónico no es válido.' })
  @IsNotEmpty({ message: 'El correo es obligatorio.' })
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'La contraseña es obligatoria.' })
  password: string;
}

export class SetupAdminDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre es obligatorio.' })
  name: string;

  @IsEmail({}, { message: 'El correo electrónico no es válido.' })
  @IsNotEmpty({ message: 'El correo es obligatorio.' })
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'La contraseña es obligatoria.' })
  password: string;
}

