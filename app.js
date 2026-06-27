const DEFAULT_DURATIONS = { focus: 25, shortBreak: 5, longBreak: 15 };
const LONG_BREAK_INTERVAL = 4;

let state = {
  mode: 'focus',
  timeLeft: DEFAULT_DURATIONS.focus * 60,
  totalTime: DEFAULT_DURATIONS.focus * 60,
  isRunning: false,
  timerId: null,
  completedPomodoros: 0,
  currentTaskId: null,
};

let settings = loadSettings();
let todos = loadTodos();
let stats = loadStats();

// DOM refs
const $ = id => document.getElementById(id);
const timerDisplay = $('timerDisplay');
const timerLabel = $('timerLabel');
const startBtn = $('startBtn');
const resetBtn = $('resetBtn');
const modeTabs = document.querySelectorAll('.mode-tab');
const pomodoroCount = $('pomodoroCount');
const todayCount = $('todayCount');
const todoForm = $('todoForm');
const todoInput = $('todoInput');
const todoList = $('todoList');
const todoCount = $('todoCount');
const statPomodoros = $('statPomodoros');
const statMinutes = $('statMinutes');
const statTasks = $('statTasks');
const timerSection = document.querySelector('.timer-section');
const ringProgress = document.querySelector('.ring-progress');
const audio = $('notificationSound');

// Sound – generate a gentle chime
function initAudio() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 1);

    setTimeout(() => {
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.frequency.value = 1108;
      osc2.type = 'sine';
      gain2.gain.setValueAtTime(0.3, ctx.currentTime);
      gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8);
      osc2.start(ctx.currentTime);
      osc2.stop(ctx.currentTime + 0.8);
    }, 200);
  } catch (_) { /* fallback silent */ }
}

// Storage helpers
function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem('pomodoro_settings'));
    return s || { ...DEFAULT_DURATIONS, longBreakInterval: LONG_BREAK_INTERVAL };
  } catch { return { ...DEFAULT_DURATIONS, longBreakInterval: LONG_BREAK_INTERVAL }; }
}

function saveSettings() {
  localStorage.setItem('pomodoro_settings', JSON.stringify(settings));
}

function loadTodos() {
  try { return JSON.parse(localStorage.getItem('pomodoro_todos')) || []; }
  catch { return []; }
}

function saveTodos() {
  localStorage.setItem('pomodoro_todos', JSON.stringify(todos));
}

function loadStats() {
  try {
    const s = JSON.parse(localStorage.getItem('pomodoro_stats'));
    const today = new Date().toDateString();
    if (s && s.date === today) return s;
    return { date: today, pomodoros: 0, minutes: 0, tasksDone: 0 };
  } catch {
    return { date: new Date().toDateString(), pomodoros: 0, minutes: 0, tasksDone: 0 };
  }
}

function saveStats() {
  localStorage.setItem('pomodoro_stats', JSON.stringify(stats));
}

function loadWhitelist() {
  try { return JSON.parse(localStorage.getItem('pomodoro_whitelist')) || []; }
  catch { return []; }
}
function saveWhitelist() {
  localStorage.setItem('pomodoro_whitelist', JSON.stringify(whitelist));
}
function loadHabits() {
  try {
    const h = JSON.parse(localStorage.getItem('pomodoro_habits'));
    const today = new Date().toDateString();
    if (h && h.date === today) return h;
    return { date: today, items: [] };
  } catch { return { date: new Date().toDateString(), items: [] }; }
}
function saveHabits() {
  localStorage.setItem('pomodoro_habits', JSON.stringify(habits));
}
function getDurationForMode(mode) {
  return (settings[mode] || DEFAULT_DURATIONS[mode]) * 60;
}

// Timer
function updateDisplay() {
  const m = Math.floor(state.timeLeft / 60);
  const s = state.timeLeft % 60;
  timerDisplay.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

  const total = state.totalTime || 1;
  const offset = 628.32 * (1 - state.timeLeft / total);
  ringProgress.style.strokeDashoffset = offset;

  const modeNames = { focus: '专注时间', shortBreak: '短休时间', longBreak: '长休时间' };
  timerLabel.textContent = modeNames[state.mode] || '专注时间';
}

