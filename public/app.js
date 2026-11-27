import { DEPARTAMENTOS as DEP, SECOES, TURNOS, OLEOS, PRODUTOS_CF as PROD, CF_PH, CF_CONC, PH, oleoPorId } from './config.js';

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
// "hoje", "ontem", "há 5 dias" ou a data
const quando = (s) => {
  if (!s) return '';
  const n = Math.round((Date.parse(CFG.hoje + 'T12:00:00Z') - Date.parse(s + 'T12:00:00Z')) / 864e5);
  return n <= 0 ? 'hoje' : n === 1 ? 'ontem' : n < 30 ? `há ${n} dias` : br(s);
};

let CFG = { hoje: new Date().toISOString().slice(0, 10) };
let ME = null; // { id, login, nome, dep, turno, admin, trocar }
let view = { v: 'menu' }, pilha = [], cfD = null;
const cache = {};
const app = $('app'), ttl = $('ttl'), back = $('back'), layer = $('layer'), meBtn = $('me');
try { ['cd-perfil', 'cd-admin', 'cd-chave'].forEach((k) => localStorage.removeItem(k)); sessionStorage.removeItem('cd-admin'); } catch {}
const isAdmin = () => !!ME?.admin;
const deUsuario = (u) => ({ id: u.id, login: u.login, nome: u.nome, dep: u.departamento, turno: u.turno, admin: u.admin, trocar: u.trocar_senha });

// Cor de cada tela, para reconhecer de relance
const COR = { cf: '#0e7490', 6002: '#2456b8', 2001: '#6d28d9', houghto: '#c2410c', mql: '#475569', diagrind: '#a16207', microcut: '#15803d' };
const gota = (k) => `<span class="gota" style="--c:${COR[k] || '#2456b8'}" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 2.6c-3.4 4.5-7 8.4-7 12.1a7 7 0 0 0 14 0c0-3.7-3.6-7.6-7-12.1z" fill="currentColor"/><path d="M8.6 15.2a3.4 3.4 0 0 0 3.4 3.3" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" opacity=".85"/></svg></span>`;

// ---------- API ----------
const authH = () => { const t = store.get('cd-token'); return t ? { authorization: 'Bearer ' + t } : {}; };
let VERSAO = null, avisouVersao = false;
function confereVersao(res) {
  const v = res.headers.get('x-versao'); if (!v) return;
  if (!VERSAO) { VERSAO = v; return; }
  if (v !== VERSAO && !avisouVersao) {
    avisouVersao = true;
    const t = document.createElement('div'); t.className = 'toast novo'; t.setAttribute('role', 'status');
    t.innerHTML = '<span>Saiu uma versão nova do app.</span><button>Atualizar</button>';
    t.querySelector('button').onclick = () => location.reload();
    document.body.appendChild(t);
  }
}
async function api(path, { method = 'GET', body } = {}) {
  let res;
  try { res = await fetch(path, { method, headers: { 'content-type': 'application/json', ...authH() }, body: body ? JSON.stringify(body) : undefined }); }
  catch { throw new Error('Sem conexão. Verifique a internet e tente de novo.'); }
  confereVersao(res);
  const d = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/api/login') { store.set('cd-token', null); ME = null; vLogin(d.erro); throw new Error(d.erro || 'Entre de novo.'); }
  if (!res.ok) throw new Error(d.erro || 'Falha ao falar com o servidor.');
  return d;
}
async function baixar(path, nome) {
  try {
    const res = await fetch(path, { headers: authH() });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).erro || 'Falha ao exportar.');
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a'); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch (e) { toast(e.message, null, true); }
}
const cts = async (dep, novo) => (!novo && cache['cts' + dep]) || (cache['cts' + dep] = await api('/api/cts?dep=' + dep));
const precos = async (dep, novo) => (!novo && cache['pr' + dep]) || (cache['pr' + dep] = await api('/api/precos?dep=' + dep));
const maquinas = async (dep, novo) => (!novo && cache['mq' + dep]) || (cache['mq' + dep] = await api('/api/maquinas?dep=' + dep));
// "6,0 - 8,0" → [6, 8]
const faixaDe = (t) => { const m = String(t || '').match(/(\d+(?:[.,]\d+)?)\s*[-–a]\s*(\d+(?:[.,]\d+)?)/); return m ? [num(m[1]), num(m[2])] : null; };
const limpaCache = () => { for (const k in cache) delete cache[k]; };
// Departamento de uma tela: quem não é admin só trabalha no próprio
const depDaTela = (o) => {
  const d = isAdmin() && view.dep ? view.dep : ME.dep;
  return !o || o.deps.includes(d) ? d : null;
};

// Fundidos se divide em I e II: a pessoa escolhe, e a escolha fica salva no aparelho
const multiSecao = (dep) => DEP[dep].secoes.length > 1;
const secaoSalva = (dep) => { const s = store.get('cd-secao-' + ME.id + '-' + dep); return DEP[dep].secoes.includes(s) ? s : ''; };
const salvaSecao = (dep, s) => store.set('cd-secao-' + ME.id + '-' + dep, s || null);
const secaoTela = (dep) => (multiSecao(dep) ? (DEP[dep].secoes.includes(view.secao) ? view.secao : secaoSalva(dep)) : DEP[dep].secoes[0]);
const subtitulo = (dep, s) => DEP[dep].nome + (multiSecao(dep) && s ? ' · ' + SECOES[s].replace('Fundidos ', '') : '');
const campoSecao = (id, dep, v) => (multiSecao(dep) ? field(id, 'Usinagem', seg(id, DEP[dep].secoes.map((x) => [x, SECOES[x]]), v)) : '');

// ---------- navegação ----------
function go(v, empilha = true) { if (empilha) pilha.push(view); view = v; app.dataset.h = ''; render(); window.scrollTo(0, 0); }
back.onclick = () => { layer.innerHTML = ''; view = pilha.pop() || { v: 'menu' }; app.dataset.h = ''; render(); };
const home = () => { pilha = []; go({ v: 'menu' }, false); };
meBtn.onclick = () => go({ v: 'conta' });
function titulo(t, sub) { ttl.innerHTML = esc(t) + (sub ? '<small>' + esc(sub) + '</small>' : ''); }
async function render() {
  document.body.classList.toggle('largo', view.v === 'info' || view.v === 'hist');
  if (!ME) return vLogin();
  if (ME.trocar && view.v !== 'conta') { view = { v: 'conta' }; pilha = []; }
  back.hidden = view.v === 'menu' || (ME.trocar && view.v === 'conta');
  meBtn.hidden = view.v === 'conta';
  meBtn.innerHTML = `<span class="av">${esc(ME.nome.trim()[0] || '?').toUpperCase()}</span><span class="mt">${esc(ME.nome.split(' ')[0])}${isAdmin() ? ' · admin' : ''}</span>`;
  const v = { menu: vMenu, conta: vConta, cf: vCF, oil: vOil, ok: vOk, hist: vHist, admin: vAdmin, info: vInfo }[view.v] || vMenu;
  try { await v(); } catch (e) { app.innerHTML = `<div class="empty">${esc(e.message)}</div><div class="row mt"><button class="btn ghost" id="tenta">Tentar de novo</button></div>`; $('tenta').onclick = render; }
}

