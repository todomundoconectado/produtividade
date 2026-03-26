// TMC Dashboard de Produtividade — app.js

// ─── Estado ───────────────────────────────────────────────────────────────────
let allData       = [];
let currentPeriod = 'week';
let currentView   = 'dashboard';
let chart         = null;
let refreshTimer  = null;

// ─── Período ──────────────────────────────────────────────────────────────────
function getPeriodDates(period) {
  const now = new Date();

  let start;
  switch (period) {
    case 'today':
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      break;

    case 'week': {
      const dow  = now.getDay();                       // 0=Dom
      const diff = dow === 0 ? 6 : dow - 1;           // dias desde segunda
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff, 0, 0, 0);
      break;
    }

    case 'month':
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
      break;

    case 'quarter': {
      const q = Math.floor(now.getMonth() / 3);
      start = new Date(now.getFullYear(), q * 3, 1, 0, 0, 0);
      break;
    }

    default:
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0);
  }

  return { start: start.toISOString(), end: now.toISOString() };
}

// ─── Fetch ────────────────────────────────────────────────────────────────────
async function fetchData() {
  const { start, end } = getPeriodDates(currentPeriod);

  const url =
    `${SUPABASE_URL}/rest/v1/tempo_producao` +
    `?created_at=gte.${encodeURIComponent(start)}` +
    `&created_at=lte.${encodeURIComponent(end)}` +
    `&order=created_at.desc`;

  const res = await fetch(url, {
    headers: {
      'apikey':        SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type':  'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function extractCliente(taskName) {
  if (!taskName) return 'Sem cliente';
  const parts = taskName.split(' | ');
  return parts.length > 1 ? parts[1].trim() : taskName;
}

function fmtH(min) {
  if (!min || min <= 0) return '0h';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

function fmtHd(min) {
  if (!min || min <= 0) return '0.0h';
  return (min / 60).toFixed(1) + 'h';
}

function initials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0] || '').join('').substring(0, 2).toUpperCase();
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── Processamento ────────────────────────────────────────────────────────────
function metrics(data) {
  const totalMin     = data.reduce((s, r) => s + (r.minutos_sessao || 0), 0);
  const uniqueTasks  = new Set(data.map(r => r.task_id || r.task_name)).size;
  const avgMin       = uniqueTasks > 0 ? Math.round(totalMin / uniqueTasks) : 0;

  const byPerson = {};
  data.forEach(r => {
    if (!r.responsavel) return;
    byPerson[r.responsavel] = (byPerson[r.responsavel] || 0) + (r.minutos_sessao || 0);
  });
  const top = Object.entries(byPerson).sort((a, b) => b[1] - a[1])[0];

  return { totalMin, uniqueTasks, avgMin, top };
}

function byDay(data) {
  const map = {};
  data.forEach(r => {
    if (!r.entrada_em_andamento) return;
    const d = r.entrada_em_andamento.substring(0, 10);
    map[d] = (map[d] || 0) + (r.minutos_sessao || 0);
  });
  const sorted = Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  return {
    labels: sorted.map(([d]) => { const [, m, day] = d.split('-'); return `${day}/${m}`; }),
    values: sorted.map(([, v]) => +(v / 60).toFixed(1)),
  };
}

function byPerson(data) {
  const map = {};
  data.forEach(r => {
    if (!r.responsavel) return;
    if (!map[r.responsavel]) map[r.responsavel] = { name: r.responsavel, min: 0, tasks: new Set(), sessions: 0 };
    map[r.responsavel].min += (r.minutos_sessao || 0);
    map[r.responsavel].tasks.add(r.task_id || r.task_name || '?');
    map[r.responsavel].sessions++;
  });
  return Object.values(map)
    .map(p => ({ ...p, tasks: p.tasks.size }))
    .sort((a, b) => b.min - a.min);
}

function byTask(data) {
  const map = {};
  data.forEach(r => {
    const key = r.task_id || r.task_name;
    if (!key) return;
    if (!map[key]) {
      map[key] = {
        task_id:    r.task_id,
        task_name:  r.task_name,
        cliente:    extractCliente(r.task_name),
        responsavel: r.responsavel,
        totalMin:   0,
        sessions:   0,
        lastAt:     null,
      };
    }
    map[key].totalMin += (r.minutos_sessao || 0);
    map[key].sessions++;
    if (!map[key].lastAt || r.created_at > map[key].lastAt) map[key].lastAt = r.created_at;
  });
  return Object.values(map).sort((a, b) => b.totalMin - a.totalMin);
}

// ─── Renderização ─────────────────────────────────────────────────────────────
function renderMetrics(data) {
  const m = metrics(data);
  document.getElementById('metricsGrid').innerHTML = `
    <div class="metric-card">
      <div class="metric-label">Horas em Produção</div>
      <div class="metric-value">${fmtHd(m.totalMin)}</div>
      <div class="metric-sub">${m.totalMin} minutos no período</div>
      <span class="metric-icon">⏱</span>
    </div>
    <div class="metric-card">
      <div class="metric-label">Tarefas Executadas</div>
      <div class="metric-value">${m.uniqueTasks}</div>
      <div class="metric-sub">tarefas únicas</div>
      <span class="metric-icon">✓</span>
    </div>
    <div class="metric-card">
      <div class="metric-label">Média por Tarefa</div>
      <div class="metric-value">${fmtHd(m.avgMin)}</div>
      <div class="metric-sub">por tarefa executada</div>
      <span class="metric-icon">∅</span>
    </div>
    <div class="metric-card">
      <div class="metric-label">Maior Produtor</div>
      <div class="metric-value" style="font-size:20px;line-height:1.4">
        ${m.top ? m.top[0].split(' ')[0] : '—'}
      </div>
      <div class="metric-sub">${m.top ? fmtHd(m.top[1]) + ' no período' : 'sem dados'}</div>
      <span class="metric-icon">★</span>
    </div>
  `;
}

function renderChart(data) {
  const { labels, values } = byDay(data);
  const ctx = document.getElementById('productionChart').getContext('2d');
  if (chart) chart.destroy();

  if (labels.length === 0) {
    ctx.canvas.parentElement.innerHTML = '<div class="empty">Sem dados no período selecionado</div>';
    return;
  }

  chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: 'rgba(124, 58, 237, 0.45)',
        borderColor:     'rgba(124, 58, 237, 0.85)',
        borderWidth: 1,
        borderRadius: 6,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#18181f',
          borderColor:     'rgba(255,255,255,0.09)',
          borderWidth: 1,
          titleColor:  '#f1f1f5',
          bodyColor:   'rgba(241,241,245,0.6)',
          padding: 10,
          callbacks: { label: c => ` ${c.raw}h em produção` },
        },
      },
      scales: {
        x: {
          grid:  { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: 'rgba(241,241,245,0.4)', font: { family: 'DM Mono', size: 11 } },
        },
        y: {
          grid:  { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: 'rgba(241,241,245,0.4)', font: { family: 'DM Mono', size: 11 }, callback: v => v + 'h' },
        },
      },
    },
  });
}

