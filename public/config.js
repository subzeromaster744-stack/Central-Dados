// Regras do negócio, usadas pela tela (navegador) e pela API (Worker).
// Mudou um limite, um óleo ou um produto? Mude aqui e as duas pontas acompanham.

export const DEPARTAMENTOS = {
  Eixos: { nome: 'Usinagem de Eixos', secoes: ['Usinagem_de_Eixos'] },
  Fundidos: { nome: 'Usinagem de Fundidos', secoes: ['Usinagem_de_Fundidos_I', 'Usinagem_de_Fundidos_II'] },
};

export const TURNOS = ['1° Turno', '2° Turno', '3° Turno', 'Turno Normal'];

// Óleos das máquinas individuais.
// tipo = valor gravado no CT; conc = faixa permitida da concentração (null = não pede); ph = pede pH?
export const OLEOS = [
  { id: '6002', nome: 'Ecocool SYN 6002', tipo: 'Ecocool_6002', conc: [0, 40], ph: true, deps: ['Eixos', 'Fundidos'] },
  { id: '2001', nome: 'Ecocool S-SYN 2001', tipo: 'Ecocool_2001', conc: [0, 40], ph: true, deps: ['Eixos', 'Fundidos'] },
  { id: 'houghto', nome: 'Houghto 5089', tipo: 'Houghto_5089', conc: [0, 20], ph: false, deps: ['Eixos'] },
  { id: 'mql', nome: 'MQL', tipo: 'MQL', conc: null, ph: false, deps: ['Eixos'] },
  { id: 'diagrind', nome: 'DIAGRIND 535', tipo: 'DIAGRIND 535/25 AVEX', conc: [0, 40], ph: true, deps: ['Eixos'] },
  { id: 'microcut', nome: 'Microcut 515 FW', tipo: 'Microcut 515 FW', conc: [0, 40], ph: true, deps: ['Fundidos'] },
];

// Produtos da Central de Fluidos e as descrições de cada departamento.
export const PRODUTOS_CF = {
  'Filtro (m)': { un: 'm', Eixos: ['Tecfibra', 'Fibertex', 'Argetex'], Fundidos: ['Argetex', 'TechWoven', 'Tecfibra'] },
  'Água (m³)': { un: 'm³', Eixos: ['Água'], Fundidos: ['Água'] },
  'Anticorrosivo (L)': { un: 'L', Eixos: ['Aktiv 28'], Fundidos: ['Additive M'] },
  'Anti-séptico (L)': { un: 'L', Eixos: ['A18'], Fundidos: ['A18'] },
  'Óleo de corte (L)': { un: 'L', Eixos: ['Ecocool SYN 6002'], Fundidos: ['Microcut 510 FW'] },
};

// Limites da Central de Fluidos
export const CF_PH = [0, 14];
export const CF_CONC = [0, 10];
export const PH = [0, 14];

export const oleoPorId = (id) => OLEOS.find((o) => o.id === id);
export const descricoesCF = (dep) => Object.values(PRODUTOS_CF).flatMap((p) => p[dep] || []);