function setMode(mode) {
  state.mode = mode;
  state.isRunning = false;
  clearInterval(state.timerId);
  state.timerId = null;
  state.totalTime = getDurationForMode(mode);
  state.timeLeft = state.totalTime;
  startBtn.textContent = '开始';

  timerSection.className = 'timer-section ' + mode + '-mode';
  modeTabs.forEach(tab => tab.classList.toggle('active', tab.dataset.mode === mode));
  updateDisplay();
}

function tick() {
  state.timeLeft--;
  updateDisplay();
  if (state.timeLeft <= 0) {
    clearInterval(state.timerId);
    state.timerId = null;
    state.isRunning = false;
    startBtn.textContent = '开始';
    onTimerComplete();
  }
}

function toggleTimer() {
  if (state.isRunning) {
    clearInterval(state.timerId);
    state.timerId = null;
    state.isRunning = false;
    startBtn.textContent = '继续';
  } else {
    state.isRunning = true;
    startBtn.textContent = '暂停';
    state.timerId = setInterval(tick, 1000);
  }
}

function resetTimer() {
  state.isRunning = false;
  clearInterval(state.timerId);
  state.timerId = null;
  state.totalTime = getDurationForMode(state.mode);
  state.timeLeft = state.totalTime;
  startBtn.textContent = '开始';
  updateDisplay();
}

function onTimerComplete() {
  initAudio();

  if (state.mode === 'focus') {
    state.completedPomodoros++;
    stats.pomodoros++;
    stats.minutes += Math.round(settings.focus || DEFAULT_DURATIONS.focus);
    saveStats();
    updatePomodoroDots();
    updateStatsUI();
    updateTodayBadge();

    // Auto-complete active task
    if (state.currentTaskId !== null) {
      const task = todos.find(t => t.id === state.currentTaskId);
      if (task && !task.done) {
        task.done = true;
        stats.tasksDone++;
        saveTodos();
        saveStats();
        renderTodos();
        updateStatsUI();
      }
      state.currentTaskId = null;
    }

    // Decide next break
    if (state.completedPomodoros % (settings.longBreakInterval || LONG_BREAK_INTERVAL) === 0) {
      setMode('longBreak');
    } else {
      setMode('shortBreak');
    }
  } else {
    setMode('focus');
  }

  if (Notification.permission === 'granted') {
    const msg = state.mode === 'focus' ? '专注时间结束！休息一下吧 🍅' : '休息结束！开始新的专注 💪';
    new Notification('番茄Todo', { body: msg });
  }
}

// Pomodoro dots
function updatePomodoroDots() {
  const interval = settings.longBreakInterval || LONG_BREAK_INTERVAL;
  const dots = pomodoroCount.querySelectorAll('.count-dot');
  dots.forEach((dot, i) => {
    dot.classList.toggle('filled', i < state.completedPomodoros % interval);
  });
}

// Today badge
function updateTodayBadge() {
  todayCount.textContent = `今日 ${stats.pomodoros}`;
}

// Stats UI
function updateStatsUI() {
  statPomodoros.textContent = stats.pomodoros;
  statMinutes.textContent = stats.minutes;
  statTasks.textContent = stats.tasksDone;
}

