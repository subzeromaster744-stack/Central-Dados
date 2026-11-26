-- Guarda o ID do registro de origem (SharePoint) para que importar o mesmo arquivo
-- duas vezes não duplique registros.
ALTER TABLE registros_mi ADD COLUMN origem TEXT;
ALTER TABLE registros_cf ADD COLUMN origem TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mi_origem ON registros_mi (origem);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cf_origem ON registros_cf (origem);
