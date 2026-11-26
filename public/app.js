import { DEPARTAMENTOS as DEP, TURNOS, OLEOS, PRODUTOS_CF as PROD, CF_PH, CF_CONC, PH, oleoPorId } from './config.js';

// ---------- utilidades ----------
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (s) => { s = String(s ?? '').trim().replace(',', '.'); return s === '' || isNaN(+s) ? NaN : +s; };
const br = (s) => (s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : '');
const fmt = (n, d = 2) => (n != null && isFinite(n) ? Number(n).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
const brl = (n) => 'R$ ' + fmt(n);
const inNum = (n) => (n == null ? '' : String(n).replace('.', ','));
const nomeSecao = (s) => String(s).replace(/_/g, ' ');
const store = {
  get(k, s = localStorage) { try { return JSON.parse(s.getItem(k)); } catch { return null; } },
  set(k, v, s = localStorage) { try { v == null ? s.removeItem(k) : s.setItem(k, JSON.stringify(v)); } catch {} },
};
const diasAtras = (n) => { const d = new Date(CFG.hoje + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };

let CFG = { hoje: new Date().toISOString().slice(0, 10) };
let ME = store.get('cd-perfil'); // { nome, dep, turno }
let view = { v: 'menu' }, pilha = [], cfD = null;
const cache = {};
const app = $('app'), ttl = $('ttl'), back = $('back'), layer = $('layer'), meBtn = $('me');

// ---------- API ----------
async function api(path, { method = 'GET', body } = {}) {
  const h = { 'content-type': 'application/json' };
  const k = store.get('cd-chave'); if (k) h['x-app-key'] = k;
  const a = store.get('cd-admin', sessionStorage); if (a && path.startsWith('/api/admin')) h['x-admin-password'] = a;
  let res;
  try { res = await fetch(path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }); }
  catch { throw new Error('Sem conexão. Verifique a internet e tente de novo.'); }
  const d = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.startsWith('/api/admin')) { store.set('cd-chave', null); telaChave(d.erro); throw new Error(d.erro || 'Acesso negado.'); }
  if (res.status === 401 && path.startsWith('/api/admin')) store.set('cd-admin', null, sessionStorage);
  if (!res.ok) throw new Error(d.erro || 'Falha ao falar com o servidor.');
  return d;
}
async function baixar(path, nome) {
  const h = {}; const k = store.get('cd-chave'); if (k) h['x-app-key'] = k;
  try {
    const res = await fetch(path, { headers: h });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).erro || 'Falha ao exportar.');
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a'); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch (e) { toast(e.message, null, true); }
}
const cts = async (dep, novo) => (!novo && cache['cts' + dep]) || (cache['cts' + dep] = await api('/api/cts?dep=' + dep));
const precos = async (dep, novo) => (!novo && cache['pr' + dep]) || (cache['pr' + dep] = await api('/api/precos?dep=' + dep));
const limpaCache = () => { for (const k in cache) delete cache[k]; };

// ---------- navegação ----------
function go(v, empilha = true) { if (empilha) pilha.push(view); view = v; app.dataset.h = ''; render(); window.scrollTo(0, 0); }
back.onclick = () => { layer.innerHTML = ''; view = pilha.pop() || { v: 'menu' }; app.dataset.h = ''; render(); };
const home = () => { pilha = []; go({ v: 'menu' }, false); };
meBtn.onclick = () => go({ v: 'perfil' });
function titulo(t, sub) { ttl.innerHTML = esc(t) + (sub ? '<small>' + esc(sub) + '</small>' : ''); }
async function render() {
  back.hidden = view.v === 'menu' || !ME;
  meBtn.hidden = !ME || view.v === 'perfil';
  if (ME) meBtn.textContent = ME.nome.split(' ')[0] + ' · ' + ME.turno.replace(' Turno', '').replace('Turno ', '');
  const v = { menu: vMenu, perfil: vPerfil, cf: vCF, oil: vOil, ok: vOk, hist: vHist, admin: vAdmin, info: vInfo }[view.v];
  try { await v(); } catch (e) { app.innerHTML = `<div class="empty">${esc(e.message)}</div><div class="row mt"><button class="btn ghost" id="tenta">Tentar de novo</button></div>`; $('tenta').onclick = render; }
}

