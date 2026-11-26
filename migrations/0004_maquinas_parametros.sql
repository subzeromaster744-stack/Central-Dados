-- Parâmetros da planilha "Usinagens Máquinas Individuais":
-- concentração de referência (usada no volume para montagem), faixa de pH e fator de refração.
ALTER TABLE maquinas ADD COLUMN conc_ref REAL;
ALTER TABLE maquinas ADD COLUMN ph TEXT NOT NULL DEFAULT '';
ALTER TABLE maquinas ADD COLUMN fator REAL;
