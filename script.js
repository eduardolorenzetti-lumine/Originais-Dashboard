const STORAGE_KEY = "originais_lumine_state_v2";
const SESSION_USER_KEY = `${STORAGE_KEY}_session_user`;
const SESSION_TAB_KEY = `${STORAGE_KEY}_session_tab`;
const PROJECTS_BACKUP_KEY = `${STORAGE_KEY}_projects_backup`;
const IDB_NAME = "originais_lumine_db";
const IDB_STORE = "kv";
const IDB_STATE_KEY = "app_state";
const IDB_PROJECTS_KEY = "projects_backup";
const STORAGE_FALLBACK_KEYS = [
  `${STORAGE_KEY}_backup`,
  "originais_lumine_state_v1",
  "originais_lumine_state",
  "base44_app_state"
];
const WINDOW_STORE_PREFIX = "__originais_store__:";
const memoryStore = new Map();
let storageEngines = null;
let hasShownStorageWarning = false;

const CONFIG_META = {
  stages: "ETAPA",
  categories: "CATEGORIA",
  formats: "FORMATO",
  natures: "NATUREZA",
  durations: "DURAÇÃO",
  statuses: "STATUS"
};

const CONFIG_SINGULAR_META = {
  stages: "Etapa",
  categories: "Categoria",
  formats: "Formato",
  natures: "Natureza",
  durations: "Duração",
  statuses: "Status"
};

const COLOR_CONFIG_KEYS = new Set(["categories", "formats", "natures", "durations", "statuses"]);

const STATUS_COLORS = {
  Backlog: "gray",
  "Em Planejamento": "yellow",
  "Em andamento": "blue",
  Concluído: "green",
  Pausado: "gray",
  INCUBADO: "yellow"
};

const BASE44_FILES = [
  "Category_export.csv",
  "Duration_export.csv",
  "Format_export.csv",
  "Nature_export.csv",
  "ProductionType_export.csv",
  "Project_export.csv",
  "ProjectStatus_export.csv",
  "Stage_export.csv",
  "StageType_export.csv"
];

const DEFAULT_ADMIN_EMAIL = "eduardo.lorenzetti@lumine.tv";
const LEGACY_ADMIN_EMAIL = "admin@originais.com";
const DEFAULT_ADMIN_PASSWORD = "admin123";
const DEFAULT_INVITED_PASSWORD = "lumine123";
const SUPABASE_STATE_TABLE = "app_state";
const SUPABASE_DEFAULT_STATE_ID = "originais-main";
const THEME_STORAGE_KEY = "lumine-theme";
const THEME_VALUES = new Set(["dark", "light", "system"]);
const MAX_AUDIT_LOG_ITEMS = 2000;

let state = seedState();
let currentTab = "dashboard";
let selectedDashboardYears = new Set();
let dashboardFiltersOpen = false;
let selectedDashboardFilters = {
  categories: new Set(),
  formats: new Set(),
  natures: new Set(),
  durations: new Set(),
  projects: new Set()
};
let selectedGanttYears = new Set();
let ganttFiltersOpen = false;
let selectedGanttFilters = {
  categories: new Set(),
  formats: new Set(),
  natures: new Set(),
  durations: new Set(),
  projects: new Set()
};
let selectedProjectYears = new Set();
let projectFiltersOpen = false;
let selectedProjectFilters = {
  categories: new Set(),
  formats: new Set(),
  natures: new Set(),
  durations: new Set(),
  projects: new Set()
};
const projectFilterQueries = {
  dashboard: "",
  gantt: "",
  projects: ""
};
let selectedConfigKey = "stages";
let selectedStageRef = null;
let draggingStage = null;
let draggingRelease = null;
let suppressLineClickUntil = 0;
let currentUserId = "";
let supabaseClientInstance = undefined;
let supabaseStateId = SUPABASE_DEFAULT_STATE_ID;
let supabaseSyncTimer = null;
let supabaseSyncInFlight = false;
let queuedSupabaseStateRaw = "";
let hasShownSupabaseWarning = false;
let hasShownSupabaseConfigWarning = false;
let hasLoggedSupabaseTarget = false;
let supabaseBaseState = null;
let currentThemePreference = "system";
let systemThemeMediaQuery = null;
const ALLOWED_TABS = new Set(["dashboard", "cronograma", "projetos", "usuarios", "configuracoes"]);
const FIELD_TO_SETTINGS_KEY = {
  category: "categories",
  format: "formats",
  nature: "natures",
  duration: "durations",
  status: "statuses"
};

function normalizeThemePreference(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return THEME_VALUES.has(normalized) ? normalized : "system";
}

function getStoredThemePreference() {
  try {
    return normalizeThemePreference(window.localStorage?.getItem(THEME_STORAGE_KEY) || "system");
  } catch (_) {
    return "system";
  }
}

function getSystemThemeMode() {
  try {
    if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) return "dark";
  } catch (_) {}
  return "light";
}

function updateThemeOptionButtons() {
  document.querySelectorAll("[data-theme-option]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.themeOption === currentThemePreference);
  });
}

function applyThemePreference(value, { persist = true } = {}) {
  currentThemePreference = normalizeThemePreference(value);
  const resolvedTheme = currentThemePreference === "system" ? getSystemThemeMode() : currentThemePreference;
  document.documentElement.setAttribute("data-theme", resolvedTheme);
  document.documentElement.setAttribute("data-theme-preference", currentThemePreference);
  updateThemeOptionButtons();
  if (!persist) return;
  try {
    window.localStorage?.setItem(THEME_STORAGE_KEY, currentThemePreference);
  } catch (_) {}
}

function bindSystemThemeListener() {
  try {
    if (!window.matchMedia) return;
    if (!systemThemeMediaQuery) systemThemeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      if (currentThemePreference !== "system") return;
      applyThemePreference("system", { persist: false });
    };
    if (typeof systemThemeMediaQuery.addEventListener === "function") systemThemeMediaQuery.addEventListener("change", handleChange);
    else if (typeof systemThemeMediaQuery.addListener === "function") systemThemeMediaQuery.addListener(handleChange);
  } catch (_) {}
}

function initTheme() {
  bindSystemThemeListener();
  applyThemePreference(getStoredThemePreference(), { persist: false });
}

function normalizeTabName(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ALLOWED_TABS.has(normalized) ? normalized : "dashboard";
}

function persistCurrentTab() {
  try {
    sessionStorage.setItem(SESSION_TAB_KEY, normalizeTabName(currentTab));
  } catch (_) {}
}

function restoreCurrentTab() {
  try {
    currentTab = normalizeTabName(sessionStorage.getItem(SESSION_TAB_KEY) || "dashboard");
  } catch (_) {
    currentTab = "dashboard";
  }
}

async function init() {
  state = loadState();
  const beforeHydrate = JSON.stringify(state);
  state = await hydrateStateFromIndexedDb(state);
  state = await hydrateStateFromSupabase(state);
  if (JSON.stringify(state) !== beforeHydrate) saveState({ skipSupabase: true });
  ensureAdminAccount();
  supabaseBaseState = cloneForSync(state);
  applyPtBrLocaleToDateInputs(document);
  bindNavigation();
  bindGlobalActions();
  bindDialog();
  bindAuthActions();
  restoreSessionUser();
  restoreCurrentTab();
  renderAll();
  applyAuthVisibility();
  queueSupabaseSync(JSON.stringify(state));
}

function bindNavigation() {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      openTab(btn.dataset.tab);
    });
  });
}

function openTab(tab) {
  if (!isAuthenticated()) {
    applyAuthVisibility();
    return;
  }
  if (tab === "usuarios" && !canViewUsers()) tab = "dashboard";
  currentTab = normalizeTabName(tab);
  persistCurrentTab();
  document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
  document.getElementById(currentTab).classList.add("active");
  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === currentTab && !b.hidden));
  renderAll();
}

function bindGlobalActions() {
  document.getElementById("btnNewProject").addEventListener("click", () => {
    if (!canEditContent()) {
      alert("Perfil LEITOR possui apenas visualização.");
      return;
    }
    openProjectDialog();
  });
  document.getElementById("btnQuickNewProject").addEventListener("click", () => {
    if (!canEditContent()) {
      alert("Perfil LEITOR possui apenas visualização.");
      return;
    }
    openProjectDialog();
  });

  document.getElementById("timelineStart").value = state.timeline.start;
  document.getElementById("timelineEnd").value = state.timeline.end;

  document.getElementById("applyTimeline").addEventListener("click", () => {
    if (!canEditContent()) {
      alert("Perfil LEITOR possui apenas visualização.");
      return;
    }
    const start = document.getElementById("timelineStart").value;
    const end = document.getElementById("timelineEnd").value;
    if (!start || !end || monthToIndex(start) > monthToIndex(end)) {
      alert("Período inválido.");
      return;
    }
    state.timeline.start = start;
    state.timeline.end = end;
    state.timeline.monthsShown = monthToIndex(end) - monthToIndex(start) + 1;
    saveState();
    renderGantt();
  });
  document.getElementById("timelineBack").addEventListener("click", decreaseTimelineWindow);
  document.getElementById("timelineForward").addEventListener("click", increaseTimelineWindow);
  document.getElementById("timelineLeft").addEventListener("click", () => panTimeline(-1));
  document.getElementById("timelineRight").addEventListener("click", () => panTimeline(1));

  document.getElementById("projectSearch").addEventListener("input", renderProjectsTable);
  document.getElementById("btnCreateUser").addEventListener("click", () => {
    if (!canManageUsers()) {
      alert("Apenas ADMIN pode gerir usuários.");
      return;
    }
    openUserDialog();
  });
  document.getElementById("btnInviteUser").addEventListener("click", () => {
    if (!canManageUsers()) {
      alert("Apenas ADMIN pode gerir usuários.");
      return;
    }
    openInviteDialog();
  });

  document.getElementById("btnImportCsv").addEventListener("click", () => {
    if (!canEditContent()) {
      alert("Perfil LEITOR possui apenas visualização.");
      return;
    }
    document.getElementById("csvInput").click();
  });

  document.getElementById("csvInput").addEventListener("change", importCsvFile);

  document.getElementById("btnAddConfig").addEventListener("click", () => {
    if (!canEditContent()) {
      alert("Perfil LEITOR possui apenas visualização.");
      return;
    }
    addConfigItem();
  });
  document.getElementById("dashboardFiltersToggle").addEventListener("click", () => {
    dashboardFiltersOpen = !dashboardFiltersOpen;
    renderDashboard();
  });
  document.getElementById("btnFilterGantt").addEventListener("click", () => {
    ganttFiltersOpen = !ganttFiltersOpen;
    renderGantt();
  });
  document.getElementById("btnFilterProjects").addEventListener("click", () => {
    projectFiltersOpen = !projectFiltersOpen;
    renderProjectsTools();
    renderProjectsTable();
  });
}

function bindAuthActions() {
  const loginForm = document.getElementById("loginForm");
  const forgotPasswordBtn = document.getElementById("forgotPasswordBtn");
  const firstAccessBtn = document.getElementById("firstAccessBtn");
  const profileMenuBtn = document.getElementById("profileMenuBtn");
  const profileMenu = document.getElementById("profileMenu");
  const profileMenuList = document.getElementById("profileMenuList");

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = String(document.getElementById("loginEmail").value || "").trim().toLowerCase();
    const password = document.getElementById("loginPassword").value;
    let user = authenticateUser(email, password);
    if (!user) {
      await refreshStateFromSupabaseNow();
      user = authenticateUser(email, password);
    }
    if (!user) {
      showLoginError("E-mail ou senha inválidos.");
      return;
    }
    if (user.firstAccessPending) {
      const completed = promptPasswordSetup(user, { contextLabel: "primeiro acesso", completeFirstAccess: true });
      if (!completed) {
        showLoginError("No primeiro acesso, defina sua senha para continuar.");
        return;
      }
    }

    currentUserId = user.id;
    persistSessionUser();
    clearLoginError();
    loginForm.reset();
    openTab("dashboard");
    applyAuthVisibility();
    renderAll();
  });

  forgotPasswordBtn.addEventListener("click", startForgotPasswordFlow);
  firstAccessBtn?.addEventListener("click", startFirstAccessFlow);

  profileMenuBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    profileMenuList.hidden = !profileMenuList.hidden;
  });

  document.addEventListener("click", (event) => {
    if (!profileMenu.contains(event.target)) profileMenuList.hidden = true;
  });

  document.getElementById("profileViewEditBtn").addEventListener("click", () => {
    profileMenuList.hidden = true;
    if (!currentUserId) return;
    openUserDialog(currentUserId);
  });

  document.getElementById("profileLogoutBtn").addEventListener("click", () => {
    profileMenuList.hidden = true;
    logoutCurrentUser();
  });

  document.querySelectorAll("[data-theme-option]").forEach((button) => {
    button.addEventListener("click", () => {
      applyThemePreference(button.dataset.themeOption || "dark");
    });
  });
}

function authenticateUser(email, password) {
  if (!email || !password) return null;
  const user = state.users.find((item) => String(item.email || "").toLowerCase() === email);
  if (!user) return null;
  const passwordHash = String(user.passwordHash || "").trim();
  if (!passwordHash) {
    if (String(user.email || "").toLowerCase() === DEFAULT_ADMIN_EMAIL && password === DEFAULT_ADMIN_PASSWORD) {
      user.passwordHash = hashPassword(DEFAULT_ADMIN_PASSWORD);
      saveState();
      return user;
    }
    return null;
  }
  return passwordHash === hashPassword(password) ? user : null;
}

function getCurrentUser() {
  if (!currentUserId) return null;
  return state.users.find((user) => user.id === currentUserId) || null;
}

function isAuthenticated() {
  return Boolean(getCurrentUser());
}

function getCurrentUserRole() {
  const user = getCurrentUser();
  return String(user?.role || "").toUpperCase();
}

function canManageUsers() {
  return getCurrentUserRole() === "ADMIN";
}

function canEditContent() {
  const role = getCurrentUserRole();
  return role === "ADMIN" || role === "EDITOR";
}

function canViewUsers() {
  return getCurrentUserRole() === "ADMIN";
}

function persistSessionUser() {
  try {
    if (currentUserId) sessionStorage.setItem(SESSION_USER_KEY, currentUserId);
    else sessionStorage.removeItem(SESSION_USER_KEY);
  } catch (_) {}
}

function restoreSessionUser() {
  try {
    currentUserId = sessionStorage.getItem(SESSION_USER_KEY) || "";
  } catch (_) {
    currentUserId = "";
  }
  if (currentUserId && !state.users.some((user) => user.id === currentUserId)) currentUserId = "";
  persistSessionUser();
}

function applyAuthVisibility() {
  const loginView = document.getElementById("loginView");
  const appShell = document.getElementById("appShell");
  const profileMenuList = document.getElementById("profileMenuList");
  const profileMenuUser = document.getElementById("profileMenuUser");
  const user = getCurrentUser();
  const isAdmin = canManageUsers();
  const canEdit = canEditContent();
  const canSeeUsers = canViewUsers();

  loginView.hidden = Boolean(user);
  appShell.hidden = !user;
  profileMenuList.hidden = true;
  profileMenuUser.textContent = user ? `${user.name || "Usuário"} • ${user.role || "LEITOR"}` : "";
  const btnCreateUser = document.getElementById("btnCreateUser");
  const btnInviteUser = document.getElementById("btnInviteUser");
  if (btnCreateUser) btnCreateUser.hidden = !isAdmin;
  if (btnInviteUser) btnInviteUser.hidden = !isAdmin;
  const usersNavBtn = document.querySelector('.nav-btn[data-tab="usuarios"]');
  if (usersNavBtn) usersNavBtn.hidden = !canSeeUsers;

  const readOnlyControls = [
    "btnNewProject",
    "btnQuickNewProject",
    "btnImportCsv",
    "btnAddConfig",
    "applyTimeline",
    "timelineBack",
    "timelineForward",
    "timelineLeft",
    "timelineRight"
  ];
  readOnlyControls.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.hidden = !canEdit;
    if ("disabled" in el) el.disabled = !canEdit;
  });
  const timelineStart = document.getElementById("timelineStart");
  const timelineEnd = document.getElementById("timelineEnd");
  if (timelineStart) timelineStart.disabled = !canEdit;
  if (timelineEnd) timelineEnd.disabled = !canEdit;

  if (user && currentTab === "usuarios" && !canSeeUsers) currentTab = "dashboard";
  currentTab = normalizeTabName(currentTab);
  persistCurrentTab();
  if (user) {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.getElementById(currentTab)?.classList.add("active");
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === currentTab && !b.hidden));
  }
  updateThemeOptionButtons();
}

function logoutCurrentUser() {
  currentUserId = "";
  persistSessionUser();
  const loginForm = document.getElementById("loginForm");
  if (loginForm) loginForm.reset();
  clearLoginError();
  applyAuthVisibility();
}

function showLoginError(message) {
  const error = document.getElementById("loginError");
  error.textContent = message;
  error.hidden = false;
}

function clearLoginError() {
  const error = document.getElementById("loginError");
  error.textContent = "";
  error.hidden = true;
}

async function refreshStateFromSupabaseNow() {
  const before = JSON.stringify(state);
  const merged = await hydrateStateFromSupabase(state);
  if (JSON.stringify(merged) === before) return false;
  state = merged;
  ensureAdminAccount();
  supabaseBaseState = cloneForSync(state);
  saveState({ skipSupabase: true });
  return true;
}

function promptPasswordSetup(user, { contextLabel = "redefinição de senha", completeFirstAccess = false } = {}) {
  if (!user) return false;
  const pass1 = prompt(`Digite a nova senha (${contextLabel}) (mínimo 6 caracteres):`);
  if (!pass1) return false;
  if (String(pass1).length < 6) {
    alert("A senha deve ter no mínimo 6 caracteres.");
    return false;
  }
  const pass2 = prompt("Confirme a nova senha:");
  if (pass1 !== pass2) {
    alert("A confirmação da senha não confere.");
    return false;
  }
  user.passwordHash = hashPassword(pass1);
  if (completeFirstAccess) user.firstAccessPending = false;
  saveState();
  return true;
}

async function startForgotPasswordFlow() {
  const email = prompt("Informe o e-mail cadastrado:");
  if (!email) return;
  const normalizedEmail = String(email).trim().toLowerCase();
  let user = state.users.find((item) => String(item.email || "").toLowerCase() === normalizedEmail);
  if (!user) {
    await refreshStateFromSupabaseNow();
    user = state.users.find((item) => String(item.email || "").toLowerCase() === normalizedEmail);
  }
  if (!user) {
    alert("E-mail não encontrado.");
    return;
  }
  const updated = promptPasswordSetup(user, {
    contextLabel: "redefinição de senha",
    completeFirstAccess: Boolean(user.firstAccessPending)
  });
  if (!updated) return;
  alert("Senha atualizada com sucesso.");
}

async function startFirstAccessFlow() {
  const email = prompt("Informe o e-mail do convite:");
  if (!email) return;
  const normalizedEmail = String(email).trim().toLowerCase();
  let user = state.users.find((item) => String(item.email || "").toLowerCase() === normalizedEmail);
  if (!user) {
    await refreshStateFromSupabaseNow();
    user = state.users.find((item) => String(item.email || "").toLowerCase() === normalizedEmail);
  }
  if (!user) {
    alert("E-mail não encontrado.");
    return;
  }
  if (!user.firstAccessPending) {
    alert("Esse usuário já concluiu o primeiro acesso. Use \"Esqueci minha senha\" se necessário.");
    return;
  }
  const updated = promptPasswordSetup(user, { contextLabel: "primeiro acesso", completeFirstAccess: true });
  if (!updated) return;
  document.getElementById("loginEmail").value = user.email || normalizedEmail;
  document.getElementById("loginPassword").value = "";
  clearLoginError();
  alert("Primeiro acesso concluído. Faça login com a nova senha.");
}

function ensureAdminAccount() {
  if (!Array.isArray(state.users)) state.users = [];
  const normalizedDefaultEmail = DEFAULT_ADMIN_EMAIL.toLowerCase();
  const normalizedLegacyEmail = LEGACY_ADMIN_EMAIL.toLowerCase();

  let admin = state.users.find((user) => String(user.email || "").trim().toLowerCase() === normalizedDefaultEmail);
  const legacyAdmin = state.users.find((user) => String(user.email || "").trim().toLowerCase() === normalizedLegacyEmail);

  if (!admin && legacyAdmin) {
    legacyAdmin.email = DEFAULT_ADMIN_EMAIL;
    admin = legacyAdmin;
  }

  if (!admin) {
    admin = {
      id: uid(),
      name: "Administrador",
      email: DEFAULT_ADMIN_EMAIL,
      role: "ADMIN",
      passwordHash: hashPassword(DEFAULT_ADMIN_PASSWORD),
      invitedAt: new Date().toISOString().slice(0, 10),
      firstAccessPending: false
    };
    state.users.push(admin);
    saveState();
    return;
  }
  if (!String(admin.passwordHash || "").trim()) {
    admin.passwordHash = hashPassword(DEFAULT_ADMIN_PASSWORD);
    saveState();
  }
  if (admin.firstAccessPending) {
    admin.firstAccessPending = false;
    saveState();
  }
}

