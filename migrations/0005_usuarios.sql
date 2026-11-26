-- Usuários com senha e sessões de login.
CREATE TABLE IF NOT EXISTS usuarios (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  login        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  nome         TEXT NOT NULL,
  departamento TEXT NOT NULL,          -- Eixos | Fundidos
  turno        TEXT NOT NULL,
  admin        INTEGER NOT NULL DEFAULT 0,
  ativo        INTEGER NOT NULL DEFAULT 1,
  senha        TEXT NOT NULL,          -- pbkdf2$iterações$sal$hash
  trocar_senha INTEGER NOT NULL DEFAULT 1, -- 1 = senha provisória, pedir para trocar no próximo login
  criado_em    TEXT NOT NULL,
  alterado_em  TEXT
);
CREATE TABLE IF NOT EXISTS sessoes (
  token      TEXT PRIMARY KEY,         -- SHA-256 do token entregue ao navegador
  usuario_id INTEGER NOT NULL,
  criado_em  TEXT NOT NULL,
  expira_em  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessoes_usuario ON sessoes (usuario_id);
