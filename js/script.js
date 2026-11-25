/* RaffleApp — sorteios com participantes, animação e histórico */

const $ = (s) => document.querySelector(s);
const escapar = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const banco = {
  ler(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  salvar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem storage */ } }
};
const reduzMovimento = matchMedia('(prefers-reduced-motion: reduce)').matches;

let participantes = banco.ler('raffle_participantes', ['Ana', 'Bruno', 'Carla', 'Diego', 'Eduarda', 'Felipe', 'Gabriela', 'Henrique']);
let historico = banco.ler('raffle_historico', []);
let qtdGanhadores = 1;
let sorteando = false;
let ultimoResultado = '';

// Número aleatório criptograficamente seguro e sem viés
function aleatorio(max) {
  const lim = Math.floor(0x100000000 / max) * max; const b = new Uint32Array(1);
  do crypto.getRandomValues(b); while (b[0] >= lim);
  return b[0] % max;
}

/* ---------- Participantes ---------- */
const normal = (n) => n.trim().toLocaleLowerCase('pt-BR');
function adicionar(nomes) {
  let novos = 0, repetidos = 0;
  nomes.map((n) => n.trim().replace(/\s+/g, ' ')).filter(Boolean).forEach((n) => {
    if (participantes.some((p) => normal(p) === normal(n))) repetidos++;
    else { participantes.push(n.slice(0, 60)); novos++; }
  });
  $('#aviso-part').textContent = repetidos ? `${repetidos} nome(s) repetido(s) ignorado(s).` : '';
  salvarERender();
  return novos;
}
function salvarERender() { banco.salvar('raffle_participantes', participantes); renderParticipantes(); }

function renderParticipantes(destaque = -1) {
  $('#total').textContent = participantes.length;
  $('#pessoas').innerHTML = participantes.length ? participantes.map((p, i) =>
    `<li class="pessoa ${i === destaque ? 'sorteando' : ''}"><span>${escapar(p)}</span><button data-i="${i}" aria-label="Remover ${escapar(p)}">×</button></li>`).join('')
    : '<li class="vazio">Nenhum participante ainda. Adicione nomes acima.</li>';
  qtdGanhadores = Math.max(1, Math.min(qtdGanhadores, participantes.length || 1));
  $('#qtd').textContent = qtdGanhadores;
  $('#sortear').disabled = participantes.length < 2 || sorteando;
  $('#sortear').textContent = participantes.length < 2 ? 'Adicione 2 ou mais pessoas' : 'Sortear';
}

$('#form-add').addEventListener('submit', (e) => {
  e.preventDefault();
  adicionar([$('#nome').value]); $('#nome').value = ''; $('#nome').focus();
});
$('#importar').addEventListener('click', () => {
  const n = adicionar($('#lista-colada').value.split(/[\n,;]+/));
  $('#lista-colada').value = '';
  toast(`${n} participante(s) adicionado(s)`);
});
$('#pessoas').addEventListener('click', (e) => {
  const b = e.target.closest('[data-i]'); if (!b || sorteando) return;
  participantes.splice(Number(b.dataset.i), 1); salvarERender();
});
$('#limpar').addEventListener('click', (e) => {
  const b = e.currentTarget;
  if (!participantes.length || sorteando) return;
  if (!b.dataset.ok) { b.dataset.ok = '1'; b.textContent = 'Confirmar?'; setTimeout(() => { delete b.dataset.ok; b.textContent = 'Limpar lista'; }, 2500); return; }
  delete b.dataset.ok; b.textContent = 'Limpar lista';
  participantes = []; salvarERender();
});
document.querySelector('.stepper').addEventListener('click', (e) => {
  const b = e.target.closest('[data-passo]'); if (!b) return;
  qtdGanhadores = Math.max(1, Math.min(10, participantes.length - 1 || 1, qtdGanhadores + Number(b.dataset.passo)));
  $('#qtd').textContent = qtdGanhadores;
});

/* ---------- Sorteio com animação ---------- */
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function animarAte(nomeFinal) {
  const tela = $('#tela'), alvo = $('#tela-nome');
  tela.classList.remove('vencedor'); tela.classList.add('girando');
  if (!reduzMovimento) {
    // Começa rápido e vai desacelerando, como uma roleta
    const passos = 26;
    for (let k = 0; k < passos; k++) {
      const i = aleatorio(participantes.length);
      alvo.textContent = participantes[i];
      renderParticipantes(i);
      await espera(40 + Math.pow(k / passos, 3) * 380);
    }
  }
  alvo.textContent = nomeFinal;
  tela.classList.remove('girando'); tela.classList.add('vencedor');
  renderParticipantes(participantes.indexOf(nomeFinal));
}

