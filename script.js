/**
 * Study Tracker Web App - Core Logic
 */

function getLocalISODate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// --- STATE MANAGEMENT ---
const defaultState = {
  tasks: [],
  dailyGoalHrs: 5,
};

let state = defaultState;
let chartInstance = null;
let uiInterval = null;
let currentUser = JSON.parse(localStorage.getItem('studyTrackerCurrentUser')) || null;

async function loadUserState() {
  state = defaultState;
  if (!currentUser) return;
  try {
    const res = await fetch('/api/state');
    if (res.ok) {
      const backendState = await res.json();
      if (backendState && backendState.tasks) {
        state = backendState;
      } else {
        const stored = localStorage.getItem(`studyTrackerState_${currentUser.email}`);
        if (stored) state = JSON.parse(stored);
      }
    } else {
      const stored = localStorage.getItem(`studyTrackerState_${currentUser.email}`);
      if (stored) state = JSON.parse(stored);
    }
  } catch (e) {
    console.error("Failed to load state", e);
    const stored = localStorage.getItem(`studyTrackerState_${currentUser.email}`);
    if (stored) state = JSON.parse(stored);
  }

  // Data migration for old tasks to ensure fields match new requirements
  if (state.tasks) {
    state.tasks = state.tasks.map(t => ({
      id: t.id || Date.now() + Math.random(),
      name: t.name || t.title || "Untitled Task",
      completed: t.completed || false,
      totalTime: t.totalTime || t.totalTimeMs || 0,
      isRunning: t.isRunning || false,
      startTime: t.startTime || null,
      createdDate: t.createdDate || t.dateCreated || t.date || new Date().toISOString(),
      targetDate: t.targetDate || (t.createdDate ? t.createdDate.split('T')[0] : getLocalISODate(new Date())),
      dailyRecords: t.dailyRecords || {},
      sessions: t.sessions || [],
      currentSessionStart: t.currentSessionStart || null
    }));
  } else {
    state.tasks = [];
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initAuth();
});

function safeSetText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function initApp() {
  initTheme();
  initSidebar();
  initNavigation();
  updateGreeting();
  renderTasks();
  updateDashboard();
  renderCalendar();
  
  startGlobalInterval();

  // Settings / Forms
  const addTaskForm = document.getElementById('add-task-form');
  if (addTaskForm) addTaskForm.addEventListener('submit', handleAddTask);
  const editGoalBtn = document.getElementById('edit-goal-btn');
  if (editGoalBtn) editGoalBtn.addEventListener('click', handleEditGoal);
  
  const saveGoalBtn = document.getElementById('save-goal-btn');
  if (saveGoalBtn) {
    saveGoalBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const input = document.getElementById('dash-goal-input');
      const newGoal = input.value;
      if (newGoal && !isNaN(newGoal) && newGoal > 0) {
        state.dailyGoalHrs = parseFloat(newGoal);
        saveState();
        updateDashboard();
        showToast("Daily goal updated!");
      }
    });
  }
  
  // Profile dropdown and logout
  const profileDropdownBtn = document.getElementById('profile-dropdown-btn');
  const profileDropdownMenu = document.getElementById('profile-dropdown-menu');
  if (profileDropdownBtn && profileDropdownMenu) {
    profileDropdownBtn.onclick = (e) => {
      profileDropdownMenu.classList.toggle('hidden');
    };
  }
  
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.onclick = (e) => {
      e.preventDefault();
      handleLogout();
    };
  }
  
  // Feedback System removed as it is now app-generated
  
  // Event Delegation for Task Actions
  const tasksList = document.getElementById('tasks-list');
  const historyList = document.getElementById('history-list');
  if (tasksList) tasksList.addEventListener('click', handleTaskAction);
  if (historyList) historyList.addEventListener('click', handleTaskAction);
}

// --- THEME & UI ---
function initTheme() {
  const themeToggle = document.getElementById('theme-toggle');
  const themeIcon = document.getElementById('theme-icon');
  
  const currentTheme = localStorage.getItem('studyTrackerTheme') || 'light';
  if (currentTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    if(themeIcon) themeIcon.textContent = 'light_mode';
  }

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      if (isDark) {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('studyTrackerTheme', 'light');
        if(themeIcon) themeIcon.textContent = 'dark_mode';
      } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('studyTrackerTheme', 'dark');
        if(themeIcon) themeIcon.textContent = 'light_mode';
      }
      
      // Update charts if they exist
      if (chartInstance) {
        chartInstance.options.scales.x.ticks.color = isDark ? '#64748b' : '#94a3b8';
        chartInstance.options.scales.y.ticks.color = isDark ? '#64748b' : '#94a3b8';
        chartInstance.update();
      }
    });
  }
}

