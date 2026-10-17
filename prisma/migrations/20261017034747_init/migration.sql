-- CreateTable
CREATE TABLE "solicitudes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contenido_raw" TEXT NOT NULL,
    "contenido_mascarado" TEXT NOT NULL,
    "clasificacion_original" JSONB NOT NULL,
    "categoria" TEXT NOT NULL,
    "prioridad" TEXT NOT NULL,
    "area_sugerida" TEXT NOT NULL,
    "idioma" TEXT NOT NULL,
    "resumen" TEXT NOT NULL,
    "requiere_info" BOOLEAN NOT NULL,
    "pregunta_seguimiento" TEXT,
    "confianza" REAL NOT NULL,
    "version_prompt" TEXT NOT NULL,
    "requiere_revision" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "correcciones" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "solicitud_id" TEXT NOT NULL,
    "campo" TEXT NOT NULL,
    "valor_anterior" TEXT,
    "valor_nuevo" TEXT,
    "patch_id" TEXT NOT NULL,
    "autor" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "correcciones_solicitud_id_fkey" FOREIGN KEY ("solicitud_id") REFERENCES "solicitudes" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "model_call_logs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "solicitud_id" TEXT,
    "modelo" TEXT NOT NULL,
    "version_prompt" TEXT NOT NULL,
    "prompt_tokens" INTEGER NOT NULL,
    "completion_tokens" INTEGER NOT NULL,
    "total_tokens" INTEGER NOT NULL,
    "costo_estimado" REAL NOT NULL,
    "latencia_ms" INTEGER NOT NULL,
    "intento" INTEGER NOT NULL,
    "reparaciones" INTEGER NOT NULL,
    "estado" TEXT NOT NULL,
    "error" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "model_call_logs_solicitud_id_fkey" FOREIGN KEY ("solicitud_id") REFERENCES "solicitudes" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "solicitudes_categoria_idx" ON "solicitudes"("categoria");

-- CreateIndex
CREATE INDEX "solicitudes_prioridad_idx" ON "solicitudes"("prioridad");

-- CreateIndex
CREATE INDEX "solicitudes_area_sugerida_idx" ON "solicitudes"("area_sugerida");

-- CreateIndex
CREATE INDEX "solicitudes_requiere_revision_idx" ON "solicitudes"("requiere_revision");

-- CreateIndex
CREATE INDEX "solicitudes_created_at_idx" ON "solicitudes"("created_at");

-- CreateIndex
CREATE INDEX "correcciones_solicitud_id_patch_id_idx" ON "correcciones"("solicitud_id", "patch_id");

-- CreateIndex
CREATE INDEX "model_call_logs_solicitud_id_idx" ON "model_call_logs"("solicitud_id");

-- CreateIndex
CREATE INDEX "model_call_logs_created_at_idx" ON "model_call_logs"("created_at");

-- CreateIndex
CREATE INDEX "model_call_logs_estado_idx" ON "model_call_logs"("estado");
