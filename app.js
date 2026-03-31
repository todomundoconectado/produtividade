// TMC Dashboard de Produtividade — app.js

// ─── Estado ───────────────────────────────────────────────────────────────────
let allData        = [];
let currentPeriod  = 'week';
let currentView    = 'dashboard';
let selectedPerson = null;
let currentDueFilter = 'all';
let customStart    = null;
let customEnd      = null;
let movCurrentTab  = 'geral';
let charts         = {}; // armazena todas as instâncias Chart.js

// Paleta de cores para gráficos multi-pessoa
const PALETTE_BG = [
  'rgba(124,58,237,0.65)',
  'rgba(59,130,246,0.65)',
  'rgba(16,185,129,0.65)',
  'rgba(245,158,11,0.65)',
  'rgba(239,68,68,0.65)',
  'rgba(236,72,153,0.65)',
];
const PALETTE_LINE = [
  'rgba(124,58,237,1)',
  'rgba(59,130,246,1)',
  'rgba(16,185,129,1)',
  'rgba(245,158,11,1)',
  'rgba(239,68,68,1)',
  'rgba(236,72,153,1)',
];

// ─── Tema ─────────────────────────────────────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem('tmc-theme') || 'dark';
  applyTheme(saved);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('themeToggle');
  btn.textContent = theme === 'dark' ? '☀' : '🌙';
  localStorage.setItem('tmc-theme', theme);
  if (allData.length) renderAllViews();
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

document.getElementById('themeToggle').addEventListener('click', toggleTheme);