// ---------- campos e validação ----------
const field = (id, label, input, req = 1, hint = '') => `<div class="f" id="w-${id}"><label for="${id}">${label}${req ? ' <i>*</i>' : ''}${hint ? ` <span class="hint">${hint}</span>` : ''}</label>${input}<div class="err" id="e-${id}"></div></div>`;
const tNum = (id, v) => `<input id="${id}" inputmode="decimal" autocomplete="off" value="${esc(inNum(v))}">`;
const tData = (id, v) => `<input id="${id}" type="date" max="${CFG.hoje}" value="${esc(v || CFG.hoje)}">`;
const sel = (id, opts, v, ph = 'Selecione') => `<select id="${id}"><option value="">${esc(ph)}</option>${opts.map((o) => { const [val, lab] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(val)}"${val === v ? ' selected' : ''}>${esc(lab)}</option>`; }).join('')}</select>`;
const val = (id) => $(id)?.value ?? '';
const R = {
  data: (v) => (!v ? 'Informe a data.' : v > CFG.hoje ? 'A data não pode passar de hoje.' : ''),
  req: (n) => (v) => (!String(v).trim() ? n + ' não pode ficar vazio.' : ''),
  faixa: (n, [a, b]) => (v) => { const x = num(v); return v === '' ? n + ' não pode ficar vazio.' : isNaN(x) || x < a || x > b ? `${n} deve estar entre ${a} e ${b}.` : ''; },
  pos: (n) => (v) => { const x = num(v); return v === '' ? n + ' não pode ficar vazio.' : isNaN(x) || x < 0 ? n + ' deve ser um número maior ou igual a 0.' : ''; },
};
function check(regras, btn) {
  let ok = true;
  for (const [id, fn] of regras) {
    const el = $(id); if (!el) continue;
    const m = fn(el.value); if (m) ok = false;
    const mostra = m && (el.dataset.t || el.value !== '');
    $('e-' + id).textContent = mostra ? m : '';
    $('w-' + id).classList.toggle('bad', !!mostra);
  }
  if (btn && $(btn)) $(btn).disabled = !ok;
  return ok;
}
function live(regras, btn, extra) {
  const run = () => { extra && extra(); check(regras, btn); };
  for (const [id] of regras) { const el = $(id); if (!el) continue; for (const ev of ['input', 'change', 'blur']) el.addEventListener(ev, () => { el.dataset.t = 1; run(); }); }
  run(); return run;
}
async function ocupado(btn, txt, fn) {
  const b = $(btn), o = b.textContent; b.disabled = true; b.textContent = txt;
  try { await fn(); } catch (e) { toast(e.message, null, true); b.disabled = false; b.textContent = o; }
}

// ---------- telas de entrada ----------
async function telaChave(msg) {
  titulo('Qualidade do óleo', 'Acesso');
  back.hidden = true; meBtn.hidden = true;
  app.innerHTML = `<h2>Senha de acesso</h2><p class="hint" style="font-size:15px">Peça a senha ao responsável pelo app.</p>${field('k', 'Senha', '<input id="k" type="password" autocomplete="current-password">')}<div class="err" style="color:var(--red);font-weight:600;min-height:20px">${esc(msg || '')}</div><button class="btn" id="kb" style="width:100%">Entrar</button>`;
  const ir = () => { store.set('cd-chave', val('k')); limpaCache(); render(); };
  $('kb').onclick = ir; $('k').onkeydown = (e) => e.key === 'Enter' && ir(); $('k').focus();
}
function vPerfil() {
  titulo(ME ? 'Seu perfil' : 'Bem-vindo', 'Usado em todos os seus registros');
  const p = ME || { nome: '', dep: '', turno: '' };
  app.innerHTML = `${ME ? '' : '<p style="margin-top:0">Antes de começar, diga quem você é. Fica salvo neste aparelho.</p>'}
    ${field('p-nome', 'Seu nome', `<input id="p-nome" autocomplete="name" maxlength="80" value="${esc(p.nome)}">`)}
    ${field('p-dep', 'Departamento', sel('p-dep', Object.entries(DEP).map(([k, d]) => [k, d.nome]), p.dep))}
    ${field('p-tur', 'Turno', sel('p-tur', TURNOS, p.turno))}
    <button class="btn" id="p-ok" style="width:100%">${ME ? 'Salvar' : 'Começar'}</button>`;
  live([['p-nome', R.req('O nome')], ['p-dep', R.req('O departamento')], ['p-tur', R.req('O turno')]], 'p-ok');
  $('p-ok').onclick = () => { ME = { nome: val('p-nome').trim(), dep: val('p-dep'), turno: val('p-tur') }; store.set('cd-perfil', ME); home(); };
}

// ---------- menu ----------
async function vMenu() {
  if (!ME) return go({ v: 'perfil' }, false);
  titulo('Menu', DEP[ME.dep].nome);
  const r = await api('/api/resumo?dep=' + ME.dep);
  const tiles = OLEOS.filter((o) => o.deps.includes(ME.dep)).map((o) => {
    const l = r.mi[o.id];
    return `<button class="tile" data-oil="${o.id}"><b>${esc(o.nome)}</b><span>${l ? `Último ${br(l.data)} · CT ${esc(l.ct)}${l.concentracao != null ? ` · ${fmt(l.concentracao, 1)}%` : ''}` : 'Sem registros'}</span></button>`;
  }).join('');
  const c = r.cf;
  const avisos = [];
  if (!r.cts) avisos.push('Nenhum CT cadastrado para este departamento. O admin precisa cadastrar antes dos registros de óleo.');
  else if (r.ctsSemPreco) avisos.push(`${r.ctsSemPreco} CT(s) sem preço do óleo.`);
  if (r.semPrecoCF.length) avisos.push(`Sem preço na Central: ${r.semPrecoCF.map(esc).join(', ')}.`);
  app.innerHTML = `${avisos.length ? `<div class="warn">${avisos.join(' ')} <a href="#" id="toAdm" style="color:inherit;font-weight:700">Ajustar no Admin</a></div>` : ''}
  <div class="tiles">
    <button class="tile wide" data-go="cf"><b>Central de Fluidos</b><span>${c ? `Último ${br(c.data)} · pH ${fmt(c.ph, 1)} · ${fmt(c.concentracao, 1)}% · ${esc(c.descricao)}` : 'Sem registros'}</span></button>
    ${tiles}
    <button class="tile alt" data-go="info"><b>Informações</b><span>Máquinas, volumes e concentração alvo</span></button>
    <button class="tile alt" data-go="admin"><b>Admin</b><span>CTs, preços e máquinas</span></button>
  </div>`;
  app.querySelectorAll('[data-oil]').forEach((b) => (b.onclick = () => go({ v: 'oil', id: b.dataset.oil })));
  app.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => { if (b.dataset.go === 'cf') cfD = null; go({ v: b.dataset.go }); }));
  if ($('toAdm')) $('toAdm').onclick = (e) => { e.preventDefault(); go({ v: 'admin' }); };
}

// ---------- Central de Fluidos (3 etapas) ----------
async function vCF() {
  titulo('Central de Fluidos', DEP[ME.dep].nome);
  const pr = await precos(ME.dep);
  if (!cfD) cfD = { step: 1, data: CFG.hoje, turno: ME.turno, ph: '', concentracao: '', produto: '', descricao: '', consumo: '', observacoes: '' };
  const s = cfD.step;
  const bar = `<div class="steps">${[1, 2, 3].map((i) => `<div class="${i <= s ? 'on' : ''}"></div>`).join('')}</div>`;
  let body, regras;
  if (s === 1) {
    body = `<h2>1. Data e turno</h2>${field('c-data', 'Data', tData('c-data', cfD.data))}${field('c-tur', 'Turno', sel('c-tur', TURNOS, cfD.turno))}`;
    regras = [['c-data', R.data], ['c-tur', R.req('O turno')]];
  } else if (s === 2) {
    body = `<h2>2. Parâmetros do fluido</h2><div class="grid2">${field('c-ph', 'pH', tNum('c-ph', cfD.ph), 1, CF_PH.join(' a '))}${field('c-conc', 'Concentração (%)', tNum('c-conc', cfD.concentracao), 1, CF_CONC.join(' a '))}</div>`;
    regras = [['c-ph', R.faixa('O pH', CF_PH)], ['c-conc', R.faixa('A concentração', CF_CONC)]];
  } else {
    const un = cfD.produto ? PROD[cfD.produto].un : '';
    body = `<h2>3. Consumo</h2>${field('c-prod', 'Produto', sel('c-prod', Object.keys(PROD), cfD.produto))}
      ${field('c-desc', 'Descrição do produto', sel('c-desc', cfD.produto ? PROD[cfD.produto][ME.dep] : [], cfD.descricao, cfD.produto ? 'Selecione' : 'Escolha o produto primeiro'))}
      ${field('c-cons', `Consumo${un ? ' (' + un + ')' : ''}`, tNum('c-cons', cfD.consumo))}
      <div class="cost"><span>Custo estimado<small id="c-unit"></small></span><b id="c-cost">—</b></div>
      ${field('c-obs', 'Observações', `<textarea id="c-obs" maxlength="1000">${esc(cfD.observacoes)}</textarea>`, 0)}`;
    regras = [['c-prod', R.req('O produto')], ['c-desc', R.req('A descrição')], ['c-cons', R.pos('O consumo')]];
  }
  app.innerHTML = bar + `<div class="chips"><span class="chip">${esc(ME.nome)}</span><span class="chip">${esc(DEP[ME.dep].nome)}</span></div>` + body +
    `<div class="row mt">${s > 1 ? '<button class="btn ghost" id="prev">Voltar</button>' : ''}<button class="btn" id="nx">${s < 3 ? 'Prosseguir' : 'Enviar'}</button></div>
     <div class="row mt"><button class="btn ghost" id="toH">Histórico</button></div>`;
  const pega = () => { for (const [k, id] of [['data', 'c-data'], ['turno', 'c-tur'], ['ph', 'c-ph'], ['concentracao', 'c-conc'], ['produto', 'c-prod'], ['descricao', 'c-desc'], ['consumo', 'c-cons'], ['observacoes', 'c-obs']]) if ($(id)) cfD[k] = $(id).value; };
  const custo = () => {
    if (!$('c-cost')) return;
    const p = pr[val('c-desc')], c = num(val('c-cons'));
    $('c-cost').textContent = p > 0 && isFinite(c) ? brl(p * c) : '—';
    $('c-unit').textContent = !val('c-desc') ? '' : p > 0 ? brl(p) + ' por unidade' : 'Produto sem preço cadastrado';
  };
  live(regras, 'nx', custo);
  if (s === 3) { $('c-prod').addEventListener('change', () => { pega(); cfD.descricao = ''; vCF(); }); $('c-obs').oninput = pega; }
  $('toH').onclick = () => { pega(); go({ v: 'hist', id: 'cf' }); };
  if (s > 1) $('prev').onclick = () => { pega(); cfD.step--; vCF(); };
  $('nx').onclick = () => {
    pega();
    if (s < 3) { cfD.step++; vCF(); return; }
    ocupado('nx', 'Enviando…', async () => {
      await api('/api/cf', { method: 'POST', body: { ...cfD, departamento: ME.dep, responsavel: ME.nome } });
      cfD = null;
      go({ v: 'ok', msg: 'Registro da Central de Fluidos enviado', novo: { v: 'cf' }, hist: { v: 'hist', id: 'cf' } });
    });
  };
}

// ---------- formulário único dos óleos ----------
function oilCampos(o, lista, r) {
  const opts = lista.map((c) => c.ct);
  if (r && !opts.includes(r.ct)) opts.unshift(r.ct);
  return field('o-data', 'Data', tData('o-data', r?.data)) +
    field('o-ct', 'CT', sel('o-ct', opts, r?.ct)) +
    `<div class="grid2">${o.conc ? field('o-conc', 'Concentração (%)', tNum('o-conc', r?.concentracao), 1, o.conc.join(' a ')) : ''}${o.ph ? field('o-ph', 'pH', tNum('o-ph', r?.ph), 1, PH.join(' a ')) : ''}${field('o-rep', 'Reposição de óleo (L)', tNum('o-rep', r?.reposicao))}</div>` +
    (r ? field('o-tur', 'Turno', sel('o-tur', TURNOS, r.turno)) : '') +
    `<div class="cost"><span>Custo da reposição<small id="o-unit">Escolha o CT</small></span><b id="o-cost">—</b></div>`;
}
const oilRegras = (o) => [['o-data', R.data], ['o-ct', R.req('O CT')], ...(o.conc ? [['o-conc', R.faixa('A concentração', o.conc)]] : []), ...(o.ph ? [['o-ph', R.faixa('O pH', PH)]] : []), ['o-rep', R.pos('A reposição')], ...($('o-tur') ? [['o-tur', R.req('O turno')]] : [])];
const oilCusto = (lista, r) => () => {
  const c = lista.find((x) => x.ct === val('o-ct')), q = num(val('o-rep'));
  const p = r && r.ct === val('o-ct') && r.preco > 0 ? r.preco : c?.preco;
  $('o-cost').textContent = p > 0 && isFinite(q) ? brl(p * q) : '—';
  $('o-unit').textContent = !val('o-ct') ? 'Escolha o CT' : p > 0 ? brl(p) + ' por litro' : 'CT sem preço cadastrado';
};
const oilLe = (o) => ({ data: val('o-data'), ct: val('o-ct'), concentracao: o.conc ? val('o-conc') : null, ph: o.ph ? val('o-ph') : null, reposicao: val('o-rep') });

async function vOil() {
  const o = oleoPorId(view.id);
  titulo(o.nome, DEP[ME.dep].nome);
  const lista = (await cts(ME.dep)).filter((c) => c.tipo === o.tipo);
  if (!lista.length) {
    app.innerHTML = `<div class="empty">Nenhum CT de ${esc(o.nome)} cadastrado em ${esc(DEP[ME.dep].nome)}.<br>O admin precisa cadastrar em Admin › Centros de trabalho.</div><div class="row mt"><button class="btn ghost" id="toH">Histórico</button><button class="btn ghost" id="toA">Admin</button></div>`;
    $('toH').onclick = () => go({ v: 'hist', id: o.id }); $('toA').onclick = () => go({ v: 'admin' });
    return;
  }
  app.innerHTML = `<div class="chips"><span class="chip">${esc(ME.nome)}</span><span class="chip">${esc(ME.turno)}</span><span class="chip">${esc(DEP[ME.dep].nome)}</span></div>` + oilCampos(o, lista) +
    `<div class="row"><button class="btn" id="send">Enviar</button></div><div class="row mt"><button class="btn ghost" id="toH">Histórico</button></div>`;
  live(oilRegras(o), 'send', oilCusto(lista));
  $('toH').onclick = () => go({ v: 'hist', id: o.id });
  $('send').onclick = () => ocupado('send', 'Enviando…', async () => {
    await api('/api/mi', { method: 'POST', body: { ...oilLe(o), tipo: o.id, departamento: ME.dep, turno: ME.turno, responsavel: ME.nome } });
    go({ v: 'ok', msg: `Registro de ${o.nome} enviado`, novo: { v: 'oil', id: o.id }, hist: { v: 'hist', id: o.id } });
  });
}

function vOk() {
  titulo('Registro enviado');
  app.innerHTML = `<div class="ok"><div class="mark">✓</div><h2>${esc(view.msg)}</h2><p class="hint" style="font-size:15px">Salvo às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.</p></div>
  <div class="row"><button class="btn" id="a">Novo registro</button><button class="btn ghost" id="h">Histórico</button><button class="btn ghost" id="m">Menu</button></div>`;
  $('a').onclick = () => { pilha.pop(); go(view.novo, false); };
  $('h').onclick = () => go(view.hist);
  $('m').onclick = home;
}

// ---------- histórico ----------
const PERIODOS = [['30', 'Últimos 30 dias'], ['90', 'Últimos 90 dias'], ['365', 'Último ano'], ['', 'Tudo']];
function histQuery() {
  const p = new URLSearchParams({ dep: ME.dep });
  if (view.id !== 'cf') p.set('tipo', view.id);
  const per = view.per ?? '30';
  if (per) p.set('de', diasAtras(+per));
  if (view.q) p.set('q', view.q);
  return p.toString();
}
async function vHist() {
  const isCF = view.id === 'cf', o = isCF ? null : oleoPorId(view.id);
  titulo('Registros · ' + (isCF ? 'Central de Fluidos' : o.nome), DEP[ME.dep].nome);
  if (app.dataset.h !== view.id || !$('hq')) {
    app.dataset.h = view.id;
    app.innerHTML = `<div class="filt">${field('hq', `Buscar ${isCF ? 'produto, obs. ou nome' : 'CT ou nome'}`, `<input id="hq" autocomplete="off" value="${esc(view.q || '')}">`, 0)}${field('hp', 'Período', sel('hp', PERIODOS, view.per ?? '30', 'Período'))}</div>
      <div id="hres"><div class="load">Carregando…</div></div>
      <div class="row" style="margin-top:16px"><button class="btn" id="nv">Novo</button><button class="btn ghost" id="ex">Exportar Excel</button><button class="btn ghost" id="mn">Menu</button></div>
      <p class="tag">Toque em um registro para editar ou excluir. Mostra até 200 registros; a exportação traz todos do período.</p>`;
    let t;
    $('hq').oninput = () => { clearTimeout(t); t = setTimeout(() => { view.q = val('hq').trim(); lista(); }, 300); };
    $('hp').onchange = () => { view.per = val('hp'); lista(); };
    $('nv').onclick = () => { if (isCF) cfD = null; go(isCF ? { v: 'cf' } : { v: 'oil', id: o.id }); };
    $('mn').onclick = home;
    $('ex').onclick = () => baixar(`/api/exportar/${isCF ? 'cf' : 'mi'}.csv?` + histQuery(), `${isCF ? 'central-de-fluidos' : 'oleo-' + o.id}-${ME.dep}-${CFG.hoje}.csv`);
  }
  await lista();
  async function lista() {
    const box = $('hres'); if (!box) return;
    let d;
    try { d = await api(`/api/${isCF ? 'cf' : 'mi'}?` + histQuery()); }
    catch (e) { box.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    const t = d.totais;
    const sum = isCF ? `<span><b>${t.n}</b> registros</span><span>Custo total <b>${brl(t.custo)}</b></span>`
      : `<span><b>${t.n}</b> registros</span><span>Reposição <b>${fmt(t.litros, 0)} L</b></span><span>Custo <b>${brl(t.custo)}</b></span>`;
    const itens = d.registros.map((r) => isCF
      ? `<button class="item" data-id="${r.id}"><div class="h"><span>${br(r.data)} · ${esc(r.turno)}</span><span>${esc(r.descricao)}</span></div><div class="v"><span>pH <b>${fmt(r.ph, 1)}</b></span><span>Conc. <b>${fmt(r.concentracao, 1)}%</b></span><span>${esc(r.produto)} <b>${fmt(r.consumo, 0)}</b></span><span>${esc(r.responsavel)}</span>${r.preco > 0 ? `<span>${brl(r.consumo * r.preco)}</span>` : '<span>sem preço</span>'}${r.observacoes ? `<span>“${esc(r.observacoes)}”</span>` : ''}</div></button>`
      : `<button class="item" data-id="${r.id}"><div class="h"><span>${br(r.data)} · CT ${esc(r.ct)}</span><span>${fmt(r.reposicao, 0)} L</span></div><div class="v">${r.concentracao != null ? `<span>Conc. <b>${fmt(r.concentracao, 1)}%</b></span>` : ''}${r.ph != null ? `<span>pH <b>${fmt(r.ph, 1)}</b></span>` : ''}<span>${esc(r.turno)}</span><span>${esc(r.responsavel)}</span><span>${r.preco > 0 ? brl(r.reposicao * r.preco) : 'sem preço'}</span></div></button>`).join('');
    box.innerHTML = `<div class="sum">${sum}</div><div class="list">${itens || '<div class="empty">Nenhum registro neste período.</div>'}</div>`;
    box.querySelectorAll('.item').forEach((b) => (b.onclick = () => { const r = d.registros.find((x) => x.id === +b.dataset.id); isCF ? editaCF(r, lista) : editaOleo(o, r, lista); }));
  }
}
const rodapeEdicao = `<div class="msg" id="sh-msg"></div><div class="row"><button class="btn" id="sv">Salvar</button></div><div class="row mt"><button class="btn ghost" id="dl" style="color:var(--red)">Excluir registro</button></div>`;
function confirmaExclusao(rotulo, rota, recarrega) {
  const sh = layer.querySelector('.sheet');
  sh.innerHTML = `<h2>Excluir este registro?</h2><p>${rotulo}</p><div class="row"><button class="btn ghost" id="no">Cancelar</button><button class="btn dang" id="yes">Excluir</button></div>`;
  $('no').onclick = () => (layer.innerHTML = '');
  $('yes').onclick = () => ocupado('yes', 'Excluindo…', async () => {
    await api(rota, { method: 'DELETE' });
    layer.innerHTML = ''; recarrega();
    toast('Registro excluído', async () => { try { await api(rota + '/restaurar', { method: 'POST' }); recarrega(); toast('Registro restaurado'); } catch (e) { toast(e.message, null, true); } });
  });
}
async function salvaFolha(fn) {
  $('sh-msg').textContent = '';
  const b = $('sv'); b.disabled = true; b.textContent = 'Salvando…';
  try { await fn(); } catch (e) { $('sh-msg').textContent = e.message; b.disabled = false; b.textContent = 'Salvar'; }
}
async function editaOleo(o, r, recarrega) {
  const lista = (await cts(ME.dep)).filter((c) => c.tipo === o.tipo);
  folha('Editar registro', `<p class="hint" style="margin-top:0">Lançado por ${esc(r.responsavel)}${r.alterado_em ? ' · já editado' : ''}</p>` + oilCampos(o, lista, r) + rodapeEdicao, () => {
    live(oilRegras(o), 'sv', oilCusto(lista, r));
    $('sv').onclick = () => salvaFolha(async () => {
      await api('/api/mi/' + r.id, { method: 'PUT', body: { ...oilLe(o), turno: val('o-tur') } });
      layer.innerHTML = ''; recarrega(); toast('Registro atualizado');
    });
    $('dl').onclick = () => confirmaExclusao(`${br(r.data)} · CT ${esc(r.ct)} · ${fmt(r.reposicao, 0)} L`, '/api/mi/' + r.id, recarrega);
  });
}
function editaCF(r, recarrega) {
  const dk = r.departamento;
  const descs = (p) => (p ? PROD[p][dk] : []);
  folha('Editar registro da Central', `<p class="hint" style="margin-top:0">Lançado por ${esc(r.responsavel)}${r.alterado_em ? ' · já editado' : ''}</p>
    <div class="grid2">${field('e-data', 'Data', tData('e-data', r.data))}${field('e-tur', 'Turno', sel('e-tur', TURNOS, r.turno))}${field('e-ph', 'pH', tNum('e-ph', r.ph), 1, CF_PH.join(' a '))}${field('e-conc', 'Concentração (%)', tNum('e-conc', r.concentracao), 1, CF_CONC.join(' a '))}</div>
    ${field('e-prod', 'Produto', sel('e-prod', Object.keys(PROD), r.produto))}${field('e-desc', 'Descrição', sel('e-desc', descs(r.produto), r.descricao))}
    ${field('e-cons', 'Consumo', tNum('e-cons', r.consumo))}${field('e-obs', 'Observações', `<textarea id="e-obs" maxlength="1000">${esc(r.observacoes)}</textarea>`, 0)}` + rodapeEdicao, () => {
    const run = live([['e-data', R.data], ['e-tur', R.req('O turno')], ['e-ph', R.faixa('O pH', CF_PH)], ['e-conc', R.faixa('A concentração', CF_CONC)], ['e-prod', R.req('O produto')], ['e-desc', R.req('A descrição')], ['e-cons', R.pos('O consumo')]], 'sv');
    $('e-prod').addEventListener('change', () => { $('e-desc').innerHTML = '<option value="">Selecione</option>' + descs(val('e-prod')).map((d) => `<option>${esc(d)}</option>`).join(''); run(); });
    $('sv').onclick = () => salvaFolha(async () => {
      await api('/api/cf/' + r.id, { method: 'PUT', body: { data: val('e-data'), turno: val('e-tur'), ph: val('e-ph'), concentracao: val('e-conc'), produto: val('e-prod'), descricao: val('e-desc'), consumo: val('e-cons'), observacoes: val('e-obs') } });
      layer.innerHTML = ''; recarrega(); toast('Registro atualizado');
    });
    $('dl').onclick = () => confirmaExclusao(`${br(r.data)} · ${esc(r.descricao)} · ${fmt(r.consumo, 0)}`, '/api/cf/' + r.id, recarrega);
  });
}

// ---------- admin ----------
async function vAdmin() {
  titulo('Admin', DEP[view.dep || ME.dep].nome);
  if (!store.get('cd-admin', sessionStorage)) {
    app.innerHTML = `<h2>Entrar como admin</h2>${field('ap', 'Senha de admin', '<input id="ap" type="password" autocomplete="current-password">')}<div class="err" id="ap-msg" style="color:var(--red);font-weight:600;min-height:20px"></div><button class="btn" id="ab" style="width:100%">Entrar</button>`;
    const ir = () => ocupado('ab', 'Entrando…', async () => {
      store.set('cd-admin', val('ap'), sessionStorage);
      try { await api('/api/admin/entrar', { method: 'POST' }); } catch (e) { store.set('cd-admin', null, sessionStorage); $('ap-msg').textContent = e.message; throw new Error(e.message); }
      vAdmin();
    });
    $('ab').onclick = ir; $('ap').onkeydown = (e) => e.key === 'Enter' && ir(); $('ap').focus();
    return;
  }
  const dep = view.dep || ME.dep, tab = view.tab || 'ct';
  app.innerHTML = `<div class="tabs">${[['ct', 'Centros de trabalho'], ['pr', 'Preços da Central'], ['mq', 'Máquinas']].map(([k, l]) => `<button data-t="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    ${field('a-dep', 'Departamento', sel('a-dep', Object.entries(DEP).map(([k, d]) => [k, d.nome]), dep, 'Departamento'), 0)}<div id="adm"><div class="load">Carregando…</div></div>
    <div class="row" style="margin-top:22px"><button class="btn ghost" id="sair">Sair do admin</button></div>`;
  app.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => { view.tab = b.dataset.t; vAdmin(); }));
  $('a-dep').onchange = () => { view.dep = val('a-dep') || ME.dep; vAdmin(); };
  $('sair').onclick = () => { store.set('cd-admin', null, sessionStorage); home(); };
  const box = $('adm');
  if (tab === 'ct') return admCTs(box, dep);
  if (tab === 'pr') return admPrecos(box, dep);
  return admMaquinas(box, dep);
}
async function admCTs(box, dep) {
  const lista = await cts(dep, true);
  const tipos = OLEOS.filter((o) => o.deps.includes(dep)).map((o) => [o.tipo, o.nome]);
  box.innerHTML = `<h3>Adicionar centro de trabalho</h3>${field('n-ct', 'CT', '<input id="n-ct" inputmode="numeric" autocomplete="off" maxlength="30">')}
    <div class="grid2">${field('n-sec', 'Seção', sel('n-sec', DEP[dep].secoes.map((s) => [s, nomeSecao(s)]), DEP[dep].secoes[0]))}${field('n-tipo', 'Óleo', sel('n-tipo', tipos))}</div>
    ${field('n-pr', 'Preço do óleo (R$/L)', tNum('n-pr', ''))}<button class="btn" id="n-add" style="width:100%">Adicionar</button>
    <h3>CTs cadastrados</h3>
    ${lista.length ? `<div class="scroll"><table class="stack"><thead><tr><th>CT</th><th>Óleo</th><th>Seção</th><th class="n">R$/L</th><th></th></tr></thead><tbody>${lista.map((c) => `<tr><td>${esc(c.ct)}</td><td>${esc(OLEOS.find((o) => o.tipo === c.tipo)?.nome || c.tipo)}</td><td>${esc(nomeSecao(c.departamento))}</td><td class="n"><input data-ct="${esc(c.ct)}" data-v="${c.preco}" inputmode="decimal" value="${fmt(c.preco)}" aria-label="Preço do CT ${esc(c.ct)}"></td><td class="n"><button class="x" data-del="${esc(c.ct)}" aria-label="Remover CT ${esc(c.ct)}">✕</button></td></tr>`).join('')}</tbody></table></div>
      <button class="btn" id="sp" style="width:100%;margin-top:12px">Salvar preços</button>` : '<div class="empty">Nenhum CT cadastrado neste departamento.</div>'}
    <h3>Importar vários CTs</h3>
    <p class="hint" style="font-size:14px;margin-top:-4px">Cole linhas do Excel com as colunas <b>CT; óleo; seção; preço</b>. Seção: Usinagem_de_Eixos, Usinagem_de_Fundidos_I ou Usinagem_de_Fundidos_II. CT que já existe é atualizado.</p>
    ${field('imp', 'Linhas', '<textarea id="imp" rows="5" placeholder="01060061;Ecocool_2001;Usinagem_de_Eixos;37,70"></textarea>', 0)}
    <button class="btn ghost" id="imp-b" style="width:100%">Importar</button><div id="imp-r"></div>`;
  live([['n-ct', (v) => (!v.trim() ? 'Informe o CT.' : lista.some((c) => c.ct === v.trim()) ? 'Esse CT já está cadastrado.' : '')], ['n-sec', R.req('A seção')], ['n-tipo', R.req('O óleo')], ['n-pr', R.pos('O preço')]], 'n-add');
  const recarrega = () => { delete cache['cts' + dep]; admCTs(box, dep); };
  $('n-add').onclick = () => ocupado('n-add', 'Adicionando…', async () => {
    await api('/api/admin/cts', { method: 'POST', body: { ct: val('n-ct').trim(), departamento: val('n-sec'), tipo: val('n-tipo'), preco: num(val('n-pr')) } });
    recarrega(); toast('CT adicionado');
  });
  if ($('sp')) $('sp').onclick = () => ocupado('sp', 'Salvando…', async () => {
    const mud = {};
    box.querySelectorAll('[data-ct]').forEach((i) => { const x = num(i.value); if (!isFinite(x) || x < 0) throw new Error(`Preço inválido no CT ${i.dataset.ct}.`); if (x !== +i.dataset.v) mud[i.dataset.ct] = x; });
    if (!Object.keys(mud).length) { toast('Nenhuma alteração'); $('sp').disabled = false; $('sp').textContent = 'Salvar preços'; return; }
    await api('/api/admin/cts', { method: 'PUT', body: { precos: mud } });
    recarrega(); toast(`${Object.keys(mud).length} preço(s) atualizado(s)`);
  });
  box.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => folha('Remover CT ' + b.dataset.del + '?', '<p>Os registros já feitos com esse CT continuam no histórico. Ele só deixa de aparecer para novos registros.</p><div class="row"><button class="btn ghost" data-close>Cancelar</button><button class="btn dang" id="rm">Remover</button></div>', () => {
    $('rm').onclick = () => ocupado('rm', 'Removendo…', async () => { await api('/api/admin/cts/' + encodeURIComponent(b.dataset.del), { method: 'DELETE' }); layer.innerHTML = ''; recarrega(); toast('CT removido'); });
  })));
  $('imp-b').onclick = () => ocupado('imp-b', 'Importando…', async () => {
    const r = await api('/api/admin/cts/importar', { method: 'POST', body: { linhas: val('imp') } });
    delete cache['cts' + dep];
    const msg = `${r.gravados} CT(s) gravado(s).` + (r.erros.length ? '\nNão importadas:\n' + r.erros.map((e) => `Linha ${e.linha}: ${e.msg}`).join('\n') : '');
    if (!r.erros.length) { admCTs(box, dep).then(() => toast(`${r.gravados} CT(s) gravado(s)`)); return; }
    $('imp-r').innerHTML = `<pre class="res">${esc(msg)}</pre>`; $('imp-b').disabled = false; $('imp-b').textContent = 'Importar';
  });
}
async function admPrecos(box, dep) {
  const p = await precos(dep, true);
  box.innerHTML = `<h3>Preços da Central de Fluidos</h3><p class="hint" style="font-size:14px;margin-top:-4px">Usados para calcular o custo de cada consumo. Um registro guarda o preço do dia em que foi feito.</p>
    <table><thead><tr><th>Produto</th><th class="n">Preço (R$)</th></tr></thead><tbody>${Object.entries(PROD).flatMap(([prod, m]) => m[dep].map((d) => `<tr><td>${esc(d)}<br><span class="hint">${esc(prod)}${p[d] > 0 ? '' : ' · sem preço'}</span></td><td class="n"><input data-p="${esc(d)}" inputmode="decimal" value="${p[d] != null ? fmt(p[d]) : ''}" aria-label="Preço ${esc(d)}"></td></tr>`)).join('')}</tbody></table>
    <button class="btn" id="psv" style="width:100%;margin-top:12px">Salvar preços</button>`;
  $('psv').onclick = () => ocupado('psv', 'Salvando…', async () => {
    const out = {};
    box.querySelectorAll('[data-p]').forEach((i) => { if (i.value.trim() === '') return; const x = num(i.value); if (!isFinite(x) || x < 0) throw new Error(`Preço inválido em ${i.dataset.p}.`); out[i.dataset.p] = x; });
    await api('/api/admin/precos', { method: 'PUT', body: { departamento: dep, precos: out } });
    delete cache['pr' + dep]; admPrecos(box, dep); toast('Preços salvos');
  });
}
async function admMaquinas(box, dep) {
  const lista = await api('/api/maquinas?dep=' + dep);
  box.innerHTML = `<button class="btn" id="mq-n" style="width:100%">Adicionar máquina</button><h3>Máquinas</h3>
    ${lista.length ? `<div class="list">${lista.map((m) => `<button class="item" data-id="${m.id}"><div class="h"><span>${esc(m.maquina || '—')}</span><span>CT ${esc(m.ct || '—')}</span></div><div class="v"><span>${esc(m.secao)}</span><span>${esc(m.oleo)}</span>${m.volume != null ? `<span><b>${fmt(m.volume, 0)} L</b></span>` : ''}${m.concentracao ? `<span>Alvo ${esc(m.concentracao)}</span>` : ''}</div></button>`).join('')}</div>` : '<div class="empty">Nenhuma máquina cadastrada neste departamento.</div>'}`;
  const recarrega = () => admMaquinas(box, dep);
  const abre = (m) => folha(m ? 'Editar máquina' : 'Nova máquina', `
    ${field('m-maq', 'Máquina', `<input id="m-maq" maxlength="80" value="${esc(m?.maquina)}">`)}
    <div class="grid2">${field('m-ct', 'CT', `<input id="m-ct" maxlength="30" value="${esc(m?.ct)}">`, 0)}${field('m-sec', 'Seção', `<input id="m-sec" maxlength="60" value="${esc(m?.secao)}">`, 0)}</div>
    ${field('m-oleo', 'Óleo', `<input id="m-oleo" maxlength="60" list="m-oleos" value="${esc(m?.oleo)}"><datalist id="m-oleos">${OLEOS.map((o) => `<option value="${esc(o.nome)}">`).join('')}</datalist>`, 0)}
    <div class="grid2">${field('m-vol', 'Volume (L)', tNum('m-vol', m?.volume), 0)}${field('m-conc', 'Concentração alvo', `<input id="m-conc" maxlength="30" placeholder="ex.: 5 a 7%" value="${esc(m?.concentracao)}">`, 0)}</div>
    <div class="msg" id="sh-msg"></div><div class="row"><button class="btn" id="sv">Salvar</button></div>${m ? '<div class="row mt"><button class="btn ghost" id="dl" style="color:var(--red)">Remover máquina</button></div>' : ''}`, () => {
    live([['m-maq', R.req('O nome da máquina')], ['m-vol', (v) => (v === '' ? '' : R.pos('O volume')(v))]], 'sv');
    $('sv').onclick = () => salvaFolha(async () => {
      const body = { departamento: dep, maquina: val('m-maq'), ct: val('m-ct'), secao: val('m-sec'), oleo: val('m-oleo'), volume: val('m-vol') === '' ? null : num(val('m-vol')), concentracao: val('m-conc') };
      await api('/api/admin/maquinas' + (m ? '/' + m.id : ''), { method: m ? 'PUT' : 'POST', body });
      layer.innerHTML = ''; recarrega(); toast(m ? 'Máquina atualizada' : 'Máquina adicionada');
    });
    if (m) $('dl').onclick = () => ocupado('dl', 'Removendo…', async () => { await api('/api/admin/maquinas/' + m.id, { method: 'DELETE' }); layer.innerHTML = ''; recarrega(); toast('Máquina removida'); });
  });
  $('mq-n').onclick = () => abre(null);
  box.querySelectorAll('.item').forEach((b) => (b.onclick = () => abre(lista.find((x) => x.id === +b.dataset.id))));
}

