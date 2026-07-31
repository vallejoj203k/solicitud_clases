-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EstadoReserva" ADD VALUE 'PENDIENTE_PAGO';
ALTER TYPE "EstadoReserva" ADD VALUE 'EXPIRADA';

-- AlterTable
ALTER TABLE "Reserva" ADD COLUMN     "expiraEn" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Reserva_estado_expiraEn_idx" ON "Reserva"("estado", "expiraEn");