// ─── Período ──────────────────────────────────────────────────────────────────
function getPeriodDates(period) {
  const now = new Date();

  if (period === 'custom') {
    return {
      start: customStart || new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).toISOString(),
      end:   customEnd   || now.toISOString(),
    };
  }

  let start;
  switch (period) {
    case 'today':
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      break;

    case 'yesterday': {
      const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0);
      return {
        start: y.toISOString(),
        end:   new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).toISOString(),
      };
    }

    case 'week': {
      const dow  = now.getDay();
      const diff = dow === 0 ? 6 : dow - 1;
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
function isLight() {
  return document.documentElement.getAttribute('data-theme') === 'light';
}

function fmtHM(min) {
  if (!min || min <= 0) return '00:00';
  const h = Math.floor(min / 60);
  const m = Math.floor(min % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function extractCliente(taskName) {
  if (!taskName) return '—';
  const parts = taskName.split(' | ');
  return parts.length > 1 ? parts[1].trim() : '—';
}

function taskDisplayName(t) {
  if (t.task_name && t.task_name.trim()) {
    return t.task_name.split(' | ')[0].trim();
  }
  return t.task_id ? `Tarefa #${t.task_id}` : '—';
}

function taskLink(t) {
  const name = taskDisplayName(t);
  if (t.task_id) {
    return `<a href="https://app.clickup.com/t/${t.task_id}" target="_blank" rel="noopener">${name}<span class="link-arrow">↗</span></a>`;
  }
  return name;
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

function fmtDateShort(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function filterByPerson(data) {
  if (!selectedPerson) return data;
  return data.filter(r => r.responsavel === selectedPerson);
}

function chartTheme() {
  const light = isLight();
  return {
    tickColor:  light ? 'rgba(26,24,48,0.45)'  : 'rgba(241,241,245,0.4)',
    gridColor:  light ? 'rgba(0,0,0,0.06)'      : 'rgba(255,255,255,0.04)',
    tooltipBg:  light ? '#ffffff'               : '#1a1928',
    tooltipBdr: light ? 'rgba(0,0,0,0.1)'      : 'rgba(255,255,255,0.09)',
    tooltipTxt: light ? '#1a1830'               : '#f1f1f5',
    tooltipSub: light ? 'rgba(26,24,48,0.6)'   : 'rgba(241,241,245,0.6)',
  };
}

function destroyChart(key) {
  if (charts[key]) {
    charts[key].destroy();
    charts[key] = null;
  }
}

// ─── Processamento ────────────────────────────────────────────────────────────
function metrics(data) {
  const totalMin    = data.reduce((s, r) => s + (r.minutos_sessao || 0), 0);
  const uniqueTasks = new Set(data.map(r => r.task_id || r.task_name)).size;
  const avgMin      = uniqueTasks > 0 ? Math.round(totalMin / uniqueTasks) : 0;

  const byPersonMap = {};
  data.forEach(r => {
    if (!r.responsavel) return;
    byPersonMap[r.responsavel] = (byPersonMap[r.responsavel] || 0) + (r.minutos_sessao || 0);
  });
  const top = Object.entries(byPersonMap).sort((a, b) => b[1] - a[1])[0];

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
    values: sorted.map(([, v]) => v), // em minutos
    rawDates: sorted.map(([d]) => d),
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
        task_id:     r.task_id,
        task_name:   r.task_name,
        cliente:     extractCliente(r.task_name),
        responsavel: r.responsavel,
        due_date:    r.due_date || null,
        totalMin:    0,
        sessions:    0,
        lastAt:      null,
      };
    }
    map[key].totalMin += (r.minutos_sessao || 0);
    map[key].sessions++;
    if (!map[key].lastAt || r.created_at > map[key].lastAt) map[key].lastAt = r.created_at;
    if (r.due_date && !map[key].due_date) map[key].due_date = r.due_date;
  });
  return Object.values(map).sort((a, b) => b.totalMin - a.totalMin);
}

function byDayPerson(data) {
  const persons = [...new Set(data.map(r => r.responsavel).filter(Boolean))].sort();
  const datesSet = new Set();
  const dayPersonMap = {};

  data.forEach(r => {
    if (!r.entrada_em_andamento || !r.responsavel) return;
    const date = r.entrada_em_andamento.substring(0, 10);
    datesSet.add(date);
    const k = `${date}::${r.responsavel}`;
    if (!dayPersonMap[k]) dayPersonMap[k] = 0;
    dayPersonMap[k] += (r.minutos_sessao || 0);
  });

  const dates = [...datesSet].sort();
  return { dates, persons, dayPersonMap };
}

function byMovimentacao(data) {
  const datesSet   = new Set();
  const personsSet = new Set();
  const map        = {}; // { date: { person: { tasks: Set, min, sessions } } }

  data.forEach(r => {
    if (!r.entrada_em_andamento || !r.responsavel) return;
    const date = r.entrada_em_andamento.substring(0, 10);
    datesSet.add(date);
    personsSet.add(r.responsavel);
    if (!map[date]) map[date] = {};
    if (!map[date][r.responsavel]) map[date][r.responsavel] = { tasks: new Set(), min: 0, sessions: 0 };
    map[date][r.responsavel].tasks.add(r.task_id || r.task_name || Math.random().toString());
    map[date][r.responsavel].min += (r.minutos_sessao || 0);
    map[date][r.responsavel].sessions++;
  });

  const dates   = [...datesSet].sort();
  const persons = [...personsSet].sort();

  // Converte tasks Set para count
  const finalMap = {};
  Object.entries(map).forEach(([date, personData]) => {
    finalMap[date] = {};
    Object.entries(personData).forEach(([person, stats]) => {
      finalMap[date][person] = {
        taskCount: stats.tasks.size,
        min:       stats.min,
        sessions:  stats.sessions,
      };
    });
  });

  return { map: finalMap, dates, persons };
}

// ─── Person Pills ─────────────────────────────────────────────────────────────
function renderPersonPills(data) {
  const persons = [...new Set(data.map(r => r.responsavel).filter(Boolean))].sort();
  const container = document.getElementById('personPills');
  if (!container) return;

  const pills = [
    `<button class="person-pill ${!selectedPerson ? 'active' : ''}" data-person="">Todos</button>`,
    ...persons.map(p =>
      `<button class="person-pill ${selectedPerson === p ? 'active' : ''}" data-person="${p}">${p.split(' ')[0]}</button>`
    ),
  ];
  container.innerHTML = pills.join('');

  container.querySelectorAll('.person-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedPerson = btn.dataset.person || null;
      renderPersonPills(allData);
      renderAllViews();
    });
  });
}