// ---------- informações ----------
async function vInfo() {
  titulo('Informações', 'Máquinas e fluidos');
  const f = view.f ?? ME.dep;
  const rows = await api('/api/maquinas' + (f ? '?dep=' + f : ''));
  app.innerHTML = `${field('i-dep', 'Departamento', `<select id="i-dep"><option value="">Todos</option>${Object.entries(DEP).map(([k, d]) => `<option value="${k}"${k === f ? ' selected' : ''}>${d.nome}</option>`).join('')}</select>`, 0)}
    ${rows.length ? `<table class="stack"><thead><tr><th>CT</th><th>Máquina</th><th>Seção</th><th>Óleo</th><th class="n">Volume</th><th>Conc. alvo</th></tr></thead><tbody>${rows.map((m) => `<tr><td>${esc(m.ct)}</td><td>${esc(m.maquina)}</td><td>${esc(m.secao)}</td><td>${esc(m.oleo)}</td><td class="n">${m.volume != null ? fmt(m.volume, 0) + ' L' : ''}</td><td>${esc(m.concentracao)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Nenhuma máquina cadastrada. O admin cadastra em Admin › Máquinas.</div>'}`;
  $('i-dep').onchange = () => { view.f = val('i-dep'); vInfo(); };
}

// ---------- folha e aviso ----------
function folha(title, html, bind) {
  layer.innerHTML = `<div class="ov"><div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><button class="x" data-close aria-label="Fechar">✕</button><h2>${esc(title)}</h2>${html}</div></div>`;
  const ov = layer.firstChild;
  ov.addEventListener('click', (e) => { if (e.target === ov || e.target.closest('[data-close]')) layer.innerHTML = ''; });
  bind && bind();
}
let tt;
function toast(msg, desfazer, ruim) {
  document.querySelector('.toast')?.remove(); clearTimeout(tt);
  const t = document.createElement('div'); t.className = 'toast' + (ruim ? ' bad' : ''); t.setAttribute('role', 'status');
  t.innerHTML = `<span>${esc(msg)}</span>${desfazer ? '<button>Desfazer</button>' : ''}`;
  document.body.appendChild(t);
  if (desfazer) t.querySelector('button').onclick = () => { t.remove(); desfazer(); };
  tt = setTimeout(() => t.remove(), desfazer ? 7000 : ruim ? 5000 : 2600);
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') layer.innerHTML = ''; });

// ---------- início ----------
(async () => {
  try { CFG = await (await fetch('/api/config')).json(); } catch {}
  if (CFG.precisaChave && !store.get('cd-chave')) return telaChave();
  render();
})();