function bindDialog() {
  const dialog = document.getElementById("projectDialog");
  const form = document.getElementById("projectForm");
  const stageDialog = document.getElementById("stageDialog");
  const stageForm = document.getElementById("stageForm");
  const configItemDialog = document.getElementById("configItemDialog");
  const configItemForm = document.getElementById("configItemForm");
  const userDialog = document.getElementById("userDialog");
  const userForm = document.getElementById("userForm");
  const inviteDialog = document.getElementById("inviteDialog");
  const inviteForm = document.getElementById("inviteForm");
  const stageStartMonthInput = document.getElementById("stageStartMonth");
  const stageStartYearInput = document.getElementById("stageStartYear");
  const stageDurationInput = document.getElementById("stageDuration");
  const projectReleaseDateTextInput = document.getElementById("projectReleaseDateText");
  const projectReleaseDatePickerInput = document.getElementById("projectReleaseDatePicker");
  const projectReleaseDateOpenBtn = document.getElementById("projectReleaseDateOpen");
  const projectBudgetInput = document.getElementById("projectBudget");

  document.getElementById("btnCancelDialog").addEventListener("click", () => dialog.close());

  document.getElementById("btnDeleteProject").addEventListener("click", () => {
    if (!canEditContent()) {
      alert("Perfil LEITOR possui apenas visualização.");
      return;
    }
    const id = document.getElementById("projectId").value;
    if (!id) return;
    if (!confirm("Excluir projeto?")) return;
    state.projects = state.projects.filter((p) => p.id !== id);
    saveState();
    dialog.close();
    renderAll();
  });

  document.getElementById("btnAddStage").addEventListener("click", () => {
    if (!canEditContent()) {
      alert("Perfil LEITOR possui apenas visualização.");
      return;
    }
    document.getElementById("projectStages").appendChild(buildStageRow());
  });

  const syncReleaseTextAndPicker = (rawValue, shouldAlert = false) => {
    const raw = String(rawValue || "").trim();
    if (!raw) {
      projectReleaseDateTextInput.value = "";
      projectReleaseDatePickerInput.value = "";
      syncProjectYearFromReleaseDate();
      return true;
    }
    const normalized = normalizeDateInput(raw);
    if (!normalized) {
      if (shouldAlert) alert("Lançamento inválido. Use o calendário ou o formato dd/mm/aaaa.");
      syncProjectYearFromReleaseDate();
      return false;
    }
    projectReleaseDateTextInput.value = formatDatePtBr(normalized);
    projectReleaseDatePickerInput.value = normalized;
    syncProjectYearFromReleaseDate();
    return true;
  };

  projectReleaseDateTextInput.addEventListener("input", () => {
    projectReleaseDateTextInput.value = maskDateTextPtBr(projectReleaseDateTextInput.value);
    if (!String(projectReleaseDateTextInput.value || "").trim()) projectReleaseDatePickerInput.value = "";
    syncProjectYearFromReleaseDate();
  });
  projectReleaseDateTextInput.addEventListener("change", () => {
    syncReleaseTextAndPicker(projectReleaseDateTextInput.value, true);
  });
  projectReleaseDateTextInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    syncReleaseTextAndPicker(projectReleaseDateTextInput.value, true);
  });
  projectReleaseDatePickerInput.addEventListener("change", () => {
    syncReleaseTextAndPicker(projectReleaseDatePickerInput.value, false);
  });
  projectReleaseDateOpenBtn.addEventListener("click", () => {
    if (typeof projectReleaseDatePickerInput.showPicker === "function") projectReleaseDatePickerInput.showPicker();
    else projectReleaseDatePickerInput.click();
  });

  [stageStartMonthInput, stageStartYearInput, stageDurationInput].forEach((input) => {
    if (!input) return;
    input.addEventListener("input", updateStageDialogMonthLabels);
    input.addEventListener("change", updateStageDialogMonthLabels);
  });

  projectBudgetInput.addEventListener("blur", () => {
    const parsed = parseCurrencyInputBRL(projectBudgetInput.value);
    projectBudgetInput.value = parsed === null ? "" : formatCurrencyInputBRL(parsed);
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!canEditContent()) {
      alert("Perfil LEITOR possui apenas visualização.");
      return;
    }
    const project = collectProjectForm();
    if (!project) return;
    const idx = state.projects.findIndex((p) => p.id === project.id);
    if (idx >= 0) state.projects[idx] = project;
    else state.projects.push(project);
    saveState();
    dialog.close();
    renderAll();
  });

  document.getElementById("stageCancelBtn").addEventListener("click", () => stageDialog.close());
  document.getElementById("stageDeleteBtn").addEventListener("click", () => {
    if (!canEditContent()) {
      alert("Perfil LEITOR possui apenas visualização.");
      return;
    }
    const projectId = document.getElementById("stageProjectId").value;
    const stageId = document.getElementById("stageId").value;
    if (!projectId || !stageId) return;
    const project = state.projects.find((p) => p.id === projectId);
    if (!project) return;
    project.stages = project.stages.filter((s) => s.id !== stageId);
    saveState();
    stageDialog.close();
    renderAll();
  });

  stageForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!canEditContent()) {
      alert("Perfil LEITOR possui apenas visualização.");
      return;
    }
    updateStageDialogMonthLabels();
    const projectId = document.getElementById("stageProjectId").value;
    const stageId = document.getElementById("stageId").value;
    const stageTypeId = document.getElementById("stageTypeSelect").value;
    const start = document.getElementById("stageStart").value;
    const end = document.getElementById("stageEnd").value;
    const notes = document.getElementById("stageNotes").value.trim();
    if (!projectId || !stageTypeId || !start || !end || monthToIndex(start) > monthToIndex(end)) {
      alert("Preencha etapa, início e fim com período válido.");
      return;
    }
    const project = state.projects.find((p) => p.id === projectId);
    if (!project) return;
    const stageDef = state.settings.stages.find((s) => s.id === stageTypeId);
    const payload = {
      id: stageId || uid(),
      stageId: stageTypeId,
      start,
      end,
      name: stageDef?.name || "",
      notes
    };
    const idx = project.stages.findIndex((s) => s.id === payload.id);
    if (idx >= 0) project.stages[idx] = { ...project.stages[idx], ...payload };
    else project.stages.push(payload);
    project.stages.sort((a, b) => monthToIndex(a.start) - monthToIndex(b.start));
    saveState();
    stageDialog.close();
    renderAll();
  });

  document.getElementById("configItemCancelBtn").addEventListener("click", () => configItemDialog.close());
  configItemForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!canEditContent()) {
      alert("Perfil LEITOR possui apenas visualização.");
      return;
    }
    saveConfigItemDialog();
    configItemDialog.close();
  });

  document.getElementById("userCancelBtn").addEventListener("click", () => userDialog.close());
  userForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const payload = collectUserForm();
    if (!payload) return;

    const idx = state.users.findIndex((user) => user.id === payload.id);
    if (idx >= 0) state.users[idx] = { ...state.users[idx], ...payload, invitedAt: state.users[idx].invitedAt || payload.invitedAt };
    else state.users.push(payload);

    saveState();
    userDialog.close();
    renderUsers();
    applyAuthVisibility();
  });

  document.getElementById("inviteCancelBtn").addEventListener("click", () => inviteDialog.close());
  inviteForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!canManageUsers()) {
      alert("Apenas ADMIN pode gerir usuários.");
      inviteDialog.close();
      return;
    }
    const payload = collectInviteForm();
    if (!payload) return;
    const inviteLink = buildUserInviteLink(payload.email, payload.role);
    const existingIdx = state.users.findIndex((user) => String(user.email || "").toLowerCase() === payload.email);
    const invitedAt = new Date().toISOString().slice(0, 10);
    const passwordHash = hashPassword(DEFAULT_INVITED_PASSWORD);
    if (existingIdx >= 0) {
      const existing = state.users[existingIdx];
      state.users[existingIdx] = {
        ...existing,
        name: String(existing.name || "").trim() || displayNameFromEmail(payload.email),
        email: payload.email,
        role: payload.role,
        invitedAt,
        passwordHash,
        firstAccessPending: true
      };
    } else {
      state.users.push({
        id: uid(),
        name: displayNameFromEmail(payload.email),
        email: payload.email,
        role: payload.role,
        passwordHash,
        invitedAt,
        firstAccessPending: true
      });
    }
    saveState();
    renderUsers();
    inviteDialog.close();
    window.location.href = inviteLink;
  });
}

function renderAll() {
  if (currentUserId && !state.users.some((user) => user.id === currentUserId)) {
    currentUserId = "";
    persistSessionUser();
  }
  renderDashboard();
  renderGantt();
  renderProjectsTools();
  renderProjectsTable();
  renderUsers();
  renderConfigTabs();
  renderConfigList();
  applyPtBrLocaleToDateInputs(document);
  applyAuthVisibility();
}

function renderDashboard() {
  renderDashboardYearChips();
  renderDashboardExtraFilters();
  const allProjects = [...state.projects];
  const projects = filteredDashboardProjects();

  const totalProjects = allProjects.length;
  const projectsWithSpent = projects
    .map((p) => ({ p, value: getProjectSpentValue(p) }))
    .filter((item) => item.value !== null);
  const totalSpent = projectsWithSpent.reduce((acc, item) => acc + item.value, 0);
  const avgSpent = projectsWithSpent.length ? totalSpent / projectsWithSpent.length : 0;

  document.getElementById("summaryCards").innerHTML = [
    cardHtml("Total de Produções", String(totalProjects), "projects"),
    cardHtml("Total Gasto", money(totalSpent), "spent"),
    cardHtml("Gasto Médio por Projeto", money(avgSpent), "avg")
  ].join("");

  const categoryPicker = (project) => getNormalizedProjectField(project, "category", { strict: true });
  const formatPicker = (project) => getNormalizedProjectField(project, "format", { strict: true });
  const naturePicker = (project) => getNormalizedProjectField(project, "nature", { strict: true });
  const durationPicker = (project) => getNormalizedProjectField(project, "duration", { strict: true });

  renderBarChart(document.getElementById("chartByYear"), countByYearWithMissing(projects), "vertical", ["#f3ba00"]);
  renderBarChart(document.getElementById("chartByStatus"), countBy(projects, (p) => getProjectField(p, "status"), true), "vertical", ["#10b981", "#3b82f6", "#f59e0b", "#94a3b8"]);
  renderBarChart(document.getElementById("chartByCategory"), countBy(projects, categoryPicker, true), "vertical", ["#10b981", "#3b82f6", "#f59e0b", "#94a3b8"]);
  renderBarChart(document.getElementById("chartByFormat"), countBy(projects, formatPicker, true), "vertical", ["#10b981", "#3b82f6", "#f59e0b"]);
  renderBarChart(document.getElementById("chartByNature"), countBy(projects, naturePicker, true), "vertical", ["#10b981", "#3b82f6", "#f59e0b"]);
  renderBarChart(document.getElementById("chartByDuration"), countBy(projects, durationPicker, true), "vertical", ["#10b981", "#3b82f6", "#f59e0b"]);
  renderBarChart(document.getElementById("chartAvgStage"), avgMonthsByStage(projects), "horizontal", ["#94a3b8", "#60a5fa", "#fcd34d", "#34d399", "#f472b6"]);
}

function renderDashboardYearChips() {
  const years = [...new Set(state.projects.map((p) => getProjectYear(p)).filter((y) => y > 0))].sort((a, b) => a - b);
  const hasMissingYear = state.projects.some((project) => !getProjectYear(project));
  const allActive = selectedDashboardYears.size === 0;
  const chips = ["Todos", ...years, ...(hasMissingYear ? ["SEM ANO"] : [])];
  document.getElementById("yearChips").innerHTML = chips
    .map((y) => {
      const value = y === "Todos" ? "__all" : y === "SEM ANO" ? "__no_year" : String(y);
      const active = y === "Todos" ? allActive : selectedDashboardYears.has(value);
      return `<button class="chip ${active ? "active" : ""}" data-year="${value}">${y}</button>`;
    })
    .join("");

  document.querySelectorAll("#yearChips .chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      if (chip.dataset.year === "__all") {
        selectedDashboardYears.clear();
      } else {
        const y = chip.dataset.year;
        if (selectedDashboardYears.has(y)) selectedDashboardYears.delete(y);
        else selectedDashboardYears.add(y);
      }
      renderDashboard();
    });
  });
}

function filteredDashboardProjects() {
  return state.projects.filter((p) => {
    if (selectedDashboardYears.size) {
      const year = getProjectYear(p);
      const yearKey = year ? String(year) : "__no_year";
      if (!selectedDashboardYears.has(yearKey)) return false;
    }
    if (!matchesMultiFilter(getNormalizedProjectField(p, "category", { strict: true }), selectedDashboardFilters.categories)) return false;
    if (!matchesMultiFilter(getNormalizedProjectField(p, "format", { strict: true }), selectedDashboardFilters.formats)) return false;
    if (!matchesMultiFilter(getNormalizedProjectField(p, "nature", { strict: true }), selectedDashboardFilters.natures)) return false;
    if (!matchesMultiFilter(getNormalizedProjectField(p, "duration", { strict: true }), selectedDashboardFilters.durations)) return false;
    if (!matchesProjectFilter(p.id, selectedDashboardFilters.projects)) return false;
    return true;
  });
}

function renderDashboardExtraFilters() {
  const panel = document.getElementById("dashboardFiltersPanel");
  const toggle = document.getElementById("dashboardFiltersToggle");
  panel.hidden = !dashboardFiltersOpen;
  toggle.innerHTML = `Filtros <span class="filter-arrow">${dashboardFiltersOpen ? "▴" : "▾"}</span>`;
  const categoryValues = uniq(state.settings.categories).filter(Boolean);
  const formatValues = uniq(state.settings.formats).filter(Boolean);
  const natureValues = uniq(state.settings.natures).filter(Boolean);
  const durationValues = uniq(state.settings.durations).filter(Boolean);
  sanitizeFilterSet(selectedDashboardFilters.categories, categoryValues);
  sanitizeFilterSet(selectedDashboardFilters.formats, formatValues);
  sanitizeFilterSet(selectedDashboardFilters.natures, natureValues);
  sanitizeFilterSet(selectedDashboardFilters.durations, durationValues);

  renderDashboardFilterChips(
    document.getElementById("dashboardCategoryChips"),
    categoryValues,
    selectedDashboardFilters.categories,
    "categories"
  );
  renderDashboardFilterChips(
    document.getElementById("dashboardFormatChips"),
    formatValues,
    selectedDashboardFilters.formats,
    "formats"
  );
  renderDashboardFilterChips(
    document.getElementById("dashboardNatureChips"),
    natureValues,
    selectedDashboardFilters.natures,
    "natures"
  );
  renderDashboardFilterChips(
    document.getElementById("dashboardDurationChips"),
    durationValues,
    selectedDashboardFilters.durations,
    "durations"
  );
  renderProjectPickerFilter(document.getElementById("dashboardProjectFilter"), selectedDashboardFilters.projects, "dashboard", () => renderDashboard());
}

function renderDashboardFilterChips(container, values, selectedSet, key, onChange = renderDashboard) {
  const allActive = selectedSet.size === 0;
  container.innerHTML = [
    `<button class="chip ${allActive ? "active" : ""}" data-filter-key="${key}" data-filter-value="__all">Todos</button>`,
    ...values.map((value) => `<button class="chip ${selectedSet.has(value) ? "active" : ""}" data-filter-key="${key}" data-filter-value="${encodeURIComponent(value)}">${escapeHtml(value)}</button>`)
  ].join("");

  container.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const filterValue = chip.dataset.filterValue === "__all" ? "__all" : decodeURIComponent(chip.dataset.filterValue);
      const set = selectedSet;
      if (filterValue === "__all") {
        set.clear();
      } else if (set.has(filterValue)) {
        set.delete(filterValue);
      } else {
        set.add(filterValue);
      }
      onChange();
    });
  });
}

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function renderProjectPickerFilter(container, selectedSet, scopeKey, onChange) {
  if (!container) return;
  const allProjects = sortedProjects(state.projects, "desc").map((project) => ({
    id: project.id,
    label: `${project.code || "Sem SKU"} ${project.title || "Sem título"}`.trim()
  }));
  const validIds = new Set(allProjects.map((project) => project.id));
  [...selectedSet].forEach((id) => {
    if (!validIds.has(id)) selectedSet.delete(id);
  });
  const query = String(projectFilterQueries[scopeKey] || "");
  const selectedIds = [...selectedSet];
  const selectedItems = selectedIds
    .map((id) => allProjects.find((project) => project.id === id))
    .filter(Boolean);

  const getSuggestions = () => {
    const q = normalizeSearchText(projectFilterQueries[scopeKey] || "");
    if (!q) return [];
    return allProjects
      .filter((project) => !selectedSet.has(project.id))
      .filter((project) => {
        return normalizeSearchText(project.label).includes(q);
      })
      .slice(0, 10);
  };

  const renderSuggestionsHtml = () => {
    const q = normalizeSearchText(projectFilterQueries[scopeKey] || "");
    if (!q) return "";
    const suggestions = getSuggestions();
    if (!suggestions.length) return '<span class="project-picker-empty">Nenhum projeto encontrado.</span>';
    return suggestions
      .map((item) => `<button type="button" data-project-filter="add" data-id="${item.id}">${escapeHtml(item.label)}</button>`)
      .join("");
  };

  const allActive = selectedSet.size === 0;
  container.innerHTML = `<div class="project-picker">
    <div class="project-picker-top">
      <button class="chip ${allActive ? "active" : ""}" data-project-filter="all">Todos</button>
      <div class="project-picker-input">
        ${selectedItems
          .map(
            (item) =>
              `<span class="project-token">${escapeHtml(item.label)}<button type="button" data-project-filter="remove" data-id="${item.id}" aria-label="Remover projeto">×</button></span>`
          )
          .join("")}
        <input type="text" data-project-filter="query" placeholder="Buscar projeto..." value="${escapeHtml(query)}" />
      </div>
    </div>
    <div class="project-picker-suggestions" data-project-filter="suggestions">${renderSuggestionsHtml()}</div>
  </div>`;

  const queryInput = container.querySelector("[data-project-filter='query']");
  const suggestionsWrap = container.querySelector("[data-project-filter='suggestions']");
  if (queryInput) {
    const addProjectFromSuggestion = (candidate) => {
      if (!candidate) return;
      selectedSet.add(candidate.id);
      projectFilterQueries[scopeKey] = "";
      onChange();
    };

    const addFromQuery = () => {
      if (!String(queryInput.value || "").trim()) return;
      const first = getSuggestions()[0];
      addProjectFromSuggestion(first);
    };

    const refreshSuggestions = () => {
      if (!suggestionsWrap) return;
      suggestionsWrap.innerHTML = renderSuggestionsHtml();
    };

    queryInput.addEventListener("input", () => {
      projectFilterQueries[scopeKey] = queryInput.value;
      refreshSuggestions();
    });

    queryInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === "," || event.key === ";") {
        event.preventDefault();
        addFromQuery();
        return;
      }
      if (event.key !== "Backspace" || queryInput.value.trim()) return;
      const last = selectedItems[selectedItems.length - 1];
      if (!last) return;
      selectedSet.delete(last.id);
      onChange();
    });

    suggestionsWrap?.addEventListener("click", (event) => {
      const btn = event.target.closest("button[data-project-filter='add']");
      if (!btn) return;
      const candidate = allProjects.find((project) => project.id === btn.dataset.id);
      addProjectFromSuggestion(candidate);
    });
  }

  container.querySelector("[data-project-filter='all']")?.addEventListener("click", () => {
    selectedSet.clear();
    projectFilterQueries[scopeKey] = "";
    onChange();
  });

  container.querySelectorAll("[data-project-filter='remove']").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedSet.delete(btn.dataset.id);
      onChange();
    });
  });
}

function matchesMultiFilter(value, selectedSet) {
  if (!selectedSet || selectedSet.size === 0) return true;
  const normalized = String(value || "").trim();
  return normalized && selectedSet.has(normalized);
}

function matchesProjectFilter(projectId, selectedSet) {
  if (!selectedSet || selectedSet.size === 0) return true;
  return selectedSet.has(projectId);
}

function getProjectField(project, field) {
  const pick = (...keys) => {
    for (const key of keys) {
      const value = project?.[key];
      if (value !== null && value !== undefined && String(value).trim() !== "") return String(value).trim();
    }
    return "";
  };

  if (field === "category") return pick("category", "categoria");
  if (field === "format") return pick("format", "formato", "productionType", "production_type");
  if (field === "nature") return pick("nature", "natureza");
  if (field === "duration") return pick("duration", "duracao");
  if (field === "status") return pick("status");
  return pick(field);
}

function normalizeValueBySettings(field, value, { strict = false } = {}) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const settingsKey = FIELD_TO_SETTINGS_KEY[field];
  if (!settingsKey) return raw;
  const options = Array.isArray(state?.settings?.[settingsKey]) ? state.settings[settingsKey].map((item) => String(item || "").trim()).filter(Boolean) : [];
  if (!options.length) return strict ? "" : raw;
  const normalizedRaw = normalizeSearchText(raw);
  const exact = options.find((item) => normalizeSearchText(item) === normalizedRaw);
  if (exact) return exact;

  if (field === "category" && normalizedRaw.includes("incubad")) {
    const incubado = options.find((item) => normalizeSearchText(item).includes("incubad"));
    if (incubado) return incubado;
  }
  return strict ? "" : raw;
}

function getNormalizedProjectField(project, field, { strict = false } = {}) {
  return normalizeValueBySettings(field, getProjectField(project, field), { strict });
}

function sanitizeFilterSet(selectedSet, allowedValues) {
  const allowed = new Set((allowedValues || []).map((value) => String(value || "").trim()).filter(Boolean));
  [...selectedSet].forEach((value) => {
    if (!allowed.has(String(value || "").trim())) selectedSet.delete(value);
  });
}

function getProjectYear(project) {
  const normalizedReleaseDate = normalizeDateInput(project?.releaseDate || project?.release_date || project?.dataDeLancamento || project?.data_de_lancamento || "");
  if (normalizedReleaseDate) return Number(normalizedReleaseDate.slice(0, 4));
  const fallbackYear = Number(project?.year || project?.ano);
  if (Number.isInteger(fallbackYear) && fallbackYear > 0) return fallbackYear;
  return null;
}

