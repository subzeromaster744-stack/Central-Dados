-- Esquema inicial do Central-Dados (registro da qualidade do óleo).
-- Pode ser aplicado mais de uma vez sem erro (IF NOT EXISTS).

-- Centros de trabalho e o preço do óleo usado em cada um (antes: "CTs e Preços II")
CREATE TABLE IF NOT EXISTS cts (
  ct           TEXT PRIMARY KEY,
  tipo         TEXT NOT NULL,          -- ex.: Ecocool_2001, MQL, Microcut 515 FW
  departamento TEXT NOT NULL,          -- Usinagem_de_Eixos, Usinagem_de_Fundidos_I, Usinagem_de_Fundidos_II
  preco        REAL NOT NULL DEFAULT 0 -- R$ por litro
);

-- Preços dos produtos da Central de Fluidos, por departamento (antes: "CTs e Preços")
CREATE TABLE IF NOT EXISTS precos_cf (
  departamento TEXT NOT NULL,          -- Eixos | Fundidos
  descricao    TEXT NOT NULL,          -- ex.: Tecfibra, Água, Aktiv 28
  preco        REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (departamento, descricao)
);

-- Tabela da tela "Informações" (antes: "Máquinas Fluidos")
CREATE TABLE IF NOT EXISTS maquinas (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  departamento TEXT NOT NULL,          -- Eixos | Fundidos
  secao        TEXT NOT NULL DEFAULT '',
  ct           TEXT NOT NULL DEFAULT '',
  maquina      TEXT NOT NULL DEFAULT '',
  oleo         TEXT NOT NULL DEFAULT '',
  volume       REAL,
  concentracao TEXT NOT NULL DEFAULT ''
);

-- Registros das máquinas individuais (antes: "Relatório óleo Máquinas Individuais")
CREATE TABLE IF NOT EXISTS registros_mi (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo         TEXT NOT NULL,          -- id do óleo: 6002, 2001, houghto, mql, diagrind, microcut
  departamento TEXT NOT NULL,          -- Eixos | Fundidos
  data         TEXT NOT NULL,          -- AAAA-MM-DD
  ct           TEXT NOT NULL,
  concentracao REAL,
  ph           REAL,
  reposicao    REAL NOT NULL,          -- litros
  preco        REAL NOT NULL DEFAULT 0,-- R$/L no momento do registro
  turno        TEXT NOT NULL,
  responsavel  TEXT NOT NULL,
  criado_em    TEXT NOT NULL,
  alterado_em  TEXT,
  excluido_em  TEXT
);
CREATE INDEX IF NOT EXISTS idx_mi_busca ON registros_mi (departamento, tipo, data);

-- Registros da Central de Fluidos. Uma tabela só no lugar de
-- "Relatório óleo Central de Fluidos", "Consumo CF" e "Parâmetros CF".
CREATE TABLE IF NOT EXISTS registros_cf (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  departamento TEXT NOT NULL,
  data         TEXT NOT NULL,
  turno        TEXT NOT NULL,
  ph           REAL NOT NULL,
  concentracao REAL NOT NULL,
  produto      TEXT NOT NULL,          -- ex.: Filtro (m)
  descricao    TEXT NOT NULL,          -- ex.: Tecfibra
  consumo      REAL NOT NULL,
  preco        REAL NOT NULL DEFAULT 0,
  observacoes  TEXT NOT NULL DEFAULT '',
  responsavel  TEXT NOT NULL,
  criado_em    TEXT NOT NULL,
  alterado_em  TEXT,
  excluido_em  TEXT
);
CREATE INDEX IF NOT EXISTS idx_cf_busca ON registros_cf (departamento, data);
