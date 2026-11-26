// API do Central-Dados (registro da qualidade do óleo).
// Tudo que começa com /api passa por aqui; o resto são os arquivos de /public.
import {
  DEPARTAMENTOS, TURNOS, OLEOS, PRODUTOS_CF, CF_PH, CF_CONC, PH, oleoPorId,
} from '../public/config.js';

// ---------- utilidades ----------
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
class Erro extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const falha = (status, msg) => { throw new Erro(status, msg); };

// Brasília (UTC-3, sem horário de verão)
const hojeBR = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const agora = () => new Date().toISOString();
const num = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  const s = String(v ?? '').trim().replace(',', '.');
  return s === '' || isNaN(+s) ? NaN : +s;
};
const texto = (v, max = 120) => String(v ?? '').trim().slice(0, max);
const dataValida = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T12:00:00Z'));

async function igual(a, b) {
  const ea = new TextEncoder().encode(a), eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  return crypto.subtle.timingSafeEqual(ea, eb);
}

async function corpo(req) {
  try { return await req.json(); } catch { falha(400, 'Corpo da requisição inválido.'); }
}

function exigeDep(dep) {
  if (!DEPARTAMENTOS[dep]) falha(400, 'Departamento inválido.');
  return dep;
}

function faixa(nome, v, [a, b]) {
  const x = num(v);
  if (isNaN(x)) falha(400, `${nome} não pode ficar vazio.`);
  if (x < a || x > b) falha(400, `${nome} deve estar entre ${a} e ${b}.`);
  return x;
}
function naoNegativo(nome, v) {
  const x = num(v);
  if (isNaN(x)) falha(400, `${nome} não pode ficar vazio.`);
  if (x < 0) falha(400, `${nome} deve ser maior ou igual a 0.`);
  return x;
}
function data(v) {
  const d = texto(v, 10);
  if (!dataValida(d)) falha(400, 'Informe uma data válida.');
  if (d > hojeBR()) falha(400, 'A data não pode passar de hoje.');
  return d;
}
function turno(v) {
  const t = texto(v, 20);
  if (!TURNOS.includes(t)) falha(400, 'Turno inválido.');
  return t;
}
function responsavel(v) {
  const r = texto(v, 80);
  if (!r) falha(400, 'Informe o nome do responsável.');
  return r;
}

// filtros comuns de histórico
function filtros(url, cols) {
  const where = ['excluido_em IS NULL'], args = [];
  const dep = exigeDep(url.searchParams.get('dep'));
  where.push('departamento = ?'); args.push(dep);
  const de = url.searchParams.get('de'), ate = url.searchParams.get('ate');
  if (de && dataValida(de)) { where.push('data >= ?'); args.push(de); }
  if (ate && dataValida(ate)) { where.push('data <= ?'); args.push(ate); }
  const q = texto(url.searchParams.get('q'), 60);
  if (q) { where.push('(' + cols.map((c) => `${c} LIKE ?`).join(' OR ') + ')'); cols.forEach(() => args.push(`%${q}%`)); }
  return { where, args, dep };
}

// ---------- máquinas individuais ----------
async function validaMI(env, b, atual) {
  const o = oleoPorId(b.tipo ?? atual?.tipo);
  if (!o) falha(400, 'Tipo de óleo inválido.');
  const dep = exigeDep(b.departamento ?? atual?.departamento);
  if (!o.deps.includes(dep)) falha(400, `${o.nome} não é usado em ${DEPARTAMENTOS[dep].nome}.`);
  const ct = texto(b.ct, 30);
  if (!ct) falha(400, 'O CT não pode ficar vazio.');
  const cad = await env.DB.prepare('SELECT * FROM cts WHERE ct = ? AND tipo = ?').bind(ct, o.tipo).first();
  const mesmoCT = atual && atual.ct === ct;
  if (!mesmoCT) {
    if (!cad) falha(400, `O CT ${ct} não está cadastrado para ${o.nome}.`);
    if (!DEPARTAMENTOS[dep].secoes.includes(cad.departamento)) falha(400, `O CT ${ct} não é de ${DEPARTAMENTOS[dep].nome}.`);
  }
  const v = {
    tipo: o.id, departamento: dep, data: data(b.data), ct,
    concentracao: o.conc ? faixa('A concentração', b.concentracao, o.conc) : null,
    ph: o.ph ? faixa('O pH', b.ph, PH) : null,
    reposicao: naoNegativo('A reposição', b.reposicao),
    turno: turno(b.turno),
  };
  // preço por litro: o do CT no momento; numa edição, mantém o antigo se nada mudou
  v.preco = atual && mesmoCT && atual.preco > 0 ? atual.preco : (cad?.preco ?? atual?.preco ?? 0);
  return v;
}