function getProjectYearLabel(project) {
  const year = getProjectYear(project);
  return year ? String(year) : "";
}

function renderGantt() {
  const editable = canEditContent();
  renderGanttYearChips();
  renderGanttExtraFilters();
  normalizeTimelineWindow();
  document.getElementById("timelineStart").value = state.timeline.start;
  document.getElementById("timelineEnd").value = state.timeline.end;

  const months = monthsBetween(state.timeline.start, state.timeline.end);
  const list = sortedProjects(filteredGanttProjects(), "desc");
  const container = document.getElementById("ganttContainer");
  const rangeLabel = document.getElementById("timelineRangeLabel");
  if (rangeLabel) rangeLabel.textContent = timelineRangeLabel(state.timeline.start, state.timeline.end);

  if (!months.length) {
    container.innerHTML = '<div class="empty">Período inválido.</div>';
    return;
  }

  const containerWidth = Math.max(container.clientWidth, 320);
  const leftWidth = containerWidth < 540 ? 160 : containerWidth < 800 ? 210 : 270;
  const availableWidth = Math.max(containerWidth - leftWidth - 8, 140);
  const minMonthWidth = containerWidth < 540 ? 12 : containerWidth < 800 ? 14 : 18;
  const monthWidth = Math.max(minMonthWidth, Math.floor(availableWidth / months.length));
  const timelineWidth = Math.max(months.length * monthWidth, availableWidth);
  container.style.setProperty("--month-width", `${monthWidth}px`);
  const currentMonthIso = (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  })();
  const currentMarkerIndex = monthToIndex(currentMonthIso) - monthToIndex(state.timeline.start);
  const hasCurrentMarker = currentMarkerIndex >= 0 && currentMarkerIndex < months.length;

  let html = `<div class="gantt" style="min-width:${leftWidth + timelineWidth}px">`;
  html += `<div class="gantt-head" style="grid-template-columns:${leftWidth}px ${timelineWidth}px">`;
  html += '<div class="g-left">PROJETO</div>';
  html += `<div class="g-months">${months
    .map((m, idx) => `<div class="g-month ${idx > 0 && String(m).endsWith("-01") ? "year-separator" : ""}">${monthLabel(m)}</div>`)
    .join("")}</div>`;
  html += "</div>";

  list.forEach((project) => {
    html += `<div class="gantt-row" style="grid-template-columns:${leftWidth}px ${timelineWidth}px">`;
    html += `<div class="g-left">
      ${
        editable
          ? `<button class="g-open" data-open-project="${project.id}">`
          : '<span class="g-open g-open-readonly">'
      }
        <span class="g-code">${escapeHtml(project.code || "")}</span>
        <span class="g-title">${escapeHtml(project.title)}</span>
      ${editable ? "</button>" : "</span>"}
      ${editable ? `<button class="g-add-stage" data-add-stage="${project.id}" title="Adicionar etapa">+</button>` : ""}
    </div>`;

    html += `<div class="g-line" data-line-project="${project.id}">`;
    months.forEach((m, idx) => {
      if (idx > 0 && String(m).endsWith("-01")) {
        html += `<div class="g-year-divider" style="left: calc(${idx} * var(--month-width));" aria-hidden="true"></div>`;
      }
    });
    project.stages.forEach((st) => {
      const start = monthToIndex(st.start) - monthToIndex(state.timeline.start);
      const end = monthToIndex(st.end) - monthToIndex(state.timeline.start);
      if (end < 0 || start >= months.length) return;
      const visStart = Math.max(0, start);
      const visEnd = Math.min(months.length - 1, end);
      const width = visEnd - visStart + 1;
      const stageDef = state.settings.stages.find((s) => s.id === st.stageId);
      const color = stageDef?.color || "#cbd5e1";
      const stageLabel = stageDef?.name || st.name || "Etapa";
      const stageTitle = `${stageLabel}: ${monthHoverLabel(st.start)} - ${monthHoverLabel(st.end)}`;
      const selected = selectedStageRef && selectedStageRef.projectId === project.id && selectedStageRef.stageId === st.id;

      html += `<div class="stage-bar ${selected ? "selected" : ""}" style="left: calc(${visStart} * var(--month-width)); width: calc(${width} * var(--month-width) - 2px); background:${color}" data-project="${project.id}" data-stage="${st.id}" title="${escapeHtml(stageTitle)}">
        <span class="label">${escapeHtml(stageLabel)}</span>
        <span class="stage-handle left" data-resize="left"></span>
        <span class="stage-handle right" data-resize="right"></span>
      </div>`;
    });

    const releaseMarker = getReleaseMarkerData(project.releaseDate, state.timeline.start, state.timeline.end);
    if (releaseMarker) {
      html += `<div class="release-stage-bar" style="left: calc(${releaseMarker.offsetMonths} * var(--month-width)); width: calc(1 * var(--month-width) - 2px);" data-release-project="${project.id}" title="Lançamento: ${escapeHtml(
        releaseMarker.label
      )}">
        <span class="label">LAN</span>
        <span class="stage-handle left"></span>
        <span class="stage-handle right"></span>
      </div>`;
    }
    html += "</div></div>";
  });

  if (hasCurrentMarker) {
    const markerLeft = leftWidth + currentMarkerIndex * monthWidth + monthWidth / 2;
    html += `<div class="g-current-month-marker" style="left:${markerLeft}px" title="Mês atual: ${escapeHtml(monthLabel(currentMonthIso))}">
      <span class="g-current-month-dot" aria-hidden="true"></span>
    </div>`;
  }

  html += "</div>";
  container.innerHTML = html;

  const ganttEl = container.querySelector(".gantt");
  const headEl = container.querySelector(".gantt-head");
  if (ganttEl && headEl) ganttEl.style.setProperty("--g-current-top", `${headEl.offsetHeight}px`);

  if (!editable) return;

  container.querySelectorAll("[data-open-project]").forEach((el) => {
    el.addEventListener("click", () => openProjectDialog(el.dataset.openProject));
  });

  container.querySelectorAll("[data-add-stage]").forEach((el) => {
    el.addEventListener("click", () => openStageDialog(el.dataset.addStage));
  });

  container.querySelectorAll(".stage-bar").forEach((bar) => {
    bar.addEventListener("click", () => {
      selectedStageRef = { projectId: bar.dataset.project, stageId: bar.dataset.stage };
      renderGantt();
    });
    bar.addEventListener("dblclick", () => openStageDialog(bar.dataset.project, bar.dataset.stage));
    bar.addEventListener("mousedown", (event) => {
      if (event.button !== 0) return;
      const handle = event.target.closest("[data-resize]");
      startStageDrag(event, bar, handle?.dataset.resize || "move");
    });
  });

  container.querySelectorAll(".release-stage-bar").forEach((bar) => {
    bar.addEventListener("dblclick", (event) => {
      event.stopPropagation();
      openReleaseDateEditor(bar.dataset.releaseProject);
    });
    bar.addEventListener("mousedown", (event) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      startReleaseDrag(event, bar);
    });
  });

  container.querySelectorAll(".g-line").forEach((line) => {
    const projectId = line.dataset.lineProject;
    line.addEventListener("mousemove", (event) => renderStageGhost(line, event));
    line.addEventListener("mouseleave", () => removeStageGhost(line));
    line.addEventListener("click", (event) => {
      if (Date.now() < suppressLineClickUntil) return;
      if (event.target.closest(".stage-bar, .release-stage-bar")) return;
      const idx = monthIndexFromLinePointer(line, event);
      if (idx == null) return;
      const month = addMonths(state.timeline.start, idx);
      openStageDialog(projectId, null, month);
    });
  });
}

function renderTimelineYearChips() {
  const years = [...new Set(monthsBetween(state.timeline.start, state.timeline.end).map((m) => Number(m.slice(0, 4))))];
  document.getElementById("timelineYears").innerHTML = years.map((y) => `<span class="chip active">${y}</span>`).join("");
}

function renderGanttYearChips() {
  const years = [...new Set(state.projects.map((p) => getProjectYear(p)).filter((y) => y > 0))].sort((a, b) => a - b);
  const allActive = selectedGanttYears.size === 0;
  const chips = ["Todos", ...years];
  document.getElementById("timelineYears").innerHTML = chips
    .map((y) => {
      const active = y === "Todos" ? allActive : selectedGanttYears.has(String(y));
      const value = y === "Todos" ? "__all" : String(y);
      return `<button class="chip ${active ? "active" : ""}" data-gyear="${value}">${y}</button>`;
    })
    .join("");

  document.querySelectorAll("#timelineYears .chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      if (chip.dataset.gyear === "__all") {
        selectedGanttYears.clear();
      } else {
        const y = chip.dataset.gyear;
        if (selectedGanttYears.has(y)) selectedGanttYears.delete(y);
        else selectedGanttYears.add(y);
      }
      renderGantt();
    });
  });
}

function renderGanttExtraFilters() {
  const panel = document.getElementById("ganttFiltersPanel");
  const toggle = document.getElementById("btnFilterGantt");
  panel.hidden = !ganttFiltersOpen;
  toggle.innerHTML = `Filtros <span class="filter-arrow">${ganttFiltersOpen ? "▴" : "▾"}</span>`;

  renderDashboardFilterChips(
    document.getElementById("ganttCategoryChips"),
    uniq([...state.settings.categories, ...state.projects.map((p) => getProjectField(p, "category"))]).filter(Boolean),
    selectedGanttFilters.categories,
    "categories",
    () => renderGantt()
  );
  renderDashboardFilterChips(
    document.getElementById("ganttFormatChips"),
    uniq([...state.settings.formats, ...state.projects.map((p) => getProjectField(p, "format"))]).filter(Boolean),
    selectedGanttFilters.formats,
    "formats",
    () => renderGantt()
  );
  renderDashboardFilterChips(
    document.getElementById("ganttNatureChips"),
    uniq([...state.settings.natures, ...state.projects.map((p) => getProjectField(p, "nature"))]).filter(Boolean),
    selectedGanttFilters.natures,
    "natures",
    () => renderGantt()
  );
  renderDashboardFilterChips(
    document.getElementById("ganttDurationChips"),
    uniq([...state.settings.durations, ...state.projects.map((p) => getProjectField(p, "duration"))]).filter(Boolean),
    selectedGanttFilters.durations,
    "durations",
    () => renderGantt()
  );
  renderProjectPickerFilter(document.getElementById("ganttProjectFilter"), selectedGanttFilters.projects, "gantt", () => renderGantt());
}

function filteredGanttProjects() {
  return state.projects.filter((p) => {
    if (selectedGanttYears.size && !selectedGanttYears.has(String(getProjectYear(p)))) return false;
    if (!matchesMultiFilter(getProjectField(p, "category"), selectedGanttFilters.categories)) return false;
    if (!matchesMultiFilter(getProjectField(p, "format"), selectedGanttFilters.formats)) return false;
    if (!matchesMultiFilter(getProjectField(p, "nature"), selectedGanttFilters.natures)) return false;
    if (!matchesMultiFilter(getProjectField(p, "duration"), selectedGanttFilters.durations)) return false;
    if (!matchesProjectFilter(p.id, selectedGanttFilters.projects)) return false;
    return true;
  });
}

function openStageDialog(projectId, stageId = null, forcedStart = null) {
  if (!canEditContent()) {
    alert("Perfil LEITOR possui apenas visualização.");
    return;
  }
  const project = state.projects.find((p) => p.id === projectId);
  if (!project) return;
  const stage = stageId ? project.stages.find((s) => s.id === stageId) : null;
  const dialog = document.getElementById("stageDialog");
  const stageSelect = document.getElementById("stageTypeSelect");
  const startMonthSelect = document.getElementById("stageStartMonth");
  const monthTemplate = document.getElementById("stageMonthOptionsTpl");

  stageSelect.innerHTML = state.settings.stages
    .map((st) => `<option value="${st.id}" ${st.id === (stage?.stageId || state.settings.stages[0]?.id) ? "selected" : ""}>${escapeHtml(st.name)}</option>`)
    .join("");
  if (startMonthSelect && monthTemplate) startMonthSelect.innerHTML = monthTemplate.innerHTML;

  document.getElementById("stageDialogTitle").textContent = stage ? "Editar Etapa" : "Nova Etapa";
  document.getElementById("stageProjectId").value = project.id;
  document.getElementById("stageId").value = stage?.id || "";
  const start = stage?.start || forcedStart || state.timeline.start;
  const end = stage?.end || start;
  setStageDialogRange(start, end);
  document.getElementById("stageNotes").value = stage?.notes || "";
  document.getElementById("stageDeleteBtn").style.visibility = stage ? "visible" : "hidden";
  updateStageDialogMonthLabels();
  dialog.showModal();
}

function startStageDrag(event, bar, mode) {
  if (!canEditContent()) return;
  event.preventDefault();
  const projectId = bar.dataset.project;
  const stageId = bar.dataset.stage;
  const project = state.projects.find((p) => p.id === projectId);
  const stage = project?.stages.find((s) => s.id === stageId);
  if (!stage) return;
  const monthWidth = parseFloat(getComputedStyle(document.getElementById("ganttContainer")).getPropertyValue("--month-width")) || 46;
  draggingStage = {
    projectId,
    stageId,
    mode,
    startX: event.clientX,
    startMonth: monthToIndex(stage.start),
    endMonth: monthToIndex(stage.end),
    monthWidth,
    moved: false
  };
  document.addEventListener("mousemove", onStageDragMove);
  document.addEventListener("mouseup", onStageDragEnd, { once: true });
}

function onStageDragMove(event) {
  if (!draggingStage) return;
  const delta = Math.round((event.clientX - draggingStage.startX) / draggingStage.monthWidth);
  const project = state.projects.find((p) => p.id === draggingStage.projectId);
  const stage = project?.stages.find((s) => s.id === draggingStage.stageId);
  if (!stage) return;

  let start = draggingStage.startMonth;
  let end = draggingStage.endMonth;
  if (draggingStage.mode === "move") {
    start += delta;
    end += delta;
  } else if (draggingStage.mode === "left") {
    start = Math.min(draggingStage.startMonth + delta, end);
  } else if (draggingStage.mode === "right") {
    end = Math.max(draggingStage.endMonth + delta, start);
  }
  stage.start = indexToMonth(start);
  stage.end = indexToMonth(end);
  if (delta !== 0) draggingStage.moved = true;
  renderGantt();
}

function onStageDragEnd() {
  document.removeEventListener("mousemove", onStageDragMove);
  if (draggingStage?.moved) suppressLineClickUntil = Date.now() + 250;
  draggingStage = null;
  saveState();
  renderDashboard();
}

function startReleaseDrag(event, bar) {
  if (!canEditContent()) return;
  event.preventDefault();
  const projectId = bar.dataset.releaseProject;
  const project = state.projects.find((p) => p.id === projectId);
  const normalizedReleaseDate = normalizeDateInput(project?.releaseDate || "");
  if (!project || !normalizedReleaseDate) return;

  const monthWidth = parseFloat(getComputedStyle(document.getElementById("ganttContainer")).getPropertyValue("--month-width")) || 46;
  draggingRelease = {
    projectId,
    startX: event.clientX,
    startMonth: monthToIndex(monthFromDate(normalizedReleaseDate)),
    monthWidth,
    moved: false,
    baseDate: normalizedReleaseDate
  };
  document.addEventListener("mousemove", onReleaseDragMove);
  document.addEventListener("mouseup", onReleaseDragEnd, { once: true });
}

function onReleaseDragMove(event) {
  if (!draggingRelease) return;
  const delta = Math.round((event.clientX - draggingRelease.startX) / draggingRelease.monthWidth);
  const project = state.projects.find((p) => p.id === draggingRelease.projectId);
  if (!project) return;

  const nextMonth = indexToMonth(draggingRelease.startMonth + delta);
  const nextDate = setReleaseDateMonth(draggingRelease.baseDate, nextMonth);
  if (!nextDate || project.releaseDate === nextDate) return;
  project.releaseDate = nextDate;
  project.year = Number(nextDate.slice(0, 4));
  if (delta !== 0) draggingRelease.moved = true;
  renderGantt();
}

function onReleaseDragEnd() {
  document.removeEventListener("mousemove", onReleaseDragMove);
  const didMove = Boolean(draggingRelease?.moved);
  draggingRelease = null;
  if (!didMove) return;
  suppressLineClickUntil = Date.now() + 250;
  saveState();
  renderProjectsTools();
  renderProjectsTable();
  renderDashboard();
}

function openReleaseDateEditor(projectId) {
  if (!canEditContent()) {
    alert("Perfil LEITOR possui apenas visualização.");
    return;
  }
  const project = state.projects.find((p) => p.id === projectId);
  if (!project) return;
  const normalized = normalizeDateInput(project.releaseDate || "");
  if (!normalized) return;

  const picker = document.createElement("input");
  picker.type = "date";
  picker.lang = "pt-BR";
  picker.value = normalized;
  picker.style.position = "fixed";
  picker.style.opacity = "0";
  picker.style.pointerEvents = "none";
  picker.style.width = "1px";
  picker.style.height = "1px";
  document.body.appendChild(picker);

  const cleanup = () => picker.remove();
  picker.addEventListener(
    "change",
    () => {
      const next = normalizeDateInput(picker.value);
      if (next) {
        project.releaseDate = next;
        project.year = Number(next.slice(0, 4));
        saveState();
        renderAll();
      }
      cleanup();
    },
    { once: true }
  );
  picker.addEventListener(
    "blur",
    () => {
      setTimeout(cleanup, 0);
    },
    { once: true }
  );

  if (typeof picker.showPicker === "function") picker.showPicker();
  else picker.click();
}

function monthIndexFromLinePointer(line, event) {
  const rect = line.getBoundingClientRect();
  const monthWidth = parseFloat(getComputedStyle(document.getElementById("ganttContainer")).getPropertyValue("--month-width")) || 46;
  const x = event.clientX - rect.left;
  const idx = Math.floor(x / monthWidth);
  const max = monthsBetween(state.timeline.start, state.timeline.end).length - 1;
  if (idx < 0 || idx > max) return null;
  return idx;
}

function renderStageGhost(line, event) {
  const idx = monthIndexFromLinePointer(line, event);
  if (idx == null) return;
  let ghost = line.querySelector(".stage-ghost");
  if (!ghost) {
    ghost = document.createElement("div");
    ghost.className = "stage-ghost";
    line.appendChild(ghost);
  }
  ghost.style.left = `calc(${idx} * var(--month-width))`;
  ghost.textContent = monthHoverLabel(addMonths(state.timeline.start, idx));
}

function removeStageGhost(line) {
  line.querySelector(".stage-ghost")?.remove();
}

function zoomTimeline(delta) {
  if (!canEditContent()) return;
  normalizeTimelineWindow();
  const current = getTimelineMonthsShown();
  const next = Math.max(6, Math.min(72, current + delta));
  const container = document.getElementById("ganttContainer");
  state.timeline.monthsShown = next;
  state.timeline.end = addMonths(state.timeline.start, next - 1);
  document.getElementById("timelineStart").value = state.timeline.start;
  document.getElementById("timelineEnd").value = state.timeline.end;
  saveState();
  renderGantt();
  if (container) container.scrollLeft = 0;
}

function decreaseTimelineWindow() {
  zoomTimeline(6);
}

function increaseTimelineWindow() {
  zoomTimeline(-6);
}

function panTimeline(delta) {
  if (!canEditContent()) return;
  normalizeTimelineWindow();
  state.timeline.start = addMonths(state.timeline.start, delta);
  state.timeline.end = addMonths(state.timeline.end, delta);
  document.getElementById("timelineStart").value = state.timeline.start;
  document.getElementById("timelineEnd").value = state.timeline.end;
  saveState();
  renderGantt();
}

function renderProjectsTools() {
  const panel = document.getElementById("projectFiltersPanel");
  const toggle = document.getElementById("btnFilterProjects");
  panel.hidden = !projectFiltersOpen;
  toggle.innerHTML = `Filtros <span class="filter-arrow">${projectFiltersOpen ? "▴" : "▾"}</span>`;

  const years = [...new Set(state.projects.map((p) => getProjectYear(p)).filter((y) => y > 0))].sort((a, b) => a - b);
  const allActive = selectedProjectYears.size === 0;
  document.getElementById("projectYears").innerHTML = ["Todos", ...years]
    .map((year) => {
      const active = year === "Todos" ? allActive : selectedProjectYears.has(String(year));
      const value = year === "Todos" ? "__all" : String(year);
      return `<button class="chip ${active ? "active" : ""}" data-pyear="${value}">${year}</button>`;
    })
    .join("");

  document.querySelectorAll("#projectYears .chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      if (chip.dataset.pyear === "__all") selectedProjectYears.clear();
      else if (selectedProjectYears.has(chip.dataset.pyear)) selectedProjectYears.delete(chip.dataset.pyear);
      else selectedProjectYears.add(chip.dataset.pyear);
      renderProjectsTable();
      renderProjectsTools();
    });
  });

  renderDashboardFilterChips(
    document.getElementById("projectCategoryChips"),
    uniq([...state.settings.categories, ...state.projects.map((p) => getProjectField(p, "category"))]).filter(Boolean),
    selectedProjectFilters.categories,
    "categories",
    () => {
      renderProjectsTools();
      renderProjectsTable();
    }
  );
  renderDashboardFilterChips(
    document.getElementById("projectFormatChips"),
    uniq([...state.settings.formats, ...state.projects.map((p) => getProjectField(p, "format"))]).filter(Boolean),
    selectedProjectFilters.formats,
    "formats",
    () => {
      renderProjectsTools();
      renderProjectsTable();
    }
  );
  renderDashboardFilterChips(
    document.getElementById("projectNatureChips"),
    uniq([...state.settings.natures, ...state.projects.map((p) => getProjectField(p, "nature"))]).filter(Boolean),
    selectedProjectFilters.natures,
    "natures",
    () => {
      renderProjectsTools();
      renderProjectsTable();
    }
  );
  renderDashboardFilterChips(
    document.getElementById("projectDurationChips"),
    uniq([...state.settings.durations, ...state.projects.map((p) => getProjectField(p, "duration"))]).filter(Boolean),
    selectedProjectFilters.durations,
    "durations",
    () => {
      renderProjectsTools();
      renderProjectsTable();
    }
  );
  renderProjectPickerFilter(document.getElementById("projectProjectFilter"), selectedProjectFilters.projects, "projects", () => {
    renderProjectsTools();
    renderProjectsTable();
  });
}