$('#sortear').addEventListener('click', async () => {
  if (sorteando || participantes.length < 2) return;
  sorteando = true; $('#sortear').disabled = true; $('#copiar').hidden = true;
  $('#ganhadores').innerHTML = '';
  const premio = $('#premio').value.trim();
  const remover = $('#remover').checked;
  const qtd = Math.min(qtdGanhadores, participantes.length);
  const ganhadores = [];
  const pool = [...participantes];

  for (let g = 0; g < qtd; g++) {
    const nome = pool.splice(aleatorio(pool.length), 1)[0];
    ganhadores.push(nome);
    await animarAte(nome);
    $('#ganhadores').insertAdjacentHTML('beforeend', `<li>${escapar(nome)}</li>`);
    confete();
    if (g < qtd - 1) await espera(1400);
  }

  historico = [{ ts: Date.now(), premio, ganhadores, total: participantes.length }, ...historico].slice(0, 30);
  banco.salvar('raffle_historico', historico);
  if (remover) participantes = participantes.filter((p) => !ganhadores.includes(p));
  ultimoResultado = `Sorteio${premio ? ` — ${premio}` : ''} (${new Date().toLocaleString('pt-BR')})\n${ganhadores.map((n, i) => `${i + 1}º ${n}`).join('\n')}`;
  sorteando = false;
  salvarERender(); renderHistorico();
  $('#copiar').hidden = false;
});

$('#copiar').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(ultimoResultado); toast('Resultado copiado'); }
  catch { toast('Não foi possível copiar neste navegador'); }
});

/* ---------- Histórico ---------- */
function renderHistorico() {
  $('#historico').innerHTML = historico.length ? historico.map((h) => `
    <li><time>${new Date(h.ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</time>
      <b>${h.ganhadores.map(escapar).join(', ')}</b>
      <span>${h.premio ? `${escapar(h.premio)} · ` : ''}${h.total} participantes</span></li>`).join('')
    : '<li class="vazio">Os sorteios realizados aparecem aqui.</li>';
}
$('#limpar-hist').addEventListener('click', (e) => {
  const b = e.currentTarget;
  if (!historico.length) return;
  if (!b.dataset.ok) { b.dataset.ok = '1'; b.textContent = 'Confirmar?'; setTimeout(() => { delete b.dataset.ok; b.textContent = 'Apagar histórico'; }, 2500); return; }
  delete b.dataset.ok; b.textContent = 'Apagar histórico';
  historico = []; banco.salvar('raffle_historico', historico); renderHistorico();
});

/* ---------- Confete (canvas) ---------- */
const cv = $('#confete'), cx = cv.getContext('2d');
let pedacos = [], animando = false;
function ajustar() { cv.width = innerWidth * devicePixelRatio; cv.height = innerHeight * devicePixelRatio; cx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0); }
const ro = new ResizeObserver(ajustar); ro.observe(document.body);
function confete() {
  if (reduzMovimento) return;
  const cores = ['#e6007e', '#ffd23f', '#00c2a8', '#4f7cff', '#ff7a1a'];
  for (let i = 0; i < 140; i++) {
    pedacos.push({ x: innerWidth / 2, y: innerHeight / 3, vx: (Math.random() - .5) * 16, vy: Math.random() * -14 - 4, g: .35 + Math.random() * .2,
      w: 6 + Math.random() * 6, h: 8 + Math.random() * 8, r: Math.random() * 6, vr: (Math.random() - .5) * .4, cor: cores[i % cores.length], vida: 0 });
  }
  if (!animando) { animando = true; requestAnimationFrame(quadro); }
}
function quadro() {
  cx.clearRect(0, 0, innerWidth, innerHeight);
  pedacos.forEach((p) => {
    p.vy += p.g; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.vida++;
    cx.save(); cx.translate(p.x, p.y); cx.rotate(p.r); cx.fillStyle = p.cor;
    cx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.vida / 6))); cx.restore();
  });
  pedacos = pedacos.filter((p) => p.y < innerHeight + 40 && p.vida < 400);
  if (pedacos.length) requestAnimationFrame(quadro); else { animando = false; cx.clearRect(0, 0, innerWidth, innerHeight); }
}

let timerToast;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(timerToast); timerToast = setTimeout(() => { t.hidden = true; }, 2000); }

renderParticipantes(); renderHistorico();