// Todos
function renderTodos() {
  todoList.innerHTML = '';
  if (todos.length === 0) {
    todoList.innerHTML = '<li class="empty-state">还没有任务，添加一个吧 ✨</li>';
    todoCount.textContent = '0';
    return;
  }

  const activeTodos = todos.filter(t => !t.done);
  const doneTodos = todos.filter(t => t.done);
  const sorted = [...activeTodos, ...doneTodos];

  sorted.forEach(task => {
    const li = document.createElement('li');
    li.className = 'todo-item' + (task.done ? ' completed' : '');
    li.dataset.id = task.id;

    const checkbox = document.createElement('button');
    checkbox.className = 'todo-checkbox';
    checkbox.setAttribute('aria-label', task.done ? '取消完成' : '完成任务');
    checkbox.textContent = task.done ? '✓' : '';
    checkbox.addEventListener('click', () => toggleTodo(task.id));

    const text = document.createElement('span');
    text.className = 'todo-text';
    text.textContent = task.text;

    const badge = document.createElement('span');
    badge.className = 'todo-active-badge';
    badge.textContent = '专注中';
    badge.style.display = (state.currentTaskId === task.id && !task.done && state.mode === 'focus') ? 'block' : 'none';

    const del = document.createElement('button');
    del.className = 'todo-delete';
    del.setAttribute('aria-label', '删除任务');
    del.textContent = '✕';
    del.addEventListener('click', () => deleteTodo(task.id));

    li.append(checkbox, text, badge, del);

    if (!task.done) {
      li.addEventListener('click', (e) => {
        if (e.target === checkbox || e.target === del) return;
        setActiveTask(task.id);
      });
    }

    todoList.appendChild(li);
  });

  todoCount.textContent = todos.filter(t => !t.done).length;
}

function addTodo(text) {
  const task = { id: Date.now().toString(36), text: text.trim(), done: false, createdAt: Date.now() };
  todos.unshift(task);
  saveTodos();
  renderTodos();
}

function toggleTodo(id) {
  const task = todos.find(t => t.id === id);
  if (!task) return;
  task.done = !task.done;
  if (task.done) {
    stats.tasksDone++;
    if (state.currentTaskId === id) state.currentTaskId = null;
  } else {
    stats.tasksDone = Math.max(0, stats.tasksDone - 1);
  }
  saveTodos();
  saveStats();
  renderTodos();
  updateStatsUI();
}

function deleteTodo(id) {
  todos = todos.filter(t => t.id !== id);
  if (state.currentTaskId === id) state.currentTaskId = null;
  saveTodos();
  renderTodos();
}

function setActiveTask(id) {
  state.currentTaskId = id;
  renderTodos();
}
// ===== Whitelist =====
function renderWhitelist() {
  whitelistList.innerHTML = '';
  if (whitelist.length === 0) {
    whitelistList.innerHTML = '<span class="empty-tags">暂无白名单项目</span>';
    whitelistCount.textContent = '0';
    return;
  }
  whitelist.forEach(function(item, i) {
    var tag = document.createElement('span');
    tag.className = 'tag-item';
    tag.innerHTML = '<span>' + item + '</span><button class="tag-delete" data-index="' + i + '">×</button>';
    tag.querySelector('.tag-delete').addEventListener('click', function() { deleteWhitelistItem(i); });
    whitelistList.appendChild(tag);
  });
  whitelistCount.textContent = whitelist.length;
}
function addWhitelistItem(text) {
  whitelist.push(text.trim());
  saveWhitelist();
  renderWhitelist();
}
function deleteWhitelistItem(index) {
  whitelist.splice(index, 1);
  saveWhitelist();
  renderWhitelist();
}

