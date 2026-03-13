// ═══════════════════════════════════════
// STATE
// ═══════════════════════════════════════
const state = {
  today: {},
  currentBlock: 0,
  timerRunning: false,
  timerSeconds: 25 * 60,
  timerTotal: 25 * 60,
  breakSeconds: 0,
  breakTotal: 0,
  breakExtended: false,
  sessionsCompleted: 0,
  deepWorkMinutes: 0,
  driftMinutes: 0,
  reentryAction: '',
  lastBreakAction: '',
  blockStartTime: null,
  nudgeShown: false,
  driftWarningShown: false,
};

// ═══════════════════════════════════════
// SCHEDULE (built dynamically)
// ═══════════════════════════════════════
const SCHEDULE_TEMPLATE = [
  { id:'ritual',  name:'Morning ritual',  type:'review',  start:'09:15', end:'09:30', icon:'🌅', breakMins:0  },
  { id:'standup', name:'Standup',         type:'standup', start:'09:30', end:'10:00', icon:'📞', breakMins:0  },
  { id:'drift',   name:'YouTube + news',  type:'drift',   start:'10:00', end:'10:40', icon:'📺', breakMins:40 },
  { id:'deep1',   name:'Deep work',       type:'deep',    start:'10:40', end:'12:40', icon:'🔴', workMins:120 },
  { id:'walk',    name:'Walk',            type:'walk',    start:'12:40', end:'13:10', icon:'🚶', breakMins:30 },
  { id:'learn',   name:'Learning',        type:'learn',   start:'13:10', end:'14:10', icon:'📚', workMins:60  },
  { id:'deep2',   name:'Deep work',       type:'deep',    start:'14:10', end:'16:10', icon:'🔴', workMins:120 },
  { id:'admin',   name:'Admin',           type:'admin',   start:'16:10', end:'16:50', icon:'✅', workMins:40  },
  { id:'review',  name:'End of day',      type:'review',  start:'16:50', end:'17:15', icon:'📊', workMins:25  },
];

let schedule = [];

// ═══════════════════════════════════════
// API KEY MANAGEMENT
// ═══════════════════════════════════════
let _apiKey = '';

function onApiKeyInput(val) {
  _apiKey = val.trim();
  const status = document.getElementById('api-key-status');
  if(!status) return;
  if(_apiKey.startsWith('sk-ant-') && _apiKey.length > 20) {
    status.textContent = '✓ ready';
    status.style.color = 'var(--green)';
  } else if(_apiKey.length > 0) {
    status.textContent = 'invalid';
    status.style.color = 'var(--red)';
  } else {
    status.textContent = 'not set';
    status.style.color = 'var(--muted)';
  }
}

function getApiHeaders() {
  if(!_apiKey) {
    showInterrupt('Add your API key on the setup screen first.');
    throw new Error('No API key set');
  }
  return {
    'Content-Type': 'application/json',
    'x-api-key': _apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  };
}

// ═══════════════════════════════════════
// AI TASK BREAKDOWN
// ═══════════════════════════════════════
let aiSubtasks = [];
let currentSubtaskIdx = 0;

async function runAIBreakdown() {
  const mainTask = document.getElementById('main-task-input').value.trim();
  const dump     = document.getElementById('task-dump-input').value.trim();
  if(!mainTask && !dump) { showAIError('Enter your main task or paste a task dump first.'); return; }
  const taskText = dump || mainTask;

  document.getElementById('ai-breakdown-btn').style.display  = 'none';
  document.getElementById('ai-thinking').classList.add('show');
  document.getElementById('ai-error').classList.remove('show');
  document.getElementById('subtask-results').style.display   = 'none';

  const prompt = `You are a productivity coach helping a developer break down a complex technical task into ordered, focused work subtasks.

The user's task/dump:
"""
${taskText}
"""

Analyse this and produce a smart breakdown. Rules:
- Respect natural investigation dependencies (e.g. can't test edge cases before mapping the flow)
- Each subtask needs a specific first physical action — what do you do in the first 30 seconds?
- Estimate realistic minutes per subtask (be honest, not optimistic)
- Assign to block1 (morning deep work, ~120 min) or block2 (afternoon deep work, ~120 min)
- Maximum 6 subtasks
- Jira/documentation capture is NOT a separate subtask — embed as closing action of relevant subtasks
- Keep subtask names under 8 words

Respond ONLY with a JSON array, no markdown, no explanation:
[{"name":"short name","action":"specific first physical action","mins":60,"block":"block1"}]`;

  try {
    const res  = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST', headers:getApiHeaders(),
      body: JSON.stringify({
        model:'claude-sonnet-4-20250514', max_tokens:1000,
        messages:[{role:'user', content:prompt}]
      })
    });
    const data = await res.json();
    const raw  = data.content?.[0]?.text || '';
    const clean = raw.replace(/```json|```/g,'').trim();
    const parsed = JSON.parse(clean);
    if(!Array.isArray(parsed)||!parsed.length) throw new Error('Empty');

    aiSubtasks = parsed.map((t,i) => ({
      id:i, name:t.name||`Subtask ${i+1}`,
      action:t.action||'Open the relevant file',
      mins:t.mins||45, block:t.block||'block1', done:false
    }));

    renderSubtaskSetup();
    document.getElementById('ai-thinking').classList.remove('show');
    document.getElementById('subtask-results').style.display = 'block';
    if(!document.getElementById('main-task-input').value.trim())
      document.getElementById('main-task-input').value = taskText.split('\n')[0].slice(0,80);

  } catch(err) {
    document.getElementById('ai-thinking').classList.remove('show');
    document.getElementById('ai-breakdown-btn').style.display = 'flex';
    showAIError('Couldn\'t reach AI. Check your connection and try again.');
    console.error(err);
  }
}

function showAIError(msg) {
  const el = document.getElementById('ai-error');
  el.textContent = msg; el.classList.add('show');
}

function resetBreakdown() {
  aiSubtasks = []; currentSubtaskIdx = 0;
  document.getElementById('subtask-results').style.display  = 'none';
  document.getElementById('ai-breakdown-btn').style.display = 'flex';
  document.getElementById('ai-error').classList.remove('show');
}

function renderSubtaskSetup() {
  const container = document.getElementById('subtask-list-setup');
  const b1 = aiSubtasks.filter(t=>t.block==='block1');
  const b2 = aiSubtasks.filter(t=>t.block==='block2');
  let html = '';
  if(b1.length) {
    html += `<div class="breakdown-block-label">🔴 Deep work block 1 · ${b1.reduce((s,t)=>s+t.mins,0)} min</div>`;
    html += b1.map(t=>subtaskCardHTML(t)).join('');
  }
  if(b2.length) {
    html += `<div class="breakdown-block-label">🔵 Deep work block 2 · ${b2.reduce((s,t)=>s+t.mins,0)} min</div>`;
    html += b2.map(t=>subtaskCardHTML(t)).join('');
  }
  container.innerHTML = html;
}