function renderRanking(data) {
  const people = byPerson(data);
  const el     = document.getElementById('teamRanking');

  if (!people.length) {
    el.innerHTML = '<div class="empty">Sem dados no período</div>';
    return;
  }

  const maxMin = people[0].min || 1;
  el.innerHTML = people.map((p, i) => `
    <div class="ranking-item">
      <span class="ranking-pos">${i + 1}</span>
      <div class="ranking-avatar">${initials(p.name)}</div>
      <div class="ranking-info">
        <div class="ranking-name">${p.name}</div>
        <div class="ranking-bar-bg">
          <div class="ranking-bar-fill" style="width:${(p.min / maxMin * 100).toFixed(1)}%"></div>
        </div>
      </div>
      <span class="ranking-hours">${fmtHd(p.min)}</span>
    </div>
  `).join('');
}

function renderTeam(data) {
  const people = byPerson(data);
  const el     = document.getElementById('teamGrid');

  if (!people.length) {
    el.innerHTML = '<div class="empty">Sem dados no período</div>';
    return;
  }

  el.innerHTML = people.map(p => `
    <div class="team-card">
      <div class="team-card-header">
        <div class="team-avatar-lg">${initials(p.name)}</div>
        <div class="team-name">${p.name}</div>
      </div>
      <div class="team-stats">
        <div class="team-stat">
          <div class="team-stat-label">Horas</div>
          <div class="team-stat-value">${fmtHd(p.min)}</div>
        </div>
        <div class="team-stat">
          <div class="team-stat-label">Tarefas</div>
          <div class="team-stat-value">${p.tasks}</div>
        </div>
        <div class="team-stat">
          <div class="team-stat-label">Sessões</div>
          <div class="team-stat-value">${p.sessions}</div>
        </div>
        <div class="team-stat">
          <div class="team-stat-label">Média/tarefa</div>
          <div class="team-stat-value" style="font-size:14px">
            ${p.tasks > 0 ? fmtHd(Math.round(p.min / p.tasks)) : '—'}
          </div>
        </div>
      </div>
    </div>
  `).join('');
}