// ─── Renderização ─────────────────────────────────────────────────────────────
function renderMetrics(data) {
  const m = metrics(data);
  document.getElementById('metricsGrid').innerHTML = `
    <div class="metric-card">
      <div class="metric-label">Horas em Produção</div>
      <div class="metric-value">${fmtHM(m.totalMin)}</div>
      <div class="metric-sub">${m.totalMin} min no período</div>
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
      <div class="metric-value">${fmtHM(m.avgMin)}</div>
      <div class="metric-sub">por tarefa executada</div>
      <span class="metric-icon">∅</span>
    </div>
    <div class="metric-card">
      <div class="metric-label">Maior Produtor</div>
      <div class="metric-value" style="font-size:20px;line-height:1.4">
        ${m.top ? m.top[0].split(' ')[0] : '—'}
      </div>
      <div class="metric-sub">${m.top ? fmtHM(m.top[1]) + ' no período' : 'sem dados'}</div>
      <span class="metric-icon">★</span>
    </div>
  `;
}

function renderChart(data) {
  const { labels, values } = byDay(data);
  const container = document.getElementById('productionChart')?.parentElement;
  if (!container) return;

  if (!document.getElementById('productionChart')) {
    container.innerHTML = '<canvas id="productionChart"></canvas>';
  }

  const ctx = document.getElementById('productionChart').getContext('2d');
  destroyChart('main');

  if (labels.length === 0) {
    container.innerHTML = '<div class="empty">Sem dados no período selecionado</div>';
    return;
  }

  const t = chartTheme();

  charts['main'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: 'rgba(124,58,237,0.45)',
        borderColor:     'rgba(124,58,237,0.85)',
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
          backgroundColor: t.tooltipBg,
          borderColor:     t.tooltipBdr,
          borderWidth: 1,
          titleColor:  t.tooltipTxt,
          bodyColor:   t.tooltipSub,
          padding: 10,
          callbacks: { label: c => ` ${fmtHM(c.raw)} em produção` },
        },
      },
      scales: {
        x: {
          grid:  { color: t.gridColor },
          ticks: { color: t.tickColor, font: { family: 'DM Mono', size: 11 } },
        },
        y: {
          grid:  { color: t.gridColor },
          ticks: { color: t.tickColor, font: { family: 'DM Mono', size: 11 }, callback: v => fmtHM(v) },
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
      <span class="ranking-hours">${fmtHM(p.min)}</span>
    </div>
  `).join('');
}

function renderEquipeCharts(data) {
  const people = byPerson(data);

  // ── Bar chart: horas por pessoa ──────────────────────────────────────────
  const barCtx = document.getElementById('equipeBarChart');
  destroyChart('equipeBar');
  if (barCtx && people.length) {
    const t = chartTheme();
    charts['equipeBar'] = new Chart(barCtx.getContext('2d'), {
      type: 'bar',
      data: {
        labels: people.map(p => p.name.split(' ')[0]),
        datasets: [{
          data: people.map(p => p.min),
          backgroundColor: people.map((_, i) => PALETTE_BG[i % PALETTE_BG.length]),
          borderRadius: 6,
          borderSkipped: false,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: t.tooltipBg,
            borderColor: t.tooltipBdr,
            borderWidth: 1,
            titleColor: t.tooltipTxt,
            bodyColor: t.tooltipSub,
            callbacks: { label: c => ` ${fmtHM(c.raw)}` },
          },
        },
        scales: {
          x: { grid: { color: t.gridColor }, ticks: { color: t.tickColor, font: { family: 'DM Mono', size: 10 }, callback: v => fmtHM(v) } },
          y: { grid: { color: 'transparent' }, ticks: { color: t.tickColor, font: { family: 'Inter', size: 12 } } },
        },
      },
    });
  }

  // ── Pie chart: distribuição de tarefas ───────────────────────────────────
  const pieCtx = document.getElementById('equipePieChart');
  destroyChart('equipePie');
  if (pieCtx && people.length >= 2) {
    const t = chartTheme();
    charts['equipePie'] = new Chart(pieCtx.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: people.map(p => p.name.split(' ')[0]),
        datasets: [{
          data: people.map(p => p.tasks),
          backgroundColor: people.map((_, i) => PALETTE_BG[i % PALETTE_BG.length]),
          borderColor: 'transparent',
          hoverOffset: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        plugins: {
          legend: {
            position: 'right',
            labels: { color: t.tickColor, font: { family: 'Inter', size: 11 }, padding: 10, boxWidth: 10 },
          },
          tooltip: {
            backgroundColor: t.tooltipBg,
            borderColor: t.tooltipBdr,
            borderWidth: 1,
            titleColor: t.tooltipTxt,
            bodyColor: t.tooltipSub,
            callbacks: { label: c => ` ${c.raw} tarefa(s)` },
          },
        },
      },
    });
  } else if (pieCtx && people.length < 2) {
    pieCtx.parentElement.innerHTML = '<div class="empty" style="padding:60px 0">Necessário 2+ pessoas</div>';
  }

  // ── Line chart: tendência de horas por dia ────────────────────────────────
  const trendCtx = document.getElementById('equipeTrendChart');
  destroyChart('equipeTrend');
  if (trendCtx && people.length) {
    const { dates, persons, dayPersonMap } = byDayPerson(data);
    const labels = dates.map(d => { const [, m, day] = d.split('-'); return `${day}/${m}`; });
    const t = chartTheme();

    charts['equipeTrend'] = new Chart(trendCtx.getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets: persons.map((p, i) => ({
          label: p.split(' ')[0],
          data: dates.map(d => dayPersonMap[`${d}::${p}`] || 0),
          borderColor: PALETTE_LINE[i % PALETTE_LINE.length],
          backgroundColor: PALETTE_BG[i % PALETTE_BG.length],
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 5,
          tension: 0.3,
          fill: false,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: { color: t.tickColor, font: { family: 'Inter', size: 11 }, padding: 12, boxWidth: 10 },
          },
          tooltip: {
            backgroundColor: t.tooltipBg,
            borderColor: t.tooltipBdr,
            borderWidth: 1,
            titleColor: t.tooltipTxt,
            bodyColor: t.tooltipSub,
            callbacks: { label: c => ` ${c.dataset.label}: ${fmtHM(c.raw)}` },
          },
        },
        scales: {
          x: { grid: { color: t.gridColor }, ticks: { color: t.tickColor, font: { family: 'DM Mono', size: 10 } } },
          y: { grid: { color: t.gridColor }, ticks: { color: t.tickColor, font: { family: 'DM Mono', size: 10 }, callback: v => fmtHM(v) } },
        },
      },
    });
  }
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
          <div class="team-stat-value">${fmtHM(p.min)}</div>
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
            ${p.tasks > 0 ? fmtHM(Math.round(p.min / p.tasks)) : '—'}
          </div>
        </div>
      </div>
    </div>
  `).join('');
}