function initSidebar() {
  const sidebarToggle = document.getElementById('sidebar-toggle');
  const sidebar = document.getElementById('sidebar');
  const icon = document.getElementById('sidebar-toggle-icon');
  
  if (sidebarToggle && sidebar) {
    sidebarToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.innerWidth <= 768) {
        sidebar.classList.toggle('mobile-open');
        icon.textContent = sidebar.classList.contains('mobile-open') ? 'close' : 'menu';
      } else {
        sidebar.classList.toggle('collapsed');
        icon.textContent = sidebar.classList.contains('collapsed') ? 'menu' : 'menu_open';
      }
    });
    
    // Close on outside click
    document.addEventListener('click', (e) => {
      if (window.innerWidth <= 768 && sidebar.classList.contains('mobile-open')) {
        if (!sidebar.contains(e.target) && !sidebarToggle.contains(e.target)) {
          sidebar.classList.remove('mobile-open');
          icon.textContent = 'menu';
        }
      }
    });
  }
}

function updateGreeting() {
  const hour = new Date().getHours();
  let greeting = 'Good evening';
  if (hour < 12) greeting = 'Good morning';
  else if (hour < 18) greeting = 'Good afternoon';
  
  const userName = currentUser && currentUser.name ? currentUser.name : 'Guest';
  safeSetText('greeting-text', `${greeting}, ${userName} 👋`);
  safeSetText('top-username', userName);
}

function handleTaskAction(e) {
  const target = e.target;
  const btn = target.closest('button, input');
  if (!btn) return;
  const taskItem = btn.closest('.task-item');
  if (!taskItem) return;

  const taskId = Number(taskItem.getAttribute('data-id'));

  if (btn.classList.contains('task-checkbox')) toggleTaskComplete(taskId);
  else if (btn.closest('.btn-play')) startTimer(taskId);
  else if (btn.closest('.btn-pause')) pauseTimer(taskId);
  else if (btn.closest('.btn-stop')) endTimer(taskId);
  else if (btn.closest('[title="Delete"]')) deleteTask(taskId);
}

async function saveState() {
  if (currentUser) {
    localStorage.setItem(`studyTrackerState_${currentUser.email}`, JSON.stringify(state));
    try {
      await fetch('/api/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state)
      });
      
      // Save daily summary to the new backend DB
      const todayStr = getLocalISODate(new Date());
      let ms = 0;
      let completed = 0;
      state.tasks.forEach(t => {
         if (t.dailyRecords && t.dailyRecords[todayStr]) ms += t.dailyRecords[todayStr];
         if (t.completed && getLocalISODate(new Date(t.createdDate)) === todayStr) completed++;
      });
      const studyHours = parseFloat((ms / (1000 * 60 * 60)).toFixed(2));
      
      await fetch('/api/study-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: todayStr, studyHours, tasksCompleted: completed })
      });
    } catch (e) {
      console.error("Failed to save state to backend", e);
    }
  }
}

// --- GLOBAL TICKER ---
function startGlobalInterval() {
  if (uiInterval) clearInterval(uiInterval);
  updateRealTimeClock();
  
  uiInterval = setInterval(() => {
    updateRealTimeClock();
    let needsRender = false;
    state.tasks.forEach(task => {
      if (task.isRunning && task.startTime) {
        const liveSessionMs = Date.now() - task.startTime;
        const displayTotal = task.totalTime + liveSessionMs;
        
        // Update specific task elements
        const displayEl = document.getElementById(`timer-display-${task.id}`);
        if (displayEl) {
          displayEl.textContent = formatTime(displayTotal);
        }
        needsRender = true;
      }
    });

    if (needsRender) {
      updateDashboardStatsOnly();
    }
  }, 1000);
}

function updateRealTimeClock() {
  const timeEl = document.getElementById('current-time');
  const dateEl = document.getElementById('current-date');
  if (!timeEl || !dateEl) return;

  const now = new Date();
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const seconds = now.getSeconds().toString().padStart(2, '0');
  timeEl.textContent = `${hours}:${minutes}:${seconds}`;

  dateEl.textContent = now.toLocaleDateString(undefined, {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
}

// --- NAVIGATION ---
function initNavigation() {
  const navBtns = document.querySelectorAll('.nav-btn');
  navBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const viewId = btn.getAttribute('data-view');
      switchView(viewId, btn);
    });
  });
}

function switchView(viewId, activeBtn) {
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
  if (activeBtn) activeBtn.classList.add('active');
  else {
    const tabEl = document.querySelector(`.nav-btn[data-view="${viewId}"]`);
    if(tabEl) tabEl.classList.add('active');
  }

  document.querySelectorAll('.view').forEach(view => view.classList.remove('active-view'));
  const viewEl = document.getElementById(viewId);
  if(viewEl) viewEl.classList.add('active-view');

  if (viewId === 'analytics') {
    initAnalytics();
    renderInsights();
  }
  if (viewId === 'calendar') renderCalendar();
  if (viewId === 'dashboard') updateDashboard();
  if (viewId === 'feedback') renderInsights();
}

function navigateToTasks() {
  switchView('tasks');
}