function renderProjectsTable() {
  const editable = canEditContent();
  const query = document.getElementById("projectSearch").value.trim().toLowerCase();

  const projects = sortedProjects(state.projects, "desc").filter((p) => {
    const hit = !query || String(p.title || "").toLowerCase().includes(query) || String(p.code || "").toLowerCase().includes(query);
    if (!hit) return false;
    if (selectedProjectYears.size && !selectedProjectYears.has(String(getProjectYear(p)))) return false;
    if (!matchesMultiFilter(getProjectField(p, "category"), selectedProjectFilters.categories)) return false;
    if (!matchesMultiFilter(getProjectField(p, "format"), selectedProjectFilters.formats)) return false;
    if (!matchesMultiFilter(getProjectField(p, "nature"), selectedProjectFilters.natures)) return false;
    if (!matchesMultiFilter(getProjectField(p, "duration"), selectedProjectFilters.durations)) return false;
    if (!matchesProjectFilter(p.id, selectedProjectFilters.projects)) return false;
    return true;
  });

  const body = document.getElementById("projectsTableBody");
  if (!projects.length) {
    body.innerHTML = '<tr><td colspan="10" class="empty">Nenhum projeto encontrado.</td></tr>';
    return;
  }

  const categories = uniq(state.settings.categories).filter(Boolean);
  const formats = uniq(state.settings.formats).filter(Boolean);
  const natures = uniq(state.settings.natures).filter(Boolean);
  const durations = uniq(state.settings.durations).filter(Boolean);
  const statuses = uniq(state.settings.statuses).filter(Boolean);

  body.innerHTML = projects
    .map((p) => {
      const badgeClass = STATUS_COLORS[p.status] || "gray";
      const yearLabel = getProjectYearLabel(p);
      const budgetValue = hasNumericValue(p.budget) ? Number(p.budget) : hasNumericValue(p.spent) ? Number(p.spent) : null;
      const releaseDateIso = normalizeDateInput(p.releaseDate || "");
      const releaseDateLabel = releaseDateIso ? formatDatePtBr(releaseDateIso) : "";
      const skuLabel = p.code ? `#${p.code}` : "";
      return `<tr>
        <td>${editable ? `<button class="btn light cell-link-edit" data-action="edit" data-id="${p.id}">${escapeHtml(skuLabel)}</button>` : `<span>${escapeHtml(skuLabel)}</span>`}</td>
        <td>
          ${
            editable
              ? `<button class="btn light cell-link-edit project-title-link" data-action="edit" data-id="${p.id}">`
              : '<span class="project-title-link">'
          }
            <span class="project-title-main">${escapeHtml(p.title || "")}</span>
            ${yearLabel ? `<span class="project-title-meta-year">${escapeHtml(yearLabel)}</span>` : ""}
          ${editable ? "</button>" : "</span>"}
        </td>
        <td>${editable ? inlineSelect("category", p.id, getProjectField(p, "category"), categories) : escapeHtml(getProjectField(p, "category") || "—")}</td>
        <td>${editable ? inlineSelect("format", p.id, getProjectField(p, "format"), formats) : escapeHtml(getProjectField(p, "format") || "—")}</td>
        <td>${editable ? inlineSelect("nature", p.id, getProjectField(p, "nature"), natures) : escapeHtml(getProjectField(p, "nature") || "—")}</td>
        <td>${editable ? inlineSelect("duration", p.id, getProjectField(p, "duration"), durations) : escapeHtml(getProjectField(p, "duration") || "—")}</td>
        <td>${
          editable
            ? `<input class="cell-inline-input" data-action="inline-budget" data-id="${p.id}" type="text" inputmode="decimal" value="${escapeHtml(
                formatCurrencyInputBRL(budgetValue)
              )}" placeholder="R$ 0,00" />`
            : escapeHtml(formatCurrencyInputBRL(budgetValue) || "—")
        }</td>
        <td>
          ${
            editable
              ? `<div class="release-inline-wrap">
            <input class="cell-inline-input release-inline-text${releaseDateIso ? " is-filled" : ""}" data-action="inline-release-date-text" data-id="${p.id}" type="text" inputmode="numeric" placeholder="dd/mm/aaaa" value="${escapeHtml(
                releaseDateLabel
              )}" />
            <button type="button" class="btn light release-inline-btn" data-action="inline-release-date-open" title="Selecionar data" aria-label="Selecionar data">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 2h2v2h6V2h2v2h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3V2zm13 8H4v8h16v-8zM4 8h16V6H4v2z"/></svg>
            </button>
            <input class="release-inline-picker" data-action="inline-release-date-picker" data-id="${p.id}" type="date" lang="pt-BR" value="${escapeHtml(
              releaseDateIso
            )}" />
          </div>`
              : `<span class="${releaseDateIso ? "release-inline-text is-filled" : "release-inline-text"}">${escapeHtml(releaseDateLabel || "dd/mm/aaaa")}</span>`
          }
        </td>
        <td>${editable ? inlineSelect("status", p.id, getProjectField(p, "status"), statuses, badgeClass) : escapeHtml(getProjectField(p, "status") || "—")}</td>
        <td>
          ${
            editable
              ? `<button class="btn light icon-btn" data-action="edit" data-id="${p.id}" title="Editar projeto" aria-label="Editar projeto">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25zm2.92 2.33H5v-.92l9.06-9.06.92.92L5.92 19.58zM20.71 7.04a1 1 0 0 0 0-1.41L18.37 3.3a1 1 0 0 0-1.41 0l-1.54 1.54 3.75 3.75 1.54-1.55z"/></svg>
          </button>
          <button class="btn danger icon-btn" data-action="del" data-id="${p.id}" title="Excluir projeto" aria-label="Excluir projeto">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 2h5v2H3V5h5l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM7 9h2v9H7V9zm-1 12h12a2 2 0 0 0 2-2V8H4v11a2 2 0 0 0 2 2z"/></svg>
          </button>`
              : '<span style="color:#94a3b8">—</span>'
          }
        </td>
      </tr>`;
    })
    .join("");

  if (!editable) return;

  body.querySelectorAll("button[data-action='edit']").forEach((btn) => {
    btn.addEventListener("click", () => openProjectDialog(btn.dataset.id));
  });

  if (!body.dataset.inlineSelectDelegated) {
    body.dataset.inlineSelectDelegated = "1";
    const handleInlineSelectEvent = (event) => {
      const select = event.target?.closest?.("select[data-action='inline-select']");
      if (!select || !body.contains(select)) return;
      // Safari pode atualizar o valor do <select> no fim do ciclo do evento.
      setTimeout(() => commitProjectInlineSelect(select), 0);
    };
    ["change", "input", "blur"].forEach((eventName) => {
      body.addEventListener(eventName, handleInlineSelectEvent, true);
    });
  }

  body.querySelectorAll("input[data-action='inline-budget']").forEach((el) => {
    el.addEventListener("change", () => {
      const project = state.projects.find((p) => p.id === el.dataset.id);
      if (!project) return;
      const raw = String(el.value || "").trim();
      const parsed = parseCurrencyInputBRL(raw);
      if (raw && parsed === null) {
        alert("Valor de gasto inválido.");
        renderProjectsTable();
        return;
      }
      // Mantem compatibilidade com dados legados que usam "spent" como campo de gasto.
      // Ao editar/limpar gasto na tabela, os dois campos precisam refletir o mesmo valor.
      project.budget = parsed;
      project.spent = parsed;
      saveState();
      renderProjectsTable();
      renderDashboard();
    });
  });

  const commitReleaseDate = (projectId, rawValue) => {
      const project = state.projects.find((p) => p.id === projectId);
      if (!project) return;
      const raw = String(rawValue || "").trim();
      const normalized = normalizeDateInput(raw);
      if (raw && !normalized) {
        alert("Lançamento inválido. Use o calendário ou o formato dd/mm/aaaa.");
        renderProjectsTable();
        return;
      }
      const previousReleaseDate = normalizeDateInput(project.releaseDate || "") || "";
      const nextReleaseDate = normalized || "";
      if (previousReleaseDate === nextReleaseDate) return;
      project.releaseDate = nextReleaseDate;
      if (normalized) project.year = Number(normalized.slice(0, 4));
      saveState();
      renderProjectsTable();
      renderGantt();
      renderDashboard();
      renderProjectsTools();
  };

  body.querySelectorAll("input[data-action='inline-release-date-text']").forEach((el) => {
    el.addEventListener("input", () => {
      el.value = maskDateTextPtBr(el.value);
      el.classList.toggle("is-filled", Boolean(String(el.value || "").trim()));
    });
    el.addEventListener("change", () => {
      commitReleaseDate(el.dataset.id, el.value);
    });
    el.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      commitReleaseDate(el.dataset.id, el.value);
      el.blur();
    });
    el.addEventListener("blur", () => {
      commitReleaseDate(el.dataset.id, el.value);
    });
  });

  body.querySelectorAll("input[data-action='inline-release-date-picker']").forEach((picker) => {
    picker.addEventListener("change", () => {
      commitReleaseDate(picker.dataset.id, picker.value);
    });
  });

  body.querySelectorAll("button[data-action='inline-release-date-open']").forEach((btn) => {
    btn.addEventListener("click", () => {
      const wrap = btn.closest(".release-inline-wrap");
      const picker = wrap?.querySelector("input[data-action='inline-release-date-picker']");
      if (!picker) return;
      if (typeof picker.showPicker === "function") picker.showPicker();
      else picker.click();
    });
  });

  body.querySelectorAll("button[data-action='del']").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!confirm("Excluir projeto?")) return;
      state.projects = state.projects.filter((p) => p.id !== btn.dataset.id);
      saveState();
      renderAll();
    });
  });
}

function renderUsers() {
  const body = document.getElementById("usersTableBody");
  if (!body) return;
  const allowManage = canManageUsers();

  const users = [...(state.users || [])].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "pt-BR"));
  if (!users.length) {
    body.innerHTML = '<tr><td colspan="6" class="empty">Nenhum usuário cadastrado.</td></tr>';
    return;
  }

  body.innerHTML = users
    .map((user) => {
      const invitedAt = user.invitedAt ? formatDatePtBr(user.invitedAt) : "";
      const inviteText = invitedAt ? `Convidado em ${invitedAt}` : "Sem convite";
      const passwordState = user.firstAccessPending ? "Primeiro acesso" : user.passwordHash ? "Definida" : "Pendente";
      return `<tr>
        <td>${escapeHtml(user.name || "")}</td>
        <td>${escapeHtml(user.email || "")}</td>
        <td><span class="badge blue">${escapeHtml(user.role || "LEITOR")}</span></td>
        <td>${escapeHtml(passwordState)}</td>
        <td>${escapeHtml(inviteText)}</td>
        <td>
          ${
            allowManage
              ? `<button class="btn light icon-btn" data-user-action="edit" data-id="${user.id}" title="Editar usuário" aria-label="Editar usuário">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25zm2.92 2.33H5v-.92l9.06-9.06.92.92L5.92 19.58zM20.71 7.04a1 1 0 0 0 0-1.41L18.37 3.3a1 1 0 0 0-1.41 0l-1.54 1.54 3.75 3.75 1.54-1.55z"/></svg>
          </button>
          <button class="btn danger icon-btn" data-user-action="del" data-id="${user.id}" title="Excluir usuário" aria-label="Excluir usuário">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 2h5v2H3V5h5l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM7 9h2v9H7V9zm-1 12h12a2 2 0 0 0 2-2V8H4v11a2 2 0 0 0 2 2z"/></svg>
          </button>`
              : '<span style="color:#94a3b8">—</span>'
          }
        </td>
      </tr>`;
    })
    .join("");

  body.querySelectorAll("button[data-user-action='edit']").forEach((btn) => {
    btn.addEventListener("click", () => openUserDialog(btn.dataset.id));
  });

  body.querySelectorAll("button[data-user-action='del']").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!canManageUsers()) {
        alert("Apenas ADMIN pode gerir usuários.");
        return;
      }
      if (!confirm("Excluir usuário?")) return;
      state.users = state.users.filter((user) => user.id !== btn.dataset.id);
      saveState();
      renderAll();
    });
  });
}

function commitProjectInlineSelect(el) {
  if (!el) return;
  const project = state.projects.find((p) => p.id === el.dataset.id);
  if (!project) return;
  const field = String(el.dataset.field || "").trim();
  const nextValue = String(el.value || "");
  const fieldMap = {
    category: "category",
    format: "format",
    nature: "nature",
    duration: "duration",
    status: "status"
  };
  const projectField = fieldMap[field];
  if (!projectField) return;
  if (String(project[projectField] || "") === nextValue) return;
  project[projectField] = nextValue;
  saveState();
  renderProjectsTable();
  renderDashboard();
  renderGantt();
}

function openUserDialog(userId = null) {
  const dialog = document.getElementById("userDialog");
  const current = getCurrentUser();
  const isAdmin = canManageUsers();
  if (!isAdmin) {
    if (!current) return;
    if (!userId || userId !== current.id) {
      alert("Apenas ADMIN pode gerir usuários.");
      return;
    }
  }
  const user = state.users.find((item) => item.id === userId);
  document.getElementById("userDialogTitle").textContent = user ? (isAdmin ? "Editar Usuário" : "Editar Perfil") : "Cadastrar Usuário";
  document.getElementById("userId").value = user?.id || uid();
  document.getElementById("userName").value = user?.name || "";
  document.getElementById("userEmail").value = user?.email || "";
  const roleSelect = document.getElementById("userRole");
  roleSelect.value = user?.role || "LEITOR";
  roleSelect.disabled = !isAdmin;
  const roleLabel = roleSelect.closest("label");
  if (roleLabel) roleLabel.hidden = !isAdmin;
  document.getElementById("userPassword").value = "";
  document.getElementById("userPasswordConfirm").value = "";
  document.getElementById("userPasswordHint").hidden = !user;
  dialog.showModal();
}

function collectUserForm() {
  const id = document.getElementById("userId").value;
  const existing = state.users.find((user) => user.id === id);
  const current = getCurrentUser();
  const isAdmin = canManageUsers();
  if (!isAdmin) {
    if (!current || id !== current.id) {
      alert("Apenas ADMIN pode gerir usuários.");
      return null;
    }
  }
  const name = document.getElementById("userName").value.trim();
  const email = document.getElementById("userEmail").value.trim().toLowerCase();
  const role = document.getElementById("userRole").value;
  const password = document.getElementById("userPassword").value;
  const passwordConfirm = document.getElementById("userPasswordConfirm").value;
  if (!name || !email) {
    alert("Preencha nome e e-mail.");
    return null;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    alert("E-mail inválido.");
    return null;
  }
  if (state.users.some((user) => user.id !== id && String(user.email || "").toLowerCase() === email)) {
    alert("Já existe um usuário com esse e-mail.");
    return null;
  }
  if ((!existing || !existing.passwordHash) && !password) {
    alert("Defina uma senha para o usuário.");
    return null;
  }
  if ((password || passwordConfirm) && password !== passwordConfirm) {
    alert("A confirmação da senha não confere.");
    return null;
  }
  if (password && password.length < 6) {
    alert("A senha deve ter no mínimo 6 caracteres.");
    return null;
  }
  return {
    id,
    name,
    email,
    role: isAdmin ? (["ADMIN", "EDITOR", "LEITOR"].includes(role) ? role : "LEITOR") : String(existing?.role || current?.role || "LEITOR"),
    passwordHash: password ? hashPassword(password) : String(existing?.passwordHash || ""),
    invitedAt: existing?.invitedAt || new Date().toISOString().slice(0, 10),
    firstAccessPending: password ? false : Boolean(existing?.firstAccessPending)
  };
}

function openInviteDialog() {
  if (!canManageUsers()) {
    alert("Apenas ADMIN pode gerir usuários.");
    return;
  }
  document.getElementById("inviteEmail").value = "";
  document.getElementById("inviteRole").value = "LEITOR";
  document.getElementById("inviteDialog").showModal();
}

function collectInviteForm() {
  const email = document.getElementById("inviteEmail").value.trim().toLowerCase();
  const role = document.getElementById("inviteRole").value;
  if (!email) {
    alert("Preencha o e-mail.");
    return null;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    alert("E-mail inválido.");
    return null;
  }
  return {
    email,
    role: ["ADMIN", "EDITOR", "LEITOR"].includes(role) ? role : "LEITOR"
  };
}

function displayNameFromEmail(email) {
  const value = String(email || "").trim();
  if (!value.includes("@")) return "Usuário convidado";
  const [local] = value.split("@");
  const normalized = local.replace(/[._-]+/g, " ").trim();
  if (!normalized) return "Usuário convidado";
  return normalized
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildUserInviteLink(email, role) {
  const subject = encodeURIComponent("Convite de acesso - Originais Lumine");
  const platformLink = getPlatformLink();
  const body = encodeURIComponent(
    `Você foi convidado para o sistema Originais Lumine.\n\nFunção: ${role}\nE-mail: ${email}\nSenha inicial: ${DEFAULT_INVITED_PASSWORD}\n\nNo primeiro acesso, clique em "Primeiro acesso" para criar sua senha.\n\nAcesse a plataforma: ${platformLink}`
  );
  return `mailto:${encodeURIComponent(email)}?subject=${subject}&body=${body}`;
}

function openProjectDialog(projectId = null) {
  if (!canEditContent()) {
    alert("Perfil LEITOR possui apenas visualização.");
    return;
  }
  const project = state.projects.find((p) => p.id === projectId);
  const dialog = document.getElementById("projectDialog");

  fillSelect("projectCategory", state.settings.categories, project?.category);
  fillSelect("projectFormat", state.settings.formats, project?.format);
  fillSelect("projectNature", state.settings.natures, project?.nature);
  fillSelect("projectDuration", state.settings.durations, project?.duration);
  fillSelect("projectStatus", ["", ...state.settings.statuses], project?.status || "");

  document.getElementById("dialogTitle").textContent = project ? "Editar Projeto" : "Novo Projeto";
  document.getElementById("btnDeleteProject").style.visibility = project ? "visible" : "hidden";

  document.getElementById("projectId").value = project?.id || uid();
  document.getElementById("projectCode").value = project?.code || nextCode();
  document.getElementById("projectTitle").value = project?.title || "";
  document.getElementById("projectYear").value = project?.year || "";
  document.getElementById("projectBudget").value = formatCurrencyInputBRL(
    hasNumericValue(project?.budget) ? Number(project.budget) : hasNumericValue(project?.spent) ? Number(project.spent) : null
  );
  const releaseDate = normalizeDateInput(project?.releaseDate || "");
  document.getElementById("projectReleaseDateText").value = releaseDate ? formatDatePtBr(releaseDate) : "";
  document.getElementById("projectReleaseDatePicker").value = releaseDate;
  document.getElementById("projectNotes").value = project?.notes || "";
  syncProjectYearFromReleaseDate();

  const stageWrap = document.getElementById("projectStages");
  stageWrap.innerHTML = "";
  const stages = project?.stages?.length ? project.stages : [];
  stages.forEach((stage) => stageWrap.appendChild(buildStageRow(stage)));
  dialog.showModal();
}

function collectProjectForm() {
  if (!canEditContent()) return null;
  const projectId = document.getElementById("projectId").value;
  const existingProject = state.projects.find((project) => project.id === projectId);
  const rawBudget = document.getElementById("projectBudget").value.trim();
  const rawYear = document.getElementById("projectYear").value.trim();
  const rawReleaseDate = (document.getElementById("projectReleaseDateText").value || document.getElementById("projectReleaseDatePicker").value || "").trim();
  const normalizedReleaseDate = normalizeDateInput(rawReleaseDate);
  const parsedBudget = parseCurrencyInputBRL(rawBudget);
  const parsedYear = rawYear === "" ? null : Number(rawYear);

  if (rawReleaseDate && !normalizedReleaseDate) {
    alert("Lançamento inválido. Use o calendário ou o formato dd/mm/aaaa.");
    return null;
  }
  if (rawBudget && parsedBudget === null) {
    alert("Gasto inválido. Use um valor numérico.");
    return null;
  }
  if (rawYear && (!Number.isInteger(parsedYear) || parsedYear < 1900 || parsedYear > 2100)) {
    alert("Ano inválido.");
    return null;
  }
  const existingStagesById = new Map((existingProject?.stages || []).map((stage) => [stage.id, stage]));
  const stages = [...document.querySelectorAll("#projectStages .stage-row")]
    .map((row) => {
      const stageId = row.querySelector('[data-field="stageId"]').value;
      const start = row.querySelector('[data-field="start"]').value;
      const end = row.querySelector('[data-field="end"]').value;
      if (!stageId || !start || !end || monthToIndex(start) > monthToIndex(end)) return null;
      const previous = existingStagesById.get(row.dataset.id) || {};
      return {
        ...previous,
        id: row.dataset.id || previous.id || uid(),
        stageId,
        start,
        end
      };
    })
    .filter(Boolean);

  return {
    id: projectId,
    code: document.getElementById("projectCode").value.trim(),
    title: document.getElementById("projectTitle").value.trim(),
    year: normalizedReleaseDate ? Number(normalizedReleaseDate.slice(0, 4)) : parsedYear,
    category: document.getElementById("projectCategory").value,
    productionType: existingProject?.productionType || "",
    format: document.getElementById("projectFormat").value,
    nature: document.getElementById("projectNature").value,
    duration: document.getElementById("projectDuration").value,
    status: document.getElementById("projectStatus").value,
    budget: parsedBudget,
    releaseDate: normalizedReleaseDate,
    // Sincroniza com o campo legado para evitar reexibição do valor após limpar.
    spent: parsedBudget,
    notes: document.getElementById("projectNotes").value.trim(),
    stages
  };
}

function buildStageRow(stage = null) {
  const tpl = document.getElementById("stageRowTpl");
  const row = tpl.content.firstElementChild.cloneNode(true);
  row.dataset.id = stage?.id || uid();

  const select = row.querySelector('[data-field="stageId"]');
  select.innerHTML = state.settings.stages
    .map((st) => `<option value="${st.id}" ${st.id === (stage?.stageId || state.settings.stages[0]?.id) ? "selected" : ""}>${escapeHtml(st.name)}</option>`)
    .join("");

  const startMonthSelect = row.querySelector('[data-field="startMonth"]');
  const startYearSelect = row.querySelector('[data-field="startYear"]');
  const durationInput = row.querySelector('[data-field="duration"]');
  const monthTemplate = document.getElementById("stageMonthOptionsTpl");

  if (startMonthSelect && monthTemplate) startMonthSelect.innerHTML = monthTemplate.innerHTML;
  populateStageYearSelect(startYearSelect, stage?.start || state.timeline.start);
  const defaultStart = stage?.start || state.timeline.start;
  setStageRowRange(row, defaultStart, stage?.end || defaultStart);

  [startMonthSelect, startYearSelect, durationInput].forEach((input) => {
    if (!input) return;
    input.addEventListener("input", () => updateStageRowMonthLabels(row));
    input.addEventListener("change", () => updateStageRowMonthLabels(row));
  });
  updateStageRowMonthLabels(row);

  row.querySelector("[data-remove]").addEventListener("click", () => row.remove());
  return row;
}

function renderConfigTabs() {
  if (!CONFIG_META[selectedConfigKey]) selectedConfigKey = Object.keys(CONFIG_META)[0];
  const tabs = Object.entries(CONFIG_META);
  const el = document.getElementById("configTabs");
  el.innerHTML = tabs
    .map(([key, label]) => `<button class="chip config-tab-chip ${selectedConfigKey === key ? "active" : ""}" data-key="${key}">${label}</button>`)
    .join("");

  el.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      selectedConfigKey = chip.dataset.key;
      renderConfigTabs();
      renderConfigList();
    });
  });
}

function renderConfigList() {
  const editable = canEditContent();
  document.getElementById("configTitle").textContent = CONFIG_META[selectedConfigKey];
  const list = document.getElementById("configList");

  if (selectedConfigKey === "stages") {
    list.innerHTML = state.settings.stages
      .map(
        (item, index) => `<li class="config-item" data-config-index="${index}" data-config-id="${item.id}">
      <span class="config-item-main">
        ${editable ? '<button type="button" class="btn light config-drag-btn" draggable="true" title="Arrastar para ordenar" aria-label="Arrastar para ordenar">⋮⋮</button>' : ""}
        <span class="config-item-label">${escapeHtml(item.name)}</span>
      </span>
      <span class="actions">
        ${
          editable
            ? `<input class="config-color-input" type="color" value="${item.color}" data-action="color" data-id="${item.id}" />
        <button class="btn light" data-action="edit" data-id="${item.id}">Editar</button>
        <button class="btn danger" data-action="del" data-id="${item.id}">Excluir</button>`
            : ""
        }
      </span>
    </li>`
      )
      .join("");
  } else {
    const hasColor = COLOR_CONFIG_KEYS.has(selectedConfigKey);
    const arr = state.settings[selectedConfigKey] || [];
    list.innerHTML = arr
      .map(
        (item, i) => `<li class="config-item" data-config-index="${i}" data-config-id="${i}">
      <span class="config-item-main">
        ${editable ? '<button type="button" class="btn light config-drag-btn" draggable="true" title="Arrastar para ordenar" aria-label="Arrastar para ordenar">⋮⋮</button>' : ""}
        <span class="config-item-label">${escapeHtml(item)}</span>
      </span>
      <span class="actions">
        ${
          editable
            ? `${
                hasColor
                  ? `<input class="config-color-input" type="color" value="${getConfigItemColor(selectedConfigKey, item, i)}" data-action="item-color" data-id="${i}" />`
                  : ""
              }
        <button class="btn light" data-action="edit" data-id="${i}">Editar</button>
        <button class="btn danger" data-action="del" data-id="${i}">Excluir</button>`
            : ""
        }
      </span>
    </li>`
      )
      .join("");
  }

  if (!list.children.length) list.innerHTML = '<li class="empty">Sem itens.</li>';

  if (!editable) return;

  list.querySelectorAll("button[data-action='edit']").forEach((btn) => {
    btn.addEventListener("click", () => editConfigItem(btn.dataset.id));
  });

  list.querySelectorAll("button[data-action='del']").forEach((btn) => {
    btn.addEventListener("click", () => deleteConfigItem(btn.dataset.id));
  });

  list.querySelectorAll("input[data-action='color']").forEach((input) => {
    input.addEventListener("change", () => {
      const stage = state.settings.stages.find((st) => st.id === input.dataset.id);
      if (!stage) return;
      stage.color = input.value;
      saveState();
      renderGantt();
      renderConfigList();
    });
  });

  list.querySelectorAll("input[data-action='item-color']").forEach((input) => {
    input.addEventListener("change", () => {
      const idx = Number(input.dataset.id);
      const item = state.settings[selectedConfigKey]?.[idx];
      if (!item) return;
      setConfigItemColor(selectedConfigKey, item, input.value);
      saveState();
      renderAll();
    });
  });

  initConfigDragAndDrop(list);
}

function addConfigItem() {
  if (!canEditContent()) {
    alert("Perfil LEITOR possui apenas visualização.");
    return;
  }
  if (selectedConfigKey === "stages") {
    const name = prompt("Nome da etapa:");
    if (!name || !name.trim()) return;
    state.settings.stages.push({ id: uid(), name: name.trim(), color: randomColor() });
  } else {
    const label = CONFIG_SINGULAR_META[selectedConfigKey];
    const value = prompt(`Novo ${label}:`);
    if (!value || !value.trim()) return;
    const nextValue = value.trim();
    state.settings[selectedConfigKey].push(nextValue);
    if (COLOR_CONFIG_KEYS.has(selectedConfigKey)) {
      setConfigItemColor(selectedConfigKey, nextValue, getConfigItemColor(selectedConfigKey, nextValue, state.settings[selectedConfigKey].length - 1));
    }
  }
  saveState();
  renderAll();
}

function editConfigItem(id) {
  if (!canEditContent()) {
    alert("Perfil LEITOR possui apenas visualização.");
    return;
  }
  openConfigItemDialog(id);
}

function deleteConfigItem(id) {
  if (!canEditContent()) {
    alert("Perfil LEITOR possui apenas visualização.");
    return;
  }
  if (!confirm("Excluir item?")) return;
  if (selectedConfigKey === "stages") {
    state.settings.stages = state.settings.stages.filter((st) => st.id !== id);
    state.projects.forEach((p) => {
      p.stages = p.stages.filter((st) => st.stageId !== id);
    });
  } else {
    const arr = state.settings[selectedConfigKey];
    const removed = arr[Number(id)];
    arr.splice(Number(id), 1);
    if (COLOR_CONFIG_KEYS.has(selectedConfigKey)) {
      deleteConfigItemColor(selectedConfigKey, removed);
    }
  }
  saveState();
  renderAll();
}

function isColorEnabledConfigKey(key) {
  return key === "stages" || COLOR_CONFIG_KEYS.has(key);
}

function openConfigItemDialog(id) {
  if (!canEditContent()) {
    alert("Perfil LEITOR possui apenas visualização.");
    return;
  }
  const key = selectedConfigKey;
  const dialog = document.getElementById("configItemDialog");
  const title = document.getElementById("configItemDialogTitle");
  const nameInput = document.getElementById("configItemName");
  const colorInput = document.getElementById("configItemColor");
  const colorWrap = document.getElementById("configItemColorWrap");

  let currentName = "";
  let currentColor = randomColor();

  if (key === "stages") {
    const stage = state.settings.stages.find((item) => item.id === id);
    if (!stage) return;
    currentName = stage.name;
    currentColor = stage.color || randomColor();
  } else {
    const idx = Number(id);
    const item = state.settings[key]?.[idx];
    if (!item) return;
    currentName = item;
    currentColor = getConfigItemColor(key, item, idx);
  }

  title.textContent = `Editar ${CONFIG_META[key]}`;
  document.getElementById("configItemKey").value = key;
  document.getElementById("configItemId").value = id;
  nameInput.value = currentName;
  colorWrap.hidden = !isColorEnabledConfigKey(key);
  colorInput.value = currentColor;
  dialog.showModal();
}

function saveConfigItemDialog() {
  if (!canEditContent()) return;
  const key = document.getElementById("configItemKey").value;
  const id = document.getElementById("configItemId").value;
  const nameInput = document.getElementById("configItemName");
  const colorInput = document.getElementById("configItemColor");
  const nextName = String(nameInput.value || "").trim();
  if (!nextName) return;

  const nextColor = normalizeHexColor(colorInput.value) || randomColor();
  const hasColor = isColorEnabledConfigKey(key);

  if (key === "stages") {
    const stage = state.settings.stages.find((item) => item.id === id);
    if (!stage) return;
    stage.name = nextName;
    if (hasColor) stage.color = nextColor;
  } else {
    const arr = state.settings[key] || [];
    const idx = Number(id);
    const current = arr[idx];
    if (!current) return;
    arr[idx] = nextName;
    if (hasColor) {
      if (current !== nextName) renameConfigItemColor(key, current, nextName, idx);
      setConfigItemColor(key, nextName, nextColor);
    }
  }

  saveState();
  renderAll();
}

function initConfigDragAndDrop(list) {
  if (!canEditContent()) return;
  let draggedIndex = null;
  const rows = [...list.querySelectorAll(".config-item")];
  rows.forEach((row) => {
    const handle = row.querySelector(".config-drag-btn");
    if (!handle) return;

    handle.addEventListener("dragstart", (event) => {
      draggedIndex = Number(row.dataset.configIndex);
      row.classList.add("dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", String(draggedIndex));
    });

    handle.addEventListener("dragend", () => {
      draggedIndex = null;
      rows.forEach((item) => item.classList.remove("drag-over", "dragging"));
    });

    row.addEventListener("dragover", (event) => {
      if (draggedIndex === null) return;
      event.preventDefault();
      row.classList.add("drag-over");
      event.dataTransfer.dropEffect = "move";
    });

    row.addEventListener("dragleave", () => {
      row.classList.remove("drag-over");
    });

    row.addEventListener("drop", (event) => {
      if (draggedIndex === null) return;
      event.preventDefault();
      row.classList.remove("drag-over");
      const targetIndex = Number(row.dataset.configIndex);
      if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex === draggedIndex) return;

      if (selectedConfigKey === "stages") moveArrayItem(state.settings.stages, draggedIndex, targetIndex);
      else moveArrayItem(state.settings[selectedConfigKey], draggedIndex, targetIndex);

      saveState();
      renderAll();
    });
  });
}

function importCsvFile(event) {
  if (!canEditContent()) {
    alert("Perfil LEITOR possui apenas visualização.");
    event.target.value = "";
    return;
  }
  const files = [...(event.target.files || [])];
  if (!files.length) return;
  readFilesAsText(files).then((fileMap) => {
    const normalized = normalizeBase44FileMap(fileMap);
    const available = Object.keys(normalized);
    const hasBase44 = BASE44_FILES.some((name) => available.includes(name));

    if (hasBase44) {
      try {
        state = buildStateFromBase44Exports(normalized, state);
        saveState();
        renderAll();
        alert(`Base44 importado: ${state.projects.length} projetos carregados.`);
      } catch (err) {
        alert(`Falha ao importar Base44 CSV: ${err.message}`);
      }
    } else {
      importSimpleProjectCsv(fileMap[Object.keys(fileMap)[0]]);
    }
  });
  event.target.value = "";
}

function normalizeBase44FileMap(fileMap) {
  const mapped = {};
  const patterns = {
    "Category_export.csv": /category_export/i,
    "Duration_export.csv": /duration_export/i,
    "Format_export.csv": /format_export/i,
    "Nature_export.csv": /nature_export/i,
    "ProductionType_export.csv": /productiontype_export/i,
    "Project_export.csv": /project_export/i,
    "ProjectStatus_export.csv": /projectstatus_export/i,
    "Stage_export.csv": /stage_export/i,
    "StageType_export.csv": /stagetype_export/i
  };

  Object.entries(fileMap).forEach(([name, text]) => {
    const base = name.split("/").pop();
    const canonical = Object.entries(patterns).find(([, re]) => re.test(base))?.[0];
    if (canonical) mapped[canonical] = text;
  });

  return mapped;
}

function readFilesAsText(files) {
  return Promise.all(
    files.map(
      (file) =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve([file.name, String(reader.result || "")]);
          reader.onerror = () => reject(new Error(`Falha ao ler ${file.name}`));
          reader.readAsText(file, "utf-8");
        })
    )
  ).then((entries) => Object.fromEntries(entries));
}

function importSimpleProjectCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) {
    alert("CSV vazio.");
    return;
  }

  const imported = rows
    .filter((row) => row.titulo || row.title)
    .map((row) => {
      const rawYear = row.ano || row.year || "";
      return {
        id: uid(),
        code: row.codigo || row.code || nextCode(),
        title: row.titulo || row.title,
        year: rawYear ? Number(rawYear) : null,
        category: row.categoria || state.settings.categories[0],
        productionType: row.production_type || row.tipo || state.settings.productionTypes[0] || "",
        format: row.formato || state.settings.formats[0],
        nature: row.natureza || state.settings.natures[0],
        duration: row.duracao || state.settings.durations[0],
        status: row.status || "",
        budget: parseCurrencyInputBRL(row.gasto || row.budget || ""),
        releaseDate: releaseDateFromRawOrYear(row.data_de_lancamento || row.data_lancamento || row.release_date || row.release_date_at || "", rawYear),
        spent: parseCurrencyInputBRL(row.spent || ""),
        notes: row.notas || "",
        stages: []
      };
    });

  state.projects.push(...imported);
  saveState();
  renderAll();
  alert(`${imported.length} projeto(s) importado(s).`);
}

function buildStateFromBase44Exports(fileMap, fallbackState) {
  const data = {};
  Object.entries(fileMap).forEach(([name, text]) => {
    data[name] = parseCsv(text);
  });

  const categoryRows = data["Category_export.csv"] || [];
  const durationRows = data["Duration_export.csv"] || [];
  const formatRows = data["Format_export.csv"] || [];
  const natureRows = data["Nature_export.csv"] || [];
  const productionTypeRows = data["ProductionType_export.csv"] || [];
  const projectRows = data["Project_export.csv"] || [];
  const statusRows = data["ProjectStatus_export.csv"] || [];
  const stageRows = data["Stage_export.csv"] || [];
  const stageTypeRows = data["StageType_export.csv"] || [];

  if (!projectRows.length) throw new Error("Project_export.csv não encontrado ou vazio.");

  const orderSort = (arr) =>
    [...arr].sort((a, b) => Number(a.order || 999) - Number(b.order || 999) || String(a.name || "").localeCompare(String(b.name || "")));
  const pickName = (arr) => orderSort(arr).map((r) => String(r.name || "").trim()).filter(Boolean);

  const stageTypeByName = {};
  const stages = orderSort(stageTypeRows).map((row) => {
    const obj = {
      id: row.id || uid(),
      name: row.name || "Etapa",
      color: colorKeyToHex(row.color),
      singleDay: String(row.single_day || "").toLowerCase() === "true"
    };
    stageTypeByName[String(obj.name).toLowerCase()] = obj;
    return obj;
  });

  const stageRowsByProject = {};
  stageRows.forEach((row) => {
    const projectId = String(row.project_id || "").trim();
    if (!projectId) return;
    const name = String(row.name || "").trim();
    const type = stageTypeByName[name.toLowerCase()];
    const start = monthFromDate(row.start_date);
    const end = monthFromDate(row.end_date) || start;
    if (!start) return;

    const stage = {
      id: row.id || uid(),
      stageId: type?.id || uid(),
      start,
      end,
      name,
      color: type?.color || colorKeyToHex(row.color),
      notes: row.notes || "",
      completed: String(row.completed || "").toLowerCase() === "true"
    };

    if (!stageRowsByProject[projectId]) stageRowsByProject[projectId] = [];
    stageRowsByProject[projectId].push(stage);
  });

  const projects = projectRows.map((row, idx) => {
    const projectId = row.id || uid();
    const linkedStages = (stageRowsByProject[projectId] || []).sort((a, b) => a.start.localeCompare(b.start));
    const parsedYear = String(row.year || "").trim();
    const yearValue = parsedYear ? Number(parsedYear) : null;
    return {
      id: projectId,
      code: row.sku || `02-${String(idx + 1).padStart(2, "0")}`,
      title: row.name || "Sem título",
      year: Number.isNaN(yearValue) ? null : yearValue,
      category: row.category || "",
      productionType: row.production_type || "",
      format: row.format || "",
      nature: row.nature || "",
      duration: row.duration || "",
      status: row.status || "",
      budget: parseCurrencyInputBRL(row.budget || ""),
      releaseDate: releaseDateFromRawOrYear(row.release_date || row.data_de_lancamento || "", row.year || ""),
      spent: parseCurrencyInputBRL(row.spent || ""),
      notes: row.notes || "",
      description: row.description || "",
      stages: linkedStages
    };
  });

  const categories = uniq([...pickName(categoryRows), ...projects.map((p) => p.category)]);
  const settings = {
    categories,
    productionTypes: uniq([...pickName(productionTypeRows), ...projects.map((p) => p.productionType)]),
    formats: uniq([...pickName(formatRows), ...projects.map((p) => p.format)]),
    natures: uniq([...pickName(natureRows), ...projects.map((p) => p.nature)]),
    durations: uniq([...pickName(durationRows), ...projects.map((p) => p.duration)]),
    statuses: uniq([...pickName(statusRows), ...projects.map((p) => p.status)]),
    stages: stages.length ? stages : fallbackState.settings.stages
  };
  settings.itemColors = mergeItemColors(buildDefaultItemColors(settings), {
    categories: buildItemColorMap(categoryRows, settings.categories, DEFAULT_ITEM_COLOR_PALETTES.categories),
    durations: buildItemColorMap(durationRows, settings.durations, DEFAULT_ITEM_COLOR_PALETTES.durations),
    formats: buildItemColorMap(formatRows, settings.formats, DEFAULT_ITEM_COLOR_PALETTES.formats),
    natures: buildItemColorMap(natureRows, settings.natures, DEFAULT_ITEM_COLOR_PALETTES.natures),
    statuses: buildItemColorMap(statusRows, settings.statuses, DEFAULT_ITEM_COLOR_PALETTES.statuses)
  });

  const timeline = defaultTimelineWindow();

  return {
    settings,
    projects,
    timeline,
    users: fallbackState.users || seedState().users,
    auditLogs: Array.isArray(fallbackState.auditLogs) ? fallbackState.auditLogs.slice(-MAX_AUDIT_LOG_ITEMS) : []
  };
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  const pushCell = () => {
    row.push(cell);
    cell = "";
  };
  const pushRow = () => {
    if (row.length && row.some((c) => c !== "")) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === "\"") {
      if (inQuotes && next === "\"") {
        cell += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      pushCell();
      continue;
    }
    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && next === "\n") i += 1;
      pushCell();
      pushRow();
      continue;
    }
    cell += ch;
  }
  if (cell.length || row.length) {
    pushCell();
    pushRow();
  }

  if (!rows.length) return [];
  const headers = rows[0].map((h) => String(h || "").trim().toLowerCase());
  return rows.slice(1).map((cols) => {
    const item = {};
    headers.forEach((h, idx) => {
      item[h] = String(cols[idx] || "").trim();
    });
    return item;
  });
}

function colorKeyToHex(colorKey) {
  const key = String(colorKey || "").trim().toLowerCase();
  const map = {
    red: "#ef4444",
    yellow: "#f59e0b",
    green: "#10b981",
    gray: "#94a3b8",
    blue: "#3b82f6",
    pink: "#ec4899",
    orange: "#f97316",
    purple: "#8b5cf6"
  };
  return map[key] || randomColor();
}

function monthFromDate(date) {
  const value = String(date || "").trim();
  if (!value) return "";
  return value.slice(0, 7);
}

function setReleaseDateMonth(originalDate, targetMonth) {
  if (!isValidMonth(targetMonth)) return "";
  const normalized = normalizeDateInput(originalDate);
  const baseDay = normalized ? Number(normalized.slice(8, 10)) : 1;
  const [year, month] = targetMonth.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = String(Math.max(1, Math.min(baseDay, daysInMonth))).padStart(2, "0");
  return `${year}-${String(month).padStart(2, "0")}-${day}`;
}

function releaseDateFromRawOrYear(rawReleaseDate, rawYear) {
  const normalized = normalizeDateInput(rawReleaseDate);
  if (normalized) return normalized;
  const year = Number(rawYear);
  if (Number.isInteger(year) && year > 0) return `${year}-01-01`;
  return "";
}

function isValidDateIso(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const [year, month, day] = String(value).split("-").map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
}

function normalizeDateInput(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  if (isValidDateIso(raw)) return raw;

  const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    const day = String(Number(dmy[1])).padStart(2, "0");
    const month = String(Number(dmy[2])).padStart(2, "0");
    const iso = `${dmy[3]}-${month}-${day}`;
    return isValidDateIso(iso) ? iso : "";
  }

  const dmyDash = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmyDash) {
    const day = String(Number(dmyDash[1])).padStart(2, "0");
    const month = String(Number(dmyDash[2])).padStart(2, "0");
    const iso = `${dmyDash[3]}-${month}-${day}`;
    return isValidDateIso(iso) ? iso : "";
  }

  const ymdSlash = raw.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (ymdSlash) {
    const month = String(Number(ymdSlash[2])).padStart(2, "0");
    const day = String(Number(ymdSlash[3])).padStart(2, "0");
    const iso = `${ymdSlash[1]}-${month}-${day}`;
    return isValidDateIso(iso) ? iso : "";
  }

  const isoDatePrefix = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoDatePrefix && isValidDateIso(isoDatePrefix[1])) return isoDatePrefix[1];

  return "";
}

function maskDateTextPtBr(value) {
  const digits = String(value || "")
    .replace(/\D/g, "")
    .slice(0, 8);
  if (!digits) return "";
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function hashPassword(password) {
  const value = String(password || "");
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return `h_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function getPlatformLink() {
  if (window.location.protocol === "file:") return window.location.href;
  return `${window.location.origin}${window.location.pathname}`;
}