function renderTasks(data, textFilter = '') {
  let tasks = byTask(data);

  // Filtro de texto
  if (textFilter) {
    const q = textFilter.toLowerCase();
    tasks = tasks.filter(t =>
      taskDisplayName(t).toLowerCase().includes(q) ||
      (t.cliente     || '').toLowerCase().includes(q) ||
      (t.responsavel || '').toLowerCase().includes(q)
    );
  }

  // Filtro por vencimento
  if (currentDueFilter !== 'all') {
    const today    = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    const nextWeek = new Date(today); nextWeek.setDate(today.getDate() + 7);

    tasks = tasks.filter(t => {
      if (currentDueFilter === 'none') return !t.due_date;
      if (!t.due_date) return false;
      const due = new Date(t.due_date);
      if (currentDueFilter === 'overdue') return due < today;
      if (currentDueFilter === 'today')   return due >= today && due < tomorrow;
      if (currentDueFilter === 'week')    return due >= today && due < nextWeek;
      return true;
    });
  }

  document.getElementById('taskCount').textContent = `${tasks.length} tarefa(s)`;

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tbody = document.getElementById('tasksBody');

  if (!tasks.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty">Nenhuma tarefa encontrada</td></tr>`;
    return;
  }

  tbody.innerHTML = tasks.map(t => {
    const isOverdue = t.due_date && new Date(t.due_date) < today;
    const dueBadge  = isOverdue ? '<span class="badge badge-vencida">Vencida</span>' : '';
    const dueText   = t.due_date ? fmtDateShort(t.due_date) : '—';
    return `
      <tr>
        <td title="${taskDisplayName(t)}">${taskLink(t)}${dueBadge}</td>
        <td>${t.cliente}</td>
        <td>${t.responsavel || '—'}</td>
        <td class="mono">${fmtHM(t.totalMin)}</td>
        <td class="mono">${t.sessions}</td>
        <td class="mono" style="color:${isOverdue ? 'var(--red)' : 'var(--muted)'};">${dueText}</td>
        <td style="color:var(--muted);font-size:12px">${fmtDate(t.lastAt)}</td>
      </tr>
    `;
  }).join('');
}

