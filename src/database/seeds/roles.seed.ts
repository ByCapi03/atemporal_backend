import { DataSource } from 'typeorm';
import { Role } from '../../modules/auth/entities/roles/role.entity';

export const seedRoles = async (dataSource: DataSource) => {
  const roleRepository = dataSource.getRepository(Role);
  
  const roles = [
    { id: 1, name: 'ADMIN', description: 'Administrador' },
    { id: 2, name: 'CLIENTE', description: 'Cliente' },
    { id: 3, name: 'ENCARGADO', description: 'Encargado de Sucursal' },
    { id: 4, name: 'CAJERO', description: 'Cajero' }
  ];

  for (const roleData of roles) {
    const exists = await roleRepository.findOneBy({ id: roleData.id });
    if (!exists) {
      const role = roleRepository.create(roleData);
      await roleRepository.save(role);
      console.log(`Role ${role.name} created.`);
    } else {
      console.log(`Role ${exists.name} already exists.`);
    }
  }
};