// --- TASKS MANAGEMENT (RENDERING & CRUD) ---
function renderTasks() {
  const activeList = document.getElementById('tasks-list');
  const historyList = document.getElementById('history-list');
  if(!activeList || !historyList) return;
  
  activeList.innerHTML = '';
  historyList.innerHTML = '';
  
  const activeTasks = state.tasks.filter(t => !t.completed).sort((a,b) => b.id - a.id);
  const completedTasks = state.tasks.filter(t => t.completed).sort((a,b) => b.id - a.id);

  const emptyTasksState = document.getElementById('empty-tasks-state');
  
  if (activeTasks.length === 0) {
    if (emptyTasksState) emptyTasksState.classList.remove('hidden');
    activeList.innerHTML = '<p class="text-muted text-center py-4" style="display: none;">No tasks yet</p>';
  } else {
    if (emptyTasksState) emptyTasksState.classList.add('hidden');
    activeTasks.forEach(task => activeList.appendChild(createTaskElement(task)));
  }

  if (completedTasks.length === 0) {
    historyList.innerHTML = '<p class="text-muted text-sm">No tasks yet.</p>';
  } else {
    completedTasks.forEach(task => historyList.appendChild(createHistoryElement(task)));
  }
}

function createTaskElement(task) {
  const el = document.createElement('div');
  el.className = `card task-item ${task.isRunning ? 'active-task-item' : ''}`;
  el.setAttribute('data-id', task.id);
  
  let actDisplayMs = task.totalTime;
  if (task.isRunning && task.startTime) {
    actDisplayMs += (Date.now() - task.startTime);
  }
  
  const isStarted = task.totalTime > 0;
  
  let sessionsHtml = '';
  if (task.sessions && task.sessions.length > 0) {
    const lastSession = task.sessions[task.sessions.length - 1];
    sessionsHtml = `<div class="text-xs text-muted mt-1">${formatClockTime(lastSession.startTime)} → ${formatClockTime(lastSession.endTime)}</div>`;
  }
  
  let currentSessionHtml = '';
  if (task.isRunning && task.currentSessionStart) {
    currentSessionHtml = `<div class="text-xs text-primary mt-1">${formatClockTime(task.currentSessionStart)} → ...</div>`;
  }

  let badgeHtml = '';
  const todayStr = getLocalISODate(new Date());
  const isFuture = task.targetDate && task.targetDate > todayStr;
  
  if (task.targetDate) {
    const [ty, tm, td] = task.targetDate.split('-');
    const localTarget = new Date(ty, tm - 1, td);
    if (isFuture) {
      badgeHtml = `<span class="badge" style="background: var(--primary-light); color: var(--primary); margin-left: 0.5rem;"><span class="material-symbols-outlined" style="font-size:12px; vertical-align:text-bottom;">event</span> ${localTarget.toLocaleDateString([], {month:'short', day:'numeric'})}</span>`;
    } else if (task.targetDate < todayStr && !task.completed) {
      badgeHtml = `<span class="badge" style="background: rgba(239, 68, 68, 0.1); color: var(--danger); margin-left: 0.5rem;"><span class="material-symbols-outlined" style="font-size:12px; vertical-align:text-bottom;">warning</span> Overdue</span>`;
    }
  }

  el.innerHTML = `
    <div class="task-main">
      <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''}>
      <div class="task-meta">
        <h3>${escapeHTML(task.name)} ${badgeHtml} ${task.isRunning ? '<span class="badge badge-active" style="margin-left: 0.5rem;">Currently Studying</span>' : ''}</h3>
        <span class="text-sm text-muted">Created: ${new Date(task.createdDate).toLocaleDateString()}</span>
      </div>
    </div>
    
    <div class="timer-controls">
      <div style="display: flex; flex-direction: column; align-items: flex-end; margin-right: 1rem;">
        <div class="timer-display" id="timer-display-${task.id}">${formatTime(actDisplayMs)}</div>
        ${task.isRunning ? currentSessionHtml : sessionsHtml}
      </div>
      ${task.isRunning ? `
        <button class="timer-btn btn-pause" title="Pause"><span class="material-symbols-outlined text-sm">pause</span></button>
        <button class="timer-btn btn-stop" title="Stop"><span class="material-symbols-outlined text-sm">stop</span></button>
      ` : `
        <button class="timer-btn btn-play" title="${isFuture ? 'Cannot start a future task' : (isStarted ? 'Resume' : 'Start')}" ${isFuture ? 'disabled style="opacity: 0.3; cursor: not-allowed;"' : ''}><span class="material-symbols-outlined text-sm">play_arrow</span></button>
        <button class="timer-btn btn-stop" title="Stop" disabled><span class="material-symbols-outlined text-sm">stop</span></button>
      `}
      <button class="btn-icon" title="Delete" style="color: var(--danger); margin-left: 0.5rem;"><span class="material-symbols-outlined">delete</span></button>
    </div>
  `;
  return el;
}