// ─── Movimentação ─────────────────────────────────────────────────────────────
function renderMovimentacao(data) {
  const { map, dates, persons } = byMovimentacao(data);

  // ── Métricas de resumo ────────────────────────────────────────────────────
  const totalUniqueTasks = new Set(data.map(r => r.task_id || r.task_name).filter(Boolean)).size;
  const activeDays       = dates.length;
  const activePersons    = persons.length;

  // Pessoa mais ativa (mais tarefas únicas no período)
  const personTasks = {};
  persons.forEach(p => {
    personTasks[p] = 0;
    dates.forEach(d => { personTasks[p] += map[d]?.[p]?.taskCount || 0; });
  });
  const topPersonEntry = Object.entries(personTasks).sort((a, b) => b[1] - a[1])[0];
  const topPerson = topPersonEntry ? topPersonEntry[0].split(' ')[0] : '—';

  // Dia mais movimentado
  const dayTotals = dates.map(d => ({
    date: d,
    total: persons.reduce((s, p) => s + (map[d]?.[p]?.taskCount || 0), 0),
  }));
  const topDay = dayTotals.sort((a, b) => b.total - a.total)[0];
  const topDayLabel = topDay ? (() => { const [, m, day] = topDay.date.split('-'); return `${day}/${m}`; })() : '—';

  const avgTasksPerDayPerson = activePersons > 0 && activeDays > 0
    ? (totalUniqueTasks / (activeDays * activePersons)).toFixed(1)
    : '0';

  document.getElementById('movMetrics').innerHTML = `
    <div class="metric-card">
      <div class="metric-label">Tarefas Movimentadas</div>
      <div class="metric-value">${totalUniqueTasks}</div>
      <div class="metric-sub">tarefas únicas no período</div>
      <span class="metric-icon">⇄</span>
    </div>
    <div class="metric-card">
      <div class="metric-label">Média Tarefas/Dia</div>
      <div class="metric-value">${avgTasksPerDayPerson}</div>
      <div class="metric-sub">por pessoa por dia</div>
      <span class="metric-icon">∅</span>
    </div>
    <div class="metric-card">
      <div class="metric-label">Pessoa Mais Ativa</div>
      <div class="metric-value" style="font-size:20px;line-height:1.4">${topPerson}</div>
      <div class="metric-sub">${topPersonEntry ? topPersonEntry[1] + ' tarefas' : '—'}</div>
      <span class="metric-icon">★</span>
    </div>
    <div class="metric-card">
      <div class="metric-label">Dia Mais Movimentado</div>
      <div class="metric-value" style="font-size:22px;line-height:1.4">${topDayLabel}</div>
      <div class="metric-sub">${topDay ? topDay.total + ' tarefas' : '—'}</div>
      <span class="metric-icon">📅</span>
    </div>
  `;

  // ── Gráfico de linha: tarefas por dia por pessoa ───────────────────────────
  const lineCtx = document.getElementById('movLineChart');
  destroyChart('movLine');
  if (lineCtx && dates.length && persons.length) {
    const labels = dates.map(d => { const [, m, day] = d.split('-'); return `${day}/${m}`; });
    const t = chartTheme();
    charts['movLine'] = new Chart(lineCtx.getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets: persons.map((p, i) => ({
          label: p.split(' ')[0],
          data: dates.map(d => map[d]?.[p]?.taskCount || 0),
          borderColor: PALETTE_LINE[i % PALETTE_LINE.length],
          backgroundColor: PALETTE_BG[i % PALETTE_BG.length],
          borderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          tension: 0.3,
          fill: false,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: { color: t.tickColor, font: { family: 'Inter', size: 11 }, padding: 12, boxWidth: 10 },
          },
          tooltip: {
            backgroundColor: t.tooltipBg,
            borderColor: t.tooltipBdr,
            borderWidth: 1,
            titleColor: t.tooltipTxt,
            bodyColor: t.tooltipSub,
            callbacks: { label: c => ` ${c.dataset.label}: ${c.raw} tarefa(s)` },
          },
        },
        scales: {
          x: { grid: { color: t.gridColor }, ticks: { color: t.tickColor, font: { family: 'DM Mono', size: 10 } } },
          y: {
            grid: { color: t.gridColor },
            ticks: { color: t.tickColor, font: { family: 'DM Mono', size: 10 }, stepSize: 1 },
            beginAtZero: true,
          },
        },
      },
    });
  }

  // ── Tabela detalhada por pessoa ────────────────────────────────────────────
  const tbody = document.getElementById('movDetalheBody');
  if (tbody) {
    if (!dates.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty">Sem dados no período</td></tr>';
    } else {
      const rows = [];
      dates.forEach(d => {
        const [, m, day] = d.split('-');
        const label = `${day}/${m}`;
        persons.forEach(p => {
          const stats = map[d]?.[p];
          if (!stats) return;
          rows.push(`
            <tr>
              <td class="mono">${label}</td>
              <td>${p}</td>
              <td class="mono">${stats.taskCount}</td>
              <td class="mono">${fmtHM(stats.min)}</td>
              <td class="mono">${stats.sessions}</td>
            </tr>
          `);
        });
      });
      tbody.innerHTML = rows.join('') || '<tr><td colspan="5" class="empty">Sem dados</td></tr>';
    }
  }

  // ── Comparativo entre usuários ────────────────────────────────────────────
  const compCards = document.getElementById('comparisonCards');
  if (compCards && persons.length) {
    // Calcular médias
    const personStats = persons.map(p => {
      const daysWithActivity = dates.filter(d => (map[d]?.[p]?.taskCount || 0) > 0);
      const totalTasks = dates.reduce((s, d) => s + (map[d]?.[p]?.taskCount || 0), 0);
      const totalMin   = dates.reduce((s, d) => s + (map[d]?.[p]?.min || 0), 0);
      const avgPerDay  = daysWithActivity.length > 0 ? (totalTasks / daysWithActivity.length).toFixed(1) : '0';
      return { name: p, totalTasks, totalMin, avgPerDay, activeDays: daysWithActivity.length };
    }).sort((a, b) => b.totalTasks - a.totalTasks);

    const cards = personStats.map((ps, i) => `
      <div class="comparison-card">
        <div class="comparison-card-name">
          <div class="ranking-avatar" style="width:28px;height:28px;font-size:9px">${initials(ps.name)}</div>
          ${ps.name}
        </div>
        <div class="comparison-stat">
          <div class="comparison-stat-label">Tarefas no período</div>
          <div class="comparison-stat-value">${ps.totalTasks}</div>
        </div>
        <div class="comparison-stat">
          <div class="comparison-stat-label">Média / dia ativo</div>
          <div class="comparison-stat-value">${ps.avgPerDay}</div>
        </div>
        <div class="comparison-stat">
          <div class="comparison-stat-label">Tempo total</div>
          <div class="comparison-stat-value" style="font-size:15px">${fmtHM(ps.totalMin)}</div>
        </div>
      </div>
    `).join('');

    // Card de diferença (só se tiver 2+ pessoas)
    let diffCard = '';
    if (personStats.length >= 2) {
      const p1 = personStats[0];
      const p2 = personStats[1];
      const diff = (parseFloat(p1.avgPerDay) - parseFloat(p2.avgPerDay)).toFixed(1);
      diffCard = `
        <div class="comparison-diff">
          <span style="font-size:16px">📊</span>
          <span><strong>${p1.name.split(' ')[0]}</strong> está pegando em média <strong>${diff}</strong> tarefa(s)/dia a mais que <strong>${p2.name.split(' ')[0]}</strong></span>
        </div>
      `;
    }

    compCards.innerHTML = cards + diffCard;
  }

  // ── Gráfico de barras agrupadas: comparativo ──────────────────────────────
  const barCtx = document.getElementById('movBarChart');
  destroyChart('movBar');
  if (barCtx && dates.length && persons.length) {
    const labels = dates.map(d => { const [, m, day] = d.split('-'); return `${day}/${m}`; });
    const t = chartTheme();
    charts['movBar'] = new Chart(barCtx.getContext('2d'), {
      type: 'bar',
      data: {
        labels,
        datasets: persons.map((p, i) => ({
          label: p.split(' ')[0],
          data: dates.map(d => map[d]?.[p]?.taskCount || 0),
          backgroundColor: PALETTE_BG[i % PALETTE_BG.length],
          borderRadius: 4,
          borderSkipped: false,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: { color: t.tickColor, font: { family: 'Inter', size: 11 }, padding: 12, boxWidth: 10 },
          },
          tooltip: {
            backgroundColor: t.tooltipBg,
            borderColor: t.tooltipBdr,
            borderWidth: 1,
            titleColor: t.tooltipTxt,
            bodyColor: t.tooltipSub,
            callbacks: { label: c => ` ${c.dataset.label}: ${c.raw} tarefa(s)` },
          },
        },
        scales: {
          x: { grid: { color: t.gridColor }, ticks: { color: t.tickColor, font: { family: 'DM Mono', size: 10 } } },
          y: {
            grid: { color: t.gridColor },
            ticks: { color: t.tickColor, font: { family: 'DM Mono', size: 10 }, stepSize: 1 },
            beginAtZero: true,
          },
        },
      },
    });
  }
}