function renderTasks(data, filter = '') {
  const tasks    = byTask(data);
  const filtered = filter
    ? tasks.filter(t =>
        (t.task_name  || '').toLowerCase().includes(filter.toLowerCase()) ||
        (t.cliente    || '').toLowerCase().includes(filter.toLowerCase()) ||
        (t.responsavel|| '').toLowerCase().includes(filter.toLowerCase())
      )
    : tasks;

  document.getElementById('taskCount').textContent = `${filtered.length} tarefa(s)`;

  const tbody = document.getElementById('tasksBody');
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty">Nenhuma tarefa encontrada</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(t => `
    <tr>
      <td title="${t.task_name || ''}">
        ${t.task_id
          ? `<a href="https://app.clickup.com/t/${t.task_id}" target="_blank" rel="noopener">
               ${t.task_name || 'Sem nome'}
               <span class="link-arrow">↗</span>
             </a>`
          : (t.task_name || '—')
        }
      </td>
      <td>${t.cliente}</td>
      <td>${t.responsavel || '—'}</td>
      <td class="mono">${fmtHd(t.totalMin)}</td>
      <td class="mono">${t.sessions}</td>
      <td style="color:var(--muted);font-size:12px">${fmtDate(t.lastAt)}</td>
    </tr>
  `).join('');
}

function renderRetrabalho(data) {
  const tasks  = byTask(data);
  const rework = tasks.filter(t => t.sessions > 2).sort((a, b) => b.sessions - a.sessions);

  const pct = tasks.length > 0 ? ((rework.length / tasks.length) * 100).toFixed(0) : 0;
  const extraSessions = rework.reduce((s, t) => s + (t.sessions - 2), 0);
  const reworkMin     = rework.reduce((s, t) => s + t.totalMin, 0);

  document.getElementById('retrabalhoMetrics').innerHTML = `
    <div class="metric-card">
      <div class="metric-label">Tarefas com Retrabalho</div>
      <div class="metric-value" style="color:var(--amber)">${rework.length}</div>
      <div class="metric-sub">de ${tasks.length} tarefas no período</div>
      <span class="metric-icon">↺</span>
    </div>
    <div class="metric-card">
      <div class="metric-label">Taxa de Retrabalho</div>
      <div class="metric-value" style="color:${pct > 30 ? 'var(--red)' : 'var(--amber)'}">
        ${pct}%
      </div>
      <div class="metric-sub">do total de tarefas</div>
      <span class="metric-icon">%</span>
    </div>
    <div class="metric-card">
      <div class="metric-label">Sessões Extras</div>
      <div class="metric-value">${extraSessions}</div>
      <div class="metric-sub">acima de 2 sessões</div>
      <span class="metric-icon">+</span>
    </div>
    <div class="metric-card">
      <div class="metric-label">Horas em Retrabalho</div>
      <div class="metric-value" style="color:var(--red)">${fmtHd(reworkMin)}</div>
      <div class="metric-sub">tempo total em rework</div>
      <span class="metric-icon">⏱</span>
    </div>
  `;

  const tbody = document.getElementById('retrabalhoBody');
  if (!rework.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty">✓ Nenhuma tarefa com retrabalho no período</td></tr>`;
    return;
  }

  tbody.innerHTML = rework.map(t => {
    const badge = t.sessions > 5
      ? '<span class="badge badge-danger">Alto</span>'
      : '<span class="badge badge-warning">Médio</span>';
    return `
      <tr>
        <td title="${t.task_name || ''}">
          ${t.task_id
            ? `<a href="https://app.clickup.com/t/${t.task_id}" target="_blank" rel="noopener">
                 ${t.task_name || 'Sem nome'}
                 <span class="link-arrow">↗</span>
               </a>`
            : (t.task_name || '—')
          }
        </td>
        <td>${t.cliente}</td>
        <td>${t.responsavel || '—'}</td>
        <td class="mono" style="color:var(--amber)">${t.sessions}</td>
        <td class="mono">${fmtHd(t.totalMin)}</td>
        <td>${badge}</td>
      </tr>
    `;
  }).join('');
}

// ─── Render completo ──────────────────────────────────────────────────────────
async function fetchAndRender() {
  const loading = document.getElementById('loading');
  const errEl   = document.getElementById('errorState');

  // Mostra loading, esconde views e erro
  loading.classList.remove('hidden');
  errEl.classList.add('hidden');
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));

  try {
    allData = await fetchData();

    renderMetrics(allData);
    renderChart(allData);
    renderRanking(allData);
    renderTeam(allData);
    renderTasks(allData, document.getElementById('taskSearch').value);
    renderRetrabalho(allData);

    // Mostra a view atual
    const view = document.getElementById(`view-${currentView}`);
    if (view) view.classList.remove('hidden');

  } catch (err) {
    console.error('[TMC]', err);
    document.getElementById('errorMsg').textContent = err.message;
    errEl.classList.remove('hidden');
  } finally {
    loading.classList.add('hidden');
  }
}

// ─── Navegação ────────────────────────────────────────────────────────────────
const VIEW_TITLES = { dashboard: 'Dashboard', equipe: 'Equipe', tarefas: 'Tarefas', retrabalho: 'Retrabalho' };

function switchView(view) {
  currentView = view;

  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  document.getElementById('viewTitle').textContent = VIEW_TITLES[view] || view;
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));

  const target = document.getElementById(`view-${view}`);
  if (target) target.classList.remove('hidden');
}

// ─── Eventos ──────────────────────────────────────────────────────────────────
document.querySelectorAll('.nav-item').forEach(btn =>
  btn.addEventListener('click', () => switchView(btn.dataset.view))
);

document.querySelectorAll('.period-btn').forEach(btn =>
  btn.addEventListener('click', () => {
    document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentPeriod = btn.dataset.period;
    fetchAndRender();
  })
);

document.getElementById('taskSearch').addEventListener('input', e =>
  renderTasks(allData, e.target.value)
);

// ─── Auto-refresh (60s) ───────────────────────────────────────────────────────
function startRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(fetchAndRender, 60_000);
}

// ─── Init ─────────────────────────────────────────────────────────────────────
fetchAndRender();
startRefresh();
