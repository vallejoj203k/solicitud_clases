-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('CLIENTE', 'ADMIN');

-- CreateEnum
CREATE TYPE "EstadoClase" AS ENUM ('ACTIVA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "EstadoReserva" AS ENUM ('CONFIRMADA', 'CANCELADA', 'ASISTIO', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "EstadoPago" AS ENUM ('PENDIENTE', 'PAGADO', 'RECHAZADO');

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT NOT NULL,
    "email" TEXT,
    "rol" "Rol" NOT NULL DEFAULT 'CLIENTE',
    "passwordHash" TEXT,
    "notas" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TipoClase" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#C8F751',
    "icono" TEXT NOT NULL DEFAULT 'run',
    "layoutPuestos" JSONB NOT NULL,
    "precioCop" INTEGER NOT NULL DEFAULT 0,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TipoClase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Instructor" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "foto" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Instructor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Clase" (
    "id" TEXT NOT NULL,
    "tipoClaseId" TEXT NOT NULL,
    "instructorId" TEXT,
    "inicioEn" TIMESTAMP(3) NOT NULL,
    "duracionMin" INTEGER NOT NULL DEFAULT 50,
    "cupoMaximo" INTEGER NOT NULL,
    "precioCop" INTEGER NOT NULL DEFAULT 0,
    "layoutOverride" JSONB,
    "puestosBloqueados" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "estado" "EstadoClase" NOT NULL DEFAULT 'ACTIVA',
    "notas" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Clase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reserva" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "claseId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "puestoCodigo" TEXT NOT NULL,
    "estado" "EstadoReserva" NOT NULL DEFAULT 'CONFIRMADA',
    "estadoPago" "EstadoPago" NOT NULL DEFAULT 'PENDIENTE',
    "montoCop" INTEGER NOT NULL DEFAULT 0,
    "metodoPago" TEXT,
    "pagoRef" TEXT,
    "pagoPayload" JSONB,
    "pagoActualizadoEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "canceladoEn" TIMESTAMP(3),

    CONSTRAINT "Reserva_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_telefono_key" ON "Usuario"("telefono");

-- CreateIndex
CREATE INDEX "Usuario_nombre_idx" ON "Usuario"("nombre");

-- CreateIndex
CREATE INDEX "Usuario_rol_idx" ON "Usuario"("rol");

-- CreateIndex
CREATE UNIQUE INDEX "TipoClase_slug_key" ON "TipoClase"("slug");

-- CreateIndex
CREATE INDEX "Clase_inicioEn_idx" ON "Clase"("inicioEn");

-- CreateIndex
CREATE INDEX "Clase_tipoClaseId_inicioEn_idx" ON "Clase"("tipoClaseId", "inicioEn");

-- CreateIndex
CREATE INDEX "Clase_estado_inicioEn_idx" ON "Clase"("estado", "inicioEn");

-- CreateIndex
CREATE UNIQUE INDEX "Reserva_codigo_key" ON "Reserva"("codigo");

-- CreateIndex
CREATE INDEX "Reserva_claseId_estado_idx" ON "Reserva"("claseId", "estado");

-- CreateIndex
CREATE INDEX "Reserva_usuarioId_creadoEn_idx" ON "Reserva"("usuarioId", "creadoEn");

-- CreateIndex
CREATE INDEX "Reserva_estadoPago_idx" ON "Reserva"("estadoPago");

-- CreateIndex
CREATE INDEX "Reserva_creadoEn_idx" ON "Reserva"("creadoEn");

-- AddForeignKey
ALTER TABLE "Clase" ADD CONSTRAINT "Clase_tipoClaseId_fkey" FOREIGN KEY ("tipoClaseId") REFERENCES "TipoClase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Clase" ADD CONSTRAINT "Clase_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "Instructor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_claseId_fkey" FOREIGN KEY ("claseId") REFERENCES "Clase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