// ---------- central de fluidos ----------
async function validaCF(env, b, atual) {
  const dep = exigeDep(b.departamento ?? atual?.departamento);
  const produto = texto(b.produto, 40);
  if (!PRODUTOS_CF[produto]) falha(400, 'Produto inválido.');
  const descricao = texto(b.descricao, 60);
  if (!PRODUTOS_CF[produto][dep].includes(descricao)) falha(400, `"${descricao}" não é uma descrição de ${produto} em ${DEPARTAMENTOS[dep].nome}.`);
  const v = {
    departamento: dep, data: data(b.data), turno: turno(b.turno),
    ph: faixa('O pH', b.ph, CF_PH), concentracao: faixa('A concentração', b.concentracao, CF_CONC),
    produto, descricao, consumo: naoNegativo('O consumo', b.consumo),
    observacoes: texto(b.observacoes, 1000),
  };
  const mesma = atual && atual.descricao === descricao && atual.preco > 0;
  if (mesma) v.preco = atual.preco;
  else {
    const p = await env.DB.prepare('SELECT preco FROM precos_cf WHERE departamento = ? AND descricao = ?').bind(dep, descricao).first();
    v.preco = p?.preco ?? 0;
  }
  return v;
}

// ---------- CSV ----------
const csvCel = (v) => {
  if (v == null) return '';
  if (typeof v === 'number') return String(v).replace('.', ',');
  const s = String(v);
  return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const csv = (nome, cab, linhas) =>
  new Response('﻿' + [cab, ...linhas].map((l) => l.map(csvCel).join(';')).join('\r\n'), {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${nome}"` },
  });

// ---------- importação de CTs ----------
// Lê uma linha de CSV com ; , ou tab como separador e aspas opcionais.
function celulas(linha, sep) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (q) { if (c === '"' && linha[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === sep) { out.push(cur.trim()); cur = ''; }
    else cur += c;
  }
  out.push(cur.trim());
  return out;
}
function separador(linha) {
  const conta = (c) => linha.split(c).length;
  return ['\t', ';', ','].reduce((a, b) => (conta(b) > conta(a) ? b : a));
}
const semAcento = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[\s_-]+/g, ' ').trim();
function tipoDe(s) {
  const k = semAcento(s);
  const o = OLEOS.find((o) => [o.id, o.tipo, o.nome].some((x) => semAcento(x) === k));
  return o?.tipo;
}
function secaoDe(s) {
  const k = semAcento(s);
  return Object.values(DEPARTAMENTOS).flatMap((d) => d.secoes).find((x) => semAcento(x) === k);
}