// ---------- campos e validação ----------
const field = (id, label, input, req = 1, hint = '') => `<div class="f" id="w-${id}"><label for="${id}">${label}${req ? ' <i>*</i>' : ''}${hint ? ` <span class="hint">${hint}</span>` : ''}</label>${input}<div class="err" id="e-${id}"></div></div>`;
const tNum = (id, v, un = '') => `<div class="un"><input id="${id}" inputmode="decimal" autocomplete="off" value="${esc(inNum(v))}"${un ? ` style="padding-right:${16 + un.length * 11}px"` : ''}>${un ? `<span>${un}</span>` : ''}</div>`;
const tData = (id, v) => `<input id="${id}" type="date" max="${CFG.hoje}" value="${esc(v || CFG.hoje)}">`;
const sel = (id, opts, v, ph = 'Selecione') => `<select id="${id}"><option value="">${esc(ph)}</option>${opts.map((o) => { const [val, lab] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(val)}"${val === v ? ' selected' : ''}>${esc(lab)}</option>`; }).join('')}</select>`;
// botões lado a lado no lugar de uma lista suspensa (o valor fica num campo escondido)
const seg = (id, opts, v) => `<input type="hidden" id="${id}" value="${esc(v || '')}"><div class="seg" data-for="${id}" role="group">${opts.map((o) => { const [val, lab] = Array.isArray(o) ? o : [o, o]; return `<button type="button" data-v="${esc(val)}" class="${val === v ? 'on' : ''}" aria-pressed="${val === v}">${esc(lab)}</button>`; }).join('')}</div>`;
document.addEventListener('click', (e) => {
  const b = e.target.closest('.seg button'); if (!b) return;
  const g = b.parentElement, inp = $(g.dataset.for); if (!inp) return;
  g.querySelectorAll('button').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
  inp.value = b.dataset.v; inp.dispatchEvent(new Event('change'));
});
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
// faixa da máquina ao lado do valor digitado
function statusFaixa(id, faixa, txt, un = '') {
  const el = $(id + '-fx'); if (!el) return;
  if (!faixa) { el.innerHTML = ''; return; }
  const v = num(val(id));
  const st = !isFinite(v) ? '' : v >= faixa[0] && v <= faixa[1] ? '<b class="ok">dentro</b>' : '<b class="fora">fora da faixa</b>';
  el.innerHTML = `Faixa da máquina: ${esc(txt)}${un} ${st}`;
}

// ---------- login e conta ----------
function vLogin(msg) {
  titulo('Qualidade do óleo', 'Entrar');
  back.hidden = true; meBtn.hidden = true; layer.innerHTML = '';
  app.innerHTML = `<div class="login card pad"><div class="marca">${gota('cf')}<div><b>Qualidade do óleo</b><span>Usinagem de Eixos e Fundidos</span></div></div>
    ${field('l-user', 'Usuário', '<input id="l-user" autocomplete="username" autocapitalize="none" spellcheck="false">', 0)}
    ${field('l-pass', 'Senha', '<input id="l-pass" type="password" autocomplete="current-password">', 0)}
    <div class="msg" id="l-msg">${esc(msg && !/Entre com seu/.test(msg) ? msg : '')}</div>
    <button class="btn" id="l-ok" style="width:100%">Entrar</button>
    <p class="tag" style="text-align:center">Esqueceu a senha? Fale com o admin.</p></div>`;
  const ir = () => ocupado('l-ok', 'Entrando…', async () => {
    $('l-msg').textContent = '';
    try {
      const r = await api('/api/login', { method: 'POST', body: { login: val('l-user'), senha: val('l-pass') } });
      store.set('cd-token', r.token); ME = deUsuario(r.usuario); limpaCache(); pilha = []; view = { v: 'menu' }; render();
    } catch (e) { $('l-msg').textContent = e.message; $('l-ok').disabled = false; $('l-ok').textContent = 'Entrar'; }
  });
  $('l-ok').onclick = ir;
  $('l-user').onkeydown = (e) => { if (e.key === 'Enter') $('l-pass').focus(); };
  $('l-pass').onkeydown = (e) => { if (e.key === 'Enter') ir(); };
  $('l-user').focus();
}
async function sair() {
  try { await api('/api/logout', { method: 'POST' }); } catch {}
  store.set('cd-token', null); ME = null; cfD = null; limpaCache(); pilha = []; view = { v: 'menu' };
  vLogin();
}
function vConta() {
  const novo = ME.trocar;
  titulo(novo ? 'Crie sua senha' : 'Minha conta', ME.nome);
  app.innerHTML = `${novo ? '' : `<div class="card pad"><div class="conta"><span class="av">${esc(ME.nome.trim()[0] || '?').toUpperCase()}</span><div><b>${esc(ME.nome)}</b><span>Usuário: ${esc(ME.login)}${ME.admin ? ' · admin' : ''}</span></div></div>
      <dl class="dados"><div><dt>Departamento</dt><dd>${esc(DEP[ME.dep]?.nome || ME.dep)}</dd></div><div><dt>Turno</dt><dd>${esc(ME.turno)}</dd></div></dl>
      <p class="hint" style="margin:0">Departamento e turno são definidos pelo admin.</p></div>`}
    <div class="card pad${novo ? '' : ' mt2'}"><h3 style="margin-top:0">${novo ? 'Antes de começar, troque a senha provisória' : 'Trocar senha'}</h3>
      ${novo ? '' : field('s-atual', 'Senha atual', '<input id="s-atual" type="password" autocomplete="current-password">')}
      ${field('s-nova', 'Nova senha', '<input id="s-nova" type="password" autocomplete="new-password">', 1, 'mínimo 4 caracteres')}
      ${field('s-conf', 'Repita a nova senha', '<input id="s-conf" type="password" autocomplete="new-password">')}
      <button class="btn" id="s-ok" style="width:100%">Salvar senha</button></div>
    <button class="btn ghost sair" id="s-sair">Sair / trocar de usuário</button>`;
  live([...(novo ? [] : [['s-atual', R.req('A senha atual')]]), ['s-nova', (v) => (v.length < 4 ? 'A senha precisa ter pelo menos 4 caracteres.' : '')], ['s-conf', (v) => (v !== val('s-nova') ? 'As senhas não são iguais.' : '')]], 's-ok');
  $('s-ok').onclick = () => ocupado('s-ok', 'Salvando…', async () => {
    await api('/api/me/senha', { method: 'PUT', body: { atual: val('s-atual'), nova: val('s-nova') } });
    toast('Senha alterada');
    if (novo) { ME.trocar = false; home(); } else vConta();
  });
  $('s-sair').onclick = sair;
}

// ---------- início ----------
function botoesDe(dep, r) {
  const c = r.cf;
  const b = (k, nome, sub, alvo, cls = '') => `<button class="tile${cls}" style="--c:${COR[k]}" data-dep="${dep}" data-go='${esc(JSON.stringify(alvo))}'><b>${esc(nome)}</b><span>${sub}</span></button>`;
  const esc_ = multiSecao(dep) ? `<div class="escolha" id="esc-${dep}"><span>Qual usinagem?</span>${seg('m-sec-' + dep, DEP[dep].secoes.map((x) => [x, SECOES[x]]), secaoSalva(dep))}</div>` : '';
  return `${esc_}<div class="tiles">${b('cf', 'Central de Fluidos', c ? `Último ${quando(c.data)}` : 'Sem registros', { v: 'cf', dep }, ' wide')}${OLEOS.filter((o) => o.deps.includes(dep)).map((o) => {
    const l = r.mi[o.id];
    return b(o.id, o.nome, l ? `Último ${quando(l.data)}` : 'Sem registros', { v: 'oil', id: o.id, dep });
  }).join('')}</div>`;
}
async function vMenu() {
  const adm = isAdmin();
  titulo('Menu', adm ? 'Todos os departamentos' : DEP[ME.dep].nome);
  const deps = adm ? [ME.dep, ...Object.keys(DEP).filter((d) => d !== ME.dep)] : [ME.dep];
  const res = await Promise.all(deps.map((d) => api('/api/resumo?dep=' + d)));
  app.innerHTML = deps.map((d, i) => `${adm ? `<h3 class="sec">${esc(DEP[d].nome)}</h3>` : ''}${botoesDe(d, res[i])}`).join('') +
    `<div class="menu2"><button class="btn ghost" data-go='{"v":"info"}'>Informações</button>${adm ? `<button class="btn ghost" data-go='{"v":"admin"}'>Admin</button>` : ''}</div>
    <button class="btn ghost sair" id="m-sair">Sair / trocar de usuário</button>`;
  app.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => {
    const v = JSON.parse(b.dataset.go), dep = b.dataset.dep;
    if (dep && multiSecao(dep)) {
      v.secao = secaoSalva(dep);
      if (!v.secao) { const e = $('esc-' + dep); e.classList.remove('pisca'); void e.offsetWidth; e.classList.add('pisca'); toast('Escolha Fundidos I ou Fundidos II primeiro'); return; }
    }
    if (v.v === 'cf') cfD = null; go(v);
  }));
  deps.filter(multiSecao).forEach((d) => $('m-sec-' + d).addEventListener('change', () => salvaSecao(d, val('m-sec-' + d))));
  $('m-sair').onclick = sair;
}
const foraDoDep = (nome) => {
  app.innerHTML = `<div class="empty">${esc(nome)} não é usado em ${esc(DEP[ME.dep].nome)}.</div><div class="row mt"><button class="btn ghost" id="mn">Voltar ao início</button></div>`;
  $('mn').onclick = home;
};
const aviso = (D) => (D !== ME.dep ? `<div class="warn">Lançando para <b>${esc(DEP[D].nome)}</b>, que não é o seu departamento.</div>` : '');

// ---------- Central de Fluidos (3 etapas) ----------
async function vCF() {
  const D = depDaTela(null);
  const pr = await precos(D);
  if (!cfD) cfD = { step: 1, secao: secaoTela(D), data: CFG.hoje, turno: ME.turno, ph: '', concentracao: '', produto: '', descricao: '', consumo: '', observacoes: '' };
  titulo('Central de Fluidos', subtitulo(D, cfD.secao));
  const s = cfD.step;
  const passos = `<ol class="passos">${['Data e turno', 'Parâmetros', 'Consumo'].map((t, i) => `<li class="${i + 1 < s ? 'feito' : i + 1 === s ? 'on' : ''}"><span>${i + 1 < s ? '✓' : i + 1}</span>${t}</li>`).join('')}</ol>`;
  let body, regras;
  if (s === 1) {
    body = `${campoSecao('c-sec', D, cfD.secao)}${field('c-data', 'Data', tData('c-data', cfD.data))}${field('c-tur', 'Turno', seg('c-tur', TURNOS, cfD.turno))}`;
    regras = [...(multiSecao(D) ? [['c-sec', R.req('A usinagem')]] : []), ['c-data', R.data], ['c-tur', R.req('O turno')]];
  } else if (s === 2) {
    body = `<div class="grid2">${field('c-ph', 'pH', tNum('c-ph', cfD.ph), 1, CF_PH.join(' a '))}${field('c-conc', 'Concentração', tNum('c-conc', cfD.concentracao, '%'), 1, CF_CONC.join(' a ') + '%')}</div>`;
    regras = [['c-ph', R.faixa('O pH', CF_PH)], ['c-conc', R.faixa('A concentração', CF_CONC)]];
  } else {
    const descs = cfD.produto ? PROD[cfD.produto][D] : [];
    if (descs.length === 1 && !cfD.descricao) cfD.descricao = descs[0];
    const un = cfD.produto ? PROD[cfD.produto].un : '';
    body = `${field('c-prod', 'Produto', seg('c-prod', Object.keys(PROD).map((p) => [p, p.replace(/ \(.*\)$/, '')]), cfD.produto))}
      ${cfD.produto ? field('c-desc', 'Qual?', seg('c-desc', descs, cfD.descricao)) : '<input type="hidden" id="c-desc" value=""><div id="w-c-desc"><div class="err" id="e-c-desc"></div></div>'}
      ${field('c-cons', 'Consumo', tNum('c-cons', cfD.consumo, un))}
      <div class="cost"><span>Custo estimado<small id="c-unit"></small></span><b id="c-cost">—</b></div>
      ${field('c-obs', 'Observações', `<textarea id="c-obs" maxlength="1000" placeholder="Opcional">${esc(cfD.observacoes)}</textarea>`, 0)}`;
    regras = [['c-prod', R.req('O produto')], ['c-desc', R.req('A descrição')], ['c-cons', R.pos('O consumo')]];
  }
  app.innerHTML = passos + aviso(D) + `<div class="card pad">${body}</div>
    <div class="acoes">${s > 1 ? '<button class="btn ghost" id="prev">Voltar</button>' : `<button class="btn ghost" id="toH">Histórico</button>`}<button class="btn" id="nx">${s < 3 ? 'Continuar' : 'Enviar registro'}</button></div>`;
  if ($('c-sec')) $('c-sec').addEventListener('change', () => { cfD.secao = val('c-sec'); salvaSecao(D, cfD.secao); titulo('Central de Fluidos', subtitulo(D, cfD.secao)); });
  const pega = () => { for (const [k, id] of [['secao', 'c-sec'], ['data', 'c-data'], ['turno', 'c-tur'], ['ph', 'c-ph'], ['concentracao', 'c-conc'], ['produto', 'c-prod'], ['descricao', 'c-desc'], ['consumo', 'c-cons'], ['observacoes', 'c-obs']]) if ($(id)) cfD[k] = $(id).value; };
  const custo = () => {
    if (!$('c-cost')) return;
    const p = pr[val('c-desc')], c = num(val('c-cons'));
    $('c-cost').textContent = p > 0 && isFinite(c) ? brl(p * c) : '—';
    $('c-unit').textContent = !val('c-desc') ? '' : p > 0 ? brl(p) + ' por unidade' : 'Produto sem preço cadastrado';
  };
  live(regras, 'nx', custo);
  if (s === 3) { $('c-prod').addEventListener('change', () => { pega(); cfD.descricao = ''; vCF(); }); $('c-obs').oninput = pega; }
  if ($('toH')) $('toH').onclick = () => { pega(); go({ v: 'hist', id: 'cf', dep: D, sec: multiSecao(D) ? cfD.secao : '' }); };
  if (s > 1) $('prev').onclick = () => { pega(); cfD.step--; vCF(); };
  $('nx').onclick = () => {
    pega();
    if (s < 3) { cfD.step++; vCF(); window.scrollTo(0, 0); return; }
    ocupado('nx', 'Enviando…', async () => {
      await api('/api/cf', { method: 'POST', body: { ...cfD, departamento: D, responsavel: ME.nome } });
      const sc = cfD.secao;
      cfD = null;
      go({ v: 'ok', k: 'cf', msg: 'Central de Fluidos' + (multiSecao(D) ? ' · ' + SECOES[sc] : ''), novo: { v: 'cf', dep: D, secao: sc }, hist: { v: 'hist', id: 'cf', dep: D, sec: multiSecao(D) ? sc : '' } });
    });
  };
}

// ---------- formulário único dos óleos ----------
function oilCampos(o, lista, r, maqs = []) {
  const opts = lista.map((c) => c.ct);
  if (r && !opts.includes(r.ct)) opts.unshift(r.ct);
  const rot = (ct) => { const m = maqs.find((x) => x.ct === ct); return [ct, m ? `${ct} — ${m.maquina}` : ct]; };
  return field('o-ct', 'Máquina (CT)', sel('o-ct', opts.map(rot), r?.ct, 'Escolha o CT')) + '<div id="o-maq"></div>' +
    `<div class="grid2">${o.conc ? field('o-conc', 'Concentração', tNum('o-conc', r?.concentracao, '%'), 1) + '' : ''}${o.ph ? field('o-ph', 'pH', tNum('o-ph', r?.ph), 1) : ''}</div>` +
    field('o-rep', 'Reposição de óleo', tNum('o-rep', r?.reposicao, 'L')) +
    `<div class="grid2">${field('o-data', 'Data', tData('o-data', r?.data))}${r ? field('o-tur', 'Turno', sel('o-tur', TURNOS, r.turno)) : ''}</div>` +
    `<div class="cost"><span>Custo da reposição<small id="o-unit">Escolha o CT</small></span><b id="o-cost">—</b></div>`;
}
const oilRegras = (o) => [['o-ct', R.req('O CT')], ...(o.conc ? [['o-conc', R.faixa('A concentração', o.conc)]] : []), ...(o.ph ? [['o-ph', R.faixa('O pH', PH)]] : []), ['o-rep', R.pos('A reposição')], ['o-data', R.data], ...($('o-tur') ? [['o-tur', R.req('O turno')]] : [])];
const oilCusto = (lista, r, maqs = []) => () => {
  const mq = maqs.find((m) => m.ct === val('o-ct'));
  if ($('o-maq')) $('o-maq').innerHTML = mq ? `<div class="maq"><b>${esc(mq.maquina)}</b><span>${[mq.secao, mq.volume != null ? fmt(mq.volume, 0) + ' L' : '', mq.fator != null ? 'fator de refração ' + fmt(mq.fator, 2) : ''].filter(Boolean).map(esc).join(' · ')}</span></div>` : '';
  for (const [id, campo, un] of [['o-conc', 'concentracao', '%'], ['o-ph', 'ph', '']]) {
    if (!$(id)) continue;
    if (!$(id + '-fx')) $('e-' + id).insertAdjacentHTML('beforebegin', `<div class="fx" id="${id}-fx"></div>`);
    statusFaixa(id, faixaDe(mq?.[campo]), mq?.[campo] || '', un);
  }
  const c = lista.find((x) => x.ct === val('o-ct')), q = num(val('o-rep'));
  const p = r && r.ct === val('o-ct') && r.preco > 0 ? r.preco : c?.preco;
  $('o-cost').textContent = p > 0 && isFinite(q) ? brl(p * q) : '—';
  $('o-unit').textContent = !val('o-ct') ? 'Escolha o CT' : p > 0 ? brl(p) + ' por litro' : 'CT sem preço cadastrado';
};
const oilLe = (o) => ({ data: val('o-data'), ct: val('o-ct'), concentracao: o.conc ? val('o-conc') : null, ph: o.ph ? val('o-ph') : null, reposicao: val('o-rep') });

async function vOil() {
  const o = oleoPorId(view.id);
  const D = depDaTela(o);
  if (!D) { titulo(o.nome); return foraDoDep(o.nome); }
  const S = secaoTela(D);
  titulo(o.nome, subtitulo(D, S));
  const [todos, maqs] = await Promise.all([cts(D).then((l) => l.filter((c) => c.tipo === o.tipo)), maquinas(D).catch(() => [])]);
  const lista = todos.filter((c) => !S || c.departamento === S);
  const escolhe = campoSecao('o-sec', D, S);
  const hist = { v: 'hist', id: o.id, dep: D, sec: multiSecao(D) ? S : '' };
  const ligaSecao = () => { if ($('o-sec')) $('o-sec').addEventListener('change', () => { salvaSecao(D, val('o-sec')); view.secao = val('o-sec'); vOil(); }); };
  if (!S || !lista.length) {
    app.innerHTML = (escolhe ? `<div class="card pad">${escolhe}</div>` : '') + `<div class="empty mt2">${!S ? 'Escolha acima se é Fundidos I ou Fundidos II.' : `Nenhum CT de ${esc(o.nome)} cadastrado em ${esc(multiSecao(D) ? SECOES[S] : DEP[D].nome)}.<br>Peça ao admin para cadastrar.`}</div><div class="row mt"><button class="btn ghost" id="toH">Ver histórico</button></div>`;
    $('toH').onclick = () => go(hist);
    ligaSecao();
    return;
  }
  app.innerHTML = aviso(D) + `<div class="card pad">${escolhe}${oilCampos(o, lista, null, maqs)}</div>
    <div class="acoes"><button class="btn ghost" id="toH">Histórico</button><button class="btn" id="send">Enviar registro</button></div>`;
  ligaSecao();
  live(oilRegras(o), 'send', oilCusto(lista, null, maqs));
  $('toH').onclick = () => go(hist);
  $('send').onclick = () => ocupado('send', 'Enviando…', async () => {
    await api('/api/mi', { method: 'POST', body: { ...oilLe(o), tipo: o.id, departamento: D, secao: S, turno: ME.turno, responsavel: ME.nome } });
    go({ v: 'ok', k: o.id, msg: o.nome + (multiSecao(D) ? ' · ' + SECOES[S] : ''), novo: { v: 'oil', id: o.id, dep: D, secao: S }, hist });
  });
}

function vOk() {
  titulo('Registro enviado');
  app.innerHTML = `<div class="card pad ok"><div class="mark">✓</div><h2>Registro enviado</h2><p>${gota(view.k)} ${esc(view.msg)} · ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p></div>
  <div class="acoes"><button class="btn ghost" id="m">Início</button><button class="btn ghost" id="h">Histórico</button><button class="btn" id="a">Novo registro</button></div>`;
  $('a').onclick = () => { pilha.pop(); go(view.novo, false); };
  $('h').onclick = () => { pilha = [{ v: 'menu' }]; go(view.hist, false); };
  $('m').onclick = home;
}

// ---------- histórico ----------
const PERIODOS = [['30', '30 dias'], ['90', '90 dias'], ['365', '1 ano'], ['', 'Tudo']];
function histDep() {
  const o = view.id === 'cf' ? null : oleoPorId(view.id);
  return depDaTela(o) || ME.dep;
}
function histQuery() {
  const p = new URLSearchParams({ dep: histDep() });
  if (view.id !== 'cf') p.set('tipo', view.id);
  if (view.sec && multiSecao(histDep())) p.set('secao', view.sec);
  const per = view.per ?? '30';
  if (per) p.set('de', diasAtras(+per));
  if (view.q) p.set('q', view.q);
  return p.toString();
}
async function vHist() {
  const isCF = view.id === 'cf', o = isCF ? null : oleoPorId(view.id);
  if (o && !depDaTela(o)) { titulo(o.nome); return foraDoDep(o.nome); }
  const D = histDep();
  const ms = multiSecao(D);
  titulo('Histórico · ' + (isCF ? 'Central de Fluidos' : o.nome), subtitulo(D, view.sec));
  if (app.dataset.h !== view.id + D || !$('hq')) {
    app.dataset.h = view.id + D;
    app.innerHTML = `<div class="filt">${field('hq', 'Buscar', `<input id="hq" autocomplete="off" placeholder="${isCF ? 'Produto, observação ou nome' : 'CT ou nome'}" value="${esc(view.q || '')}">`, 0)}${field('hp', 'Período', seg('hp', PERIODOS, view.per ?? '30'), 0)}</div>
      ${ms ? field('hs', 'Usinagem', seg('hs', [['', 'Todas'], ...DEP[D].secoes.map((x) => [x, SECOES[x]])], view.sec || ''), 0) : ''}
      <div id="hres"><div class="load">Carregando…</div></div>
      <div class="acoes"><button class="btn ghost" id="ex">Exportar Excel</button><button class="btn" id="nv">Novo registro</button></div>
      <p class="tag">Toque em um registro para editar ou excluir. Mostra até 200 registros; a exportação traz todos do período.</p>`;
    let t;
    $('hq').oninput = () => { clearTimeout(t); t = setTimeout(() => { view.q = val('hq').trim(); lista(); }, 300); };
    $('hp').onchange = () => { view.per = val('hp'); lista(); };
    if ($('hs')) $('hs').onchange = () => { view.sec = val('hs'); titulo('Histórico · ' + (isCF ? 'Central de Fluidos' : o.nome), subtitulo(D, view.sec)); lista(); };
    $('nv').onclick = () => { if (isCF) cfD = null; const sc = view.sec || undefined; go(isCF ? { v: 'cf', dep: D, secao: sc } : { v: 'oil', id: o.id, dep: D, secao: sc }); };
    $('ex').onclick = () => baixar(`/api/exportar/${isCF ? 'cf' : 'mi'}.csv?` + histQuery(), `${isCF ? 'central-de-fluidos' : 'oleo-' + o.id}-${D}-${CFG.hoje}.csv`);
  }
  await lista();
  async function lista() {
    const box = $('hres'); if (!box) return;
    let d;
    try { d = await api(`/api/${isCF ? 'cf' : 'mi'}?` + histQuery()); }
    catch (e) { box.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    const t = d.totais;
    const sum = `<div class="kpis"><div><small>Registros</small><b>${t.n.toLocaleString('pt-BR')}</b></div>${isCF ? '' : `<div><small>Reposição</small><b>${fmt(t.litros, 0)} L</b></div>`}<div><small>Custo</small><b>${brl(t.custo)}</b></div></div>`;
    if (!d.registros.length) { box.innerHTML = sum + '<div class="empty">Nenhum registro neste período.</div>'; return; }
    const nS = (r) => SECOES[r.secao] || '—';
    const cab0 = isCF ? ['Data', 'Turno', 'pH', 'Conc.', 'Produto', 'Consumo', 'Custo', 'Responsável', 'Obs.'] : ['Data', 'CT', ...(o.conc ? ['Conc.'] : []), ...(o.ph ? ['pH'] : []), 'Reposição', 'Turno', 'Custo', 'Responsável'];
    const cab = ms ? [cab0[0], 'Usinagem', ...cab0.slice(1)] : cab0;
    const lin0 = (r) => isCF
      ? [br(r.data), r.turno || '—', fmt(r.ph, 1), fmt(r.concentracao, 1) + '%', r.descricao, fmt(r.consumo, 0) + ' ' + (PROD[r.produto]?.un || ''), r.preco > 0 ? brl(r.consumo * r.preco) : '—', r.responsavel, r.observacoes]
      : [br(r.data), r.ct, ...(o.conc ? [r.concentracao != null ? fmt(r.concentracao, 1) + '%' : '—'] : []), ...(o.ph ? [r.ph != null ? fmt(r.ph, 1) : '—'] : []), fmt(r.reposicao, 0) + ' L', r.turno || '—', r.preco > 0 ? brl(r.reposicao * r.preco) : '—', r.responsavel];
    const lin = (r) => { const l = lin0(r); return ms ? [l[0], nS(r), ...l.slice(1)] : l; };
    const tab = `<div class="card tabela"><table><thead><tr>${cab.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${d.registros.map((r) => `<tr data-id="${r.id}" tabindex="0">${lin(r).map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    const itens = `<div class="card lista regs">${d.registros.map((r) => isCF
      ? `<button class="item" data-id="${r.id}"><div class="h"><span>${br(r.data)}${r.turno ? ' · ' + esc(r.turno) : ''}</span><span>${esc(r.descricao)} ${fmt(r.consumo, 0)}</span></div><div class="v">${ms ? `<span><b>${esc(nS(r))}</b></span>` : ''}<span>pH <b>${fmt(r.ph, 1)}</b></span><span>Conc. <b>${fmt(r.concentracao, 1)}%</b></span><span>${esc(r.responsavel)}</span>${r.observacoes ? `<span>“${esc(r.observacoes)}”</span>` : ''}</div></button>`
      : `<button class="item" data-id="${r.id}"><div class="h"><span>${br(r.data)} · CT ${esc(r.ct)}</span><span>${fmt(r.reposicao, 0)} L</span></div><div class="v">${ms ? `<span><b>${esc(nS(r))}</b></span>` : ''}${r.concentracao != null ? `<span>Conc. <b>${fmt(r.concentracao, 1)}%</b></span>` : ''}${r.ph != null ? `<span>pH <b>${fmt(r.ph, 1)}</b></span>` : ''}<span>${esc(r.turno || 'sem turno')}</span><span>${esc(r.responsavel)}</span></div></button>`).join('')}</div>`;
    box.innerHTML = sum + tab + itens;
    const abre = (id) => { const r = d.registros.find((x) => x.id === +id); isCF ? editaCF(r, lista) : editaOleo(o, r, lista); };
    box.querySelectorAll('[data-id]').forEach((b) => { b.onclick = () => abre(b.dataset.id); if (b.tagName === 'TR') b.onkeydown = (e) => { if (e.key === 'Enter') abre(b.dataset.id); }; });
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
  const [lista, maqs] = await Promise.all([cts(r.departamento).then((l) => l.filter((c) => c.tipo === o.tipo && (!r.secao || c.departamento === r.secao))), maquinas(r.departamento).catch(() => [])]);
  folha('Editar registro', `<p class="hint" style="margin-top:0">Lançado por ${esc(r.responsavel)}${r.alterado_em ? ' · já editado' : ''}</p>` + oilCampos(o, lista, r, maqs) + rodapeEdicao, () => {
    live(oilRegras(o), 'sv', oilCusto(lista, r, maqs));
    $('sv').onclick = () => salvaFolha(async () => {
      await api('/api/mi/' + r.id, { method: 'PUT', body: { ...oilLe(o), turno: val('o-tur') } });
      layer.innerHTML = ''; recarrega(); toast('Registro atualizado');
    });
    $('dl').onclick = () => confirmaExclusao(`${br(r.data)} · CT ${esc(r.ct)} · ${fmt(r.reposicao, 0)} L`, '/api/mi/' + r.id, recarrega);
  });
}
function editaCF(r, recarrega) {
  const dk = r.departamento;
  const descs = (p) => (p ? PROD[p][dk].concat(p === r.produto && !PROD[p][dk].includes(r.descricao) ? [r.descricao] : []) : []);
  folha('Editar registro da Central', `<p class="hint" style="margin-top:0">Lançado por ${esc(r.responsavel)}${r.alterado_em ? ' · já editado' : ''}</p>
    ${campoSecao('e-sec', dk, r.secao)}<div class="grid2">${field('e-data', 'Data', tData('e-data', r.data))}${field('e-tur', 'Turno', sel('e-tur', TURNOS, r.turno))}${field('e-ph', 'pH', tNum('e-ph', r.ph), 1, CF_PH.join(' a '))}${field('e-conc', 'Concentração', tNum('e-conc', r.concentracao, '%'), 1, CF_CONC.join(' a ') + '%')}</div>
    ${field('e-prod', 'Produto', seg('e-prod', Object.keys(PROD).map((p) => [p, p.replace(/ \(.*\)$/, '')]), r.produto))}<div id="e-desc-box">${field('e-desc', 'Qual?', seg('e-desc', descs(r.produto), r.descricao))}</div>
    ${field('e-cons', 'Consumo', tNum('e-cons', r.consumo, PROD[r.produto]?.un || ''))}${field('e-obs', 'Observações', `<textarea id="e-obs" maxlength="1000">${esc(r.observacoes)}</textarea>`, 0)}` + rodapeEdicao, () => {
    const regras = [...(multiSecao(dk) ? [['e-sec', R.req('A usinagem')]] : []), ['e-data', R.data], ['e-tur', R.req('O turno')], ['e-ph', R.faixa('O pH', CF_PH)], ['e-conc', R.faixa('A concentração', CF_CONC)], ['e-prod', R.req('O produto')], ['e-desc', R.req('A descrição')], ['e-cons', R.pos('O consumo')]];
    const run = live(regras, 'sv');
    $('e-prod').addEventListener('change', () => {
      const ds = descs(val('e-prod'));
      $('e-desc-box').innerHTML = field('e-desc', 'Qual?', seg('e-desc', ds, ds.length === 1 ? ds[0] : ''));
      $('e-desc').addEventListener('change', run);
      run();
    });
    $('sv').onclick = () => salvaFolha(async () => {
      await api('/api/cf/' + r.id, { method: 'PUT', body: { secao: val('e-sec') || undefined, data: val('e-data'), turno: val('e-tur'), ph: val('e-ph'), concentracao: val('e-conc'), produto: val('e-prod'), descricao: val('e-desc'), consumo: val('e-cons'), observacoes: val('e-obs') } });
      layer.innerHTML = ''; recarrega(); toast('Registro atualizado');
    });
    $('dl').onclick = () => confirmaExclusao(`${br(r.data)} · ${esc(r.descricao)} · ${fmt(r.consumo, 0)}`, '/api/cf/' + r.id, recarrega);
  });
}

// ---------- admin ----------
async function vAdmin() {
  if (!isAdmin()) { titulo('Admin'); app.innerHTML = '<div class="empty">Só o admin tem acesso a esta área.</div>'; return; }
  const tab = view.tab || 'us', dep = view.dep || ME.dep;
  titulo('Admin', tab === 'us' || tab === 'hi' ? 'Cadastros' : DEP[dep].nome);
  app.innerHTML = `<div class="tabs">${[['us', 'Usuários'], ['ct', 'Centros de trabalho'], ['pr', 'Preços da Central'], ['mq', 'Máquinas'], ['hi', 'Importar histórico']].map(([k, l]) => `<button data-t="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    ${tab === 'us' || tab === 'hi' ? '' : field('a-dep', 'Departamento', seg('a-dep', Object.entries(DEP).map(([k, d]) => [k, d.nome]), dep), 0)}<div id="adm"><div class="load">Carregando…</div></div>`;
  app.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => { view.tab = b.dataset.t; vAdmin(); }));
  if ($('a-dep')) $('a-dep').onchange = () => { view.dep = val('a-dep') || ME.dep; vAdmin(); };
  const box = $('adm');
  if (tab === 'us') return admUsuarios(box);
  if (tab === 'ct') return admCTs(box, dep);
  if (tab === 'pr') return admPrecos(box, dep);
  if (tab === 'hi') return admHistorico(box);
  return admMaquinas(box, dep);
}
async function admUsuarios(box) {
  const lista = await api('/api/admin/usuarios');
  const ativos = lista.filter((u) => u.ativo), inativos = lista.filter((u) => !u.ativo);
  const item = (u) => `<button class="item" data-id="${u.id}"><div class="h"><span>${esc(u.nome)}${u.admin ? ' <span class="badge">admin</span>' : ''}</span><span class="hint">${esc(u.login)}</span></div><div class="v"><span>${esc(DEP[u.departamento]?.nome || u.departamento)}</span><span>${esc(u.turno)}</span>${u.trocar_senha ? '<span>senha provisória</span>' : ''}</div></button>`;
  box.innerHTML = `<button class="btn" id="u-novo" style="width:100%;margin-top:14px">Novo usuário</button>
    <h3>Usuários (${ativos.length})</h3><div class="regs-lista">${ativos.map(item).join('') || '<div class="empty">Nenhum usuário.</div>'}</div>
    ${inativos.length ? `<h3>Desativados (${inativos.length})</h3><div class="regs-lista">${inativos.map(item).join('')}</div>` : ''}`;
  const recarrega = () => admUsuarios(box);
  const abre = (u) => folha(u ? 'Editar usuário' : 'Novo usuário', `
    ${field('u-nome', 'Nome', `<input id="u-nome" maxlength="80" value="${esc(u?.nome)}">`)}
    ${u ? `<p class="hint" style="margin:-6px 0 14px">Usuário para entrar: <b>${esc(u.login)}</b></p>` : field('u-login', 'Usuário para entrar', '<input id="u-login" maxlength="60" autocapitalize="none" spellcheck="false" placeholder="ex.: joao.silva">', 1, 'sem espaços')}
    ${field('u-dep', 'Departamento', seg('u-dep', Object.entries(DEP).map(([k, d]) => [k, d.nome]), u?.departamento))}
    ${field('u-tur', 'Turno', seg('u-tur', TURNOS, u?.turno))}
    ${field('u-adm', 'Acesso', seg('u-adm', [['0', 'Operador'], ['1', 'Admin']], u?.admin ? '1' : '0'))}
    ${u ? '' : field('u-senha', 'Senha provisória', '<input id="u-senha" autocomplete="off">', 1, 'a pessoa troca no primeiro acesso')}
    <div class="msg" id="sh-msg"></div><div class="row"><button class="btn" id="sv">Salvar</button></div>
    ${u ? `<div class="card pad mt2"><h3 style="margin-top:0">Redefinir senha</h3><p class="hint" style="margin-top:-6px">Para quando a pessoa esquecer. Ela troca no próximo acesso.</p>${field('u-reset', 'Nova senha provisória', '<input id="u-reset" autocomplete="off">', 0)}<button class="btn ghost" id="u-rs" style="width:100%">Redefinir senha</button></div>
      <div class="row mt2"><button class="btn ghost" id="u-at" style="color:${u.ativo ? 'var(--red)' : 'var(--blueD)'}">${u.ativo ? 'Desativar acesso' : 'Reativar acesso'}</button></div>` : ''}`, () => {
    const regras = [['u-nome', R.req('O nome')], ['u-dep', R.req('O departamento')], ['u-tur', R.req('O turno')], ...(u ? [] : [['u-login', (v) => (!/^[a-zA-Z0-9._-]{2,60}$/.test(v.trim()) ? 'Use de 2 a 60 letras, números, ponto, hífen ou sublinhado, sem espaços.' : lista.some((x) => x.login.toLowerCase() === v.trim().toLowerCase()) ? 'Já existe um usuário com esse login.' : '')], ['u-senha', (v) => (v.length < 4 ? 'A senha precisa ter pelo menos 4 caracteres.' : '')]])];
    live(regras, 'sv');
    const corpoU = (extra = {}) => ({ nome: val('u-nome'), departamento: val('u-dep'), turno: val('u-tur'), admin: val('u-adm') === '1', ...extra });
    $('sv').onclick = () => salvaFolha(async () => {
      if (u) await api('/api/admin/usuarios/' + u.id, { method: 'PUT', body: corpoU({ ativo: u.ativo }) });
      else await api('/api/admin/usuarios', { method: 'POST', body: corpoU({ login: val('u-login').trim(), senha: val('u-senha') }) });
      if (u && u.id === ME.id) { Object.assign(ME, { nome: val('u-nome'), dep: val('u-dep'), turno: val('u-tur') }); limpaCache(); }
      layer.innerHTML = ''; recarrega(); toast(u ? 'Usuário atualizado' : 'Usuário criado');
    });
    if (u) {
      $('u-rs').onclick = () => ocupado('u-rs', 'Redefinindo…', async () => {
        if (val('u-reset').length < 4) throw new Error('A senha precisa ter pelo menos 4 caracteres.');
        await api(`/api/admin/usuarios/${u.id}/senha`, { method: 'POST', body: { senha: val('u-reset') } });
        layer.innerHTML = ''; recarrega(); toast(`Senha de ${u.nome} redefinida`);
      });
      $('u-at').onclick = () => ocupado('u-at', 'Salvando…', async () => {
        await api('/api/admin/usuarios/' + u.id, { method: 'PUT', body: { nome: u.nome, departamento: u.departamento, turno: u.turno, admin: u.admin, ativo: !u.ativo } });
        layer.innerHTML = ''; recarrega(); toast(u.ativo ? 'Acesso desativado' : 'Acesso reativado');
      });
    }
  });
  $('u-novo').onclick = () => abre(null);
  box.querySelectorAll('[data-id]').forEach((b) => (b.onclick = () => abre(lista.find((x) => x.id === +b.dataset.id))));
}
async function admCTs(box, dep) {
  const lista = await cts(dep, true);
  const tipos = OLEOS.filter((o) => o.deps.includes(dep)).map((o) => [o.tipo, o.nome]);
  box.innerHTML = `<h3>Adicionar centro de trabalho</h3>${field('n-ct', 'CT', '<input id="n-ct" inputmode="numeric" autocomplete="off" maxlength="30">')}
    <div class="grid2">${field('n-sec', 'Seção', sel('n-sec', DEP[dep].secoes.map((s) => [s, nomeSecao(s)]), DEP[dep].secoes[0]))}${field('n-tipo', 'Óleo', sel('n-tipo', tipos))}</div>
    ${field('n-pr', 'Preço do óleo (R$/L)', tNum('n-pr', ''))}<button class="btn" id="n-add" style="width:100%">Adicionar</button>
    <h3>CTs cadastrados</h3>
    ${lista.length ? `<div class="scroll"><table class="stack"><thead><tr><th>CT</th><th>Óleo</th><th>Seção</th><th class="n">R$/L</th><th></th></tr></thead><tbody>${lista.map((c) => `<tr><td>${esc(c.ct)}</td><td>${esc(OLEOS.find((o) => o.tipo === c.tipo)?.nome || c.tipo)}</td><td>${esc(nomeSecao(c.departamento))}</td><td class="n"><input data-ct="${esc(c.ct)}" data-tipo="${esc(c.tipo)}" data-v="${c.preco}" inputmode="decimal" value="${fmt(c.preco)}" aria-label="Preço do CT ${esc(c.ct)}"></td><td class="n"><button class="x" data-del="${esc(c.ct)}" data-tipo="${esc(c.tipo)}" aria-label="Remover CT ${esc(c.ct)}">✕</button></td></tr>`).join('')}</tbody></table></div>
      <button class="btn" id="sp" style="width:100%;margin-top:12px">Salvar preços</button>` : '<div class="empty">Nenhum CT cadastrado neste departamento.</div>'}
    <h3>Importar vários CTs</h3>
    <p class="hint" style="font-size:14px;margin-top:-4px">Escolha o CSV exportado da lista do SharePoint, ou cole linhas do Excel com as colunas <b>CT; óleo; seção; preço</b>. CT que já existe é atualizado; preço vazio mantém o atual. Vale para todos os departamentos.</p>
    ${field('imp-f', 'Arquivo CSV', '<input id="imp-f" type="file" accept=".csv,.txt,text/csv">', 0)}
    ${field('imp', 'Ou cole as linhas', '<textarea id="imp" rows="5" placeholder="01060061;Ecocool_2001;Usinagem_de_Eixos;37,70"></textarea>', 0)}
    <button class="btn ghost" id="imp-b" style="width:100%">Importar</button><div id="imp-r"></div>`;
  $('imp-f').onchange = async () => { const f = $('imp-f').files[0]; if (f) $('imp').value = await f.text(); };
  live([['n-ct', (v) => (!v.trim() ? 'Informe o CT.' : lista.some((c) => c.ct === v.trim() && c.tipo === val('n-tipo')) ? 'Esse CT já está cadastrado para esse óleo.' : '')], ['n-sec', R.req('A seção')], ['n-tipo', R.req('O óleo')], ['n-pr', R.pos('O preço')]], 'n-add');
  const recarrega = () => { delete cache['cts' + dep]; admCTs(box, dep); };
  $('n-add').onclick = () => ocupado('n-add', 'Adicionando…', async () => {
    await api('/api/admin/cts', { method: 'POST', body: { ct: val('n-ct').trim(), departamento: val('n-sec'), tipo: val('n-tipo'), preco: num(val('n-pr')) } });
    recarrega(); toast('CT adicionado');
  });
  if ($('sp')) $('sp').onclick = () => ocupado('sp', 'Salvando…', async () => {
    const mud = [];
    box.querySelectorAll('[data-ct]').forEach((i) => { const x = num(i.value); if (!isFinite(x) || x < 0) throw new Error(`Preço inválido no CT ${i.dataset.ct}.`); if (x !== +i.dataset.v) mud.push({ ct: i.dataset.ct, tipo: i.dataset.tipo, preco: x }); });
    if (!mud.length) { toast('Nenhuma alteração'); $('sp').disabled = false; $('sp').textContent = 'Salvar preços'; return; }
    await api('/api/admin/cts', { method: 'PUT', body: { precos: mud } });
    recarrega(); toast(`${mud.length} preço(s) atualizado(s)`);
  });
  box.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => folha('Remover CT ' + b.dataset.del + '?', '<p>Os registros já feitos com esse CT continuam no histórico. Ele só deixa de aparecer para novos registros.</p><div class="row"><button class="btn ghost" data-close>Cancelar</button><button class="btn dang" id="rm">Remover</button></div>', () => {
    $('rm').onclick = () => ocupado('rm', 'Removendo…', async () => { await api('/api/admin/cts/' + encodeURIComponent(b.dataset.del) + '/' + encodeURIComponent(b.dataset.tipo), { method: 'DELETE' }); layer.innerHTML = ''; recarrega(); toast('CT removido'); });
  })));
  $('imp-b').onclick = () => ocupado('imp-b', 'Importando…', async () => {
    const r = await api('/api/admin/cts/importar', { method: 'POST', body: { linhas: val('imp') } });
    for (const k of Object.keys(DEP)) delete cache['cts' + k];
    const msg = `${r.gravados} CT(s) gravado(s)${r.repetidos ? `, ${r.repetidos} linha(s) repetida(s) ignorada(s)` : ''}.` + (r.erros.length ? '\nNão importadas:\n' + r.erros.map((e) => `Linha ${e.linha}: ${e.msg}`).join('\n') : '');
    if (!r.erros.length) { admCTs(box, dep).then(() => toast(msg)); return; }
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
    ${lista.length ? `<div class="list">${lista.map((m) => `<button class="item" data-id="${m.id}"><div class="h"><span>${esc(m.maquina || '—')}</span><span>CT ${esc(m.ct || '—')}</span></div><div class="v"><span>${esc(m.secao)}</span><span>${esc(m.oleo)}</span>${m.volume != null ? `<span><b>${fmt(m.volume, 0)} L</b></span>` : ''}${m.concentracao ? `<span>Conc. ${esc(m.concentracao)}%</span>` : ''}${m.ph ? `<span>pH ${esc(m.ph)}</span>` : ''}${m.fator != null ? `<span>Fator ${fmt(m.fator, 2)}</span>` : ''}</div></button>`).join('')}</div>` : '<div class="empty">Nenhuma máquina cadastrada neste departamento.</div>'}`;
  const recarrega = () => admMaquinas(box, dep);
  const abre = (m) => folha(m ? 'Editar máquina' : 'Nova máquina', `
    ${field('m-maq', 'Máquina', `<input id="m-maq" maxlength="80" value="${esc(m?.maquina)}">`)}
    <div class="grid2">${field('m-ct', 'CT', `<input id="m-ct" maxlength="30" value="${esc(m?.ct)}">`, 0)}${field('m-sec', 'Seção', `<input id="m-sec" maxlength="60" value="${esc(m?.secao)}">`, 0)}</div>
    ${field('m-oleo', 'Óleo', `<input id="m-oleo" maxlength="60" list="m-oleos" value="${esc(m?.oleo)}"><datalist id="m-oleos">${OLEOS.map((o) => `<option value="${esc(o.nome)}">`).join('')}</datalist>`, 0)}
    <div class="grid2">${field('m-vol', 'Volume (L)', tNum('m-vol', m?.volume), 0)}${field('m-conc', 'Faixa de concentração (%)', `<input id="m-conc" maxlength="30" placeholder="ex.: 6,0 - 8,0" value="${esc(m?.concentracao)}">`, 0)}
    ${field('m-cref', 'Conc. de referência (%)', tNum('m-cref', m?.conc_ref), 0, 'para o volume de montagem')}${field('m-ph', 'Faixa de pH', `<input id="m-ph" maxlength="30" placeholder="ex.: 8,9 - 9,5" value="${esc(m?.ph)}">`, 0)}
    ${field('m-fat', 'Fator de refração', tNum('m-fat', m?.fator), 0)}</div>
    <div class="msg" id="sh-msg"></div><div class="row"><button class="btn" id="sv">Salvar</button></div>${m ? '<div class="row mt"><button class="btn ghost" id="dl" style="color:var(--red)">Remover máquina</button></div>' : ''}`, () => {
    const opc = (n) => (v) => (v === '' ? '' : R.pos(n)(v));
    live([['m-maq', R.req('O nome da máquina')], ['m-vol', opc('O volume')], ['m-cref', opc('A concentração')], ['m-fat', opc('O fator')]], 'sv');
    $('sv').onclick = () => salvaFolha(async () => {
      const body = { departamento: dep, maquina: val('m-maq'), ct: val('m-ct'), secao: val('m-sec'), oleo: val('m-oleo'), volume: val('m-vol') === '' ? null : num(val('m-vol')), concentracao: val('m-conc'), conc_ref: val('m-cref') === '' ? null : num(val('m-cref')), ph: val('m-ph'), fator: val('m-fat') === '' ? null : num(val('m-fat')) };
      await api('/api/admin/maquinas' + (m ? '/' + m.id : ''), { method: m ? 'PUT' : 'POST', body });
      delete cache['mq' + dep]; layer.innerHTML = ''; recarrega(); toast(m ? 'Máquina atualizada' : 'Máquina adicionada');
    });
    if (m) $('dl').onclick = () => ocupado('dl', 'Removendo…', async () => { await api('/api/admin/maquinas/' + m.id, { method: 'DELETE' }); delete cache['mq' + dep]; layer.innerHTML = ''; recarrega(); toast('Máquina removida'); });
  });
  $('mq-n').onclick = () => abre(null);
  box.querySelectorAll('.item').forEach((b) => (b.onclick = () => abre(lista.find((x) => x.id === +b.dataset.id))));
}

// ---------- importar histórico (CSV das listas do SharePoint) ----------
function lerCSV(txt) {
  txt = txt.replace(/^﻿/, '');
  const prim = txt.slice(0, txt.indexOf('\n') + 1 || undefined);
  const sep = [';', ',', '\t'].reduce((a, b) => (prim.split(b).length > prim.split(a).length ? b : a));
  const linhas = []; let lin = [], cel = '', q = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (q) { if (c === '"' && txt[i + 1] === '"') { cel += '"'; i++; } else if (c === '"') q = false; else cel += c; }
    else if (c === '"') q = true;
    else if (c === sep) { lin.push(cel); cel = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && txt[i + 1] === '\n') i++; lin.push(cel); linhas.push(lin); lin = []; cel = ''; }
    else cel += c;
  }
  if (cel || lin.length) { lin.push(cel); linhas.push(lin); }
  return linhas.filter((l) => l.some((c) => c.trim()));
}
const chave = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const dataISO = (s) => { s = String(s).trim(); let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; m = s.match(/^\d{4}-\d{2}-\d{2}/); return m ? m[0] : ''; };
const horaISO = (s) => { const d = dataISO(s), m = String(s).match(/(\d{1,2}):(\d{2})/); if (!d || !m) return ''; const t = new Date(`${d}T${m[1].padStart(2, '0')}:${m[2]}:00-03:00`); return isNaN(t) ? '' : t.toISOString(); };
const turnoDe = (s) => { const k = chave(s), d = k.match(/^(\d)/); return d ? `${d[1]}° Turno` : k.includes('normal') ? 'Turno Normal' : ''; };
const depDe = (s) => (/fundid/i.test(s) ? 'Fundidos' : /eixo/i.test(s) ? 'Eixos' : '');
const oleoDe = (s) => OLEOS.find((o) => [o.id, o.tipo, o.nome].some((x) => chave(x) === chave(s)))?.id;
const nOuVazio = (s) => (String(s ?? '').trim() === '' ? null : num(s));
function mapearHistorico(linhas) {
  const cab = linhas[0].map(chave), col = (...n) => cab.findIndex((c) => n.includes(c));
  const g = (l, i) => (i >= 0 ? (l[i] ?? '').trim() : '');
  const C = { id: col('id'), data: col('data'), turno: col('periodo', 'turno'), ph: col('ph'), dep: col('departamento'), resp: col('responsavel'), hora: col('hora') };
  const avisos = { semDep: 0, ignoradas: [] };
  if (cab.includes('descproduto')) {
    Object.assign(C, { conc: col('concentracao'), obs: col('observacoes'), prod: col('produto'), desc: col('descproduto'), cons: col('consumo'), custo: col('custo') });
    const regs = linhas.slice(1).map((l, i) => {
      let dep = depDe(g(l, C.dep)); if (!dep) { dep = 'Eixos'; avisos.semDep++; }
      return { origem: 'sp-cf:' + (g(l, C.id) || i + 2), departamento: dep, data: dataISO(g(l, C.data)), turno: turnoDe(g(l, C.turno)), ph: nOuVazio(g(l, C.ph)), concentracao: nOuVazio(g(l, C.conc)),
        produto: g(l, C.prod), descricao: g(l, C.desc).replace(/^TechWoven$/i, 'Tech-Woven'), consumo: nOuVazio(g(l, C.cons)), preco: nOuVazio(g(l, C.custo)),
        observacoes: g(l, C.obs), responsavel: g(l, C.resp), criado_em: horaISO(g(l, C.hora)) };
    });
    return { tipo: 'cf', nome: 'Central de Fluidos', regs, avisos };
  }
  if (cab.includes('ct') && cab.includes('tipo')) {
    Object.assign(C, { ct: col('ct'), conc: col('concentracao'), rep: col('reposicaooleo', 'reposicao'), custo: col('custoproduto', 'custo'), tipo: col('tipo') });
    const regs = [];
    linhas.slice(1).forEach((l, i) => {
      const tipo = oleoDe(g(l, C.tipo));
      if (!tipo) return avisos.ignoradas.push(`linha ${i + 2}: óleo "${g(l, C.tipo)}" desconhecido`);
      let dep = depDe(g(l, C.dep)); if (!dep) { dep = 'Eixos'; avisos.semDep++; }
      regs.push({ origem: 'sp-mi:' + (g(l, C.id) || i + 2), tipo, departamento: dep, data: dataISO(g(l, C.data)), ct: g(l, C.ct), concentracao: nOuVazio(g(l, C.conc)), ph: nOuVazio(g(l, C.ph)),
        reposicao: nOuVazio(g(l, C.rep)), preco: nOuVazio(g(l, C.custo)), turno: turnoDe(g(l, C.turno)), responsavel: g(l, C.resp), criado_em: horaISO(g(l, C.hora)) });
    });
    return { tipo: 'mi', nome: 'Máquinas individuais', regs, avisos };
  }
  return null;
}
function admHistorico(box) {
  box.innerHTML = `<h3>Importar histórico do SharePoint</h3>
    <p class="hint" style="font-size:14px;margin-top:-4px">Escolha os CSV exportados das listas <b>Relatório óleo Central de Fluidos</b> e <b>Relatório óleo Máquinas Individuais</b> (um ou os dois). O tipo de cada arquivo é reconhecido pelas colunas. Pode importar de novo um arquivo mais recente: o que já foi importado é ignorado.</p>
    ${field('h-f', 'Arquivos CSV', '<input id="h-f" type="file" accept=".csv,text/csv" multiple>', 0)}
    <div id="h-prev"></div><button class="btn" id="h-go" style="width:100%" disabled>Importar</button><div id="h-res"></div>`;
  let lotes = [];
  $('h-f').onchange = async () => {
    lotes = []; $('h-res').innerHTML = '';
    const out = [];
    for (const f of $('h-f').files) {
      const m = mapearHistorico(lerCSV(await f.text()));
      if (!m) { out.push(`<li><b>${esc(f.name)}</b>: colunas não reconhecidas.</li>`); continue; }
      lotes.push(m);
      const datas = m.regs.map((r) => r.data).filter(Boolean).sort();
      out.push(`<li><b>${esc(m.nome)}</b> (${esc(f.name)}): ${m.regs.length.toLocaleString('pt-BR')} registros${datas.length ? `, de ${br(datas[0])} a ${br(datas.at(-1))}` : ''}${m.avisos.semDep ? `; ${m.avisos.semDep} sem departamento (vão como Eixos)` : ''}${m.avisos.ignoradas.length ? `; ${m.avisos.ignoradas.length} ignorados` : ''}.</li>`);
    }
    $('h-prev').innerHTML = out.length ? `<ul style="padding-left:20px">${out.join('')}</ul>` : '';
    $('h-go').disabled = !lotes.length;
  };
  $('h-go').onclick = () => ocupado('h-go', 'Importando…', async () => {
    const res = [];
    for (const m of lotes) {
      let novos = 0, existentes = 0; const erros = [];
      for (let i = 0; i < m.regs.length; i += 200) {
        $('h-go').textContent = `${m.nome}: ${Math.min(i + 200, m.regs.length).toLocaleString('pt-BR')} de ${m.regs.length.toLocaleString('pt-BR')}…`;
        const r = await api('/api/admin/importar/' + m.tipo, { method: 'POST', body: { registros: m.regs.slice(i, i + 200) } });
        novos += r.novos; existentes += r.existentes; erros.push(...r.erros);
      }
      res.push(`${m.nome}: ${novos.toLocaleString('pt-BR')} novos, ${existentes.toLocaleString('pt-BR')} já existiam${erros.length ? `, ${erros.length} com erro:\n` + erros.slice(0, 30).map((e) => `  ${e.origem}: ${e.msg}`).join('\n') : ''}${m.avisos.ignoradas.length ? '\n  ' + m.avisos.ignoradas.slice(0, 20).join('\n  ') : ''}`);
    }
    $('h-res').innerHTML = `<pre class="res">${esc(res.join('\n\n'))}</pre>`;
    $('h-go').textContent = 'Importar'; $('h-go').disabled = false;
    toast('Importação concluída');
  });
}

// ---------- informações ----------
async function vInfo() {
  titulo('Informações', 'Máquinas e fluidos');
  const f = view.f ?? ME.dep;
  const q = (view.iq || '').toLowerCase();
  const rows = (await api('/api/maquinas' + (f ? '?dep=' + f : ''))).filter((m) => !q || [m.ct, m.maquina, m.secao, m.oleo].join(' ').toLowerCase().includes(q));
  app.innerHTML = `${field('i-dep', 'Departamento', `<select id="i-dep"><option value="">Todos</option>${Object.entries(DEP).map(([k, d]) => `<option value="${k}"${k === f ? ' selected' : ''}>${d.nome}</option>`).join('')}</select>`, 0)}
    ${field('i-q', 'Buscar CT, máquina ou óleo', `<input id="i-q" autocomplete="off" value="${esc(view.iq || '')}">`, 0)}
    ${rows.length ? `<div class="card scroll" style="padding:4px 8px"><table class="stack"><thead><tr><th>CT</th><th>Máquina</th><th>Seção</th><th>Produto</th><th class="n">Volume</th><th>Conc. (%)</th><th>pH</th><th class="n">Fator</th><th class="n">Vol. p/ montagem</th></tr></thead><tbody>${rows.map((m) => `<tr><td>${esc(m.ct)}</td><td>${esc(m.maquina)}</td><td class="nw">${esc(m.secao)}</td><td>${esc(m.oleo)}</td><td class="n">${m.volume != null ? fmt(m.volume, 0) + ' L' : ''}</td><td class="nw">${esc(m.concentracao)}</td><td class="nw">${esc(m.ph)}</td><td class="n">${m.fator != null ? fmt(m.fator, 2) : ''}</td><td class="n">${m.volume != null && m.conc_ref != null ? fmt(m.volume * m.conc_ref / 100, 1) + ' L' : ''}</td></tr>`).join('')}</tbody></table></div>` : `<div class="empty">${q ? 'Nada encontrado.' : 'Nenhuma máquina cadastrada. O admin cadastra em Admin › Máquinas.'}</div>`}
    <p class="tag">Volume p/ montagem = volume × concentração de referência ÷ 100.</p>`;
  $('i-dep').onchange = () => { view.f = val('i-dep'); vInfo(); };
  let t; $('i-q').oninput = () => { clearTimeout(t); t = setTimeout(() => { view.iq = val('i-q'); const p = $('i-q').selectionStart; vInfo().then(() => { $('i-q').focus(); $('i-q').setSelectionRange(p, p); }); }, 250); };
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
  document.querySelector('.toast:not(.novo)')?.remove(); clearTimeout(tt);
  const t = document.createElement('div'); t.className = 'toast' + (ruim ? ' bad' : ''); t.setAttribute('role', 'status');
  t.innerHTML = `<span>${esc(msg)}</span>${desfazer ? '<button>Desfazer</button>' : ''}`;
  document.body.appendChild(t);
  if (desfazer) t.querySelector('button').onclick = () => { t.remove(); desfazer(); };
  tt = setTimeout(() => t.remove(), desfazer ? 7000 : ruim ? 5000 : 2600);
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') layer.innerHTML = ''; });

// ---------- partida ----------
(async () => {
  try { const r = await fetch('/api/config'); confereVersao(r); CFG = await r.json(); } catch {}
  if (!store.get('cd-token')) return vLogin();
  try { ME = deUsuario(await api('/api/me')); }
  catch (e) { if (store.get('cd-token')) { app.innerHTML = `<div class="empty">${esc(e.message)}</div><div class="row mt"><button class="btn ghost" onclick="location.reload()">Tentar de novo</button></div>`; } return; }
  render();
})();