// ─── Retrabalho ───────────────────────────────────────────────────────────────
async function fetchCorrecoes() {
  const { start, end } = getPeriodDates(currentPeriod);
  const url =
    `${SUPABASE_URL}/rest/v1/correcoes` +
    `?created_at=gte.${encodeURIComponent(start)}` +
    `&created_at=lte.${encodeURIComponent(end)}` +
    `&order=created_at.desc`;
  try {
    const res = await fetch(url, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
    });
    return res.ok ? res.json() : [];
  } catch {
    return [];
  }
}

async function renderRetrabalho(data) {
  const tasks     = byTask(data);
  const correcoes = await fetchCorrecoes();

  const bySessionsRework = tasks.filter(t => t.sessions > 2);

  const correcaoMap = {};
  correcoes.forEach(c => {
    const key = c.task_id || c.task_name;
    if (!key) return;
    if (!correcaoMap[key]) {
      correcaoMap[key] = {
        task_id:     c.task_id,
        task_name:   c.task_name,
        cliente:     extractCliente(c.task_name),
        responsavel: c.responsavel,
        totalMin:    0,
        sessions:    0,
        lastAt:      c.created_at,
        tipo:        'correcao',
      };
    }
    correcaoMap[key].sessions++;
  });
  const correcaoItems = Object.values(correcaoMap);

  const correcaoIds = new Set(correcaoItems.map(c => c.task_id || c.task_name));
  const sessionsItems = bySessionsRework
    .filter(t => !correcaoIds.has(t.task_id || t.task_name))
    .map(t => ({ ...t, tipo: 'sessoes' }));

  const rework = [...correcaoItems, ...sessionsItems]
    .sort((a, b) => (b.sessions || 0) - (a.sessions || 0));

  const pct         = tasks.length > 0 ? ((rework.length / tasks.length) * 100).toFixed(0) : 0;
  const extraSess   = rework.reduce((s, t) => s + Math.max(0, t.sessions - 2), 0);
  const reworkMin   = rework.reduce((s, t) => s + (t.totalMin || 0), 0);

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
      <div class="metric-value">${extraSess}</div>
      <div class="metric-sub">acima de 2 sessões</div>
      <span class="metric-icon">+</span>
    </div>
    <div class="metric-card">
      <div class="metric-label">Tempo em Retrabalho</div>
      <div class="metric-value" style="color:var(--red)">${fmtHM(reworkMin)}</div>
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
    let badge;
    if (t.tipo === 'correcao') {
      badge = '<span class="badge badge-correcao">Correção</span>';
    } else if (t.sessions > 5) {
      badge = '<span class="badge badge-danger">Alto</span>';
    } else {
      badge = '<span class="badge badge-warning">Médio</span>';
    }
    return `
      <tr>
        <td title="${taskDisplayName(t)}">${taskLink(t)}</td>
        <td>${t.cliente}</td>
        <td>${t.responsavel || '—'}</td>
        <td class="mono" style="color:var(--amber)">${t.sessions}</td>
        <td class="mono">${fmtHM(t.totalMin)}</td>
        <td>${badge}</td>
      </tr>
    `;
  }).join('');
}