function subtaskCardHTML(t) {
  const bc = t.block==='block1'?'b1':'b2';
  const bl = t.block==='block1'?'Block 1':'Block 2';
  return `<div class="subtask-card ${t.block}" id="stcard-${t.id}">
    <div class="subtask-card-header">
      <span class="subtask-num">${String(t.id+1).padStart(2,'0')}</span>
      <span class="subtask-block-tag ${bc}">${bl}</span>
      <span class="subtask-mins">${t.mins} min</span>
      <button class="subtask-del" onclick="deleteSubtask(${t.id})">✕</button>
    </div>
    <div class="subtask-name">${t.name}</div>
    <div class="subtask-action">${t.action}</div>
    <div class="subtask-edit-row">
      <input class="subtask-edit-input" value="${t.name.replace(/"/g,'&quot;')}"
        onchange="updateSubtaskName(${t.id},this.value)" placeholder="Edit name...">
    </div>
  </div>`;
}

function deleteSubtask(id) {
  aiSubtasks = aiSubtasks.filter(t=>t.id!==id);
  renderSubtaskSetup();
  if(!aiSubtasks.length) resetBreakdown();
}

function updateSubtaskName(id,val) {
  const t = aiSubtasks.find(t=>t.id===id);
  if(t) t.name = val;
}

function renderSubtaskProgress() {
  const panel = document.getElementById('subtask-progress');
  const items = document.getElementById('subtask-progress-items');
  if(!aiSubtasks.length) { panel.style.display='none'; return; }
  const block = schedule[state.currentBlock];
  if(!block||block.type!=='deep') { panel.style.display='none'; return; }
  const blockKey = block.id==='deep1'?'block1':'block2';
  const relevant = aiSubtasks.filter(t=>t.block===blockKey);
  if(!relevant.length) { panel.style.display='none'; return; }

  panel.style.display = 'block';
  items.innerHTML = relevant.map((t,i) => {
    const firstUndone = relevant.findIndex(x=>!x.done);
    const status = t.done ? 'done' : (i===firstUndone ? 'active' : '');
    return `<div class="subtask-progress-item ${status}" onclick="markSubtaskDone(${t.id})">
      <div class="subtask-pip"></div>
      <div style="flex:1;font-size:12px">${t.name}</div>
      <div style="font-family:var(--mono);font-size:9px;color:var(--muted)">${t.mins}m</div>
    </div>`;
  }).join('');

  const active = relevant.find(t=>!t.done);
  if(active) {
    document.getElementById('focus-task-name').textContent    = active.name;
    document.getElementById('focus-first-action').textContent = '→ ' + active.action;
    setTimer(active.mins * 60);
  } else {
    document.getElementById('focus-task-name').textContent    = 'All subtasks complete ✓';
    document.getElementById('focus-first-action').textContent = '→ Review findings, update Jira';
  }
}

function markSubtaskDone(id) {
  const t = aiSubtasks.find(t=>t.id===id);
  if(t) { t.done=!t.done; renderSubtaskProgress(); saveToStorage(); }
}

// ═══════════════════════════════════════
// LOGBOOK
// ═══════════════════════════════════════
// logbook = { [dateStr]: [ {time, raw, clean, category, taskName, subtaskName} ] }
let logbook = {};

const LOG_CATS = {
  finding:  { emoji:'🔍', keywords:['found','discovered','confirmed','identified','traced','shows','returns','called','calls'] },
  stuck:    { emoji:'🌀', keywords:['stuck','confused','circles','lost','unclear','not sure','going in','struggling','blocked','weird'] },
  progress: { emoji:'✓',  keywords:['done','complete','finished','fixed','working','progress','resolved','sorted','moved','pushed'] },
  return:   { emoji:'↩',  keywords:['back','returned','refocused','resumed','starting again','trying again'] },
  thought:  { emoji:'💭',  keywords:[] },
};

function categoriseEntry(text) {
  const lower = text.toLowerCase();
  for(const [cat, data] of Object.entries(LOG_CATS)) {
    if(data.keywords.some(k => lower.includes(k))) return cat;
  }
  return 'thought';
}

async function correctLogEntry(raw) {
  const taskName = getCurrentTaskName();
  const prompt = `You are a professional writing assistant. Clean up this rough work log entry into a proper sentence.

Rules:
- Fix grammar and spelling only — do NOT add information that isn't there
- Keep all technical terms exactly as written (class names, function names, tool names, file paths)
- Keep it concise — one or two sentences maximum
- Write in past tense, first person implied (no "I")
- If it's a feeling or mental state, clean it up but preserve the emotion honestly
- Context: software developer investigating duplicate payment transactions

Raw entry: "${raw}"

Respond with ONLY the corrected sentence. No quotes, no explanation.`;

  try {
    const res  = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST', headers:getApiHeaders(),
      body: JSON.stringify({
        model:'claude-sonnet-4-20250514', max_tokens:200,
        messages:[{role:'user', content:prompt}]
      })
    });
    const data = await res.json();
    return data.content?.[0]?.text?.trim() || raw;
  } catch(e) {
    return raw;
  }
}

function getCurrentTaskName() {
  if(aiSubtasks.length) {
    const block = schedule[state.currentBlock];
    if(block) {
      const blockKey = block.id === 'deep1' ? 'block1' : 'block2';
      const active   = aiSubtasks.filter(t=>t.block===blockKey).find(t=>!t.done);
      if(active) return active.name;
    }
  }
  const block = schedule[state.currentBlock];
  return block ? block.name : 'Current task';
}

function addLogEntry(raw, clean, category) {
  const dateStr = new Date().toDateString();
  if(!logbook[dateStr]) logbook[dateStr] = [];
  const entry = {
    id:       Date.now(),
    time:     formatTime(new Date()),
    raw:      raw,
    clean:    clean,
    category: category,
    taskName: getCurrentTaskName(),
    blockId:  schedule[state.currentBlock]?.id || '',
  };
  logbook[dateStr].unshift(entry); // newest first
  saveToStorage();
  return entry;
}

function switchLogTab(tab) {
  ['today','all'].forEach(t => {
    document.getElementById('ltab-'+t)?.classList.toggle('active', t===tab);
  });
  renderLogFeed(tab);
}

function renderLogFeed(tab) {
  tab = tab || 'today';
  const feed    = document.getElementById('log-feed');
  const dateStr = new Date().toDateString();
  const entries = tab === 'all'
    ? Object.entries(logbook).flatMap(([d,es]) => es.map(e=>({...e,_date:d}))).sort((a,b)=>b.id-a.id)
    : (logbook[dateStr] || []);

  // Update header
  const taskName = tab === 'all' ? 'All tasks — full history' : getCurrentTaskName();
  document.getElementById('logbook-task-name').textContent = taskName;
  document.getElementById('logbook-meta').textContent =
    tab === 'all'
      ? `${Object.keys(logbook).length} days · ${entries.length} total entries`
      : `${new Date().toLocaleDateString('en-AU',{weekday:'long',day:'numeric',month:'long'})} · ${entries.length} entries`;

  if(!entries.length) {
    feed.innerHTML = `<div style="font-family:var(--mono);font-size:11px;color:var(--muted);padding:24px 0;text-align:center">
      No entries yet${tab==='today'?' today':''}.<br>Press / on the focus screen to log a thought.
    </div>`;
    return;
  }

  feed.innerHTML = entries.map(e => `
    <div class="log-entry">
      <div class="log-time">${e.time}</div>
      <div class="log-cat">${LOG_CATS[e.category]?.emoji || '💭'}</div>
      <div class="log-body">
        <div class="log-text">${e.clean}</div>
        ${e.raw !== e.clean ? `<div class="log-raw">raw: ${e.raw}</div>` : ''}
        <div style="font-family:var(--mono);font-size:9px;color:var(--muted);margin-top:3px">${e.taskName}${tab==='all'&&e._date?' · '+e._date:''}</div>
      </div>
    </div>`).join('');
}

