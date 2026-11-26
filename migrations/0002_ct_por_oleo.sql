-- Um mesmo CT pode usar mais de um óleo (ex.: emulsão e MQL na mesma máquina).
-- A chave da tabela de CTs passa a ser (ct, tipo). Os dados existentes são mantidos.
CREATE TABLE IF NOT EXISTS cts_novo (
  ct           TEXT NOT NULL,
  tipo         TEXT NOT NULL,
  departamento TEXT NOT NULL,
  preco        REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (ct, tipo)
);
INSERT OR IGNORE INTO cts_novo (ct, tipo, departamento, preco) SELECT ct, tipo, departamento, preco FROM cts;
DROP TABLE cts;
ALTER TABLE cts_novo RENAME TO cts;