function createHistoryElement(task) {
  const el = document.createElement('div');
  el.className = `card task-item completed`;
  el.setAttribute('data-id', task.id);
  
  let sessionsHtml = '';
  if (task.sessions && task.sessions.length > 0) {
    const sessionList = task.sessions.map(s => {
      const min = Math.round(s.duration / 60000);
      return `<div>${formatClockTime(s.startTime)} → ${formatClockTime(s.endTime)} (${min} min)</div>`;
    }).join('');
    sessionsHtml = `<div class="text-xs text-muted mt-2">${sessionList}</div>`;
  }

  el.innerHTML = `
    <div class="task-main">
      <input type="checkbox" class="task-checkbox" checked>
      <div class="task-meta">
        <h3>${escapeHTML(task.name)}</h3>
        <span class="text-sm text-muted">Completed on: ${new Date(task.createdDate).toLocaleDateString()}</span>
      </div>
    </div>
    <div class="timer-controls">
      <div style="display: flex; flex-direction: column; align-items: flex-end; margin-right: 1rem;">
        <div class="timer-display text-muted">${formatTime(task.totalTime)}</div>
        ${sessionsHtml}
      </div>
      <button class="btn-icon" title="Delete" style="color: var(--danger); margin-left: 0.5rem;"><span class="material-symbols-outlined">delete</span></button>
    </div>
  `;
  return el;
}

function handleAddTask(e) {
  e.preventDefault();
  const input = document.getElementById('new-task-input');
  const dateInput = document.getElementById('new-task-date');
  
  const title = input.value.trim();
  const pickedDate = dateInput && dateInput.value ? dateInput.value : getLocalISODate(new Date());
  
  if (title) {
    const newTask = {
      id: Date.now(),
      name: title,
      completed: false,
      totalTime: 0,
      isRunning: false,
      startTime: null,
      createdDate: new Date().toISOString(),
      targetDate: pickedDate,
      dailyRecords: {},
      sessions: [],
      currentSessionStart: null
    };
    state.tasks.push(newTask);
    saveState();
    input.value = '';
    if (dateInput) dateInput.value = '';
    renderTasks();
    renderCalendar(); // To update the dots immediately
  }
}

function toggleTaskComplete(id) {
  const task = state.tasks.find(t => t.id === id);
  if (task) {
    if (task.isRunning) {
      endTimer(id, false); // Save time but don't re-render entire view yet
    }
    task.completed = !task.completed;
    saveState();
    renderTasks();
  }
}

function deleteTask(id) {
  if (confirm("Are you sure you want to delete this task?")) {
    state.tasks = state.tasks.filter(t => t.id !== id);
    saveState();
    renderTasks();
    updateDashboard(); // Ensure dashboard calculations refresh
  }
}

// --- TIMER LOGIC (CRITICAL) ---

function startTimer(id) {
  const task = state.tasks.find(t => t.id === id);
  if (task && !task.isRunning) {
    const todayStr = getLocalISODate(new Date());
    if (task.targetDate && task.targetDate > todayStr) {
      showToast("Cannot start a timer for a future task.");
      return;
    }
    
    let pausedOther = false;
    // Single Active Task Rule
    state.tasks.forEach(t => {
      if (t.isRunning && t.id !== id) {
        pauseTimer(t.id, false);
        pausedOther = true;
      }
    });

    if (pausedOther) {
      showToast("Switched to new task, previous task paused.");
    }

    task.isRunning = true;
    task.startTime = Date.now(); // Keep for legacy / compatibility
    task.currentSessionStart = Date.now();
    saveState();
    renderTasks();
    updateDashboard();
  }
}

function pauseTimer(id, triggerRender=true) {
  const task = state.tasks.find(t => t.id === id);
  if (task && task.isRunning && task.startTime) {
    const sessionTime = Date.now() - task.startTime;
    task.totalTime += sessionTime;
    
    if (task.currentSessionStart) {
      task.sessions.push({
        startTime: task.currentSessionStart,
        endTime: Date.now(),
        duration: sessionTime
      });
    }

    // Add to daily records for chart/calendar functionality
    const today = getLocalISODate(new Date());
    task.dailyRecords[today] = (task.dailyRecords[today] || 0) + sessionTime;
    
    task.isRunning = false;
    task.startTime = null;
    task.currentSessionStart = null;
    
    saveState();
    if (triggerRender) {
      renderTasks();
      updateDashboard();
    }
  }
}

function endTimer(id, triggerRender=true) {
  // Finalizes the timer loop. Same data effect as Pause. 
  pauseTimer(id, triggerRender);
}


// --- DASHBOARD HELPERS ---
function getTodayTotalMs() {
  const today = getLocalISODate(new Date());
  let totalMs = 0;
  
  state.tasks.forEach(task => {
    if (task.dailyRecords && task.dailyRecords[today]) {
      totalMs += task.dailyRecords[today];
    }
    // Plus active live time
    if (task.isRunning && task.startTime) {
      totalMs += (Date.now() - task.startTime);
    }
  });
  
  return totalMs;
}

function updateDashboard() {
  updateDashboardStatsOnly();
  
  // Update Widget visibility
  const runningTasks = state.tasks.filter(t => t.isRunning);
  const widget = document.getElementById('live-timer-widget');
  if (widget) {
    if (runningTasks.length > 0) {
      widget.classList.remove('hidden');
      if (runningTasks.length === 1) {
        document.getElementById('widget-task-name').textContent = runningTasks[0].name;
      } else {
        document.getElementById('widget-task-name').textContent = `${runningTasks.length} Tasks Active`;
      }
    } else {
      widget.classList.add('hidden');
    }
  }

  // Calculate Streaks
  safeSetText('dash-streak', `${calculateStreak()} Days`);
  
  // Best Day
  const bestDay = getBestDay();
  safeSetText('dash-best-day', bestDay ? bestDay.dateFormatted : '-');
}