// ===== Habits =====
function renderHabits() {
  habitList.innerHTML = '';
  if (habits.items.length === 0) {
    habitList.innerHTML = '<li class="empty-habits">还没有习惯，添加一个开始打卡吧 ✨</li>';
    habitsCount.textContent = '0 项';
    return;
  }
  habits.items.forEach(function(h, i) {
    var li = document.createElement('li');
    li.className = 'habit-item';
    var icon = document.createElement('div');
    icon.className = 'habit-icon';
    icon.textContent = h.count || 0;
    var info = document.createElement('div');
    info.className = 'habit-info';
    var name = document.createElement('span');
    name.className = 'habit-name';
    name.textContent = h.name;
    var progress = document.createElement('span');
    progress.className = 'habit-progress';
    progress.textContent = '今日专注 ' + (h.count || 0) + ' 次，' + ((h.count || 0) * (settings.focus || 25)) + ' 分钟';
    var del = document.createElement('button');
    del.className = 'habit-delete';
    del.setAttribute('aria-label', '删除习惯');
    del.textContent = '✕';
    del.addEventListener('click', function() { deleteHabit(i); });
    info.append(name, progress);
    li.append(icon, info, del);
    habitList.appendChild(li);
  });
  habitsCount.textContent = habits.items.length + ' 项';
}
function addHabit(name) {
  habits.items.push({ name: name.trim(), count: 0 });
  saveHabits();
  renderHabits();
}
function deleteHabit(index) {
  habits.items.splice(index, 1);
  saveHabits();
  renderHabits();
}
function logToHabit(index) {
  var h = habits.items[index];
  if (h) h.count = (h.count || 0) + 1;
  saveHabits();
  renderHabits();
  closeHabitLogModal();
}
function openHabitLogModal() {
  habitLogOptions.innerHTML = '';
  if (habits.items.length === 0) {
    habitLogOptions.innerHTML = '<p class="empty-habits" style="padding:8px 0">还没有习惯，先添加一个吧</p>';
  } else {
    habits.items.forEach(function(h, i) {
      var btn = document.createElement('button');
      btn.className = 'habit-log-btn';
      var icon = document.createElement('div');
      icon.className = 'habit-icon';
      icon.textContent = h.count || 0;
      var name = document.createElement('span');
      name.className = 'habit-name';
      name.textContent = h.name;
      btn.append(icon, name);
      btn.addEventListener('click', function() { logToHabit(i); });
      habitLogOptions.appendChild(btn);
    });
  }
  habitLogModal.classList.add('open');
}
function closeHabitLogModal() {
  habitLogModal.classList.remove('open');
}


// Settings modal
function openSettings() {
  $('settingFocus').value = settings.focus || DEFAULT_DURATIONS.focus;
  $('settingShort').value = settings.shortBreak || DEFAULT_DURATIONS.shortBreak;
  $('settingLong').value = settings.longBreak || DEFAULT_DURATIONS.longBreak;
  $('settingLongInterval').value = settings.longBreakInterval || LONG_BREAK_INTERVAL;
  $('settingsModal').classList.add('open');
}

function closeSettings() {
  $('settingsModal').classList.remove('open');
}

function saveSettingsHandler() {
  settings.focus = Math.max(1, parseInt($('settingFocus').value, 10) || DEFAULT_DURATIONS.focus);
  settings.shortBreak = Math.max(1, parseInt($('settingShort').value, 10) || DEFAULT_DURATIONS.shortBreak);
  settings.longBreak = Math.max(1, parseInt($('settingLong').value, 10) || DEFAULT_DURATIONS.longBreak);
  settings.longBreakInterval = Math.max(2, parseInt($('settingLongInterval').value, 10) || LONG_BREAK_INTERVAL);
  saveSettings();

  // Re-apply current timer
  const wasRunning = state.isRunning;
  if (wasRunning) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
  state.totalTime = getDurationForMode(state.mode);
  state.timeLeft = Math.min(state.timeLeft, state.totalTime);
  state.isRunning = false;
  startBtn.textContent = '开始';
  updateDisplay();

  closeSettings();
}

// Event Listeners
startBtn.addEventListener('click', toggleTimer);
resetBtn.addEventListener('click', resetTimer);

modeTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    if (tab.dataset.mode === state.mode) return;
    setMode(tab.dataset.mode);
  });
});

todoForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = todoInput.value.trim();
  if (!text) return;
  addTodo(text);
  todoInput.value = '';
});

// Settings modal triggers
document.querySelector('.stat-badge').addEventListener('click', openSettings);
$('settingsClose').addEventListener('click', closeSettings);
$('settingsModal').addEventListener('click', (e) => {
  if (e.target === $('settingsModal')) closeSettings();
});
$('settingsSave').addEventListener('click', saveSettingsHandler);

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key === ' ' || e.key === 'Space') {
    e.preventDefault();
    toggleTimer();
  }
  if (e.key === 'r' || e.key === 'R') resetTimer();
  if (e.key === 'Escape') { closeSettings(); closeHabitLogModal(); }
});

// Request notification permission
if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission();
}

// Init
function init() {
  setMode('focus');
  renderTodos();
  renderWhitelist();
  renderHabits();
  updatePomodoroDots();
  updateStatsUI();
  updateTodayBadge();
}

init();