function copyLogToClipboard() {
  const dateStr = new Date().toDateString();
  const entries = (logbook[dateStr] || []).slice().reverse();
  if(!entries.length) { showInterrupt('No log entries today yet.'); return; }

  const lines = entries.map(e =>
    `[${e.time}] ${LOG_CATS[e.category]?.emoji||'💭'} ${e.clean}`
  ).join('\n');

  const text = `Work Log — ${dateStr}\n${'─'.repeat(40)}\n${lines}`;
  navigator.clipboard.writeText(text).then(() => {
    showInterrupt('Log copied — paste straight into Jira ✓');
  });
}

// ═══════════════════════════════════════
// QUICK CAPTURE
// ═══════════════════════════════════════
let qcOpen = false;

function openQC() {
  if(qcOpen) return;
  qcOpen = true;
  const overlay = document.getElementById('qc-overlay');
  const input   = document.getElementById('qc-input');
  overlay.classList.add('show');
  input.value = '';
  document.getElementById('qc-status').textContent = 'Enter to log · AI will clean it up';
  document.getElementById('qc-processing').style.display = 'none';
  // Tag current task
  document.getElementById('qc-task-tag').textContent = getCurrentTaskName();
  setTimeout(() => input.focus(), 100);
}

function closeQC() {
  qcOpen = false;
  document.getElementById('qc-overlay').classList.remove('show');
  document.getElementById('qc-input').value = '';
}

function closeQCIfOutside(e) {
  if(e.target === document.getElementById('qc-overlay')) closeQC();
}

async function submitQC() {
  const raw = document.getElementById('qc-input').value.trim();
  if(!raw) { closeQC(); return; }

  const category = categoriseEntry(raw);

  // Immediate close — process in background
  closeQC();
  showInterrupt(`Logged. Cleaning up with AI...`);

  // Add placeholder entry
  const entry = addLogEntry(raw, raw, category);

  // AI correction
  const clean = await correctLogEntry(raw);
  entry.clean = clean;

  // Update storage and re-render if logbook visible
  saveToStorage();
  const lb = document.getElementById('logbook-screen');
  if(lb.classList.contains('active')) renderLogFeed();

  showInterrupt(`✓ Logged: "${clean.slice(0,50)}${clean.length>50?'…':''}"`);
}

// ═══════════════════════════════════════
// CHECK-IN PULSE (every 20 mins during deep work)
// ═══════════════════════════════════════
let checkinInterval = null;
let checkinCount    = 0;
let lastCheckinMin  = 0;

const CHECKIN_QUESTIONS = [
  q => `${Math.floor(q)} minutes in — have you started yet?`,
  () => `How's the investigation going? On track?`,
  () => `Still making progress, or has something blocked you?`,
  q => `${Math.floor(q)} minutes left in this block — what have you got so far?`,
  () => `Quiet for a while — still with it?`,
];

function startCheckinCycle() {
  clearInterval(checkinInterval);
  checkinCount = 0;
  checkinInterval = setInterval(() => {
    const block = schedule[state.currentBlock];
    if(!block || block.type !== 'deep' || !state.timerRunning) return;

    // Fire every 20 minutes of active deep work
    const elapsed = (state.timerTotal - state.timerSeconds) / 60;
    if(elapsed - lastCheckinMin >= 20) {
      lastCheckinMin = elapsed;
      showCheckin(elapsed);
    }
  }, 30000); // check every 30s
}

function showCheckin(elapsedMins) {
  const remaining = state.timerSeconds / 60;
  const idx = Math.min(checkinCount, CHECKIN_QUESTIONS.length - 1);
  const q   = CHECKIN_QUESTIONS[idx](
    idx === 0 ? elapsedMins : remaining
  );

  document.getElementById('checkin-q').textContent = q;
  document.getElementById('stuck-response').classList.remove('show');
  document.getElementById('stuck-response').textContent = '';

  const pulse = document.getElementById('checkin-pulse');
  pulse.classList.add('show');
  checkinCount++;

  // Auto-dismiss after 90s if no response
  setTimeout(() => pulse.classList.remove('show'), 90000);
}

async function checkinRespond(type) {
  const pulse = document.getElementById('checkin-pulse');
  const stuckEl = document.getElementById('stuck-response');

  if(type === 'on-track') {
    pulse.classList.remove('show');
    addLogEntry('Check-in: on track', 'On track — continuing focused work.', 'progress');
    showInterrupt('Good. Keep going.');
    return;
  }

  if(type === 'progress') {
    pulse.classList.remove('show');
    addLogEntry('Check-in: making progress', 'Making progress — moving forward on the task.', 'progress');
    showInterrupt('Nice. Progress noted.');
    return;
  }

  if(type === 'stuck') {
    // Get AI response
    const elapsed  = Math.floor((state.timerTotal - state.timerSeconds) / 60);
    const taskName = getCurrentTaskName();
    const stuckCount = (logbook[new Date().toDateString()]||[])
      .filter(e=>e.category==='stuck').length;

    const prompt = `A developer is doing deep work and just signalled they are stuck or drifting.

Context:
- Current task: "${taskName}"
- Time spent on this session: ${elapsed} minutes
- Number of stuck signals today: ${stuckCount}

Give ONE short, specific, practical response. Options depending on context:
- If they've been going a long time: suggest timeboxing the remaining time
- If early in session: ask them to name the one thing blocking them
- If stuck multiple times: suggest breaking the task smaller or asking for help
- Always end with a single concrete question they can answer mentally

Keep it under 3 sentences. Conversational, not preachy. Direct.`;

    stuckEl.textContent = 'Thinking...';
    stuckEl.classList.add('show');

    try {
      const res  = await fetch('https://api.anthropic.com/v1/messages', {
        method:'POST', headers:getApiHeaders(),
        body: JSON.stringify({
          model:'claude-sonnet-4-20250514', max_tokens:150,
          messages:[{role:'user', content:prompt}]
        })
      });
      const data = await res.json();
      const txt  = data.content?.[0]?.text?.trim() || 'Name the one thing blocking you right now.';
      stuckEl.textContent = txt;
      addLogEntry('Check-in: stuck', txt, 'stuck');
    } catch(e) {
      stuckEl.textContent = 'Name the one thing blocking you right now. Write it down, then decide: push through or break it smaller.';
    }

    // Auto-close after 20s
    setTimeout(() => pulse.classList.remove('show'), 20000);
  }
}