function updateDashboardStatsOnly() {
  const todayMs = getTodayTotalMs();
  
  // Format Today's time directly
  const hours = Math.floor(todayMs / (1000 * 60 * 60));
  const minutes = Math.floor((todayMs % (1000 * 60 * 60)) / (1000 * 60));
  safeSetText('dash-today-time', `${hours}h ${minutes}m`);
  
  // Trend Indicator Logic (compare with yesterday)
  const totals = getDailyTotals();
  const todayDate = new Date();
  todayDate.setHours(0,0,0,0);
  const yesterday = new Date(todayDate);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = getLocalISODate(yesterday);
  const yesterdayMs = totals[yesterdayStr] || 0;
  
  const trendEl = document.getElementById('dash-trend');
  const trendValEl = document.getElementById('dash-trend-val');
  if (trendEl && trendValEl) {
    if (yesterdayMs === 0) {
      trendEl.className = 'trend-indicator trend-neutral';
      trendEl.innerHTML = '<span class="material-symbols-outlined text-sm">horizontal_rule</span> <span id="dash-trend-val">-</span>';
    } else {
      const diffPercent = ((todayMs - yesterdayMs) / yesterdayMs) * 100;
      if (diffPercent > 0) {
        trendEl.className = 'trend-indicator trend-up';
        trendEl.innerHTML = `<span class="material-symbols-outlined text-sm">trending_up</span> <span id="dash-trend-val">${Math.round(diffPercent)}%</span>`;
      } else if (diffPercent < 0) {
        trendEl.className = 'trend-indicator trend-down';
        trendEl.innerHTML = `<span class="material-symbols-outlined text-sm">trending_down</span> <span id="dash-trend-val">${Math.round(Math.abs(diffPercent))}%</span>`;
      } else {
        trendEl.className = 'trend-indicator trend-neutral';
        trendEl.innerHTML = '<span class="material-symbols-outlined text-sm">horizontal_rule</span> <span id="dash-trend-val">0%</span>';
      }
    }
  }

  // Widget Time
  const runningTasks = state.tasks.filter(t => t.isRunning);
  if (runningTasks.length > 0) {
    let totalWidgetMs = 0;
    runningTasks.forEach(task => {
      if (task.startTime) {
        totalWidgetMs += task.totalTime + (Date.now() - task.startTime);
      }
    });
    safeSetText('widget-timer-display', formatTime(totalWidgetMs));
  }

  // Goal Progress updates
  const dashGoalInput = document.getElementById('dash-goal-input');
  if (dashGoalInput) dashGoalInput.value = state.dailyGoalHrs;
  safeSetText('dash-goal-text', state.dailyGoalHrs);
  
  const goalMs = state.dailyGoalHrs * 60 * 60 * 1000;
  let progressPercent = Math.min(100, Math.round((todayMs / goalMs) * 100)) || 0;
  
  // Circular Progress
  const scoreCircle = document.getElementById('score-circle');
  const scoreText = document.getElementById('score-text');
  if (scoreCircle && scoreText) {
    scoreText.textContent = `${progressPercent}%`;
    let color = 'var(--primary)';
    if (progressPercent < 30) color = 'var(--danger)';
    else if (progressPercent < 70) color = 'var(--warning)';
    else if (progressPercent >= 100) color = 'var(--success)';
    
    scoreCircle.style.background = `conic-gradient(${color} ${progressPercent * 3.6}deg, var(--border-color) 0deg)`;
  }
}

function handleEditGoal() {
  const newGoal = prompt("Enter your daily study goal in hours (e.g. 5):", state.dailyGoalHrs);
  if (newGoal && !isNaN(newGoal) && newGoal > 0) {
    state.dailyGoalHrs = parseFloat(newGoal);
    saveState();
    updateDashboard();
  }
}

// --- DATA AGGREGATION & ALGORITHMS ---
function getDailyTotals() {
  const totals = {};
  state.tasks.forEach(task => {
    if (task.dailyRecords) {
      for (const [dateStr, msObj] of Object.entries(task.dailyRecords)) {
        totals[dateStr] = (totals[dateStr] || 0) + msObj;
      }
    }
    
    // Include live active sessions
    if (task.isRunning && task.startTime) {
       const today = getLocalISODate(new Date());
       const currentSessionMs = Date.now() - task.startTime;
       totals[today] = (totals[today] || 0) + currentSessionMs;
    }
  });
  return totals;
}

function getBestDay() {
  const totals = getDailyTotals();
  let maxMs = -1;
  let bestDateStr = null;
  
  for (const [dateStr, ms] of Object.entries(totals)) {
    if (ms > maxMs) { maxMs = ms; bestDateStr = dateStr; }
  }
  
  if (!bestDateStr) return null;
  const tempDate = new Date(bestDateStr);
  return {
    date: bestDateStr,
    ms: maxMs,
    dateFormatted: tempDate.toLocaleDateString([], { month: 'short', day: 'numeric'}) 
  };
}