// ---------- rotas ----------
async function api(req, env, url) {
  const p = url.pathname.replace(/\/+$/, '');
  const m = req.method;
  const seg = p.split('/').slice(2).map(decodeURIComponent); // depois de /api

  if (p === '/api/config') return json({ precisaChave: !!env.APP_PASSWORD, adminAtivo: !!env.ADMIN_PASSWORD, hoje: hojeBR() });

  if (env.APP_PASSWORD && !(await igual(req.headers.get('x-app-key') || '', env.APP_PASSWORD))) falha(401, 'Senha de acesso inválida.');

  // ---- admin ----
  if (seg[0] === 'admin') {
    if (!env.ADMIN_PASSWORD) falha(403, 'A área de admin está desligada. Configure o Secret ADMIN_PASSWORD na Cloudflare.');
    if (!(await igual(req.headers.get('x-admin-password') || '', env.ADMIN_PASSWORD))) falha(401, 'Senha de admin incorreta.');
    return admin(req, env, seg.slice(1), m);
  }

  // ---- leitura geral ----
  if (m === 'GET' && p === '/api/resumo') {
    const dep = exigeDep(url.searchParams.get('dep'));
    const mi = await env.DB.prepare(`SELECT tipo, data, ct, concentracao FROM (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY tipo ORDER BY data DESC, id DESC) AS n
        FROM registros_mi WHERE departamento = ? AND excluido_em IS NULL) WHERE n = 1`).bind(dep).all();
    const cf = await env.DB.prepare(`SELECT data, ph, concentracao, descricao FROM registros_cf
        WHERE departamento = ? AND excluido_em IS NULL ORDER BY data DESC, id DESC LIMIT 1`).bind(dep).first();
    const precos = await env.DB.prepare('SELECT descricao FROM precos_cf WHERE departamento = ? AND preco > 0').bind(dep).all();
    const comPreco = new Set(precos.results.map((r) => r.descricao));
    const semPrecoCF = [...new Set(Object.values(PRODUTOS_CF).flatMap((x) => x[dep]))].filter((d) => !comPreco.has(d));
    const cts = await env.DB.prepare(`SELECT COUNT(*) AS n, SUM(preco <= 0) AS sem FROM cts WHERE departamento IN (${DEPARTAMENTOS[dep].secoes.map(() => '?').join(',')})`).bind(...DEPARTAMENTOS[dep].secoes).first();
    return json({ mi: Object.fromEntries(mi.results.map((r) => [r.tipo, r])), cf, semPrecoCF, cts: cts.n, ctsSemPreco: cts.sem || 0 });
  }

  if (m === 'GET' && p === '/api/cts') {
    const dep = exigeDep(url.searchParams.get('dep'));
    const s = DEPARTAMENTOS[dep].secoes;
    const r = await env.DB.prepare(`SELECT * FROM cts WHERE departamento IN (${s.map(() => '?').join(',')}) ORDER BY tipo, ct`).bind(...s).all();
    return json(r.results);
  }

  if (m === 'GET' && p === '/api/precos') {
    const dep = exigeDep(url.searchParams.get('dep'));
    const r = await env.DB.prepare('SELECT descricao, preco FROM precos_cf WHERE departamento = ?').bind(dep).all();
    return json(Object.fromEntries(r.results.map((x) => [x.descricao, x.preco])));
  }

  if (m === 'GET' && p === '/api/maquinas') {
    const dep = url.searchParams.get('dep');
    const r = dep ? await env.DB.prepare('SELECT * FROM maquinas WHERE departamento = ? ORDER BY ct').bind(exigeDep(dep)).all()
                  : await env.DB.prepare('SELECT * FROM maquinas ORDER BY departamento, ct').all();
    return json(r.results);
  }

  // ---- máquinas individuais ----
  if (seg[0] === 'mi') {
    if (m === 'GET' && seg.length === 1) {
      const f = filtros(url, ['ct', 'responsavel']);
      const tipo = url.searchParams.get('tipo');
      if (!oleoPorId(tipo)) falha(400, 'Tipo de óleo inválido.');
      f.where.push('tipo = ?'); f.args.push(tipo);
      const w = f.where.join(' AND ');
      const lim = Math.min(+url.searchParams.get('limite') || 200, 1000);
      const [rows, tot] = await Promise.all([
        env.DB.prepare(`SELECT * FROM registros_mi WHERE ${w} ORDER BY data DESC, id DESC LIMIT ${lim}`).bind(...f.args).all(),
        env.DB.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(reposicao),0) AS litros, COALESCE(SUM(reposicao*preco),0) AS custo FROM registros_mi WHERE ${w}`).bind(...f.args).first(),
      ]);
      return json({ registros: rows.results, totais: tot });
    }
    if (m === 'POST' && seg.length === 1) {
      const b = await corpo(req);
      const v = await validaMI(env, b);
      const r = await env.DB.prepare(`INSERT INTO registros_mi (tipo, departamento, data, ct, concentracao, ph, reposicao, preco, turno, responsavel, criado_em)
        VALUES (?,?,?,?,?,?,?,?,?,?,?) RETURNING *`).bind(v.tipo, v.departamento, v.data, v.ct, v.concentracao, v.ph, v.reposicao, v.preco, v.turno, responsavel(b.responsavel), agora()).first();
      return json(r, 201);
    }
    const id = +seg[1];
    if (!Number.isInteger(id)) falha(404, 'Rota não encontrada.');
    const atual = await env.DB.prepare('SELECT * FROM registros_mi WHERE id = ?').bind(id).first();
    if (!atual) falha(404, 'Registro não encontrado.');
    if (m === 'PUT' && seg.length === 2) {
      if (atual.excluido_em) falha(409, 'Esse registro foi excluído.');
      const v = await validaMI(env, { ...(await corpo(req)), tipo: atual.tipo, departamento: atual.departamento }, atual);
      const r = await env.DB.prepare(`UPDATE registros_mi SET data=?, ct=?, concentracao=?, ph=?, reposicao=?, preco=?, turno=?, alterado_em=? WHERE id=? RETURNING *`)
        .bind(v.data, v.ct, v.concentracao, v.ph, v.reposicao, v.preco, v.turno, agora(), id).first();
      return json(r);
    }
    if (m === 'DELETE' && seg.length === 2) {
      await env.DB.prepare('UPDATE registros_mi SET excluido_em = ? WHERE id = ?').bind(agora(), id).run();
      return json({ ok: true });
    }
    if (m === 'POST' && seg[2] === 'restaurar') {
      await env.DB.prepare('UPDATE registros_mi SET excluido_em = NULL WHERE id = ?').bind(id).run();
      return json({ ok: true });
    }
  }

  // ---- central de fluidos ----
  if (seg[0] === 'cf') {
    if (m === 'GET' && seg.length === 1) {
      const f = filtros(url, ['descricao', 'produto', 'observacoes', 'responsavel']);
      const w = f.where.join(' AND ');
      const lim = Math.min(+url.searchParams.get('limite') || 200, 1000);
      const [rows, tot] = await Promise.all([
        env.DB.prepare(`SELECT * FROM registros_cf WHERE ${w} ORDER BY data DESC, id DESC LIMIT ${lim}`).bind(...f.args).all(),
        env.DB.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(consumo*preco),0) AS custo FROM registros_cf WHERE ${w}`).bind(...f.args).first(),
      ]);
      return json({ registros: rows.results, totais: tot });
    }
    if (m === 'POST' && seg.length === 1) {
      const b = await corpo(req);
      const v = await validaCF(env, b);
      const r = await env.DB.prepare(`INSERT INTO registros_cf (departamento, data, turno, ph, concentracao, produto, descricao, consumo, preco, observacoes, responsavel, criado_em)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?) RETURNING *`).bind(v.departamento, v.data, v.turno, v.ph, v.concentracao, v.produto, v.descricao, v.consumo, v.preco, v.observacoes, responsavel(b.responsavel), agora()).first();
      return json(r, 201);
    }
    const id = +seg[1];
    if (!Number.isInteger(id)) falha(404, 'Rota não encontrada.');
    const atual = await env.DB.prepare('SELECT * FROM registros_cf WHERE id = ?').bind(id).first();
    if (!atual) falha(404, 'Registro não encontrado.');
    if (m === 'PUT' && seg.length === 2) {
      if (atual.excluido_em) falha(409, 'Esse registro foi excluído.');
      const v = await validaCF(env, { ...(await corpo(req)), departamento: atual.departamento }, atual);
      const r = await env.DB.prepare(`UPDATE registros_cf SET data=?, turno=?, ph=?, concentracao=?, produto=?, descricao=?, consumo=?, preco=?, observacoes=?, alterado_em=? WHERE id=? RETURNING *`)
        .bind(v.data, v.turno, v.ph, v.concentracao, v.produto, v.descricao, v.consumo, v.preco, v.observacoes, agora(), id).first();
      return json(r);
    }
    if (m === 'DELETE' && seg.length === 2) {
      await env.DB.prepare('UPDATE registros_cf SET excluido_em = ? WHERE id = ?').bind(agora(), id).run();
      return json({ ok: true });
    }
    if (m === 'POST' && seg[2] === 'restaurar') {
      await env.DB.prepare('UPDATE registros_cf SET excluido_em = NULL WHERE id = ?').bind(id).run();
      return json({ ok: true });
    }
  }

  // ---- exportação para Excel ----
  if (m === 'GET' && p === '/api/exportar/mi.csv') {
    const f = filtros(url, ['ct', 'responsavel']);
    const tipo = url.searchParams.get('tipo');
    if (tipo) { if (!oleoPorId(tipo)) falha(400, 'Tipo de óleo inválido.'); f.where.push('tipo = ?'); f.args.push(tipo); }
    const r = await env.DB.prepare(`SELECT * FROM registros_mi WHERE ${f.where.join(' AND ')} ORDER BY data, id`).bind(...f.args).all();
    return csv(`maquinas-individuais-${f.dep}${tipo ? '-' + tipo : ''}.csv`,
      ['ID', 'Data', 'Óleo', 'CT', 'Concentração (%)', 'pH', 'Reposição (L)', 'Preço (R$/L)', 'Custo (R$)', 'Turno', 'Responsável', 'Departamento', 'Criado em'],
      r.results.map((x) => [x.id, x.data, oleoPorId(x.tipo)?.nome || x.tipo, x.ct, x.concentracao, x.ph, x.reposicao, x.preco, +(x.reposicao * x.preco).toFixed(2), x.turno, x.responsavel, DEPARTAMENTOS[x.departamento]?.nome, x.criado_em]));
  }
  if (m === 'GET' && p === '/api/exportar/cf.csv') {
    const f = filtros(url, ['descricao', 'produto', 'observacoes', 'responsavel']);
    const r = await env.DB.prepare(`SELECT * FROM registros_cf WHERE ${f.where.join(' AND ')} ORDER BY data, id`).bind(...f.args).all();
    return csv(`central-de-fluidos-${f.dep}.csv`,
      ['ID', 'Data', 'Turno', 'pH', 'Concentração (%)', 'Produto', 'Descrição', 'Consumo', 'Preço (R$)', 'Custo (R$)', 'Observações', 'Responsável', 'Departamento', 'Criado em'],
      r.results.map((x) => [x.id, x.data, x.turno, x.ph, x.concentracao, x.produto, x.descricao, x.consumo, x.preco, +(x.consumo * x.preco).toFixed(2), x.observacoes, x.responsavel, DEPARTAMENTOS[x.departamento]?.nome, x.criado_em]));
  }

  falha(404, 'Rota não encontrada.');
}