// ═══════════════════════════════════════
// PERFORMANCE TRACKER
// ═══════════════════════════════════════
let perfTab = 'day';

function computeDayScore(dateStr) {
  // Returns 0-100 score for a given day from history
  const hist = getDayHistory(dateStr);
  if(!hist) return null;
  const deepTarget = 240; // 4 hours target
  const deepScore  = Math.min(100, (hist.deepWorkMinutes / deepTarget) * 100);
  const driftTarget = 40;
  const driftScore = Math.max(0, 100 - Math.max(0, hist.driftMinutes - driftTarget) * 2);
  const sessionScore = Math.min(100, (hist.sessionsCompleted / 6) * 100);
  const taskScore  = hist.tasksCompleted > 0 ? 100 : hist.mainTaskDone ? 70 : 30;
  return Math.round(deepScore * 0.4 + driftScore * 0.25 + sessionScore * 0.2 + taskScore * 0.15);
}

function getDayHistory(dateStr) {
  try {
    const all = JSON.parse(localStorage.getItem('dwos_history') || '{}');
    return all[dateStr] || null;
  } catch(e) { return null; }
}

function saveCurrentDayToHistory() {
  try {
    const all = JSON.parse(localStorage.getItem('dwos_history') || '{}');
    const dateStr = new Date().toDateString();
    const logEntries = logbook[dateStr] || [];
    const stuckCount = logEntries.filter(e=>e.category==='stuck').length;

    all[dateStr] = {
      deepWorkMinutes:  state.deepWorkMinutes,
      driftMinutes:     state.driftMinutes,
      sessionsCompleted:state.sessionsCompleted,
      mainTaskDone:     false, // updated by user in debrief
      tasksCompleted:   0,
      stuckSignals:     stuckCount,
      logEntries:       logEntries.length,
    };
    localStorage.setItem('dwos_history', JSON.stringify(all));
  } catch(e) {}
}

function getWeekDays() {
  const days = [];
  const today = new Date();
  for(let i=6; i>=0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    days.push(d.toDateString());
  }
  return days;
}

function switchPerfTab(tab) {
  perfTab = tab;
  ['day','week','month'].forEach(t => {
    document.getElementById('ptab-'+t).classList.toggle('active', t===tab);
  });
  renderPerfContent();
}

function renderPerfContent() {
  const el = document.getElementById('perf-content');
  if(perfTab === 'day') el.innerHTML = renderDayPerf();
  else if(perfTab === 'week') el.innerHTML = renderWeekPerf();
  else el.innerHTML = renderMonthPerf();

  // Animate bars after render
  setTimeout(() => {
    document.querySelectorAll('.perf-bar-fill[data-width]').forEach(b => {
      b.style.width = b.dataset.width;
    });
    document.querySelectorAll('.week-bar[data-height]').forEach(b => {
      b.style.height = b.dataset.height;
    });
  }, 50);
}

function renderDayPerf() {
  const deepH    = Math.floor(state.deepWorkMinutes / 60);
  const deepM    = Math.round(state.deepWorkMinutes % 60);
  const driftM   = Math.round(state.driftMinutes);
  const score    = computeDayScore(new Date().toDateString()) ||
    Math.round(Math.min(100, (state.deepWorkMinutes/240)*100*0.7 + (state.sessionsCompleted/6)*100*0.3));

  const deepTarget  = 240;
  const driftTarget = 40;
  const deepPct  = Math.min(100, Math.round((state.deepWorkMinutes / deepTarget) * 100));
  const driftPct = Math.min(100, Math.round((driftM / 60) * 100));
  const driftCol = driftM <= driftTarget ? 'var(--green)' : 'var(--red)';

  const stuckToday = (logbook[new Date().toDateString()]||[]).filter(e=>e.category==='stuck').length;
  const logCount   = (logbook[new Date().toDateString()]||[]).length;

  const scoreColor = score >= 70 ? 'var(--green)' : score >= 40 ? 'var(--gold)' : 'var(--red)';
  const scoreDesc  = score >= 70 ? 'Strong day.' : score >= 40 ? 'Decent effort — room to grow.' : 'Tough day. Tomorrow is fresh.';

  return `
  <div class="score-wrap">
    <div class="score-number" style="color:${scoreColor}">${score}</div>
    <div class="score-label">Deep Work Score</div>
    <div class="score-desc">${scoreDesc}</div>
  </div>
  <div class="perf-grid">
    <div class="perf-card">
      <div class="perf-card-val" style="color:var(--accent-l)">${deepH > 0 ? deepH+'h '+deepM+'m' : deepM+'m'}</div>
      <div class="perf-card-key">Deep work</div>
    </div>
    <div class="perf-card">
      <div class="perf-card-val" style="color:${driftM<=driftTarget?'var(--green)':'var(--red)'}">${driftM}m</div>
      <div class="perf-card-key">Drift time</div>
    </div>
    <div class="perf-card">
      <div class="perf-card-val" style="color:var(--green)">${state.sessionsCompleted}</div>
      <div class="perf-card-key">Sessions done</div>
    </div>
    <div class="perf-card">
      <div class="perf-card-val" style="color:var(--muted2)">${logCount}</div>
      <div class="perf-card-key">Log entries</div>
    </div>
  </div>
  <div class="perf-bar-row">
    <div class="perf-bar-item">
      <div class="perf-bar-header">
        <span>Deep work vs target (4h)</span><span>${deepPct}%</span>
      </div>
      <div class="perf-bar-track">
        <div class="perf-bar-fill" data-width="${deepPct}%" style="width:0;background:var(--accent)"></div>
      </div>
    </div>
    <div class="perf-bar-item">
      <div class="perf-bar-header">
        <span>Drift vs allocation (40m)</span>
        <span style="color:${driftCol}">${driftM <= driftTarget ? '✓ contained' : '+'+Math.round(driftM-driftTarget)+'m over'}</span>
      </div>
      <div class="perf-bar-track">
        <div class="perf-bar-fill" data-width="${Math.min(100,Math.round(driftM/driftTarget*100))}%" style="width:0;background:${driftCol}"></div>
      </div>
    </div>
  </div>
  ${stuckToday > 0 ? `<div class="perf-insight">
    <div class="perf-insight-label">Pattern signal</div>
    <div class="perf-insight-text">You hit <strong>${stuckToday} stuck signal${stuckToday>1?'s':''}</strong> today. 
    ${stuckToday >= 3 ? 'This suggests the task may need to be broken down further, or external input might help.' : 
      'That\'s normal for investigation work. Notice if it\'s always the same type of problem.'}
    </div>
  </div>` : ''}`;
}

