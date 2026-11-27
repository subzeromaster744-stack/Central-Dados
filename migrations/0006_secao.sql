-- Seção do registro: Usinagem_de_Eixos, Usinagem_de_Fundidos_I ou Usinagem_de_Fundidos_II.
ALTER TABLE registros_mi ADD COLUMN secao TEXT;
ALTER TABLE registros_cf ADD COLUMN secao TEXT;
UPDATE registros_mi SET secao = 'Usinagem_de_Eixos' WHERE departamento = 'Eixos' AND secao IS NULL;
UPDATE registros_cf SET secao = 'Usinagem_de_Eixos' WHERE departamento = 'Eixos' AND secao IS NULL;
-- registros de Fundidos: a seção vem do CT cadastrado
UPDATE registros_mi SET secao = (
  SELECT c.departamento FROM cts c WHERE c.ct = registros_mi.ct AND c.tipo = CASE registros_mi.tipo
    WHEN '6002' THEN 'Ecocool_6002' WHEN '2001' THEN 'Ecocool_2001' WHEN 'houghto' THEN 'Houghto_5089'
    WHEN 'mql' THEN 'MQL' WHEN 'diagrind' THEN 'DIAGRIND 535/25 AVEX' WHEN 'microcut' THEN 'Microcut 515 FW' END)
WHERE departamento = 'Fundidos' AND secao IS NULL;