function calculateStreak() {
  const totals = getDailyTotals();
  const dates = Object.keys(totals).sort().reverse(); 
  if (dates.length === 0) return 0;
  
  let streak = 0;
  const todayObjDate = new Date();
  todayObjDate.setHours(0,0,0,0);
  
  let checkDate = new Date(todayObjDate);
  const todayStr = getLocalISODate(checkDate);
  
  if (!totals[todayStr]) checkDate.setDate(checkDate.getDate() - 1);
  
  while (true) {
    const ds = getLocalISODate(checkDate);
    if (totals[ds] && totals[ds] > 0) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}


// --- ANALYTICS / CHARTS ---
function initAnalytics() {
  const ctx = document.getElementById('studyChart');
  if (!ctx) return;
  
  const totals = getDailyTotals();
  const labels = [];
  const data = [];
  
  for(let i=6; i>=0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = getLocalISODate(d);
    labels.push(d.toLocaleDateString([], { weekday: 'short' }));
    const ms = totals[dateStr] || 0;
    data.push(Math.round(ms / (1000 * 60)));
  }
  
  if (chartInstance) chartInstance.destroy();
  
  if (typeof Chart === 'undefined') {
    console.error("Chart.js is not loaded.");
    return;
  }
  
  chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Study Minutes',
        data: data,
        backgroundColor: '#6366f1',
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { 
          beginAtZero: true, 
          suggestedMax: 10,
          ticks: {
            stepSize: 1,
            precision: 0
          },
          title: { display: true, text: 'Minutes' } 
        }
      },
      plugins: { legend: { display: false } }
    }
  });
}

// --- CALENDAR ---
let currentMonthObj = new Date();

function renderCalendar() {
  const monthYearEl = document.getElementById('calendar-month-year');
  const daysEl = document.getElementById('calendar-days');
  if (!monthYearEl || !daysEl) return;

  const year = currentMonthObj.getFullYear();
  const month = currentMonthObj.getMonth();
  
  monthYearEl.textContent = currentMonthObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  daysEl.innerHTML = '';
  
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totals = getDailyTotals();
  const todayStr = getLocalISODate(new Date());
  
  for (let i = 0; i < firstDay; i++) {
    const blank = document.createElement('div');
    blank.className = 'cal-day cal-empty';
    daysEl.appendChild(blank);
  }
  
  for (let i = 1; i <= daysInMonth; i++) {
    const dayDate = new Date(year, month, i);
    const dateStr = getLocalISODate(dayDate);
    const ms = totals[dateStr] || 0;
    const scheduledTasks = state.tasks.filter(t => t.targetDate === dateStr && !t.completed);
    
    const dayEl = document.createElement('div');
    dayEl.className = 'cal-day';
    dayEl.textContent = i;
    
    if (ms > 0) {
      dayEl.classList.add('has-activity');
      const hrs = ms / (1000 * 60 * 60);
      let opacity = Math.min(0.2 + (hrs / 5) * 0.8, 1);
      dayEl.style.backgroundColor = `rgba(37, 99, 235, ${opacity})`;
      dayEl.style.color = '#fff';
    } else if (scheduledTasks.length > 0) {
      dayEl.classList.add('has-activity');
      dayEl.style.border = '2px solid var(--primary)';
      dayEl.style.color = 'var(--primary)';
    }
    if (dateStr === todayStr) dayEl.classList.add('active'); 
    
    dayEl.addEventListener('click', () => showCalendarDetails(dateStr, ms));
    daysEl.appendChild(dayEl);
  }
  
  const prevMonthBtn = document.getElementById('prev-month');
  if (prevMonthBtn) {
    prevMonthBtn.onclick = () => {
      currentMonthObj.setMonth(currentMonthObj.getMonth() - 1);
      renderCalendar();
    };
  }
  
  const nextMonthBtn = document.getElementById('next-month');
  if (nextMonthBtn) {
    nextMonthBtn.onclick = () => {
      currentMonthObj.setMonth(currentMonthObj.getMonth() + 1);
      renderCalendar();
    };
  }
  
  showCalendarDetails(todayStr, totals[todayStr] || 0);
}