function renderWeekPerf() {
  const weekDays  = getWeekDays();
  const today     = new Date().toDateString();
  const dayLabels = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const scores    = weekDays.map(d => {
    if(d === today) return computeDayScore(today) || 0;
    const h = getDayHistory(d);
    return h ? computeDayScore(d) : null;
  });

  const validScores  = scores.filter(s=>s!==null);
  const avgScore     = validScores.length ? Math.round(validScores.reduce((a,b)=>a+b,0)/validScores.length) : 0;
  const bestScore    = validScores.length ? Math.max(...validScores) : 0;
  const bestDayIdx   = scores.indexOf(bestScore);
  const bestDayLabel = bestDayIdx>=0 ? dayLabels[new Date(weekDays[bestDayIdx]).getDay() || 6] : '—';

  const maxScore = Math.max(...scores.filter(s=>s!==null), 1);
  const barsHTML = weekDays.map((d, i) => {
    const score = scores[i];
    const label = dayLabels[new Date(d).getDay() === 0 ? 6 : new Date(d).getDay()-1];
    const isToday = d === today;
    const hasData = score !== null;
    const h = hasData ? Math.max(4, Math.round((score/Math.max(maxScore,1))*80)) : 4;
    return `<div class="week-col">
      <div class="week-bar ${isToday?'today':''} ${!hasData?'empty':''}" 
           data-height="${h}px" style="height:4px"></div>
      <div class="week-lbl">${label}</div>
      <div class="week-scr">${hasData?score:'—'}</div>
    </div>`;
  }).join('');

  return `
  <div class="score-wrap">
    <div class="score-number" style="color:var(--accent-l)">${avgScore||'—'}</div>
    <div class="score-label">Weekly average</div>
  </div>
  <div class="week-bars">${barsHTML}</div>
  <div class="perf-grid">
    <div class="perf-card">
      <div class="perf-card-val" style="color:var(--green)">${bestScore||'—'}</div>
      <div class="perf-card-key">Best day score</div>
    </div>
    <div class="perf-card">
      <div class="perf-card-val" style="color:var(--gold)">${validScores.length}</div>
      <div class="perf-card-key">Days tracked</div>
    </div>
  </div>
  <div class="perf-insight">
    <div class="perf-insight-label">Weekly read</div>
    <div class="perf-insight-text">
      ${validScores.length < 3
        ? 'Not enough days tracked yet. Keep logging — patterns emerge after 3–4 days.'
        : avgScore >= 65
          ? `<strong>Solid week.</strong> Average score of ${avgScore}. ${bestDayLabel} was your best day — notice what made it different.`
          : `<strong>Mixed week.</strong> Average of ${avgScore}. The drift window and task-starting are the two levers with most impact on your score.`
      }
    </div>
  </div>`;
}

function renderMonthPerf() {
  // Collect last 30 days
  const days = [];
  for(let i=29;i>=0;i--) {
    const d = new Date(); d.setDate(d.getDate()-i);
    days.push(d.toDateString());
  }
  const scores = days.map(d => {
    if(d === new Date().toDateString()) return computeDayScore(d);
    return getDayHistory(d) ? computeDayScore(d) : null;
  }).filter(s=>s!==null);

  const avg   = scores.length ? Math.round(scores.reduce((a,b)=>a+b,0)/scores.length) : 0;
  const trend = scores.length >= 7
    ? scores.slice(-7).reduce((a,b)=>a+b,0)/7 - scores.slice(0,7).reduce((a,b)=>a+b,0)/7
    : 0;
  const trendStr = trend > 5 ? '↑ trending up' : trend < -5 ? '↓ trending down' : '→ steady';
  const trendCol = trend > 5 ? 'var(--green)' : trend < -5 ? 'var(--red)' : 'var(--muted2)';

  return `
  <div class="score-wrap">
    <div class="score-number" style="color:var(--accent-l)">${avg||'—'}</div>
    <div class="score-label">30-day average</div>
    <div class="score-desc" style="color:${trendCol}">${trendStr}</div>
  </div>
  <div class="perf-grid">
    <div class="perf-card">
      <div class="perf-card-val" style="color:var(--gold)">${scores.length}</div>
      <div class="perf-card-key">Days tracked</div>
    </div>
    <div class="perf-card">
      <div class="perf-card-val" style="color:var(--green)">${scores.length ? Math.max(...scores) : '—'}</div>
      <div class="perf-card-key">Best score</div>
    </div>
  </div>
  <div class="perf-insight">
    <div class="perf-insight-label">Month read</div>
    <div class="perf-insight-text">
      ${scores.length < 7
        ? 'Keep going — meaningful monthly patterns need at least 7 days of data.'
        : `<strong>${scores.length} days tracked.</strong> ${trend > 5 ? 'Your scores are improving — the system is working.' : trend < -5 ? 'Scores have dipped lately. Revisit your morning setup ritual and drift window discipline.' : 'Consistent performance. Look for the one thing that separates your 80+ days from your 50 days.'}`
      }
    </div>
  </div>`;
}

// ═══════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════
function navTo(dest) {
  const clocks = ['clock-logbook','clock-perf'];
  clocks.forEach(id => {
    const el = document.getElementById(id);
    if(el) el.textContent = formatTime(new Date());
  });

  ['nav-focus','nav-log','nav-perf'].forEach(id => {
    document.getElementById(id)?.classList.remove('active');
  });

  if(dest === 'focus') {
    document.getElementById('nav-focus').classList.add('active');
    showScreen('focus-screen');
  } else if(dest === 'logbook') {
    document.getElementById('nav-log').classList.add('active');
    showScreen('logbook-screen');
    renderLogFeed();
  } else if(dest === 'perf') {
    document.getElementById('nav-perf').classList.add('active');
    showScreen('perf-screen');
    renderPerfContent();
  }
}

function showBottomNav() {
  document.getElementById('bottom-nav').classList.add('show');
}

// Show slash hint after timer starts
function showSlashHint() {
  setTimeout(() => {
    document.getElementById('slash-hint')?.classList.add('show');
  }, 3000);
}

// ═══════════════════════════════════════
// ═══════════════════════════════════════
function formatTime(date) {
  return date.toLocaleTimeString('en-AU', {hour:'2-digit', minute:'2-digit', hour12:false});
}
function updateClocks() {
  const t = formatTime(new Date());
  ['clock-setup','clock-focus','clock-break','clock-debrief'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.textContent = t;
  });
}
setInterval(updateClocks, 1000);
updateClocks();

function getGreeting() {
  const h = new Date().getHours();
  if(h < 12) return 'Good morning.';
  if(h < 17) return 'Good afternoon.';
  return 'Good evening.';
}
document.getElementById('greeting-text').textContent = getGreeting();

// ═══════════════════════════════════════
// SCREEN MANAGEMENT
// ═══════════════════════════════════════
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ═══════════════════════════════════════
// SETUP FLOW
// ═══════════════════════════════════════
function nextStep(step) {
  for(let i=0;i<=5;i++){
    const el = document.getElementById('step-'+i);
    if(el) el.style.display = i===step ? 'flex' : 'none';
  }
  if(step === 5) buildDayPreview();
}