function applyPtBrLocaleToDateInputs(scope = document) {
  scope.querySelectorAll('input[type="date"], input[type="month"]').forEach((input) => {
    input.setAttribute("lang", "pt-BR");
    input.setAttribute("data-locale", "pt-BR");
  });
}

function syncProjectYearFromReleaseDate() {
  const releaseTextInput = document.getElementById("projectReleaseDateText");
  const releasePickerInput = document.getElementById("projectReleaseDatePicker");
  const yearInput = document.getElementById("projectYear");
  if (!releaseTextInput || !releasePickerInput || !yearInput) return;

  const normalized = normalizeDateInput(releaseTextInput.value || releasePickerInput.value || "");
  if (normalized) {
    releasePickerInput.value = normalized;
    yearInput.value = normalized.slice(0, 4);
    yearInput.disabled = true;
    return;
  }
  if (!String(releaseTextInput.value || "").trim()) releasePickerInput.value = "";
  yearInput.disabled = false;
}

function inferReleaseDate(source) {
  const hasExplicitReleaseField =
    Object.prototype.hasOwnProperty.call(source || {}, "releaseDate") ||
    Object.prototype.hasOwnProperty.call(source || {}, "release_date") ||
    Object.prototype.hasOwnProperty.call(source || {}, "dataDeLancamento") ||
    Object.prototype.hasOwnProperty.call(source || {}, "data_de_lancamento");

  const direct = normalizeDateInput(source?.releaseDate || source?.release_date || source?.dataDeLancamento || source?.data_de_lancamento || "");
  if (direct) return direct;
  if (hasExplicitReleaseField) return "";

  const rawYear = Number(source?.year || source?.ano);
  if (Number.isInteger(rawYear) && rawYear > 0) return `${rawYear}-01-01`;
  return "";
}