async function showCalendarDetails(dateStr, totalMs) {
  const detailsEl = document.getElementById('calendar-details');
  if (!detailsEl) return;
  const [y, m, d] = dateStr.split('-');
  const displayDate = new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric'});
  
  const hrs = Math.floor(totalMs / (1000 * 60 * 60));
  const mins = Math.floor((totalMs % (1000 * 60 * 60)) / (1000 * 60));
  
  let tasksStudied = [];
  state.tasks.forEach(t => {
    if (t.dailyRecords && t.dailyRecords[dateStr]) {
      tasksStudied.push(`<li>${escapeHTML(t.name)} - ${formatTime(t.dailyRecords[dateStr])}</li>`);
    } else if (dateStr === getLocalISODate(new Date()) && t.isRunning) {
       const sessionTime = Date.now() - t.startTime;
       if(sessionTime > 0) tasksStudied.push(`<li>${escapeHTML(t.name)} - ${formatTime(sessionTime)} (Active)</li>`);
    } else if (t.targetDate === dateStr && !t.completed && (!t.dailyRecords || !t.dailyRecords[dateStr])) {
       tasksStudied.push(`<li>${escapeHTML(t.name)} - 00:00:00 <span class="badge" style="background: var(--primary-light); color: var(--primary); font-size: 0.65rem;">Scheduled</span></li>`);
    }
  });
  
  let backendDbHtml = '';
  try {
    const res = await fetch(`/api/study-data?date=${dateStr}`);
    if (res.ok) {
      const dbData = await res.json();
      if (dbData && dbData.studyHours !== undefined) {
         backendDbHtml = `
           <div class="card mt-3" style="background: var(--primary-light); border: 1px solid var(--primary); padding: 1rem; border-radius: 8px;">
             <h4 class="text-sm" style="color: var(--primary); margin-bottom: 0.5rem;"><span class="material-symbols-outlined text-sm" style="vertical-align: middle;">database</span> Database Record</h4>
             <div class="flex-between text-sm"><span>Study Hours:</span> <strong>${dbData.studyHours}h</strong></div>
             <div class="flex-between text-sm mt-1"><span>Tasks Completed:</span> <strong>${dbData.tasksCompleted}</strong></div>
           </div>`;
      }
    }
  } catch (e) { console.error("DB Fetch Error", e); }
  
  detailsEl.innerHTML = `
    <h3 class="mb-2">${displayDate}</h3>
    <div class="card bg-light-primary mb-3 text-center border-0">
      <h2 class="text-primary">${hrs}h ${mins}m</h2>
      <p class="text-sm text-muted">Total time studied</p>
    </div>
    ${backendDbHtml}
    
    <h4 class="mt-4">Tasks Worked On:</h4>
    ${tasksStudied.length > 0 ? 
      `<ul class="mt-2 text-sm text-muted custom-list" style="padding-left: 1rem; line-height: 1.8;">${tasksStudied.join('')}</ul>` 
      : '<p class="text-sm text-muted mt-2">No study data yet.</p>'}
  `;
}

// --- INSIGHTS & ANALYTICS ---
function renderInsights() {
  const totals = getDailyTotals();
  const tasks = state.tasks;
  
  const insightsContainer = document.getElementById('static-insights');
  const hasData = tasks.length > 0 && Object.keys(totals).length > 0;
  
  if (!hasData) {
    if (insightsContainer) {
      insightsContainer.innerHTML = '<p class="text-muted">Not enough data to generate insights yet. Complete some study sessions first!</p>';
    }
    safeSetText('stat-best-day', '-');
    safeSetText('stat-total-sessions', '0');
    safeSetText('stat-avg-session', '0m');
    return;
  }

  // Calculate stats
  const bestDay = getBestDay();
  let totalSessions = 0;
  let totalTimeMs = 0;
  
  tasks.forEach(t => {
    totalSessions += t.sessions ? t.sessions.length : 0;
    totalTimeMs += t.totalTime;
  });
  
  const avgSessionMs = totalSessions > 0 ? totalTimeMs / totalSessions : 0;
  
  safeSetText('stat-best-day', bestDay ? bestDay.dateFormatted : '-');
  safeSetText('stat-total-sessions', totalSessions);
  safeSetText('stat-avg-session', `${Math.round(avgSessionMs / 60000)}m`);

  if (!insightsContainer) return;

  // Generate Insights
  let insightsHtml = '';
  
  // Insight 1: General volume
  const hrs = (totalTimeMs / (1000 * 60 * 60)).toFixed(1);
  insightsHtml += `
    <div class="insight-item">
      <div class="insight-icon positive"><span class="material-symbols-outlined">moving</span></div>
      <div class="insight-text">
        <h4>Solid Progress</h4>
        <p>You've accumulated ${hrs} hours of total study time across ${tasks.length} tasks.</p>
      </div>
    </div>
  `;
  
  // Insight 2: Streak
  const currentStreak = calculateStreak();
  if (currentStreak >= 3) {
    insightsHtml += `
      <div class="insight-item">
        <div class="insight-icon positive"><span class="material-symbols-outlined">local_fire_department</span></div>
        <div class="insight-text">
          <h4>Great Momentum</h4>
          <p>You're on a ${currentStreak}-day streak! Keep up the daily habit.</p>
        </div>
      </div>
    `;
  } else if (currentStreak === 0) {
    insightsHtml += `
      <div class="insight-item">
        <div class="insight-icon warning"><span class="material-symbols-outlined">warning</span></div>
        <div class="insight-text">
          <h4>Build a Habit</h4>
          <p>You don't have an active streak. Try studying a little bit every day to build momentum.</p>
        </div>
      </div>
    `;
  }
  
  // Insight 3: Goals
  const todayMs = getTodayTotalMs();
  const goalMs = state.dailyGoalHrs * 60 * 60 * 1000;
  if (todayMs >= goalMs) {
    insightsHtml += `
      <div class="insight-item">
        <div class="insight-icon positive"><span class="material-symbols-outlined">check_circle</span></div>
        <div class="insight-text">
          <h4>Goal Crushed</h4>
          <p>You hit your daily goal of ${state.dailyGoalHrs} hours today. Excellent work!</p>
        </div>
      </div>
    `;
  } else {
    insightsHtml += `
      <div class="insight-item">
        <div class="insight-icon neutral"><span class="material-symbols-outlined">target</span></div>
        <div class="insight-text">
          <h4>Daily Goal</h4>
          <p>You are ${( ((goalMs - todayMs) / (1000 * 60 * 60)).toFixed(1) )} hours lagging from your daily goal.</p>
        </div>
      </div>
    `;
  }

  insightsContainer.innerHTML = insightsHtml;
}