function buildDayPreview() {
  const mainTask   = document.getElementById('main-task-input').value || 'Main work task';
  const mainAction = document.getElementById('main-action-input').value || 'Open the file';
  const task2      = document.getElementById('task2').value;
  const task3      = document.getElementById('task3').value;
  const learnTask  = document.getElementById('learn-task').value || 'AZ-104 with CloudLee';
  const lesson     = document.getElementById('learn-lesson').value;

  state.today = {
    mainTask, mainAction, task2, task3, learnTask, lesson,
    personalTasks: [...document.querySelectorAll('.personal-input')]
      .map(i=>i.value).filter(Boolean),
  };

  // Build schedule with real task names
  schedule = SCHEDULE_TEMPLATE.map(b => ({...b}));
  schedule.find(b=>b.id==='deep1').name  = mainTask.length > 30 ? mainTask.slice(0,30)+'…' : mainTask;
  schedule.find(b=>b.id==='learn').name  = learnTask.length > 22 ? learnTask.slice(0,22)+'…' : learnTask;

  const preview = document.getElementById('day-preview');
  preview.innerHTML = schedule.map(b => `
    <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">
      <span style="font-size:16px;width:24px;text-align:center">${b.icon}</span>
      <span style="font-family:var(--mono);font-size:10px;color:var(--muted);min-width:80px">${b.start}–${b.end}</span>
      <span style="font-size:13px;font-weight:600">${b.name}</span>
    </div>
  `).join('');
}

function startDay() {
  buildScheduleBar();
  saveToStorage();
  showScreen('focus-screen');
  showBottomNav();
  setCurrentBlock(0);
  startCheckinCycle();
}

// ═══════════════════════════════════════
// SCHEDULE BAR
// ═══════════════════════════════════════
function buildScheduleBar() {
  const bar = document.getElementById('schedule-bar');
  bar.innerHTML = schedule.map((b,i) => `
    <div class="sched-block ${b.type}" id="sched-${i}" onclick="jumpToBlock(${i})">
      <div class="sched-time">${b.start}</div>
      <div class="sched-name">${b.icon} ${b.name}</div>
    </div>
  `).join('');
}

function updateScheduleBar(activeIdx) {
  schedule.forEach((b,i) => {
    const el = document.getElementById('sched-'+i);
    if(!el) return;
    el.classList.remove('active-block','done-block');
    if(i === activeIdx) el.classList.add('active-block');
    else if(i < activeIdx) el.classList.add('done-block');
  });
}

function jumpToBlock(i) {
  setCurrentBlock(i);
}

// ═══════════════════════════════════════
// BLOCK LOGIC
// ═══════════════════════════════════════
function setCurrentBlock(i) {
  state.currentBlock = i;
  const block = schedule[i];
  if(!block) { showDebrief(); return; }

  updateScheduleBar(i);
  state.blockStartTime = Date.now();

  // Set mode badge
  const badgeEl = document.getElementById('focus-mode-badge');
  const modeMap = {
    deep:'mode-deep', drift:'mode-drift', learn:'mode-learn',
    walk:'mode-walk', admin:'mode-admin', standup:'mode-standup', review:'mode-review'
  };
  const modeLabels = {
    deep:'Deep work', drift:'Drift window', learn:'Learning',
    walk:'Walk', admin:'Admin', standup:'Standup', review:'Review'
  };
  badgeEl.innerHTML = `
    <div class="mode-badge ${modeMap[block.type]||'mode-review'}">
      <div class="dot"></div>
      ${modeLabels[block.type]||block.type}
    </div>`;

  document.getElementById('focus-until-text').textContent = `until ${block.end}`;

  // Set task name
  let taskName = block.name;
  let firstAction = '';

  if(block.type === 'deep' && block.id === 'deep1') {
    taskName = state.today.mainTask || block.name;
    firstAction = state.today.mainAction || 'Open the file';
  } else if(block.type === 'deep' && block.id === 'deep2') {
    taskName = state.today.task2 || state.today.mainTask || block.name;
    firstAction = 'Pick up where you left off';
  } else if(block.type === 'learn') {
    const lesson = state.today.lesson ? ` — starting lesson ${state.today.lesson}` : '';
    taskName = (state.today.learnTask || 'AZ-104') + lesson;
    firstAction = 'Open the course, press play';
  } else if(block.type === 'drift') {
    taskName = 'YouTube + Markets';
    firstAction = 'Fully sanctioned. Watch the clock.';
  } else if(block.type === 'walk') {
    taskName = 'Walk — 30 minutes';
    firstAction = 'Stand up. Put your shoes on. Go.';
  } else if(block.type === 'admin') {
    const pt = state.today.personalTasks;
    taskName = pt && pt.length ? pt[0] : 'Personal tasks';
    firstAction = pt && pt.length > 1 ? `Then: ${pt.slice(1).join(', ')}` : 'Work through the list';
  } else if(block.type === 'standup') {
    taskName = 'Team standup';
    firstAction = 'Check your notes, open the call';
  } else if(block.type === 'review') {
    taskName = block.id === 'ritual' ? 'Morning setup done' : 'End of day review';
    firstAction = block.id === 'ritual' ? 'Day is set. Deep work begins at 10:40' : 'Reflect honestly';
  }

  document.getElementById('focus-task-name').textContent = taskName;
  document.getElementById('focus-first-action').textContent = '→ ' + firstAction;

  // Overlay subtask progress if AI breakdown exists for this block
  renderSubtaskProgress();

  // Set timer based on block type
  const workMins = block.workMins || 25;
  const sessionMins = block.type === 'deep' ? 50 :
                      block.type === 'learn' ? 50 :
                      block.type === 'admin' ? 40 :
                      block.type === 'drift' ? 40 :
                      block.type === 'walk'  ? 30 : 25;

  setTimer(sessionMins * 60);

  // Drift block special handling
  if(block.type === 'drift' && !state.driftWarningShown) {
    state.driftWarningShown = true;
    showDriftWarning();
  }

  // Update action button
  const btn = document.getElementById('main-action-btn');
  if(block.type === 'drift' || block.type === 'walk' || block.type === 'standup' || block.type === 'review') {
    btn.textContent = '▶ Begin';
  } else {
    btn.textContent = '▶ Start session';
  }

  state.timerRunning = false;
  updateTimerUI();
}

// ═══════════════════════════════════════
// TIMER
// ═══════════════════════════════════════
let timerInterval = null;

function setTimer(seconds) {
  clearInterval(timerInterval);
  state.timerSeconds = seconds;
  state.timerTotal   = seconds;
  state.timerRunning = false;
  updateTimerUI();
}

function toggleTimer() {
  if(state.timerRunning) {
    pauseTimer();
  } else {
    startTimer();
  }
}

function startTimer() {
  state.timerRunning = true;
  document.getElementById('main-action-btn').textContent = '⏸ Pause';
  showSlashHint();
  timerInterval = setInterval(() => {
    state.timerSeconds--;
    if(state.timerSeconds <= 0) {
      clearInterval(timerInterval);
      timerComplete();
    }
    updateTimerUI();

    // Track deep work time
    const block = schedule[state.currentBlock];
    if(block && (block.type==='deep'||block.type==='learn'||block.type==='admin')) {
      state.deepWorkMinutes += 1/60;
    }
    if(block && block.type==='drift') {
      state.driftMinutes += 1/60;
    }
  }, 1000);
}

