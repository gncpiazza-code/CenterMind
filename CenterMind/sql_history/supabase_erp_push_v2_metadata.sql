-- ================================================================
-- ERP PUSH ARCHITECTURE - PHASE 2: Enhanced Client Metadata
-- ================================================================

-- 1. Add new columns to erp_clientes_raw for advanced routing and segmentation
DO $$ 
BEGIN 
    -- Routing & Visit Days
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='erp_clientes_raw' AND column_name='ruta') THEN
        ALTER TABLE erp_clientes_raw ADD COLUMN ruta TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='erp_clientes_raw' AND column_name='visita_lunes') THEN
        ALTER TABLE erp_clientes_raw ADD COLUMN visita_lunes TEXT;
        ALTER TABLE erp_clientes_raw ADD COLUMN visita_martes TEXT;
        ALTER TABLE erp_clientes_raw ADD COLUMN visita_miercoles TEXT;
        ALTER TABLE erp_clientes_raw ADD COLUMN visita_jueves TEXT;
        ALTER TABLE erp_clientes_raw ADD COLUMN visita_viernes TEXT;
        ALTER TABLE erp_clientes_raw ADD COLUMN visita_sabado TEXT;
        ALTER TABLE erp_clientes_raw ADD COLUMN visita_domingo TEXT;
    END IF;

    -- Segmentation
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='erp_clientes_raw' AND column_name='canal') THEN
        ALTER TABLE erp_clientes_raw ADD COLUMN canal TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='erp_clientes_raw' AND column_name='subcanal') THEN
        ALTER TABLE erp_clientes_raw ADD COLUMN subcanal TEXT;
    END IF;

    -- Contact
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='erp_clientes_raw' AND column_name='telefono') THEN
        ALTER TABLE erp_clientes_raw ADD COLUMN telefono TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='erp_clientes_raw' AND column_name='movil') THEN
        ALTER TABLE erp_clientes_raw ADD COLUMN movil TEXT;
    END IF;

    -- Dates
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='erp_clientes_raw' AND column_name='fecha_alta') THEN
        ALTER TABLE erp_clientes_raw ADD COLUMN fecha_alta DATE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='erp_clientes_raw' AND column_name='fecha_ultima_compra') THEN
        ALTER TABLE erp_clientes_raw ADD COLUMN fecha_ultima_compra DATE;
    END IF;

END $$;