// --- UTILITIES ---
function formatTime(ms) {
  let totalSeconds = Math.floor(ms / 1000);
  let hours = Math.floor(totalSeconds / 3600);
  let minutes = Math.floor((totalSeconds % 3600) / 60);
  let seconds = totalSeconds % 60;

  return [
    hours.toString().padStart(2, '0'),
    minutes.toString().padStart(2, '0'),
    seconds.toString().padStart(2, '0')
  ].join(':');
}

function formatClockTime(timestamp) {
  const date = new Date(timestamp);
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.innerText = str;
  return div.innerHTML;
}

function showToast(message) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;

  container.appendChild(toast);

  // Remove toast after animation (3s)
  setTimeout(() => {
    if (toast.parentNode) {
      toast.parentNode.removeChild(toast);
    }
  }, 3000);
}

// --- AUTHENTICATION ---
async function initAuth() {
  const authContainer = document.getElementById('auth-container');
  const appContainer = document.getElementById('app-container');
  
  // Try fetching session from backend (Google OAuth)
  try {
    const res = await fetch('/api/current_user');
    if (res.ok) {
      const data = await res.json();
      if (data && data.email) {
        currentUser = data; // From backend
        localStorage.setItem('studyTrackerCurrentUser', JSON.stringify(currentUser));
      }
    }
  } catch (e) {
    console.error('Error fetching current user from backend', e);
  }
  
  // If backend didn't return a user, fallback to local storage
  if (!currentUser) {
    currentUser = JSON.parse(localStorage.getItem('studyTrackerCurrentUser')) || null;
  }
  
  if (currentUser) {
    if (authContainer) authContainer.style.display = 'none';
    if (appContainer) appContainer.style.display = 'flex';
    await loadUserState();
    initApp();
  } else {
    if (authContainer) authContainer.style.display = 'flex';
    if (appContainer) appContainer.style.display = 'none';
    setupAuthListeners();
  }
}

function setupAuthListeners() {
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  const showSignupBtn = document.getElementById('show-signup-btn');
  const showLoginBtn = document.getElementById('show-login-btn');

  if (showSignupBtn) {
    showSignupBtn.onclick = (e) => {
      e.preventDefault();
      if (loginForm) loginForm.style.display = 'none';
      if (signupForm) signupForm.style.display = 'block';
    };
  }

  if (showLoginBtn) {
    showLoginBtn.onclick = (e) => {
      e.preventDefault();
      if (signupForm) signupForm.style.display = 'none';
      if (loginForm) loginForm.style.display = 'block';
    };
  }

  if (signupForm) {
    signupForm.onsubmit = (e) => {
      e.preventDefault();
      const name = document.getElementById('signup-name').value.trim();
      const email = document.getElementById('signup-email').value.trim();
      const password = document.getElementById('signup-password').value;
      
      if (!name || !email || !password) {
        alert("Please fill all fields.");
        return;
      }
      
      let users = JSON.parse(localStorage.getItem('studyTrackerUsers')) || [];
      if (users.find(u => u.email === email)) {
        alert("User with this email already exists!");
        return;
      }
      
      users.push({ name, email, password });
      localStorage.setItem('studyTrackerUsers', JSON.stringify(users));
      
      // Auto login after signup
      currentUser = { name, email };
      localStorage.setItem('studyTrackerCurrentUser', JSON.stringify(currentUser));
      initAuth();
    };
  }

  if (loginForm) {
    loginForm.onsubmit = (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      
      let users = JSON.parse(localStorage.getItem('studyTrackerUsers')) || [];
      const user = users.find(u => u.email === email && u.password === password);
      
      if (user) {
        currentUser = { name: user.name, email: user.email };
        localStorage.setItem('studyTrackerCurrentUser', JSON.stringify(currentUser));
        initAuth();
      } else {
        alert("Invalid email or password!");
      }
    };
  }
}

async function handleLogout() {
  currentUser = null;
  localStorage.removeItem('studyTrackerCurrentUser');
  try {
    await fetch('/api/logout');
  } catch (e) {
    console.error('Logout error', e);
  }
  window.location.href = '/';
}