function pauseTimer() {
  state.timerRunning = false;
  clearInterval(timerInterval);
  document.getElementById('main-action-btn').textContent = '▶ Resume';
}

function updateTimerUI() {
  const mins = Math.floor(state.timerSeconds / 60);
  const secs = state.timerSeconds % 60;
  document.getElementById('timer-display').textContent =
    `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;

  const progress = state.timerSeconds / state.timerTotal;
  const circumference = 2 * Math.PI * 90; // r=90
  const offset = circumference * (1 - progress);
  const ring = document.getElementById('timer-ring');
  ring.style.strokeDasharray  = circumference;
  ring.style.strokeDashoffset = offset;

  // Color warning
  if(state.timerSeconds < 60) {
    ring.style.stroke = 'var(--red)';
  } else if(state.timerSeconds < 5*60) {
    ring.style.stroke = 'var(--gold)';
  } else {
    ring.style.stroke = 'var(--accent)';
  }

  document.getElementById('timer-sublabel').textContent =
    state.timerRunning ? 'focus' : 'ready';
}

function timerComplete() {
  state.sessionsCompleted++;
  updateSessionLog();
  showInterrupt('Session complete. Take a short break, then continue.');
  document.getElementById('main-action-btn').textContent = '▶ Next session';
  state.timerRunning = false;
}

function updateSessionLog() {
  const log = document.getElementById('session-log');
  log.innerHTML = '';
  const block = schedule[state.currentBlock];
  const total = block && block.type === 'deep' ? 4 : 2;
  for(let i=0;i<total;i++){
    const pip = document.createElement('div');
    pip.className = 'session-pip' +
      (i < state.sessionsCompleted ? ' done' : '') +
      (i === state.sessionsCompleted ? ' current' : '');
    log.appendChild(pip);
  }
}

// ═══════════════════════════════════════
// BREAK
// ═══════════════════════════════════════
function takingBreak() {
  clearInterval(timerInterval);
  state.timerRunning = false;

  const block = schedule[state.currentBlock];
  const isLong = block && block.type === 'deep' && state.sessionsCompleted >= 2;
  const breakMins = isLong ? 15 : 10;

  startBreakScreen(breakMins, 'Short break', 'YOU EARNED THIS · RELAX');
}

function startBreakScreen(mins, label, sublabel) {
  state.breakSeconds   = mins * 60;
  state.breakTotal     = mins * 60;
  state.breakExtended  = false;

  document.getElementById('break-mode-label').textContent = label;
  document.getElementById('break-sub-text').textContent   = sublabel;
  document.getElementById('reentry-box').classList.remove('visible');
  document.getElementById('reentry-input').value = '';
  document.getElementById('end-break-btn').style.display = 'none';
  document.getElementById('extend-btn').classList.remove('show');
  document.getElementById('extend-btn').style.display = 'flex';

  showScreen('break-screen');
  updateBreakUI();

  const breakInterval = setInterval(() => {
    state.breakSeconds--;
    updateBreakUI();

    // Show re-entry question at 2 mins
    if(state.breakSeconds === 120) {
      document.getElementById('reentry-box').classList.add('visible');
    }
    // Show end break button at 30 secs
    if(state.breakSeconds === 30) {
      document.getElementById('end-break-btn').style.display = 'flex';
      document.getElementById('extend-btn').style.display = 'none';
    }

    if(state.breakSeconds <= 0) {
      clearInterval(breakInterval);
      triggerTakeover();
    }
  }, 1000);

  // Store interval ref for potential clearing
  state._breakInterval = breakInterval;
}

function updateBreakUI() {
  const mins = Math.floor(state.breakSeconds / 60);
  const secs = state.breakSeconds % 60;
  const display = `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
  const el = document.getElementById('break-timer-display');
  el.textContent = display;

  // Color transitions
  const ratio = state.breakSeconds / state.breakTotal;
  el.classList.remove('urgent','warning');
  if(state.breakSeconds <= 60)        el.classList.add('urgent');
  else if(state.breakSeconds <= 2*60) el.classList.add('warning');

  // Progress bar
  const fill = document.getElementById('break-progress');
  fill.style.width = (ratio * 100) + '%';
  fill.classList.remove('urgent','warning');
  if(state.breakSeconds <= 60)        fill.classList.add('urgent');
  else if(state.breakSeconds <= 2*60) fill.classList.add('warning');
}

function extendBreak() {
  if(state.breakExtended) return;
  state.breakExtended = true;
  state.breakSeconds += 5 * 60;
  state.breakTotal   += 5 * 60;
  document.getElementById('extend-btn').style.display = 'none';
  document.getElementById('extend-note').textContent  = 'Extension used. No more.';
  showInterrupt('5 extra minutes. That\'s the last one.');
}

function endBreak() {
  clearInterval(state._breakInterval);
  triggerTakeover();
}

function triggerTakeover() {
  const action = document.getElementById('reentry-input').value ||
                 state.today.mainAction || 'Open the file and start.';
  state.lastBreakAction = action;
  document.getElementById('takeover-action-text').textContent = action;
  showScreen('takeover-screen');
  document.getElementById('orb3').style.opacity = '1';
}

function returnFromBreak() {
  document.getElementById('orb3').style.opacity = '0';
  showScreen('focus-screen');
  // Update first action with re-entry commitment
  if(state.lastBreakAction) {
    document.getElementById('focus-first-action').textContent = '→ ' + state.lastBreakAction;
  }
}

// ═══════════════════════════════════════
// SESSION COMPLETE / BLOCK ADVANCE
// ═══════════════════════════════════════
function completeSession() {
  clearInterval(timerInterval);
  state.timerRunning = false;
  state.sessionsCompleted = 0;

  const next = state.currentBlock + 1;
  if(next >= schedule.length) {
    showDebrief();
  } else {
    setCurrentBlock(next);
    showInterrupt(`Moving to: ${schedule[next].icon} ${schedule[next].name}`);
  }
}