async function admin(req, env, seg, m) {
  if (seg[0] === 'entrar' && m === 'POST') return json({ ok: true });

  if (seg[0] === 'cts') {
    if (m === 'POST' && seg[1] === 'importar') {
      // Aceita "CT;óleo;seção;preço" ou um CSV com cabeçalho (ex.: exportado do SharePoint).
      // Preço vazio mantém o preço que o CT já tinha.
      const { linhas } = await corpo(req);
      const res = { gravados: 0, repetidos: 0, erros: [] };
      const ls = String(linhas || '').replace(/^\uFEFF/, '').split(/\r?\n/);
      const primeira = ls.find((l) => l.trim()) || '';
      const sep = separador(primeira);
      let col = { ct: 0, tipo: 1, dep: 2, preco: 3 }, inicio = 0;
      const cab = celulas(primeira, sep).map((c) => semAcento(c));
      if (cab.includes('ct')) {
        const acha = (re) => cab.findIndex((c) => re.test(c));
        col = { ct: cab.indexOf('ct'), tipo: acha(/tipo|oleo/), dep: acha(/departamento|secao/), preco: acha(/preco/) };
        inicio = ls.indexOf(primeira) + 1;
      }
      const vistos = new Set(), stmts = [];
      ls.forEach((l, i) => {
        if (i < inicio || !l.trim()) return;
        const c = celulas(l, sep), pega = (k) => (col[k] >= 0 ? c[col[k]] ?? '' : '');
        const ct = texto(pega('ct'), 30), t = pega('tipo'), d = pega('dep'), pr = pega('preco');
        const tipo = tipoDe(t), dep = secaoDe(d), preco = pr === '' ? null : num(pr);
        if (!ct) return res.erros.push({ linha: i + 1, msg: 'CT vazio' });
        if (!tipo) return res.erros.push({ linha: i + 1, msg: `Tipo de óleo "${t}" não reconhecido` });
        if (!dep) return res.erros.push({ linha: i + 1, msg: `Departamento "${d}" não reconhecido` });
        if (preco !== null && (isNaN(preco) || preco < 0)) return res.erros.push({ linha: i + 1, msg: `Preço "${pr}" inválido` });
        const k = ct + '|' + tipo;
        if (vistos.has(k)) { res.repetidos++; return; }
        vistos.add(k);
        stmts.push(env.DB.prepare(`INSERT INTO cts (ct, tipo, departamento, preco) VALUES (?,?,?,COALESCE(?,0))
          ON CONFLICT(ct, tipo) DO UPDATE SET departamento = excluded.departamento, preco = COALESCE(?, cts.preco)`).bind(ct, tipo, dep, preco, preco));
      });
      if (stmts.length) await env.DB.batch(stmts);
      res.gravados = stmts.length;
      return json(res);
    }
    if (m === 'POST' && seg.length === 1) {
      const b = await corpo(req);
      const ct = texto(b.ct, 30);
      if (!ct) falha(400, 'Informe o CT.');
      const tipo = tipoDe(b.tipo || ''); if (!tipo) falha(400, 'Tipo de óleo inválido.');
      const dep = secaoDe(b.departamento || ''); if (!dep) falha(400, 'Departamento inválido.');
      const preco = naoNegativo('O preço', b.preco);
      if (await env.DB.prepare('SELECT 1 FROM cts WHERE ct = ? AND tipo = ?').bind(ct, tipo).first()) falha(409, 'Esse CT já está cadastrado para esse óleo.');
      await env.DB.prepare('INSERT INTO cts (ct, tipo, departamento, preco) VALUES (?,?,?,?)').bind(ct, tipo, dep, preco).run();
      return json({ ok: true }, 201);
    }
    if (m === 'PUT' && seg.length === 1) {
      // vários preços de uma vez: { precos: [{ ct, tipo, preco }] }
      const { precos } = await corpo(req);
      const stmts = (Array.isArray(precos) ? precos : []).map((x) => env.DB.prepare('UPDATE cts SET preco = ? WHERE ct = ? AND tipo = ?').bind(naoNegativo(`O preço do CT ${x.ct}`, x.preco), String(x.ct), String(x.tipo)));
      if (stmts.length) await env.DB.batch(stmts);
      return json({ atualizados: stmts.length });
    }
    if (m === 'DELETE' && seg.length === 3) {
      await env.DB.prepare('DELETE FROM cts WHERE ct = ? AND tipo = ?').bind(seg[1], seg[2]).run();
      return json({ ok: true });
    }
  }

  if (seg[0] === 'precos' && m === 'PUT') {
    const { departamento, precos } = await corpo(req);
    const dep = exigeDep(departamento);
    const validas = new Set(Object.values(PRODUTOS_CF).flatMap((x) => x[dep]));
    const stmts = Object.entries(precos || {}).map(([d, pr]) => {
      if (!validas.has(d)) falha(400, `Produto "${d}" desconhecido.`);
      return env.DB.prepare(`INSERT INTO precos_cf (departamento, descricao, preco) VALUES (?,?,?)
        ON CONFLICT(departamento, descricao) DO UPDATE SET preco = excluded.preco`).bind(dep, d, naoNegativo(`O preço de ${d}`, pr));
    });
    if (stmts.length) await env.DB.batch(stmts);
    return json({ atualizados: stmts.length });
  }

  if (seg[0] === 'maquinas') {
    const le = async () => {
      const b = await corpo(req);
      const vol = b.volume === '' || b.volume == null ? null : naoNegativo('O volume', b.volume);
      return [exigeDep(b.departamento), texto(b.secao, 60), texto(b.ct, 30), texto(b.maquina, 80), texto(b.oleo, 60), vol, texto(b.concentracao, 30)];
    };
    if (m === 'POST' && seg.length === 1) {
      const v = await le();
      if (!v[2] && !v[3]) falha(400, 'Informe ao menos o CT ou o nome da máquina.');
      const r = await env.DB.prepare('INSERT INTO maquinas (departamento, secao, ct, maquina, oleo, volume, concentracao) VALUES (?,?,?,?,?,?,?) RETURNING *').bind(...v).first();
      return json(r, 201);
    }
    const id = +seg[1];
    if (m === 'PUT' && Number.isInteger(id)) {
      const r = await env.DB.prepare('UPDATE maquinas SET departamento=?, secao=?, ct=?, maquina=?, oleo=?, volume=?, concentracao=? WHERE id=? RETURNING *').bind(...(await le()), id).first();
      if (!r) falha(404, 'Máquina não encontrada.');
      return json(r);
    }
    if (m === 'DELETE' && Number.isInteger(id)) {
      await env.DB.prepare('DELETE FROM maquinas WHERE id = ?').bind(id).run();
      return json({ ok: true });
    }
  }
  falha(404, 'Rota não encontrada.');
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    try {
      return await api(req, env, url);
    } catch (e) {
      if (e instanceof Erro) return json({ erro: e.message }, e.status);
      console.error(e);
      return json({ erro: 'Erro interno. Tente de novo em instantes.' }, 500);
    }
  },
};