// ─── Render de todas as views ─────────────────────────────────────────────────
async function renderAllViews() {
  const data = filterByPerson(allData);

  renderMetrics(data);
  renderChart(data);
  renderRanking(data);
  renderEquipeCharts(data);
  renderTeam(data);
  renderTasks(data, document.getElementById('taskSearch').value);
  renderMovimentacao(data);
  await renderRetrabalho(data);
}

// ─── Fetch + Render principal ─────────────────────────────────────────────────
async function fetchAndRender() {
  const loading = document.getElementById('loading');
  const errEl   = document.getElementById('errorState');

  loading.classList.remove('hidden');
  errEl.classList.add('hidden');
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));

  try {
    allData = await fetchData();
    renderPersonPills(allData);
    await renderAllViews();

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
const VIEW_TITLES = {
  dashboard:    'Dashboard',
  equipe:       'Equipe',
  tarefas:      'Tarefas',
  movimentacao: 'Movimentação',
  retrabalho:   'Retrabalho',
};

function switchView(view) {
  currentView = view;
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  document.getElementById('viewTitle').textContent = VIEW_TITLES[view] || view;
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  const target = document.getElementById(`view-${view}`);
  if (target) target.classList.remove('hidden');
}

// ─── Picker personalizado ─────────────────────────────────────────────────────
const customPicker = document.getElementById('customPicker');
const customBtn    = document.getElementById('customBtn');

function closePicker() {
  customPicker.classList.add('hidden');
}

customBtn.addEventListener('click', e => {
  e.stopPropagation();
  customPicker.classList.toggle('hidden');
});

document.getElementById('applyCustom').addEventListener('click', () => {
  const s = document.getElementById('dateStart').value;
  const e = document.getElementById('dateEnd').value;
  if (!s || !e) return;

  customStart = new Date(s + 'T00:00:00').toISOString();
  customEnd   = new Date(e + 'T23:59:59').toISOString();

  currentPeriod = 'custom';
  document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
  customBtn.classList.add('active');
  closePicker();
  fetchAndRender();
});

document.addEventListener('click', e => {
  if (!customPicker.classList.contains('hidden') &&
      !customPicker.contains(e.target) &&
      e.target !== customBtn) {
    closePicker();
  }
});

// ─── Eventos ──────────────────────────────────────────────────────────────────
document.querySelectorAll('.nav-item').forEach(btn =>
  btn.addEventListener('click', () => switchView(btn.dataset.view))
);

document.querySelectorAll('.period-btn').forEach(btn => {
  if (btn.id === 'customBtn') return;
  btn.addEventListener('click', () => {
    document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentPeriod = btn.dataset.period;
    closePicker();
    fetchAndRender();
  });
});

document.getElementById('taskSearch').addEventListener('input', e => {
  const data = filterByPerson(allData);
  renderTasks(data, e.target.value);
});

// Filtros de vencimento
document.getElementById('dueFilters').addEventListener('click', e => {
  const btn = e.target.closest('.due-filter-btn');
  if (!btn) return;
  document.querySelectorAll('.due-filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  currentDueFilter = btn.dataset.due;
  const data = filterByPerson(allData);
  renderTasks(data, document.getElementById('taskSearch').value);
});

// Tabs de Movimentação
document.querySelectorAll('.mov-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mov-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    movCurrentTab = btn.dataset.tab;
    document.getElementById('mov-geral').classList.toggle('hidden', movCurrentTab !== 'geral');
    document.getElementById('mov-detalhe').classList.toggle('hidden', movCurrentTab !== 'detalhe');
    document.getElementById('mov-comparativo').classList.toggle('hidden', movCurrentTab !== 'comparativo');
  });
});

// ─── Auto-refresh (60s) ───────────────────────────────────────────────────────
let refreshTimer = null;
function startRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(fetchAndRender, 60_000);
}

// ─── Init ─────────────────────────────────────────────────────────────────────
initTheme();
fetchAndRender();
startRefresh();