// ═══════════════════════════════════════
// DRIFT WARNING
// ═══════════════════════════════════════
function showDriftWarning() {
  document.getElementById('drift-warning').classList.add('show');
  // Count down the drift warning display time
  let driftSecs = 40 * 60;
  const driftInterval = setInterval(() => {
    driftSecs--;
    const m = Math.floor(driftSecs/60);
    const s = driftSecs % 60;
    document.getElementById('drift-warning-time').textContent =
      `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    if(driftSecs <= 0) clearInterval(driftInterval);
  }, 1000);
}

function closeDriftWarning() {
  document.getElementById('drift-warning').classList.remove('show');
  // Start focus timer for drift block
  startTimer();
}

// ═══════════════════════════════════════
// NUDGE (for when drift extends)
// ═══════════════════════════════════════
function showNudge(msg) {
  const bar = document.getElementById('nudge-bar');
  document.getElementById('nudge-text').innerHTML = msg;
  bar.classList.add('show');
  setTimeout(() => bar.classList.remove('show'), 8000);
}

function closeNudge() {
  document.getElementById('nudge-bar').classList.remove('show');
}

// ═══════════════════════════════════════
// INTERRUPT BANNER
// ═══════════════════════════════════════
function showInterrupt(msg) {
  const banner = document.getElementById('interrupt-banner');
  banner.textContent = msg;
  banner.classList.add('show');
  setTimeout(() => banner.classList.remove('show'), 4000);
}

// ═══════════════════════════════════════
// DEBRIEF
// ═══════════════════════════════════════
// Save history when debrief is shown
function showDebrief() {
  saveCurrentDayToHistory();
  clearInterval(timerInterval);
  showScreen('debrief-screen');

  // Date
  const now = new Date();
  document.getElementById('debrief-date-label').textContent =
    now.toLocaleDateString('en-AU', {weekday:'long', day:'numeric', month:'long'});

  // Stats
  const deepH  = Math.floor(state.deepWorkMinutes / 60);
  const deepM  = Math.round(state.deepWorkMinutes % 60);
  const driftM = Math.round(state.driftMinutes);

  document.getElementById('stat-deep').textContent =
    deepH > 0 ? `${deepH}h ${deepM}m` : `${deepM}m`;
  document.getElementById('stat-drift').textContent = `${driftM}m`;
  document.getElementById('stat-sessions').textContent = state.sessionsCompleted;

  // Tasks checklist — use AI subtasks if available, otherwise manual tasks
  const tasks = aiSubtasks.length
    ? aiSubtasks.map(t => ({ name: t.name, done: t.done }))
    : [
        state.today.mainTask,
        state.today.task2,
        state.today.task3,
        state.today.learnTask ? `Learning: ${state.today.learnTask}` : null,
        ...(state.today.personalTasks || []),
      ].filter(Boolean).map(n => ({ name: n, done: false }));

  const list = document.getElementById('tasks-done-list');
  list.innerHTML = tasks.map((t,i) => `
    <div class="task-done-item">
      <div class="task-done-check ${t.done?'checked':''}" id="chk-${i}" onclick="toggleTaskCheck(${i})">
        ${t.done ? '✓' : ''}
      </div>
      <div class="task-done-name ${t.done?'checked':''}" id="tdn-${i}">${t.name}</div>
    </div>
  `).join('');

  // Narrative
  const driftOver = driftM > 45;
  const goodDeep  = state.deepWorkMinutes > 180;

  const narratives = [
    goodDeep
      ? `<strong>Solid deep work today.</strong> ${deepH > 0 ? deepH+'h '+deepM+'m' : deepM+'m'} of focused time is real progress.`
      : `<strong>Light on deep work today.</strong> That's okay — the day had its moments. Tomorrow the 10:40 block is your priority.`,
    driftOver
      ? ` Drift ran <strong>${driftM} minutes</strong> — about ${driftM - 40} minutes over. The YouTube window is there to serve you, not swallow you.`
      : ` Drift was contained — <strong>${driftM} minutes</strong>. That's the goal.`,
    ` You completed <strong>${state.sessionsCompleted} focus sessions</strong>.`,
  ];

  document.getElementById('debrief-narrative').innerHTML = narratives.join('');

  // Tomorrow suggestion
  const suggestions = driftOver
    ? 'Before the drift window ends tomorrow, type your first action into the app. Don\'t wait for motivation — type it, then press start.'
    : goodDeep
    ? 'Tomorrow: protect the 10:40 start time. That\'s when your best work happens.'
    : 'Tomorrow: commit to starting the first task within 5 minutes of 10:40. Just open the file.';

  document.getElementById('debrief-tomorrow').textContent = suggestions;
}

function toggleTaskCheck(i) {
  const chk  = document.getElementById('chk-'+i);
  const name = document.getElementById('tdn-'+i);
  const isChecked = chk.classList.toggle('checked');
  name.classList.toggle('checked');
  chk.textContent = isChecked ? '✓' : '';
}

function resetDay() {
  state.sessionsCompleted  = 0;
  state.deepWorkMinutes    = 0;
  state.driftMinutes       = 0;
  state.driftWarningShown  = false;
  state.currentBlock       = 0;
  state.today              = {};
  schedule                 = [];
  aiSubtasks               = [];
  currentSubtaskIdx        = 0;
  logbook                  = {};
  lastCheckinMin           = 0;
  checkinCount             = 0;
  clearInterval(timerInterval);
  clearInterval(checkinInterval);
  document.getElementById('bottom-nav').classList.remove('show');
  showScreen('setup-screen');
  nextStep(0);
  document.getElementById('greeting-text').textContent = getGreeting();
}

// ═══════════════════════════════════════
// STORAGE (localStorage)
// ═══════════════════════════════════════
function saveToStorage() {
  try {
    localStorage.setItem('dwos_today', JSON.stringify({
      date: new Date().toDateString(),
      today: state.today,
      deepWorkMinutes: state.deepWorkMinutes,
      sessionsCompleted: state.sessionsCompleted,
      aiSubtasks: aiSubtasks,
      logbook: logbook,
    }));
  } catch(e) {}
}

function loadFromStorage() {
  try {
    const saved = JSON.parse(localStorage.getItem('dwos_today'));
    if(saved && saved.date === new Date().toDateString()) {
      state.today             = saved.today || {};
      state.deepWorkMinutes   = saved.deepWorkMinutes || 0;
      state.sessionsCompleted = saved.sessionsCompleted || 0;
      aiSubtasks              = saved.aiSubtasks || [];
      logbook                 = saved.logbook || {};
    }
  } catch(e) {}
}

// ═══════════════════════════════════════
// REAL-TIME BLOCK DETECTION
// Uses actual clock to suggest current block
// ═══════════════════════════════════════
function getCurrentBlockByTime() {
  const now    = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  for(let i = 0; i < schedule.length; i++) {
    const [sh,sm] = schedule[i].start.split(':').map(Number);
    const [eh,em] = schedule[i].end.split(':').map(Number);
    const startMin = sh*60+sm;
    const endMin   = eh*60+em;
    if(nowMin >= startMin && nowMin < endMin) return i;
  }
  return -1;
}

// ═══════════════════════════════════════
// INIT
// ═══════════════════════════════════════
loadFromStorage();

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  // Space = start/pause on focus screen
  if(e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
    const fs = document.getElementById('focus-screen');
    if(fs.classList.contains('active')) {
      e.preventDefault();
      toggleTimer();
    }
  }
  // / = open quick capture on focus screen
  if(e.key === '/' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
    const fs = document.getElementById('focus-screen');
    if(fs.classList.contains('active')) {
      e.preventDefault();
      openQC();
    }
  }
  // ESC = close quick capture
  if(e.code === 'Escape') {
    if(qcOpen) closeQC();
    document.getElementById('checkin-pulse').classList.remove('show');
  }
});

// Enter in QC submits
document.getElementById('qc-input').addEventListener('keydown', e => {
  if(e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    submitQC();
  }
});
