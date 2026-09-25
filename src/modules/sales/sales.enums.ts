/**
 * SALES ENUMS
 * Configuración Central: Define los estados fijos (ej: SaleStatus como PENDIENTE/COMPLETADA, 
 * PaymentMethod como EFECTIVO/QR/PASARELA, y CashSessionStatus).
 */
export enum SaleChannel {
  WEB = 'WEB',
  MOVIL = 'MOVIL',
  POS = 'POS',
}

export enum SaleStatus {
  PENDIENTE = 'PENDIENTE',
  PAGADA = 'PAGADA',
  COMPLETADA = 'COMPLETADA',
  CANCELADA = 'CANCELADA',
}

export enum PaymentMethod {
  EFECTIVO = 'EFECTIVO',
  TARJETA = 'TARJETA',
  QR = 'QR',
  TRANSFERENCIA = 'TRANSFERENCIA',
  PASARELA = 'PASARELA',
}

export enum PaymentStatus {
  PENDIENTE = 'PENDIENTE',
  APROBADO = 'APROBADO',
  RECHAZADO = 'RECHAZADO',
}

export enum CashSessionStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}
