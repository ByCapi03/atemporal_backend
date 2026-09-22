/**
 * Este archivo contiene datos de prueba opcionales que se pueden inyectar
 * en un entorno de desarrollo para probar el sistema sin tener que
 * crearlos manualmente.
 * 
 * NO incluir en los seeds de producción.
 */
export const demoSeed = {
  adminUser: {
    email: process.env.SEED_ADMIN_EMAIL,
    password: process.env.SEED_ADMIN_PASSWORD, // Debe reemplazarse por bcrypt hash luego
    role_id: 1, // ROL.ADMIN
    branch_id: null
  },
  branches: [
    { id: 1, nombre: 'Sucursal Central', city_id: 1 },
    { id: 2, nombre: 'Sucursal Norte', city_id: 2 }
  ],
  suppliers: [
    { id: 1, nombre: 'Proveedor Principal S.A.' },
    { id: 2, nombre: 'Importaciones X' }
  ],
  products: [
    // Aquí irían datos dummy de productos, variantes e inventario
  ]
};