function formatDatePtBr(isoDate) {
  const normalized = normalizeDateInput(isoDate);
  if (!normalized) return "";
  const date = new Date(`${normalized}T00:00:00Z`);
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(date);
}

function getReleaseMarkerData(releaseDate, timelineStart, timelineEnd) {
  const normalized = normalizeDateInput(releaseDate);
  if (!normalized || !isValidMonth(timelineStart) || !isValidMonth(timelineEnd)) return null;
  const [year, month] = normalized.split("-").map(Number);
  const monthIso = `${year}-${String(month).padStart(2, "0")}`;
  const monthIndex = monthToIndex(monthIso);
  const startIndex = monthToIndex(timelineStart);
  const endIndex = monthToIndex(timelineEnd);
  if (monthIndex < startIndex || monthIndex > endIndex) return null;

  const offsetMonths = monthIndex - startIndex;

  return {
    offsetMonths,
    label: formatDatePtBr(normalized),
    short: formatDatePtBr(normalized)
  };
}

function uniq(values) {
  return [...new Set(values.filter((v) => String(v || "").trim()))];
}

function renderBarChart(container, map, mode = "vertical", palette = ["#f3ba00"]) {
  const entries = Object.entries(map);
  if (!entries.length) {
    container.innerHTML = '<div class="empty">Sem dados.</div>';
    return;
  }

  const max = Math.max(...entries.map(([, v]) => Number(v)), 1);

  if (mode === "horizontal") {
    container.innerHTML = entries
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .map(([label, value], idx) => {
        const color = palette[idx % palette.length];
        return `<div class="bar-row">
          <small>${escapeHtml(label)}</small>
          <strong class="bar-value-start">${value} MESES</strong>
          <div class="bar-row-track"><div class="bar-row-fill" style="width:${(Number(value) / max) * 100}%; background:${color}"></div></div>
        </div>`;
      })
      .join("");
    return;
  }

  container.innerHTML = entries
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    .map(([label, value], idx) => {
      const color = palette[idx % palette.length];
      const height = Math.max((Number(value) / max) * 110, 8);
      return `<div class="bar-col"><div class="bar" style="height:${height}px; background:${color}"></div><small>${escapeHtml(label)}</small><small>${value}</small></div>`;
    })
    .join("");
}

function renderDonutChart(container, map) {
  const entries = Object.entries(map);
  if (!entries.length) {
    container.innerHTML = '<div class="empty">Sem dados.</div>';
    return;
  }

  const colors = ["#10b981", "#3b82f6", "#f59e0b", "#8b5cf6", "#fb7185", "#06b6d4"];
  const total = entries.reduce((acc, [, v]) => acc + Number(v), 0);

  let angle = 0;
  const slices = entries
    .map(([, v], idx) => {
      const pct = (Number(v) / total) * 100;
      const from = angle;
      angle += pct;
      return `${colors[idx % colors.length]} ${from}% ${angle}%`;
    })
    .join(", ");

  const legend = entries
    .map(
      ([label, value], idx) => `<li><span class="legend-dot" style="background:${colors[idx % colors.length]}"></span>${escapeHtml(label)}: ${value}</li>`
    )
    .join("");

  container.innerHTML = `<div class="chart-donut-wrap"><div class="donut" style="background: conic-gradient(${slices})"></div><ul class="legend">${legend}</ul></div>`;
}

function summaryIconHtml(icon) {
  if (icon === "projects") {
    return `<span class="metric-icon metric-icon-yellow" aria-hidden="true">
      <svg viewBox="0 0 24 24"><path d="M3 4a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4zm2 1v3h3V5H5zm5 0v3h4V5h-4zm6 0v3h3V5h-3zM5 10v4h3v-4H5zm5 0v4h4v-4h-4zm6 0v4h3v-4h-3zM5 16v3h3v-3H5zm5 0v3h4v-3h-4zm6 0v3h3v-3h-3z"/></svg>
    </span>`;
  }
  if (icon === "spent") {
    return `<span class="metric-icon metric-icon-red" aria-hidden="true">
      <svg viewBox="0 0 24 24"><path d="M4 6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2h1a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-1v1a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6zm2 0v14h10V6H6zm12 4v7h1v-7h-1zm-3 3h4v2h-4v-2z"/></svg>
    </span>`;
  }
  return `<span class="metric-icon metric-icon-blue" aria-hidden="true">
    <svg viewBox="0 0 24 24"><path d="M4 4h2v15h14v2H4V4zm4 9h2v4H8v-4zm4-6h2v10h-2V7zm4 3h2v7h-2v-7z"/></svg>
  </span>`;
}

function cardHtml(title, value, icon = "projects") {
  return `<article class="card metric-card">
    <div class="metric-content">
      <span>${escapeHtml(title)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
    ${summaryIconHtml(icon)}
  </article>`;
}

function inlineSelect(field, projectId, currentValue, options, badgeClass = "") {
  const values = ["", ...options.filter((v) => String(v || "").trim())];
  const colorKey =
    field === "category"
      ? "categories"
      : field === "format"
        ? "formats"
        : field === "nature"
          ? "natures"
          : field === "duration"
            ? "durations"
            : field === "status"
              ? "statuses"
              : "";
  const hexColor = colorKey ? getConfigItemColor(colorKey, currentValue, 0, true) : "";
  const inlineStyle = hexColor ? ` style="background:${hexToRgba(hexColor, 0.16)};border-color:${hexToRgba(hexColor, 0.45)}"` : "";
  const cls = `cell-inline-select${field === "status" && !inlineStyle && badgeClass ? ` status-${badgeClass}` : ""}`;
  return `<select class="${cls}" data-action="inline-select" data-field="${field}" data-id="${projectId}"${inlineStyle}>
    ${values
      .map((value) => `<option value="${escapeHtml(value)}" ${String(currentValue || "") === String(value) ? "selected" : ""}>${escapeHtml(value || "—")}</option>`)
      .join("")}
  </select>`;
}

function sortedProjects(list = state.projects, order = "asc") {
  const sorted = [...list].sort((a, b) => compareSkuDesc(a.code, b.code));
  return order === "desc" ? sorted : sorted.reverse();
}

function countBy(projects, picker, ignoreEmpty = false) {
  return projects.reduce((acc, p) => {
    const raw = picker(p);
    const key = String(raw ?? "").trim();
    if (ignoreEmpty && !key) return acc;
    const finalKey = key || "-";
    acc[finalKey] = (acc[finalKey] || 0) + 1;
    return acc;
  }, {});
}

function countByYearWithMissing(projects) {
  const counts = {};
  projects.forEach((project) => {
    const year = getProjectYear(project);
    const key = year ? String(year) : "SEM ANO";
    counts[key] = (counts[key] || 0) + 1;
  });

  const ordered = {};
  Object.keys(counts)
    .sort((a, b) => {
      if (a === "SEM ANO" && b === "SEM ANO") return 0;
      if (a === "SEM ANO") return 1;
      if (b === "SEM ANO") return -1;
      return Number(a) - Number(b);
    })
    .forEach((key) => {
      ordered[key] = counts[key];
    });
  return ordered;
}

function avgMonthsByStage(projects) {
  const acc = Object.fromEntries(
    state.settings.stages
      .filter((stage) => String(stage?.name || "").trim())
      .map((stage) => [stage.id, { name: stage.name, total: 0, count: 0 }])
  );

  projects.forEach((p) => {
    p.stages.forEach((s) => {
      if (!acc[s.stageId] || !isValidMonth(s.start) || !isValidMonth(s.end)) return;
      const months = monthToIndex(s.end) - monthToIndex(s.start) + 1;
      if (!Number.isFinite(months) || months <= 0) return;
      acc[s.stageId].total += months;
      acc[s.stageId].count += 1;
    });
  });

  return Object.fromEntries(Object.values(acc).filter((v) => v.count > 0).map((v) => [v.name, (v.total / v.count).toFixed(1)]));
}

function fillSelect(id, list, selected) {
  const el = document.getElementById(id);
  if (!el) return;
  const safeList = list?.length ? list : [""];
  el.innerHTML = safeList
    .map((item) => `<option ${item === selected ? "selected" : ""}>${escapeHtml(item)}</option>`)
    .join("");
  if (!safeList.includes(selected)) el.value = safeList[0];
}

function monthsBetween(start, end) {
  const out = [];
  let i = monthToIndex(start);
  const max = monthToIndex(end);
  while (i <= max) {
    out.push(indexToMonth(i));
    i += 1;
  }
  return out;
}

function monthToIndex(value) {
  if (!isValidMonth(value)) return Number.NaN;
  const [year, month] = value.split("-").map(Number);
  return year * 12 + (month - 1);
}

function indexToMonth(index) {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

function addMonths(month, delta) {
  return indexToMonth(monthToIndex(month) + delta);
}

function monthLabel(isoMonth) {
  const labels = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const [y, m] = isoMonth.split("-");
  return `${labels[Number(m) - 1]} ${String(y).slice(2)}`;
}

function monthHoverLabel(isoMonth) {
  const labels = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const [y, m] = isoMonth.split("-");
  return `${labels[Number(m) - 1]}/${y}`;
}

function monthLabelLong(isoMonth) {
  const labels = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const [y, m] = isoMonth.split("-");
  return `${labels[Number(m) - 1]} ${y}`;
}

function monthLabelPtBrFull(isoMonth) {
  if (!isValidMonth(isoMonth)) return "";
  const labels = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const [y, m] = isoMonth.split("-");
  return `${labels[Number(m) - 1]}/${y}`;
}

function stageYearBounds() {
  const nowYear = new Date().getFullYear();
  return { min: 2017, max: nowYear + 10 };
}

function stageDurationFromRange(start, end) {
  if (!isValidMonth(start) || !isValidMonth(end)) return 1;
  const diff = monthToIndex(end) - monthToIndex(start) + 1;
  if (!Number.isFinite(diff) || diff < 1) return 1;
  return diff;
}

function sanitizeStageDuration(value) {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(parsed, 240);
}

function composeIsoMonth(yearValue, monthValue) {
  const year = String(yearValue || "").trim();
  const month = String(monthValue || "").trim().padStart(2, "0");
  if (!/^\d{4}$/.test(year) || !/^(0[1-9]|1[0-2])$/.test(month)) return "";
  return `${year}-${month}`;
}

function populateStageYearSelect(select, selectedMonthIso = "") {
  if (!select) return;
  const selectedYear = Number((selectedMonthIso || "").slice(0, 4));
  const bounds = stageYearBounds();
  const minYear = Number.isInteger(selectedYear) ? Math.min(bounds.min, selectedYear) : bounds.min;
  const maxYear = Number.isInteger(selectedYear) ? Math.max(bounds.max, selectedYear) : bounds.max;

  select.innerHTML = Array.from({ length: maxYear - minYear + 1 }, (_, index) => {
    const year = minYear + index;
    return `<option value="${year}">${year}</option>`;
  }).join("");
}

function setStageRowRange(row, start, end) {
  if (!row) return;
  const startMonthSelect = row.querySelector('[data-field="startMonth"]');
  const startYearSelect = row.querySelector('[data-field="startYear"]');
  const durationInput = row.querySelector('[data-field="duration"]');
  if (!startMonthSelect || !startYearSelect || !durationInput) return;

  const normalizedStart = isValidMonth(start) ? start : state.timeline.start;
  const normalizedEnd = isValidMonth(end) ? end : normalizedStart;

  startMonthSelect.value = normalizedStart.slice(5, 7);
  startYearSelect.value = normalizedStart.slice(0, 4);
  durationInput.value = String(stageDurationFromRange(normalizedStart, normalizedEnd));
  updateStageRowMonthLabels(row);
}

function setStageDialogRange(start, end) {
  const monthSelect = document.getElementById("stageStartMonth");
  const yearSelect = document.getElementById("stageStartYear");
  const durationInput = document.getElementById("stageDuration");
  if (!monthSelect || !yearSelect || !durationInput) return;

  const normalizedStart = isValidMonth(start) ? start : state.timeline.start;
  const normalizedEnd = isValidMonth(end) ? end : normalizedStart;

  populateStageYearSelect(yearSelect, normalizedStart);
  monthSelect.value = normalizedStart.slice(5, 7);
  yearSelect.value = normalizedStart.slice(0, 4);
  durationInput.value = String(stageDurationFromRange(normalizedStart, normalizedEnd));
  updateStageDialogMonthLabels();
}

function updateStageRowMonthLabels(row) {
  if (!row) return;
  const startMonthSelect = row.querySelector('[data-field="startMonth"]');
  const startYearSelect = row.querySelector('[data-field="startYear"]');
  const durationInput = row.querySelector('[data-field="duration"]');
  const startHidden = row.querySelector('[data-field="start"]');
  const endHidden = row.querySelector('[data-field="end"]');
  const endPreview = row.querySelector('[data-field="endPreview"]');
  const periodLabel = row.querySelector('[data-month-label="period"]');
  if (!startMonthSelect || !startYearSelect || !durationInput) return;

  const start = composeIsoMonth(startYearSelect.value, startMonthSelect.value);
  const duration = sanitizeStageDuration(durationInput.value);
  durationInput.value = String(duration);
  if (!isValidMonth(start)) {
    if (startHidden) startHidden.value = "";
    if (endHidden) endHidden.value = "";
    if (endPreview) endPreview.value = "";
    if (periodLabel) periodLabel.textContent = "Selecione mês/ano";
    return;
  }

  const end = addMonths(start, duration - 1);
  if (startHidden) startHidden.value = start;
  if (endHidden) endHidden.value = end;
  if (endPreview) endPreview.value = monthHoverLabel(end);
  if (periodLabel) periodLabel.textContent = `${monthLabelPtBrFull(start)} → ${monthLabelPtBrFull(end)} (${duration} ${duration === 1 ? "mês" : "meses"})`;
}

function updateStageDialogMonthLabels() {
  const monthSelect = document.getElementById("stageStartMonth");
  const yearSelect = document.getElementById("stageStartYear");
  const durationInput = document.getElementById("stageDuration");
  const startHidden = document.getElementById("stageStart");
  const endHidden = document.getElementById("stageEnd");
  const endPreview = document.getElementById("stageEndPreview");
  const periodLabel = document.getElementById("stagePeriodLabel");
  if (!monthSelect || !yearSelect || !durationInput) return;

  const start = composeIsoMonth(yearSelect.value, monthSelect.value);
  const duration = sanitizeStageDuration(durationInput.value);
  durationInput.value = String(duration);
  if (!isValidMonth(start)) {
    if (startHidden) startHidden.value = "";
    if (endHidden) endHidden.value = "";
    if (endPreview) endPreview.value = "";
    if (periodLabel) periodLabel.textContent = "Selecione mês/ano";
    return;
  }

  const end = addMonths(start, duration - 1);
  if (startHidden) startHidden.value = start;
  if (endHidden) endHidden.value = end;
  if (endPreview) endPreview.value = monthHoverLabel(end);
  if (periodLabel) periodLabel.textContent = `${monthLabelPtBrFull(start)} → ${monthLabelPtBrFull(end)} (${duration} ${duration === 1 ? "mês" : "meses"})`;
}

function timelineRangeLabel(start, end) {
  if (!isValidMonth(start) || !isValidMonth(end)) return "";
  return `${monthLabelLong(start)} — ${monthLabelLong(end)}`;
}

function isValidMonth(value) {
  return /^\d{4}-\d{2}$/.test(String(value || ""));
}

function money(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value || 0);
}

function formatCurrencyInputBRL(value) {
  if (!hasNumericValue(value)) return "";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    Number(value)
  );
}

function parseCurrencyInputBRL(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  let clean = raw.replace(/\s/g, "").replace(/R\$/gi, "").replace(/[^\d,.-]/g, "");
  if (!clean) return null;

  if (clean.includes(",") && clean.includes(".")) {
    clean = clean.replace(/\./g, "").replace(",", ".");
  } else if (clean.includes(",")) {
    clean = clean.replace(/\./g, "").replace(",", ".");
  } else {
    const dots = clean.split(".");
    if (dots.length > 2) {
      const decimalPart = dots.pop();
      clean = `${dots.join("")}.${decimalPart}`;
    }
  }

  const numeric = Number(clean);
  return Number.isFinite(numeric) ? numeric : null;
}

function hasNumericValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string" && value.trim() === "") return false;
  return !Number.isNaN(Number(value));
}

function compareSkuDesc(codeA, codeB) {
  const a = parseSku(codeA);
  const b = parseSku(codeB);
  if (a && b) {
    if (a.prefix !== b.prefix) return b.prefix - a.prefix;
    return b.number - a.number;
  }
  if (a) return -1;
  if (b) return 1;
  return String(codeB || "").localeCompare(String(codeA || ""));
}

function parseSku(code) {
  const match = String(code || "").trim().match(/^(\d+)-(\d+)$/);
  if (!match) return null;
  return { prefix: Number(match[1]), number: Number(match[2]) };
}

function getTimelineMonthsShown() {
  const raw = Number(state.timeline?.monthsShown);
  if (Number.isFinite(raw) && raw > 0) return raw;
  if (isValidMonth(state.timeline?.start) && isValidMonth(state.timeline?.end)) {
    const diff = monthToIndex(state.timeline.end) - monthToIndex(state.timeline.start) + 1;
    if (Number.isFinite(diff) && diff > 0) return diff;
  }
  return 24;
}

function normalizeTimelineWindow() {
  if (!isValidMonth(state.timeline?.start)) {
    const def = defaultTimelineWindow();
    state.timeline.start = def.start;
  }
  const months = getTimelineMonthsShown();
  state.timeline.monthsShown = months;
  state.timeline.end = addMonths(state.timeline.start, months - 1);
}

function getProjectSpentValue(project) {
  const spentCandidate = project?.spent;
  const budgetCandidate = project?.budget;

  if (hasNumericValue(budgetCandidate)) return Number(budgetCandidate);
  if (hasNumericValue(spentCandidate)) return Number(spentCandidate);
  return null;
}

function defaultTimelineWindow() {
  const now = new Date();
  const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return { start, end: addMonths(start, 23), monthsShown: 24 };
}

function moveArrayItem(arr, fromIndex, toIndex) {
  if (!Array.isArray(arr) || fromIndex === toIndex) return;
  const [item] = arr.splice(fromIndex, 1);
  arr.splice(toIndex, 0, item);
}

const DEFAULT_ITEM_COLOR_PALETTES = {
  categories: ["#f3ba00", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#06b6d4"],
  formats: ["#60a5fa", "#34d399", "#f472b6", "#f59e0b", "#a78bfa", "#22c55e"],
  natures: ["#10b981", "#0ea5e9", "#f97316", "#ef4444", "#8b5cf6", "#14b8a6"],
  durations: ["#f59e0b", "#14b8a6", "#6366f1", "#0ea5e9", "#16a34a", "#eab308"],
  statuses: ["#3b82f6", "#10b981", "#f59e0b", "#94a3b8", "#f97316", "#64748b"]
};

function normalizeHexColor(value) {
  const color = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return color.toLowerCase();
  return "";
}

function buildDefaultItemColors(settings = {}) {
  return {
    categories: arrayToColorMap(settings.categories, DEFAULT_ITEM_COLOR_PALETTES.categories),
    formats: arrayToColorMap(settings.formats, DEFAULT_ITEM_COLOR_PALETTES.formats),
    natures: arrayToColorMap(settings.natures, DEFAULT_ITEM_COLOR_PALETTES.natures),
    durations: arrayToColorMap(settings.durations, DEFAULT_ITEM_COLOR_PALETTES.durations),
    statuses: arrayToColorMap(settings.statuses, DEFAULT_ITEM_COLOR_PALETTES.statuses)
  };
}

function arrayToColorMap(items = [], palette = []) {
  const list = Array.isArray(items) ? items : [];
  const map = {};
  list.forEach((item, index) => {
    const name = String(item || "").trim();
    if (!name) return;
    map[name] = palette[index % palette.length] || randomColor();
  });
  return map;
}

function mergeItemColors(defaults = {}, incoming = {}) {
  const output = {};
  Object.keys(defaults).forEach((key) => {
    output[key] = { ...defaults[key] };
    const source = incoming?.[key] && typeof incoming[key] === "object" ? incoming[key] : {};
    Object.entries(source).forEach(([name, color]) => {
      const normalized = normalizeHexColor(color);
      if (normalized) output[key][name] = normalized;
    });
  });
  return output;
}

function getConfigItemColor(key, label, index = 0, strict = false) {
  if (!COLOR_CONFIG_KEYS.has(key)) return "";
  const cleanLabel = String(label || "").trim();
  const existing = normalizeHexColor(state.settings?.itemColors?.[key]?.[cleanLabel]);
  if (existing) return existing;
  if (strict) return "";
  const palette = DEFAULT_ITEM_COLOR_PALETTES[key] || [];
  return palette[index % palette.length] || randomColor();
}

function setConfigItemColor(key, label, color) {
  if (!COLOR_CONFIG_KEYS.has(key)) return;
  const cleanLabel = String(label || "").trim();
  const normalized = normalizeHexColor(color);
  if (!cleanLabel || !normalized) return;
  if (!state.settings.itemColors || typeof state.settings.itemColors !== "object") {
    state.settings.itemColors = buildDefaultItemColors(state.settings);
  }
  if (!state.settings.itemColors[key]) state.settings.itemColors[key] = {};
  state.settings.itemColors[key][cleanLabel] = normalized;
}

function deleteConfigItemColor(key, label) {
  const cleanLabel = String(label || "").trim();
  if (!cleanLabel || !COLOR_CONFIG_KEYS.has(key)) return;
  if (!state.settings?.itemColors?.[key]) return;
  delete state.settings.itemColors[key][cleanLabel];
}

function renameConfigItemColor(key, oldLabel, newLabel, index = 0) {
  if (!COLOR_CONFIG_KEYS.has(key)) return;
  const oldName = String(oldLabel || "").trim();
  const newName = String(newLabel || "").trim();
  if (!newName) return;
  const previous = getConfigItemColor(key, oldName, index);
  deleteConfigItemColor(key, oldName);
  setConfigItemColor(key, newName, previous);
}

function buildItemColorMap(rows = [], items = [], fallbackPalette = []) {
  const byName = {};
  rows.forEach((row) => {
    const name = String(row?.name || "").trim();
    if (!name) return;
    const rawColor = String(row?.color || "").trim();
    const normalized = normalizeHexColor(rawColor) || (rawColor ? normalizeHexColor(colorKeyToHex(rawColor)) : "");
    if (normalized) byName[name] = normalized;
  });

  const map = {};
  items.forEach((name, index) => {
    const key = String(name || "").trim();
    if (!key) return;
    map[key] = byName[key] || fallbackPalette[index % fallbackPalette.length] || randomColor();
  });
  return map;
}

function hexToRgba(hex, alpha = 1) {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return "";
  const r = Number.parseInt(normalized.slice(1, 3), 16);
  const g = Number.parseInt(normalized.slice(3, 5), 16);
  const b = Number.parseInt(normalized.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function resolveStorageEngines() {
  if (storageEngines) return storageEngines;
  const engines = [];
  const candidates = [];

  try {
    if (window?.localStorage) candidates.push(window.localStorage);
  } catch {}
  try {
    if (window?.sessionStorage) candidates.push(window.sessionStorage);
  } catch {}

  candidates.forEach((engine) => {
    try {
      const testKey = "__originais_storage_test__";
      engine.setItem(testKey, "1");
      engine.removeItem(testKey);
      engines.push(engine);
    } catch {}
  });

  storageEngines = engines;
  return storageEngines;
}

function encodeWindowStore(data) {
  try {
    return WINDOW_STORE_PREFIX + JSON.stringify(data);
  } catch {
    return "";
  }
}

function decodeWindowStore(raw) {
  try {
    if (!String(raw || "").startsWith(WINDOW_STORE_PREFIX)) return {};
    const payload = String(raw).slice(WINDOW_STORE_PREFIX.length);
    let parsed = null;

    try {
      parsed = JSON.parse(payload);
    } catch {
      // Compatibilidade com formato antigo em base64
      const json = decodeURIComponent(escape(atob(payload)));
      parsed = JSON.parse(json);
    }

    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function readWindowStore() {
  return decodeWindowStore(window?.name || "");
}

function writeWindowStore(data) {
  const encoded = encodeWindowStore(data);
  if (!encoded) return false;
  try {
    window.name = encoded;
    return true;
  } catch {
    return false;
  }
}

function writePersistedValue(key, value) {
  let wrote = false;
  resolveStorageEngines().forEach((engine) => {
    try {
      engine.setItem(key, value);
      wrote = true;
    } catch {}
  });

  const store = readWindowStore();
  store[key] = value;
  if (writeWindowStore(store)) wrote = true;

  memoryStore.set(key, value);
  return wrote;
}

function readPersistedValue(key) {
  return readPersistedCandidates(key)[0] ?? null;
}

function readPersistedCandidates(key) {
  const out = [];
  const seen = new Set();
  const push = (value) => {
    if (value === null || value === undefined) return;
    const raw = String(value);
    if (seen.has(raw)) return;
    seen.add(raw);
    out.push(raw);
  };

  push(readWindowStore()[key]);
  for (const engine of resolveStorageEngines()) {
    try {
      push(engine.getItem(key));
    } catch {}
  }
  if (memoryStore.has(key)) push(memoryStore.get(key));
  return out;
}

function openIndexedDb() {
  return new Promise((resolve, reject) => {
    if (!window?.indexedDB) {
      resolve(null);
      return;
    }
    const request = window.indexedDB.open(IDB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
  });
}

function idbGet(key) {
  return openIndexedDb()
    .then((db) => {
      if (!db) return null;
      return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, "readonly");
        const store = tx.objectStore(IDB_STORE);
        const req = store.get(key);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result ?? null);
      }).finally(() => db.close());
    })
    .catch(() => null);
}

function idbSet(key, value) {
  return openIndexedDb()
    .then((db) => {
      if (!db) return false;
      return new Promise((resolve) => {
        const tx = db.transaction(IDB_STORE, "readwrite");
        const store = tx.objectStore(IDB_STORE);
        store.put(value, key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      }).finally(() => db.close());
    })
    .catch(() => false);
}

async function persistStateToIndexedDb(stateRaw, projectsRaw) {
  const okState = await idbSet(IDB_STATE_KEY, stateRaw);
  const okProjects = await idbSet(IDB_PROJECTS_KEY, projectsRaw);
  return okState || okProjects;
}

async function hydrateStateFromIndexedDb(currentState) {
  const [rawState, rawProjects] = await Promise.all([idbGet(IDB_STATE_KEY), idbGet(IDB_PROJECTS_KEY)]);
  let candidate = currentState;

  if (rawState) {
    try {
      const parsed = JSON.parse(String(rawState));
      const merged = mergeState(parsed);
      if (Array.isArray(merged.projects) && merged.projects.length > candidate.projects.length) candidate = merged;
    } catch {}
  }

  if (rawProjects) {
    try {
      const parsedProjects = JSON.parse(String(rawProjects));
      if (Array.isArray(parsedProjects) && parsedProjects.length > candidate.projects.length) {
        candidate = {
          ...candidate,
          projects: parsedProjects
            .filter((project) => project && typeof project === "object")
            .map((project) => ({ ...project, releaseDate: inferReleaseDate(project) }))
        };
      }
    } catch {}
  }

  return candidate;
}

function nextCode() {
  const skus = state.projects.map((p) => String(p.code || "").trim()).filter(Boolean);
  const matched = skus.map((sku) => sku.match(/^(\d+)-(\d+)$/)).filter(Boolean);
  if (matched.length) {
    const prefix = matched[0][1];
    const next = Math.max(...matched.map((m) => Number(m[2]) || 0)) + 1;
    return `${prefix}-${String(next).padStart(2, "0")}`;
  }
  const n = skus.length + 1;
  return `02-${String(n).padStart(2, "0")}`;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function randomColor() {
  const colors = ["#34d399", "#60a5fa", "#fcd34d", "#f472b6", "#a78bfa", "#fb7185"];
  return colors[Math.floor(Math.random() * colors.length)];
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isLocalRuntime() {
  const protocol = String(window.location?.protocol || "").toLowerCase();
  const hostname = String(window.location?.hostname || "").toLowerCase();
  if (protocol === "file:") return true;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname.endsWith(".local");
}

function normalizeSupabaseRuntimeEnv(mode, environments) {
  const search = new URLSearchParams(window.location?.search || "");
  const forcedEnv = String(search.get("env") || "").trim().toLowerCase();
  if (forcedEnv && environments?.[forcedEnv]) return forcedEnv;

  const normalizedMode = String(mode || "").trim().toLowerCase();
  if (normalizedMode && normalizedMode !== "auto" && environments?.[normalizedMode]) return normalizedMode;

  return isLocalRuntime() ? "local" : "production";
}

function getSupabaseConfig() {
  const cfg = window.__ORIGINAIS_SUPABASE__ || {};
  const environments = cfg.environments && typeof cfg.environments === "object" ? cfg.environments : null;
  const envName = normalizeSupabaseRuntimeEnv(cfg.mode, environments);
  const envCfg = environments?.[envName] && typeof environments[envName] === "object" ? environments[envName] : {};

  const rawUrl = String(envCfg.url || envCfg.supabaseUrl || cfg.url || cfg.supabaseUrl || "").trim();
  const url = rawUrl.replace(/\/+$/, "").replace(/\/rest\/v1$/i, "");
  const anonKey = String(envCfg.anonKey || envCfg.key || cfg.anonKey || cfg.key || "").trim();
  const stateId = String(envCfg.stateId || cfg.stateId || SUPABASE_DEFAULT_STATE_ID).trim() || SUPABASE_DEFAULT_STATE_ID;
  const enabled = cfg.enabled !== false;
  return { url, anonKey, stateId, envName, enabled };
}

function getSupabaseClient() {
  if (supabaseClientInstance !== undefined) return supabaseClientInstance;
  const { url, anonKey, stateId, envName, enabled } = getSupabaseConfig();
  supabaseStateId = stateId;
  if (!enabled || !url || !anonKey) {
    supabaseClientInstance = null;
    return null;
  }
  if (!hasLoggedSupabaseTarget) {
    hasLoggedSupabaseTarget = true;
    console.info(`[Originais] Supabase ativo no ambiente '${envName}' (stateId: ${stateId}).`);
  }
  const factory = window.supabase?.createClient;
  if (typeof factory !== "function") {
    // Fallback sem SDK: usa REST API do Supabase.
    supabaseClientInstance = { mode: "rest", url: url.replace(/\/+$/, ""), anonKey };
    if (!hasShownSupabaseConfigWarning) {
      hasShownSupabaseConfigWarning = true;
      console.warn("[Originais] SDK Supabase não encontrado; usando fallback REST.");
    }
    return supabaseClientInstance;
  }
  try {
    supabaseClientInstance = factory(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    return supabaseClientInstance;
  } catch (error) {
    console.warn("[Originais] Falha ao iniciar cliente Supabase.", error);
    supabaseClientInstance = null;
    return null;
  }
}

async function supabaseRestFetchState(client) {
  const endpoint = `${client.url}/rest/v1/${SUPABASE_STATE_TABLE}?id=eq.${encodeURIComponent(supabaseStateId)}&select=state&limit=1`;
  const headers = {
    apikey: client.anonKey
  };
  if (String(client.anonKey || "").includes(".")) headers.Authorization = `Bearer ${client.anonKey}`;
  const response = await fetch(endpoint, {
    method: "GET",
    headers
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const rows = await response.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function supabaseRestUpsertState(client, stateRaw) {
  const payload = typeof stateRaw === "string" ? JSON.parse(stateRaw) : stateRaw;
  const endpoint = `${client.url}/rest/v1/${SUPABASE_STATE_TABLE}?on_conflict=id`;
  const headers = {
    "Content-Type": "application/json",
    apikey: client.anonKey,
    Prefer: "resolution=merge-duplicates,return=minimal"
  };
  if (String(client.anonKey || "").includes(".")) headers.Authorization = `Bearer ${client.anonKey}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify([
      {
        id: supabaseStateId,
        state: payload,
        updated_at: new Date().toISOString()
      }
    ])
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return true;
}

function mergeUsersByEmail(primaryUsers = [], secondaryUsers = []) {
  const byEmail = new Map();
  [...secondaryUsers, ...primaryUsers].forEach((user) => {
    if (!user || typeof user !== "object") return;
    const email = String(user.email || "").trim().toLowerCase();
    if (!email) return;
    if (!byEmail.has(email)) byEmail.set(email, { ...user, email });
  });
  return [...byEmail.values()];
}

function cloneForSync(value) {
  try {
    if (typeof structuredClone === "function") return structuredClone(value);
  } catch {}
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function valueEquals(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function mapById(list = []) {
  const map = new Map();
  if (!Array.isArray(list)) return map;
  list.forEach((item) => {
    if (!item || typeof item !== "object") return;
    const id = String(item.id || "").trim();
    if (!id) return;
    map.set(id, item);
  });
  return map;
}

function normalizeStageForMerge(stage) {
  if (!stage || typeof stage !== "object") return null;
  const id = String(stage.id || "").trim();
  if (!id) return null;
  return {
    id,
    stageId: String(stage.stageId || "").trim(),
    start: String(stage.start || "").trim(),
    end: String(stage.end || "").trim(),
    name: String(stage.name || "").trim(),
    notes: String(stage.notes || "").trim()
  };
}

function normalizeProjectForMerge(project) {
  if (!project || typeof project !== "object") return null;
  const id = String(project.id || "").trim();
  if (!id) return null;
  const budget = hasNumericValue(project.budget) ? Number(project.budget) : null;
  const spent = hasNumericValue(project.spent) ? Number(project.spent) : null;
  return {
    ...project,
    id,
    code: String(project.code || "").trim(),
    title: String(project.title || "").trim(),
    year: Number.isFinite(Number(project.year)) ? Number(project.year) : null,
    category: String(project.category || "").trim(),
    productionType: String(project.productionType || "").trim(),
    format: String(project.format || "").trim(),
    nature: String(project.nature || "").trim(),
    duration: String(project.duration || "").trim(),
    status: String(project.status || "").trim(),
    budget,
    spent,
    releaseDate: String(project.releaseDate || "").trim(),
    notes: String(project.notes || "").trim(),
    stages: (Array.isArray(project.stages) ? project.stages : [])
      .map(normalizeStageForMerge)
      .filter(Boolean)
  };
}

function resolveValueByBase(baseValue, localValue, remoteValue) {
  if (baseValue === undefined) {
    if (localValue === undefined) return cloneForSync(remoteValue);
    if (remoteValue === undefined) return cloneForSync(localValue);
    return valueEquals(localValue, remoteValue) ? cloneForSync(localValue) : cloneForSync(localValue);
  }
  if (valueEquals(localValue, baseValue)) {
    return remoteValue === undefined ? cloneForSync(localValue) : cloneForSync(remoteValue);
  }
  return cloneForSync(localValue);
}

function stageComparable(stage) {
  const normalized = normalizeStageForMerge(stage);
  if (!normalized) return null;
  return normalized;
}

function projectComparable(project) {
  const normalized = normalizeProjectForMerge(project);
  if (!normalized) return null;
  return {
    ...normalized,
    stages: [...normalized.stages].sort((a, b) => String(a.id).localeCompare(String(b.id)))
  };
}

function mergeStageRecordWithBase(baseStage, localStage, remoteStage) {
  const base = stageComparable(baseStage) || {};
  const local = stageComparable(localStage) || {};
  const remote = stageComparable(remoteStage) || {};
  const merged = { ...remote };
  const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
  keys.delete("id");
  keys.forEach((key) => {
    merged[key] = resolveValueByBase(base[key], local[key], remote[key]);
  });
  merged.id = String(local.id || remote.id || base.id || uid());
  return normalizeStageForMerge(merged);
}

function mergeStagesByBase(baseStages = [], localStages = [], remoteStages = []) {
  const baseMap = mapById(baseStages.map(stageComparable).filter(Boolean));
  const localMap = mapById(localStages.map(stageComparable).filter(Boolean));
  const remoteMap = mapById(remoteStages.map(stageComparable).filter(Boolean));
  const ids = new Set([...baseMap.keys(), ...localMap.keys(), ...remoteMap.keys()]);
  const merged = [];

  ids.forEach((id) => {
    const base = baseMap.get(id) || null;
    const local = localMap.get(id) || null;
    const remote = remoteMap.get(id) || null;

    if (base && !local) {
      if (!remote || valueEquals(stageComparable(remote), stageComparable(base))) return;
      merged.push(remote);
      return;
    }
    if (!base && local && !remote) {
      merged.push(local);
      return;
    }
    if (!local && remote) {
      merged.push(remote);
      return;
    }
    if (local && !remote) {
      if (base && valueEquals(stageComparable(local), stageComparable(base))) return;
      merged.push(local);
      return;
    }
    if (local && remote) {
      const record = mergeStageRecordWithBase(base, local, remote);
      if (record) merged.push(record);
    }
  });

  return merged.sort((a, b) => {
    const aStart = monthToIndex(a.start);
    const bStart = monthToIndex(b.start);
    if (Number.isFinite(aStart) && Number.isFinite(bStart) && aStart !== bStart) return aStart - bStart;
    return String(a.id).localeCompare(String(b.id));
  });
}

function mergeProjectRecordWithBase(baseProject, localProject, remoteProject) {
  const base = projectComparable(baseProject) || {};
  const local = projectComparable(localProject) || {};
  const remote = projectComparable(remoteProject) || {};
  const merged = { ...remote };
  const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
  keys.delete("id");
  keys.delete("stages");
  keys.forEach((key) => {
    merged[key] = resolveValueByBase(base[key], local[key], remote[key]);
  });
  merged.id = String(local.id || remote.id || base.id || uid());
  merged.stages = mergeStagesByBase(base.stages || [], local.stages || [], remote.stages || []);
  return normalizeProjectForMerge(merged);
}

function mergeProjectsByBase(baseProjects = [], localProjects = [], remoteProjects = []) {
  const baseMap = mapById(baseProjects.map(projectComparable).filter(Boolean));
  const localMap = mapById(localProjects.map(projectComparable).filter(Boolean));
  const remoteMap = mapById(remoteProjects.map(projectComparable).filter(Boolean));
  const ids = new Set([...baseMap.keys(), ...localMap.keys(), ...remoteMap.keys()]);
  const merged = [];

  ids.forEach((id) => {
    const base = baseMap.get(id) || null;
    const local = localMap.get(id) || null;
    const remote = remoteMap.get(id) || null;

    if (base && !local) {
      if (!remote || valueEquals(projectComparable(remote), projectComparable(base))) return;
      merged.push(remote);
      return;
    }
    if (!base && local && !remote) {
      merged.push(local);
      return;
    }
    if (!local && remote) {
      merged.push(remote);
      return;
    }
    if (local && !remote) {
      if (base && valueEquals(projectComparable(local), projectComparable(base))) return;
      merged.push(local);
      return;
    }
    if (local && remote) {
      const record = mergeProjectRecordWithBase(base, local, remote);
      if (record) merged.push(record);
    }
  });

  return merged.map((project) => ({
    ...project,
    releaseDate: inferReleaseDate(project)
  }));
}

function mergeSectionByBase(baseSection, localSection, remoteSection) {
  if (valueEquals(localSection, baseSection)) return cloneForSync(remoteSection);
  return cloneForSync(localSection);
}

function createAuditEntry({
  entityType,
  entityId,
  projectId = "",
  action,
  changes = {},
  before = null,
  after = null,
  actor = null
}) {
  const now = new Date().toISOString();
  return {
    id: uid(),
    at: now,
    stateId: supabaseStateId,
    action,
    entityType,
    entityId: String(entityId || "").trim(),
    projectId: String(projectId || "").trim(),
    byUserId: String(actor?.id || "").trim(),
    byName: String(actor?.name || "").trim() || "Sistema",
    byEmail: String(actor?.email || "").trim().toLowerCase(),
    changes,
    before,
    after
  };
}

function collectChangedFields(beforeObj, afterObj, ignoreKeys = new Set()) {
  const before = beforeObj && typeof beforeObj === "object" ? beforeObj : {};
  const after = afterObj && typeof afterObj === "object" ? afterObj : {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changes = {};
  keys.forEach((key) => {
    if (ignoreKeys.has(key)) return;
    if (valueEquals(before[key], after[key])) return;
    changes[key] = {
      from: before[key] ?? null,
      to: after[key] ?? null
    };
  });
  return changes;
}

function buildProjectAuditEntries(baseProjects = [], localProjects = [], actor = null) {
  const entries = [];
  const baseMap = mapById(baseProjects.map(projectComparable).filter(Boolean));
  const localMap = mapById(localProjects.map(projectComparable).filter(Boolean));
  const projectIds = new Set([...baseMap.keys(), ...localMap.keys()]);

  projectIds.forEach((projectId) => {
    const baseProject = baseMap.get(projectId) || null;
    const localProject = localMap.get(projectId) || null;

    if (!baseProject && localProject) {
      entries.push(
        createAuditEntry({
          entityType: "project",
          entityId: localProject.id,
          action: "create",
          before: null,
          after: { ...localProject, stages: undefined },
          actor
        })
      );
      return;
    }

    if (baseProject && !localProject) {
      entries.push(
        createAuditEntry({
          entityType: "project",
          entityId: baseProject.id,
          action: "delete",
          before: { ...baseProject, stages: undefined },
          after: null,
          actor
        })
      );
      return;
    }

    if (!baseProject || !localProject) return;

    const projectChanges = collectChangedFields(baseProject, localProject, new Set(["id", "stages"]));
    if (Object.keys(projectChanges).length) {
      entries.push(
        createAuditEntry({
          entityType: "project",
          entityId: localProject.id,
          action: "update",
          changes: projectChanges,
          before: { ...baseProject, stages: undefined },
          after: { ...localProject, stages: undefined },
          actor
        })
      );
    }

    const baseStages = mapById((baseProject.stages || []).map(stageComparable).filter(Boolean));
    const localStages = mapById((localProject.stages || []).map(stageComparable).filter(Boolean));
    const stageIds = new Set([...baseStages.keys(), ...localStages.keys()]);
    stageIds.forEach((stageId) => {
      const baseStage = baseStages.get(stageId) || null;
      const localStage = localStages.get(stageId) || null;
      if (!baseStage && localStage) {
        entries.push(
          createAuditEntry({
            entityType: "project_stage",
            entityId: localStage.id,
            projectId,
            action: "create",
            before: null,
            after: localStage,
            actor
          })
        );
        return;
      }
      if (baseStage && !localStage) {
        entries.push(
          createAuditEntry({
            entityType: "project_stage",
            entityId: baseStage.id,
            projectId,
            action: "delete",
            before: baseStage,
            after: null,
            actor
          })
        );
        return;
      }
      if (!baseStage || !localStage) return;
      const stageChanges = collectChangedFields(baseStage, localStage, new Set(["id"]));
      if (!Object.keys(stageChanges).length) return;
      entries.push(
        createAuditEntry({
          entityType: "project_stage",
          entityId: localStage.id,
          projectId,
          action: "update",
          changes: stageChanges,
          before: baseStage,
          after: localStage,
          actor
        })
      );
    });
  });

  return entries;
}

function appendAuditLogs(existingLogs = [], newEntries = []) {
  const baseLogs = Array.isArray(existingLogs) ? existingLogs : [];
  const additions = Array.isArray(newEntries) ? newEntries.filter(Boolean) : [];
  if (!additions.length) return baseLogs.slice(-MAX_AUDIT_LOG_ITEMS);
  return [...baseLogs, ...additions].slice(-MAX_AUDIT_LOG_ITEMS);
}

function mergeConcurrentState(baseState, localState, remoteState, auditEntries = []) {
  const base = mergeState(baseState || seedState());
  const local = mergeState(localState || base);
  const remote = mergeState(remoteState || base);
  const mergedUsers = mergeUsersByEmail(
    mergeSectionByBase(base.users || [], local.users || [], remote.users || []),
    remote.users || []
  );

  return {
    ...remote,
    settings: mergeSectionByBase(base.settings || {}, local.settings || {}, remote.settings || {}),
    users: mergedUsers,
    projects: mergeProjectsByBase(base.projects || [], local.projects || [], remote.projects || []),
    timeline: mergeSectionByBase(base.timeline || {}, local.timeline || {}, remote.timeline || {}),
    auditLogs: appendAuditLogs(remote.auditLogs || [], auditEntries)
  };
}

function mergeLocalAndRemoteState(localState, remoteState) {
  if (!remoteState) return localState;
  const localProjects = Array.isArray(localState?.projects) ? localState.projects : [];
  const remoteProjects = Array.isArray(remoteState?.projects) ? remoteState.projects : [];

  const primary = remoteProjects.length >= localProjects.length ? remoteState : localState;
  const secondary = primary === remoteState ? localState : remoteState;

  return {
    ...primary,
    users: mergeUsersByEmail(primary.users || [], secondary.users || []),
    auditLogs: appendAuditLogs(primary.auditLogs || [], secondary.auditLogs || [])
  };
}

async function fetchSupabaseStatePayload(client) {
  if (client.mode === "rest") return supabaseRestFetchState(client);
  const result = await client.from(SUPABASE_STATE_TABLE).select("state").eq("id", supabaseStateId).maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}

async function hydrateStateFromSupabase(currentState) {
  const client = getSupabaseClient();
  if (!client) return currentState;

  try {
    const data = await fetchSupabaseStatePayload(client);
    if (!data?.state) return currentState;
    const parsed = typeof data.state === "string" ? JSON.parse(data.state) : data.state;
    const remoteState = maybeRecoverProjectsFromBackup(mergeState(parsed));
    return mergeLocalAndRemoteState(currentState, remoteState);
  } catch (error) {
    console.warn("[Originais] Falha ao hidratar estado remoto.", error);
    return currentState;
  }
}

async function persistStateToSupabase(stateRaw) {
  const client = getSupabaseClient();
  if (!client) return false;
  try {
    const localState = maybeRecoverProjectsFromBackup(mergeState(typeof stateRaw === "string" ? JSON.parse(stateRaw) : stateRaw));
    let remoteState = null;
    try {
      const remotePayload = await fetchSupabaseStatePayload(client);
      if (remotePayload?.state) {
        const parsedRemote = typeof remotePayload.state === "string" ? JSON.parse(remotePayload.state) : remotePayload.state;
        remoteState = maybeRecoverProjectsFromBackup(mergeState(parsedRemote));
      }
    } catch (error) {
      console.warn("[Originais] Não foi possível ler estado remoto antes de salvar. Seguindo com base local.", error?.message || error);
    }

    const baseState = supabaseBaseState ? cloneForSync(supabaseBaseState) : cloneForSync(localState);
    const actor = getCurrentUser();
    const auditEntries = buildProjectAuditEntries(baseState?.projects || [], localState?.projects || [], actor);
    const payload = mergeConcurrentState(baseState, localState, remoteState || baseState, auditEntries);

    if (client.mode === "rest") {
      await supabaseRestUpsertState(client, payload);
    } else {
      const { error } = await client.from(SUPABASE_STATE_TABLE).upsert(
        {
          id: supabaseStateId,
          state: payload,
          updated_at: new Date().toISOString()
        },
        { onConflict: "id" }
      );
      if (error) {
        console.warn("[Originais] Falha ao persistir estado no Supabase.", error.message || error);
        return false;
      }
    }
    supabaseBaseState = cloneForSync(localState);
    return true;
  } catch (error) {
    console.warn("[Originais] Falha ao serializar/salvar estado no Supabase.", error);
    return false;
  }
}

function flushSupabaseSyncQueue() {
  if (supabaseSyncInFlight) return;
  if (!queuedSupabaseStateRaw) return;
  const payload = queuedSupabaseStateRaw;
  queuedSupabaseStateRaw = "";
  supabaseSyncInFlight = true;
  void persistStateToSupabase(payload)
    .then((ok) => {
      if (!ok && !hasShownSupabaseWarning) {
        hasShownSupabaseWarning = true;
        alert("Não foi possível sincronizar dados no Supabase. O app segue funcionando localmente.");
      }
    })
    .finally(() => {
      supabaseSyncInFlight = false;
      if (queuedSupabaseStateRaw) flushSupabaseSyncQueue();
    });
}

function queueSupabaseSync(stateRaw) {
  if (!getSupabaseClient()) return;
  queuedSupabaseStateRaw = stateRaw;
  if (supabaseSyncTimer) clearTimeout(supabaseSyncTimer);
  supabaseSyncTimer = setTimeout(() => {
    supabaseSyncTimer = null;
    flushSupabaseSyncQueue();
  }, 500);
}

function saveState({ skipSupabase = false } = {}) {
  const serialized = JSON.stringify(state);
  if (!writePersistedValue(STORAGE_KEY, serialized)) {
    console.warn("[Originais] Falha ao persistir estado principal.");
    if (!hasShownStorageWarning) {
      hasShownStorageWarning = true;
      alert("O navegador bloqueou a gravação local de dados. Verifique permissões de armazenamento/site data no Chrome.");
    }
  }
  try {
    if (!writePersistedValue(PROJECTS_BACKUP_KEY, JSON.stringify(state.projects || []))) {
      console.warn("[Originais] Falha ao persistir backup de projetos.");
      if (!hasShownStorageWarning) {
        hasShownStorageWarning = true;
        alert("O navegador bloqueou a gravação local de dados. Verifique permissões de armazenamento/site data no Chrome.");
      }
    }
  } catch (error) {
    console.warn("[Originais] Falha ao salvar backup de projetos.", error);
  }

  // Persistência robusta para recargas locais no Chrome.
  void persistStateToIndexedDb(serialized, JSON.stringify(state.projects || [])).then((ok) => {
    if (!ok && !hasShownStorageWarning) {
      hasShownStorageWarning = true;
      alert("Não foi possível salvar os dados locais no navegador (IndexedDB/localStorage).");
    }
  });
  if (!skipSupabase) queueSupabaseSync(serialized);
}

function loadState() {
  const primary = loadStateFromKey(STORAGE_KEY);
  if (primary) return primary;

  for (const key of STORAGE_FALLBACK_KEYS) {
    const recovered = loadStateFromKey(key);
    if (recovered) {
      console.warn(`[Originais] Estado recuperado de '${key}'.`);
      if (key !== STORAGE_KEY) {
        const serialized = JSON.stringify(recovered);
        if (!writePersistedValue(STORAGE_KEY, serialized)) {
          console.warn("[Originais] Falha ao persistir estado recuperado.");
        }
        try {
          if (!writePersistedValue(PROJECTS_BACKUP_KEY, JSON.stringify(recovered.projects || []))) {
            console.warn("[Originais] Falha ao persistir backup de projetos recuperado.");
          }
        } catch (error) {
          console.warn("[Originais] Falha ao salvar backup de projetos na recuperação.", error);
        }
      }
      return recovered;
    }
  }

  console.warn("[Originais] Nenhum estado válido encontrado no localStorage. Carregando seed.");
  return seedState();
}

function loadStateFromKey(key) {
  const raws = readPersistedCandidates(key);
  if (!raws.length) return null;

  let best = null;
  raws.forEach((raw) => {
    try {
      const parsed = JSON.parse(raw);
      const merged = maybeRecoverProjectsFromBackup(mergeState(parsed));
      if (!Array.isArray(merged?.projects)) return;
      if (!best || merged.projects.length > best.projects.length) best = merged;
    } catch (error) {
      console.warn(`[Originais] Falha ao carregar localStorage '${key}'.`, error);
    }
  });

  return best;
}

function readProjectsBackup() {
  const raws = readPersistedCandidates(PROJECTS_BACKUP_KEY);
  if (!raws.length) return [];
  let best = [];

  raws.forEach((raw) => {
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const cleaned = parsed.filter((item) => item && typeof item === "object");
      if (cleaned.length > best.length) best = cleaned;
    } catch {}
  });

  return best;
}

function looksLikeSeedProjects(projects = []) {
  const seedCodes = ["02-01", "02-12", "02-21", "02-33", "02-45", "02-52"];
  if (!Array.isArray(projects) || projects.length !== seedCodes.length) return false;
  return seedCodes.every((code) => projects.some((project) => String(project?.code || "").trim() === code));
}

function maybeRecoverProjectsFromBackup(mergedState) {
  const currentProjects = Array.isArray(mergedState?.projects) ? mergedState.projects : [];
  const backupProjects = readProjectsBackup();
  if (!backupProjects.length) return mergedState;
  if (!looksLikeSeedProjects(currentProjects)) return mergedState;
  if (backupProjects.length <= currentProjects.length) return mergedState;

  console.warn(`[Originais] Recuperando ${backupProjects.length} projetos do backup local.`);
  return {
    ...mergedState,
    projects: backupProjects.map((project) => ({
      ...project,
      releaseDate: inferReleaseDate(project)
    }))
  };
}

function pickArray(value, fallback) {
  if (Array.isArray(value) && value.length) return value;
  return Array.isArray(fallback) ? fallback : [];
}

function mergeState(parsed) {
  const base = seedState();
  const mergedSettings = {
    categories: pickArray(parsed?.settings?.categories, base.settings.categories),
    productionTypes: pickArray(parsed?.settings?.productionTypes, base.settings.productionTypes),
    formats: pickArray(parsed?.settings?.formats, base.settings.formats),
    natures: pickArray(parsed?.settings?.natures, base.settings.natures),
    durations: pickArray(parsed?.settings?.durations, base.settings.durations),
    statuses: pickArray(parsed?.settings?.statuses, base.settings.statuses),
    stages: pickArray(parsed?.settings?.stages, base.settings.stages)
  };
  mergedSettings.itemColors = mergeItemColors(buildDefaultItemColors(mergedSettings), parsed?.settings?.itemColors || base.settings.itemColors);

  const sourceProjects = Array.isArray(parsed?.projects) ? parsed.projects.filter((p) => p && typeof p === "object") : base.projects;
  const projects = sourceProjects.map((project) => ({
    ...project,
    releaseDate: inferReleaseDate(project)
  }));
  const users = Array.isArray(parsed?.users) && parsed.users.length
    ? parsed.users
        .filter((user) => user && typeof user === "object")
        .map((user) => ({
          id: user.id || uid(),
          name: String(user.name || "").trim(),
          email: String(user.email || "").trim().toLowerCase(),
          role: ["ADMIN", "EDITOR", "LEITOR"].includes(user.role) ? user.role : "LEITOR",
          passwordHash:
            String(user.passwordHash || "").trim() ||
            (
              [DEFAULT_ADMIN_EMAIL, LEGACY_ADMIN_EMAIL].includes(String(user.email || "").trim().toLowerCase())
                ? hashPassword(DEFAULT_ADMIN_PASSWORD)
                : ""
            ),
          invitedAt: user.invitedAt || "",
          firstAccessPending: Boolean(user.firstAccessPending)
        }))
        .filter((user) => user.name && user.email)
    : base.users;
  const auditLogs = Array.isArray(parsed?.auditLogs)
    ? parsed.auditLogs
        .filter((entry) => entry && typeof entry === "object")
        .slice(-MAX_AUDIT_LOG_ITEMS)
    : [];

  return {
    settings: mergedSettings,
    projects,
    users,
    auditLogs,
    timeline: {
      start: parsed?.timeline?.start || defaultTimelineWindow().start,
      end: parsed?.timeline?.end || defaultTimelineWindow().end,
      monthsShown:
        parsed?.timeline?.monthsShown ||
        (isValidMonth(parsed?.timeline?.start) && isValidMonth(parsed?.timeline?.end)
          ? monthToIndex(parsed.timeline.end) - monthToIndex(parsed.timeline.start) + 1
          : defaultTimelineWindow().monthsShown)
    }
  };
}

function seedState() {
  if (window.BASE44_SEED?.projects?.length) {
    const cloned = structuredClone(window.BASE44_SEED);
    cloned.settings = cloned.settings || {};
    cloned.users = Array.isArray(cloned.users) && cloned.users.length
      ? cloned.users.map((user) => ({
          id: user.id || uid(),
          name: String(user.name || "").trim(),
          email: String(user.email || "").trim().toLowerCase(),
          role: ["ADMIN", "EDITOR", "LEITOR"].includes(user.role) ? user.role : "LEITOR",
          passwordHash:
            String(user.passwordHash || "").trim() ||
            (
              [DEFAULT_ADMIN_EMAIL, LEGACY_ADMIN_EMAIL].includes(String(user.email || "").trim().toLowerCase())
                ? hashPassword(DEFAULT_ADMIN_PASSWORD)
                : ""
            ),
          invitedAt: user.invitedAt || new Date().toISOString().slice(0, 10),
          firstAccessPending: Boolean(user.firstAccessPending)
        }))
      : [
          {
            id: uid(),
            name: "Administrador",
            email: DEFAULT_ADMIN_EMAIL,
            role: "ADMIN",
            passwordHash: hashPassword(DEFAULT_ADMIN_PASSWORD),
            invitedAt: new Date().toISOString().slice(0, 10),
            firstAccessPending: false
          }
        ];
    cloned.projects = (cloned.projects || []).map((project) => ({
      ...project,
      releaseDate: inferReleaseDate(project)
    }));
    cloned.auditLogs = Array.isArray(cloned.auditLogs)
      ? cloned.auditLogs.filter((entry) => entry && typeof entry === "object").slice(-MAX_AUDIT_LOG_ITEMS)
      : [];
    const defaults = buildDefaultItemColors(cloned.settings);
    cloned.settings.itemColors = mergeItemColors(defaults, cloned.settings.itemColors);
    return cloned;
  }

  const stages = [
    { id: uid(), name: "Desenvolvimento", color: "#34d399" },
    { id: uid(), name: "Pré-produção", color: "#60a5fa" },
    { id: uid(), name: "Produção", color: "#fcd34d" },
    { id: uid(), name: "Pós-produção", color: "#f472b6" },
    { id: uid(), name: "Distribuição", color: "#a78bfa" }
  ];

  const projects = [
    projectSeed("02-01", "Short Doc Miss", 2026, "Streaming", "Obra Não Seriada", "Documental", "Curta-metragem", "Em andamento", 0, [
      stageSeed(stages[0].id, "2025-08", "2025-09"),
      stageSeed(stages[2].id, "2025-10", "2026-02"),
      stageSeed(stages[3].id, "2026-01", "2026-04")
    ]),
    projectSeed("02-12", "Leveza Feminina", 2025, "Streaming", "Série", "Documental", "Curta-metragem", "Planejamento", 0, [
      stageSeed(stages[0].id, "2026-03", "2026-05"),
      stageSeed(stages[1].id, "2026-06", "2026-08")
    ]),
    projectSeed("02-21", "O Encontro", 2026, "Streaming", "Obra Não Seriada", "Ficção", "Longa-metragem", "Concluído", 100879, [
      stageSeed(stages[0].id, "2025-02", "2025-03"),
      stageSeed(stages[2].id, "2025-04", "2025-08"),
      stageSeed(stages[3].id, "2025-09", "2025-11")
    ]),
    projectSeed("02-33", "Cidade Amarela", 2024, "Produtora", "Obra Não Seriada", "Ficção", "Curta-metragem", "Em andamento", 45623, [
      stageSeed(stages[2].id, "2025-04", "2025-09"),
      stageSeed(stages[4].id, "2025-10", "2025-11")
    ]),
    projectSeed("02-45", "São Francisco e Primeiro Presépio", 2024, "Streaming", "Obra Não Seriada", "Documental", "Média-metragem", "Concluído", 120540, [
      stageSeed(stages[1].id, "2024-01", "2024-03"),
      stageSeed(stages[2].id, "2024-04", "2024-06"),
      stageSeed(stages[3].id, "2024-07", "2024-09")
    ]),
    projectSeed("02-52", "Cinema Católico", 2023, "Produtora", "Série", "Documental", "Longa-metragem", "Pausado", 0, [
      stageSeed(stages[0].id, "2023-09", "2023-12")
    ])
  ];

  return {
    settings: {
      categories: ["Streaming", "Produtora", "Incubado"],
      productionTypes: ["Documentário", "Curta", "Série"],
      formats: ["Obra Não Seriada", "Série"],
      natures: ["Documental", "Ficção", "Animação"],
      durations: ["Média-metragem", "Curta-metragem", "Longa-metragem"],
      statuses: ["Em andamento", "Concluído", "Planejamento", "Pausado"],
      stages,
      itemColors: {
        categories: {
          Streaming: "#f3ba00",
          Produtora: "#3b82f6",
          Incubado: "#10b981"
        },
        formats: {
          "Obra Não Seriada": "#60a5fa",
          Série: "#34d399"
        },
        natures: {
          Documental: "#0ea5e9",
          Ficção: "#10b981",
          Animação: "#f97316"
        },
        durations: {
          "Curta-metragem": "#f59e0b",
          "Média-metragem": "#14b8a6",
          "Longa-metragem": "#6366f1"
        },
        statuses: {
          "Em andamento": "#3b82f6",
          Concluído: "#10b981",
          Planejamento: "#f59e0b",
          Pausado: "#94a3b8"
        }
      }
    },
    users: [
      {
        id: uid(),
        name: "Administrador",
        email: DEFAULT_ADMIN_EMAIL,
        role: "ADMIN",
        passwordHash: hashPassword(DEFAULT_ADMIN_PASSWORD),
        invitedAt: new Date().toISOString().slice(0, 10),
        firstAccessPending: false
      }
    ],
    projects,
    auditLogs: [],
    timeline: {
      ...defaultTimelineWindow()
    }
  };
}

function projectSeed(code, title, year, category, format, nature, duration, status, budget, stages) {
  return {
    id: uid(),
    code,
    title,
    year,
    category,
    productionType: "",
    format,
    nature,
    duration,
    status,
    budget,
    releaseDate: "",
    spent: 0,
    notes: "",
    stages
  };
}

function stageSeed(stageId, start, end) {
  return { id: uid(), stageId, start, end };
}

initTheme();
init();
