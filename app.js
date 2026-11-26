(() => {
  "use strict";

  const STORAGE_KEYS = {
    tasks: "adaptix_student_tasks_v1",
    documents: "adaptix_student_docs_v1",
    chat: "adaptix_student_chat_v1",
    notifSettings: "adaptix_student_notif_settings_v1",
    notifHistory: "adaptix_student_notif_history_v1",
    integrations: "adaptix_student_integrations_v1",
    zapierOutbox: "adaptix_student_zapier_outbox_v1"
  };

  // Clearly labelled placeholders for external integrations.
  // Never store private API keys (Google Sheets, Zapier secrets, ElevenLabs xi-api-key) in frontend JS.
  const INTEGRATION_PLACEHOLDERS = {
    botpress: {
      injectScriptUrl: "", // e.g. "https://cdn.botpress.cloud/webchat/v2.x/inject.js"
      configScriptUrl: ""  // e.g. "https://files.bpcontent.cloud/BOT_ID/CONFIG_ID/config.js"
    },
    googleSheets: {
      backendProxyUrl: "" // e.g. "https://your-backend.example.com/api/sheets-sync"
    },
    zapier: {
      backendWebhookProxyUrl: "" // e.g. "https://your-backend.example.com/api/zapier-events"
    },
    elevenLabs: {
      backendTtsProxyUrl: "", // e.g. "https://your-backend.example.com/api/elevenlabs-tts"
      voiceId: "ELEVENLABS_VOICE_ID_PLACEHOLDER",
      allowBrowserSpeechFallback: true
    },
    notebookLm: {
      notebookUrl: ""
    }
  };

  const REMINDER_STAGE_META = {
    overdue: { label: "Overdue", badgeClass: "badge-urgent", prefix: "Overdue" },
    "6h": { label: "6 Hours Left", badgeClass: "badge-urgent", prefix: "Due within 6 hours" },
    "24h": { label: "24 Hours Left", badgeClass: "badge-today", prefix: "Due within 24 hours" },
    "3d": { label: "3 Days Left", badgeClass: "badge-lavender", prefix: "Due within 3 days" }
  };

  const STUDENT_PROFILE = {
    name: "Megha",
    institute: "JECRC University",
    programme: "B.Tech – Computer Science and Engineering (CSE)",
    semester: "1st Semester"
  };

  const SUBJECTS = [
    "CPLT",
    "Digital Literacy",
    "Applied Physics",
    "Mathematics",
    "Communication Skills",
    "EDP"
  ];

  const TASK_CATEGORIES = [
    "Assignments",
    "Practical Files",
    "Lab Records",
    "Presentations",
    "Projects",
    "Quizzes",
    "Mid-semester Exams",
    "End-semester Exams"
  ];

  const VIEW_META = {
    dashboard: {
      title: "Dashboard",
      subtitle: "Personal academic overview and subject progress"
    },
    tasks: {
      title: "Academic Tasks",
      subtitle: "Manage assignments, practical files, lab records, quizzes and exams"
    },
    deadlines: {
      title: "Upcoming Deadlines",
      subtitle: "Track overdue, today, tomorrow and weekly due dates"
    },
    assistant: {
      title: "ADAPTIX AI Assistant",
      subtitle: "Ask about assignments, deadlines, subjects & study materials"
    },
    documents: {
      title: "Study Resources",
      subtitle: "Organise notes, PDFs, lab manuals & NotebookLM study prep"
    },
    progress: {
      title: "Progress Tracker",
      subtitle: "Monitor overall and subject-wise academic completion"
    },
    integrations: {
      title: "Integrations",
      subtitle: "Connect Botpress, Google Sheets, Zapier, NotebookLM workflow & Voice"
    }
  };

  const PRIORITY_WEIGHT = {
    High: 3,
    Medium: 2,
    Low: 1
  };

  // Date Utilities anchored to client local date
  function toIsoDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function addDaysIso(offsetDays) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + offsetDays);
    return toIsoDate(d);
  }

  function formatDisplayDate(isoDate) {
    if (!isoDate) return "No date";
    const parts = isoDate.split("-");
    if (parts.length !== 3) return isoDate;
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    if (Number.isNaN(d.getTime())) return isoDate;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  function getDeadlineDate(task) {
    if (!task || !task.dueDate) return null;
    const parts = task.dueDate.split("-");
    if (parts.length !== 3) return null;
    const timeStr = task.dueTime && /^\d{2}:\d{2}$/.test(task.dueTime) ? task.dueTime : "23:59";
    const [hh, mm] = timeStr.split(":").map(Number);
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), hh, mm, 0, 0);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function getDayDiffFromToday(isoDate) {
    if (!isoDate) return 999;
    const parts = isoDate.split("-");
    if (parts.length !== 3) return 999;
    const target = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);
    return Math.round((target.getTime() - today.getTime()) / 86400000);
  }

  function formatRelativeDue(isoDate, status, dueTime) {
    const timeSuffix = dueTime && dueTime !== "23:59" ? ` at ${dueTime}` : "";
    if (status === "Completed") return `Completed • Due ${formatDisplayDate(isoDate)}${timeSuffix}`;
    const diff = getDayDiffFromToday(isoDate);
    if (diff < 0) return `Overdue by ${Math.abs(diff)} day${Math.abs(diff) === 1 ? "" : "s"} (${formatDisplayDate(isoDate)}${timeSuffix})`;
    if (diff === 0) return `Due Today (${formatDisplayDate(isoDate)}${timeSuffix})`;
    if (diff === 1) return `Due Tomorrow (${formatDisplayDate(isoDate)}${timeSuffix})`;
    if (diff <= 7) return `Due in ${diff} days (${formatDisplayDate(isoDate)}${timeSuffix})`;
    return `Due ${formatDisplayDate(isoDate)}${timeSuffix}`;
  }

  // Initial Demo Tasks across Megha's 6 subjects (clearly flagged isDemo: true)
  function buildDemoTasks() {
    return [
      {
        id: "demo-1",
        title: "CPLT Loops & Functions Practical File",
        subject: "CPLT",
        category: "Practical Files",
        description: "Complete C programming lab exercises 1–6 with sample outputs and index page.",
        dueDate: addDaysIso(0),
        priority: "High",
        status: "In Progress",
        isDemo: true
      },
      {
        id: "demo-2",
        title: "Mathematics Matrix & Calculus Assignment 2",
        subject: "Mathematics",
        category: "Assignments",
        description: "Solve eigenvalues and partial differentiation practice set.",
        dueDate: addDaysIso(-1),
        priority: "High",
        status: "Pending",
        isDemo: true
      },
      {
        id: "demo-3",
        title: "Applied Physics Optics Lab Record",
        subject: "Applied Physics",
        category: "Lab Records",
        description: "Draw ray diagram observations and calculate refractive index error.",
        dueDate: addDaysIso(1),
        priority: "High",
        status: "Pending",
        isDemo: true
      },
      {
        id: "demo-4",
        title: "Digital Literacy Spreadsheet & Docs Quiz Prep",
        subject: "Digital Literacy",
        category: "Quizzes",
        description: "Review keyboard shortcuts, formulas, and file security basics.",
        dueDate: addDaysIso(3),
        priority: "Medium",
        status: "Pending",
        isDemo: true
      },
      {
        id: "demo-5",
        title: "Communication Skills Technical Presentation",
        subject: "Communication Skills",
        category: "Presentations",
        description: "Prepare 6-slide presentation on effective team communication.",
        dueDate: addDaysIso(5),
        priority: "Medium",
        status: "In Progress",
        isDemo: true
      },
      {
        id: "demo-6",
        title: "EDP Mini Campus Problem Pitch",
        subject: "EDP",
        category: "Projects",
        description: "Draft one-page entrepreneurship problem statement and user persona.",
        dueDate: addDaysIso(6),
        priority: "Low",
        status: "Pending",
        isDemo: true
      },
      {
        id: "demo-7",
        title: "CPLT Mid-Semester Revision Sheet",
        subject: "CPLT",
        category: "Mid-semester Exams",
        description: "Revise pointers, arrays, and conditional statements.",
        dueDate: addDaysIso(9),
        priority: "Medium",
        status: "Pending",
        isDemo: true
      },
      {
        id: "demo-8",
        title: "Digital Literacy Lab Worksheet 1",
        subject: "Digital Literacy",
        category: "Assignments",
        description: "Introductory formatting and cloud document sharing exercise.",
        dueDate: addDaysIso(-2),
        priority: "Low",
        status: "Completed",
        isDemo: true
      },
      {
        id: "demo-9",
        title: "Communication Skills Reading Comprehension",
        subject: "Communication Skills",
        category: "Assignments",
        description: "Submit summary paragraph for Unit 1.",
        dueDate: addDaysIso(-3),
        priority: "Low",
        status: "Completed",
        isDemo: true
      }
    ];
  }

  function buildInitialChat() {
    return [
      {
        id: "msg-welcome",
        sender: "bot",
        text: "Hi Megha! I'm ADAPTIX AI. Ask me about your pending assignments, today's priorities, upcoming deadlines, practical files, completed tasks, or uploaded documents."
      }
    ];
  }

  const state = {
    activeView: "dashboard",
    tasks: [],
    documents: [],
    chatMessages: [],
    notifSettings: { enabled: false, sentKeys: [] },
    notifHistory: [],
    notifPanelOpen: false,
    integrations: {
      botpressInjectUrl: "",
      botpressConfigUrl: "",
      botpressConnected: false,
      botpressError: "",
      sheetsBackendUrl: "",
      sheetsVerified: false,
      zapierBackendUrl: "",
      zapierVerified: false,
      elevenLabsBackendUrl: "",
      elevenLabsVoiceId: "ELEVENLABS_VOICE_ID_PLACEHOLDER",
      elevenLabsVerified: false,
      allowBrowserSpeechFallback: true,
      notebookLmUrl: ""
    },
    zapierOutbox: [],
    filters: {
      taskSearch: "",
      taskSubject: "ALL",
      taskCategory: "ALL",
      taskStatus: "ALL",
      taskSort: "deadline-asc",
      docCategory: "ALL"
    }
  };

  // Safe localStorage helpers
  function storageLoad(key, fallbackFactory) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) {
        const initial = fallbackFactory();
        storageSave(key, initial);
        return initial;
      }
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : fallbackFactory();
    } catch (_err) {
      return fallbackFactory();
    }
  }

  function storageLoadObject(key, fallbackFactory) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) {
        const initial = fallbackFactory();
        storageSave(key, initial);
        return initial;
      }
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? { ...fallbackFactory(), ...parsed }
        : fallbackFactory();
    } catch (_err) {
      return fallbackFactory();
    }
  }

  function storageSave(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (_err) {
      // Gracefully ignore storage errors in restricted environments
    }
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatFileSize(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "Size unavailable";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function showToast(message) {
    const region = document.getElementById("toastRegion");
    if (!region) return;
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    region.appendChild(toast);
    window.setTimeout(() => toast.remove(), 2800);
  }

  // Academic Metrics Helpers
  function getTaskMetrics() {
    const total = state.tasks.length;
    const completed = state.tasks.filter((t) => t.status === "Completed").length;
    const inProgress = state.tasks.filter((t) => t.status === "In Progress").length;
    const pending = state.tasks.filter((t) => t.status === "Pending").length;
    const open = total - completed;
    const upcomingWeek = state.tasks.filter((t) => {
      if (t.status === "Completed") return false;
      const diff = getDayDiffFromToday(t.dueDate);
      return diff >= 0 && diff <= 7;
    }).length;
    const overdue = state.tasks.filter(
      (t) => t.status !== "Completed" && getDayDiffFromToday(t.dueDate) < 0
    ).length;
    const dueToday = state.tasks.filter(
      (t) => t.status !== "Completed" && getDayDiffFromToday(t.dueDate) === 0
    ).length;
    const completionPct = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      total,
      completed,
      inProgress,
      pending,
      open,
      upcomingWeek,
      overdue,
      dueToday,
      completionPct
    };
  }

  function getPrioritisedOpenTasks() {
    return state.tasks
      .filter((t) => t.status !== "Completed")
      .sort((a, b) => {
        const diffA = getDayDiffFromToday(a.dueDate);
        const diffB = getDayDiffFromToday(b.dueDate);
        if (diffA !== diffB) return diffA - diffB;
        return (PRIORITY_WEIGHT[b.priority] || 0) - (PRIORITY_WEIGHT[a.priority] || 0);
      });
  }

  // ============================================================
  // ADAPTIX AI Engine (Rule-based Demo + Botpress Adapter Hook)
  // ============================================================
  const AdaptixBotEngine = {
    mode: "local-demo", // Future integration: switch to "botpress" and implement sendViaBotpress()

    async sendMessage(rawQuery, context) {
      if (this.mode === "botpress") {
        // Placeholder hook for future Botpress Webchat / Messaging API integration:
        // return await this.sendViaBotpress(rawQuery, context);
      }
      return this.generateLocalResponse(rawQuery, context);
    },

    generateLocalResponse(rawQuery, { tasks, documents }) {
      const q = rawQuery.trim().toLowerCase();
      if (!q) {
        return "Please type a question about your tasks, deadlines, subjects, or uploaded documents.";
      }

      const openTasks = tasks.filter((t) => t.status !== "Completed");
      const completedTasks = tasks.filter((t) => t.status === "Completed");

      // 1. Completed tasks
      if (q.includes("completed") || q.includes("finished") || q.includes("done")) {
        if (!completedTasks.length) {
          return "You haven't marked any tasks as Completed yet. Once you finish a task, update its status to track your progress!";
        }
        const list = completedTasks
          .slice(0, 6)
          .map((t) => `• ${t.title} (${t.subject} — ${t.category})`)
          .join("\n");
        return `You have completed ${completedTasks.length} task${completedTasks.length === 1 ? "" : "s"} so far:\n${list}`;
      }

      // 2. Practical files / lab records
      if (q.includes("practical") || q.includes("lab")) {
        const practicalPending = openTasks.filter(
          (t) => t.category === "Practical Files" || t.category === "Lab Records"
        );
        if (!practicalPending.length) {
          return "You have no pending Practical Files or Lab Records recorded right now.";
        }
        const list = practicalPending
          .map((t) => `• ${t.title} (${t.subject}) — ${formatRelativeDue(t.dueDate, t.status)}`)
          .join("\n");
        return `You have ${practicalPending.length} open practical/lab item${practicalPending.length === 1 ? "" : "s"}:\n${list}`;
      }

      // 3. Today / complete today / focus
      if (q.includes("today") || q.includes("focus")) {
        const overdue = openTasks.filter((t) => getDayDiffFromToday(t.dueDate) < 0);
        const dueToday = openTasks.filter((t) => getDayDiffFromToday(t.dueDate) === 0);
        const urgent = [...overdue, ...dueToday];

        if (!urgent.length) {
          if (!openTasks.length) {
            return "Nothing is due today — all your saved tasks are completed!";
          }
          const next = getPrioritisedOpenTasks()[0];
          return `You have no tasks due today! If you want to get ahead, your next upcoming task is "${next.title}" (${next.subject}), ${formatRelativeDue(next.dueDate, next.status)}.`;
        }

        const list = urgent
          .map((t) => `• ${t.title} (${t.subject}) — ${formatRelativeDue(t.dueDate, t.status)}`)
          .join("\n");
        return `Here is what you should focus on today:\n${list}`;
      }

      // 4. Subject with most pending work
      if (q.includes("subject") && (q.includes("most") || q.includes("busy") || q.includes("heavy"))) {
        if (!openTasks.length) {
          return "You currently have zero pending tasks across all six subjects!";
        }
        const counts = {};
        SUBJECTS.forEach((s) => {
          counts[s] = 0;
        });
        openTasks.forEach((t) => {
          counts[t.subject] = (counts[t.subject] || 0) + 1;
        });
        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        const topCount = sorted[0][1];
        const topSubjects = sorted.filter(([, c]) => c === topCount).map(([s]) => s);
        return `${topSubjects.join(" and ")} currently ${topSubjects.length > 1 ? "have" : "has"} the most open work (${topCount} pending/in-progress task${topCount === 1 ? "" : "s"}).`;
      }

      // 5. Deadlines this week
      if (q.includes("deadline") || q.includes("week") || q.includes("due")) {
        const weekTasks = openTasks
          .filter((t) => {
            const diff = getDayDiffFromToday(t.dueDate);
            return diff <= 7;
          })
          .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

        if (!weekTasks.length) {
          return "No overdue tasks or deadlines coming up in the next 7 days have been added.";
        }
        const list = weekTasks
          .slice(0, 6)
          .map((t) => `• ${t.title} (${t.subject}) — ${formatRelativeDue(t.dueDate, t.status)}`)
          .join("\n");
        return `Here are your upcoming/overdue deadlines within this week:\n${list}`;
      }

      // 6. Prioritise workload
      if (q.includes("priorit") || q.includes("workload") || q.includes("plan") || q.includes("help")) {
        if (!openTasks.length) {
          return "Your workload is clear — all saved tasks are marked Completed!";
        }
        const topThree = getPrioritisedOpenTasks().slice(0, 3);
        const list = topThree
          .map(
            (t, idx) =>
              `${idx + 1}. ${t.title} (${t.subject}, ${t.priority} priority) — ${formatRelativeDue(t.dueDate, t.status)}`
          )
          .join("\n");
        return `Start with these top ${topThree.length} tasks ordered by deadline and priority:\n${list}`;
      }

      // 7. Pending assignments (specific category or open tasks)
      if (q.includes("pending") || q.includes("assignment") || q.includes("task")) {
        const asksAssignmentsOnly = q.includes("assignment") && !q.includes("task");
        const matching = asksAssignmentsOnly
          ? openTasks.filter((t) => t.category === "Assignments")
          : openTasks;

        if (!matching.length) {
          return asksAssignmentsOnly
            ? "You don't have any pending items in the Assignments category right now."
            : "You have no pending tasks right now!";
        }
        const list = matching
          .slice(0, 6)
          .map((t) => `• ${t.title} (${t.subject} • ${t.status}) — ${formatRelativeDue(t.dueDate, t.status)}`)
          .join("\n");
        const extra = matching.length > 6 ? `\n...and ${matching.length - 6} more in Academic Tasks.` : "";
        return `You have ${matching.length} pending ${asksAssignmentsOnly ? "assignment" : "task"}${matching.length === 1 ? "" : "s"}:\n${list}${extra}`;
      }

      // 8. Uploaded documents & study materials
      if (
        q.includes("document") ||
        q.includes("pdf") ||
        q.includes("upload") ||
        q.includes("manual") ||
        q.includes("timetable") ||
        q.includes("material") ||
        q.includes("note") ||
        q.includes("guide") ||
        q.includes("study")
      ) {
        if (!documents.length) {
          return "No study materials or documents have been uploaded yet. You can add subject notes, PDFs, lab manuals, or study guides in Study Resources.";
        }
        const list = documents
          .slice(0, 5)
          .map((d) => `• ${d.name} (${d.category}, ${d.subject}) — added ${formatDisplayDate(d.uploadedAt)}`)
          .join("\n");
        return `You have ${documents.length} saved study resource${documents.length === 1 ? "" : "s"}:\n${list}\n(Note: File contents are not parsed automatically in this browser prototype.)`;
      }

      // 9. Subject-specific lookup if student mentions one of Megha's 6 subjects
      const matchedSubject = SUBJECTS.find((s) => q.includes(s.toLowerCase()));
      if (matchedSubject) {
        const subjTasks = tasks.filter((t) => t.subject === matchedSubject);
        if (!subjTasks.length) {
          return `No tasks have been added for ${matchedSubject} yet.`;
        }
        const subjOpen = subjTasks.filter((t) => t.status !== "Completed");
        if (!subjOpen.length) {
          return `All ${subjTasks.length} task(s) for ${matchedSubject} are completed!`;
        }
        const list = subjOpen
          .map((t) => `• ${t.title} (${t.category}) — ${formatRelativeDue(t.dueDate, t.status)}`)
          .join("\n");
        return `${matchedSubject} has ${subjOpen.length} open task(s):\n${list}`;
      }

      // 10. Honest fallback when info isn't available
      return `I don't have information on that because it hasn't been added to your ADAPTIX tasks or documents yet. Try asking about your pending assignments, today's tasks, deadlines this week, practical files, completed tasks, or one of your 6 subjects (${SUBJECTS.join(", ")}).`;
    }
  };

  // Navigation & Drawer
  function setMobileDrawerOpen(isOpen) {
    const sidebar = document.getElementById("sidebar");
    const backdrop = document.getElementById("sidebarBackdrop");
    const menuBtn = document.getElementById("mobileMenuBtn");
    if (!sidebar || !backdrop || !menuBtn) return;

    sidebar.classList.toggle("is-open", isOpen);
    backdrop.classList.toggle("is-visible", isOpen);
    menuBtn.setAttribute("aria-expanded", String(isOpen));
    document.body.classList.toggle("drawer-open", isOpen);
  }

  function syncBottomNav(viewKey) {
    const bottomNav = document.getElementById("mobileBottomNav");
    if (!bottomNav) return;

    const primaryMobileViews = new Set(["dashboard", "tasks", "deadlines", "assistant"]);
    const moreBtn = document.getElementById("mobileMoreBtn");

    bottomNav.querySelectorAll(".bottom-nav-item[data-view]").forEach((btn) => {
      const matches = btn.dataset.view === viewKey;
      btn.classList.toggle("is-active", matches);
      if (matches) {
        btn.setAttribute("aria-current", "page");
      } else {
        btn.removeAttribute("aria-current");
      }
    });

    if (moreBtn) {
      moreBtn.classList.toggle("is-active", !primaryMobileViews.has(viewKey));
    }
  }

  function navigateTo(viewKey, updateHash = true) {
    if (!VIEW_META[viewKey]) return;
    state.activeView = viewKey;

    document.querySelectorAll(".view-section").forEach((section) => {
      const matches = section.dataset.viewPanel === viewKey;
      section.hidden = !matches;
      section.classList.toggle("is-active", matches);
    });

    document.querySelectorAll(".nav-item[data-view]").forEach((btn) => {
      const matches = btn.dataset.view === viewKey;
      btn.classList.toggle("is-active", matches);
      if (matches) {
        btn.setAttribute("aria-current", "page");
      } else {
        btn.removeAttribute("aria-current");
      }
    });

    syncBottomNav(viewKey);

    const pageTitle = document.getElementById("pageTitle");
    const pageSubtitle = document.getElementById("pageSubtitle");
    if (pageTitle) pageTitle.textContent = VIEW_META[viewKey].title;
    if (pageSubtitle) pageSubtitle.textContent = VIEW_META[viewKey].subtitle;

    if (updateHash && window.location.hash !== `#${viewKey}`) {
      window.history.replaceState(null, "", `#${viewKey}`);
    }

    setMobileDrawerOpen(false);
    toggleNotifPanel(false);
    renderActiveView();
  }

  function updateNavBadges() {
    const metrics = getTaskMetrics();
    const pendingBadge = document.getElementById("navPendingCount");
    const urgentBadge = document.getElementById("navUrgentCount");
    const docsBadge = document.getElementById("navDocsCount");

    if (pendingBadge) pendingBadge.textContent = String(metrics.open);
    if (urgentBadge) urgentBadge.textContent = String(metrics.overdue + metrics.dueToday);
    if (docsBadge) docsBadge.textContent = String(state.documents.length);
  }

  // Reusable Card Builders
  function renderKpiCard(label, value, footnote, iconSvg) {
    return `
      <article class="kpi-card">
        <div class="kpi-top">
          <span class="kpi-label">${escapeHtml(label)}</span>
          <span class="kpi-icon" aria-hidden="true">${iconSvg}</span>
        </div>
        <div class="kpi-value">${escapeHtml(value)}</div>
        <div class="kpi-foot">${escapeHtml(footnote)}</div>
      </article>
    `;
  }

  function getStatusBadgeClass(status) {
    if (status === "Completed") return "badge-done";
    if (status === "In Progress") return "badge-blue";
    return "badge-lavender";
  }

  // View Renderers
  function renderDashboard() {
    const metrics = getTaskMetrics();

    const welcomeCopy = document.getElementById("dashboardWelcomeCopy");
    if (welcomeCopy) {
      welcomeCopy.textContent =
        metrics.open === 0
          ? "All your saved academic tasks are completed. Great job staying ahead!"
          : `You have ${metrics.open} open task${metrics.open === 1 ? "" : "s"} across your 6 subjects, with ${metrics.overdue + metrics.dueToday} urgent item${metrics.overdue + metrics.dueToday === 1 ? "" : "s"} needing attention.`;
    }

    const kpiGrid = document.getElementById("dashboardKpiGrid");
    if (kpiGrid) {
      kpiGrid.innerHTML = [
        renderKpiCard(
          "Total Assignments",
          metrics.total,
          "Across all categories",
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>'
        ),
        renderKpiCard(
          "Pending",
          metrics.pending + metrics.inProgress,
          `${metrics.inProgress} currently in progress`,
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'
        ),
        renderKpiCard(
          "Completed",
          metrics.completed,
          "Finished submissions",
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>'
        ),
        renderKpiCard(
          "Upcoming Deadlines",
          metrics.upcomingWeek + metrics.overdue,
          `${metrics.overdue} overdue • ${metrics.dueToday} due today`,
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>'
        ),
        renderKpiCard(
          "Academic Progress",
          `${metrics.completionPct}%`,
          "Overall semester completion",
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>'
        )
      ].join("");
    }

    const focusContainer = document.getElementById("todaysFocusList");
    if (focusContainer) {
      const focusTasks = getPrioritisedOpenTasks().slice(0, 4);
      focusContainer.innerHTML = focusTasks.length
        ? `<div class="focus-list">${focusTasks
            .map((task) => {
              const isUrgent = getDayDiffFromToday(task.dueDate) <= 0;
              return `
                <article class="focus-item">
                  <div class="focus-item-top">
                    <div class="task-badges">
                      <span class="badge badge-lavender">${escapeHtml(task.subject)}</span>
                      <span class="badge badge-blue">${escapeHtml(task.category)}</span>
                      <span class="badge priority-${escapeHtml(task.priority)}">${escapeHtml(task.priority)}</span>
                      ${task.isDemo ? '<span class="badge badge-demo">DEMO DATA</span>' : ""}
                    </div>
                    <button type="button" class="icon-btn" data-action="quick-complete" data-id="${escapeHtml(task.id)}">
                      Mark Done
                    </button>
                  </div>
                  <h3 class="task-title">${escapeHtml(task.title)}</h3>
                  <div class="task-due-meta ${isUrgent ? "is-urgent" : ""}">
                    ${escapeHtml(formatRelativeDue(task.dueDate, task.status, task.dueTime))}
                  </div>
                </article>
              `;
            })
            .join("")}</div>`
        : `<div class="empty-state">Nothing pending in Today&rsquo;s Focus! Add a new task whenever you&rsquo;re ready.</div>`;
    }

    const aiSummary = document.getElementById("dashboardAiSummary");
    if (aiSummary) {
      const top = getPrioritisedOpenTasks()[0];
      aiSummary.textContent = top
        ? `Suggested next step: "${top.title}" (${top.subject}) — ${formatRelativeDue(top.dueDate, top.status)}. Tap any prompt below to chat with ADAPTIX AI.`
        : "You're all caught up on saved tasks! Tap a prompt below to check your progress with ADAPTIX AI.";
    }

    const subjectsGrid = document.getElementById("dashboardSubjectsGrid");
    if (subjectsGrid) {
      subjectsGrid.innerHTML = SUBJECTS.map((subject) => {
        const subTasks = state.tasks.filter((t) => t.subject === subject);
        const doneCount = subTasks.filter((t) => t.status === "Completed").length;
        const openCount = subTasks.length - doneCount;
        const pct = subTasks.length ? Math.round((doneCount / subTasks.length) * 100) : 0;

        return `
          <button type="button" class="subject-card" data-action="open-subject-tasks" data-subject="${escapeHtml(subject)}">
            <div class="subject-card-top">
              <span class="subject-name">${escapeHtml(subject)}</span>
              <span class="badge badge-lavender">${pct}%</span>
            </div>
            <div class="progress-track" aria-hidden="true">
              <div class="progress-fill" style="width: ${pct}%"></div>
            </div>
            <div class="subject-stats">
              ${openCount} open &bull; ${doneCount} completed
            </div>
          </button>
        `;
      }).join("");
    }
  }

  function renderTasksView() {
    const container = document.getElementById("tasksListContainer");
    const summary = document.getElementById("tasksFilterSummary");
    if (!container) return;

    const search = state.filters.taskSearch.trim().toLowerCase();
    const subj = state.filters.taskSubject;
    const cat = state.filters.taskCategory;
    const st = state.filters.taskStatus;
    const sortBy = state.filters.taskSort;

    let filtered = state.tasks.filter((task) => {
      const matchesSearch =
        !search ||
        task.title.toLowerCase().includes(search) ||
        (task.description || "").toLowerCase().includes(search) ||
        task.subject.toLowerCase().includes(search);
      const matchesSubj = subj === "ALL" || task.subject === subj;
      const matchesCat = cat === "ALL" || task.category === cat;
      const matchesStatus = st === "ALL" || task.status === st;
      return matchesSearch && matchesSubj && matchesCat && matchesStatus;
    });

    filtered = [...filtered].sort((a, b) => {
      if (sortBy === "deadline-desc") return b.dueDate.localeCompare(a.dueDate);
      if (sortBy === "priority") {
        const diffP = (PRIORITY_WEIGHT[b.priority] || 0) - (PRIORITY_WEIGHT[a.priority] || 0);
        return diffP !== 0 ? diffP : a.dueDate.localeCompare(b.dueDate);
      }
      return a.dueDate.localeCompare(b.dueDate);
    });

    if (summary) {
      summary.textContent = `Showing ${filtered.length} of ${state.tasks.length} academic tasks`;
    }

    if (!filtered.length) {
      container.innerHTML = `<div class="empty-state">No academic tasks match your current filters. Use the form above to add a task or reset filters.</div>`;
      return;
    }

    container.innerHTML = filtered
      .map((task) => {
        const isCompleted = task.status === "Completed";
        const isUrgent = !isCompleted && getDayDiffFromToday(task.dueDate) <= 0;

        return `
          <article class="task-card ${isCompleted ? "is-completed" : ""}">
            <div class="task-card-top">
              <div class="task-badges">
                <span class="badge badge-lavender">${escapeHtml(task.subject)}</span>
                <span class="badge badge-blue">${escapeHtml(task.category)}</span>
                <span class="badge priority-${escapeHtml(task.priority)}">${escapeHtml(task.priority)} Priority</span>
                <span class="badge ${getStatusBadgeClass(task.status)}">${escapeHtml(task.status)}</span>
                ${task.isDemo ? '<span class="badge badge-demo">DEMO DATA</span>' : ""}
              </div>
              <div class="task-controls">
                <button type="button" class="icon-btn" data-action="edit-task" data-id="${escapeHtml(task.id)}">Edit</button>
                <button type="button" class="icon-btn icon-btn-danger" data-action="delete-task" data-id="${escapeHtml(task.id)}">Delete</button>
              </div>
            </div>

            <h3 class="task-title">${escapeHtml(task.title)}</h3>
            ${task.description ? `<p class="task-desc">${escapeHtml(task.description)}</p>` : ""}

            <div class="task-footer">
              <span class="task-due-meta ${isUrgent ? "is-urgent" : ""}">
                ${escapeHtml(formatRelativeDue(task.dueDate, task.status, task.dueTime))}
              </span>
              <select class="inline-select" data-action="change-status" data-id="${escapeHtml(task.id)}" aria-label="Change status for ${escapeHtml(task.title)}">
                ${["Pending", "In Progress", "Completed"]
                  .map(
                    (opt) =>
                      `<option value="${escapeHtml(opt)}" ${opt === task.status ? "selected" : ""}>${escapeHtml(opt)}</option>`
                  )
                  .join("")}
              </select>
            </div>
          </article>
        `;
      })
      .join("");
  }

  function renderDeadlineBucket(containerId, badgeId, tasks, emptyMessage, urgentTone = false) {
    const container = document.getElementById(containerId);
    const badge = document.getElementById(badgeId);
    if (badge) badge.textContent = String(tasks.length);
    if (!container) return;

    if (!tasks.length) {
      container.innerHTML = `<div class="empty-state">${escapeHtml(emptyMessage)}</div>`;
      return;
    }

    container.innerHTML = `<div class="focus-list">${tasks
      .map(
        (task) => `
        <article class="focus-item">
          <div class="focus-item-top">
            <div class="task-badges">
              <span class="badge badge-lavender">${escapeHtml(task.subject)}</span>
              <span class="badge priority-${escapeHtml(task.priority)}">${escapeHtml(task.priority)}</span>
              ${task.isDemo ? '<span class="badge badge-demo">DEMO DATA</span>' : ""}
            </div>
            <button type="button" class="icon-btn" data-action="quick-complete" data-id="${escapeHtml(task.id)}">
              Mark Done
            </button>
          </div>
          <h3 class="task-title">${escapeHtml(task.title)}</h3>
          <div class="task-due-meta ${urgentTone ? "is-urgent" : ""}">
            ${escapeHtml(task.category)} &bull; ${escapeHtml(formatRelativeDue(task.dueDate, task.status, task.dueTime))}
          </div>
        </article>
      `
      )
      .join("")}</div>`;
  }

  function renderDeadlinesView() {
    const open = state.tasks
      .filter((t) => t.status !== "Completed")
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    const overdue = open.filter((t) => getDayDiffFromToday(t.dueDate) < 0);
    const today = open.filter((t) => getDayDiffFromToday(t.dueDate) === 0);
    const tomorrow = open.filter((t) => getDayDiffFromToday(t.dueDate) === 1);
    const thisWeek = open.filter((t) => {
      const diff = getDayDiffFromToday(t.dueDate);
      return diff >= 2 && diff <= 7;
    });

    const summaryGrid = document.getElementById("deadlineSummaryGrid");
    if (summaryGrid) {
      summaryGrid.innerHTML = [
        renderKpiCard(
          "Overdue",
          overdue.length,
          "Past due date",
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
        ),
        renderKpiCard(
          "Due Today",
          today.length,
          "Finish before midnight",
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'
        ),
        renderKpiCard(
          "Due Tomorrow",
          tomorrow.length,
          "Next day submissions",
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>'
        ),
        renderKpiCard(
          "Due This Week",
          thisWeek.length,
          "Within 2–7 days",
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
        )
      ].join("");
    }

    renderDeadlineBucket("overdueTasksList", "overdueBadge", overdue, "No overdue tasks. Nice work!", true);
    renderDeadlineBucket("dueTodayTasksList", "dueTodayBadge", today, "Nothing due today.", true);
    renderDeadlineBucket("dueTomorrowTasksList", "dueTomorrowBadge", tomorrow, "Nothing due tomorrow.", false);
    renderDeadlineBucket("dueWeekTasksList", "dueWeekBadge", thisWeek, "No additional deadlines this week.", false);
  }

  function renderChatMessages() {
    const box = document.getElementById("chatMessages");
    if (!box) return;
    box.innerHTML = state.chatMessages
      .map(
        (m) => `
        <div class="chat-bubble ${m.sender === "user" ? "is-user" : "is-bot"}">
          ${escapeHtml(m.text)}
        </div>
      `
      )
      .join("");
    box.scrollTop = box.scrollHeight;
  }

  async function submitChatPrompt(promptText) {
    const clean = promptText.trim();
    if (!clean) return;

    state.chatMessages.push({
      id: `u-${Date.now()}`,
      sender: "user",
      text: clean
    });

    const replyText = await AdaptixBotEngine.sendMessage(clean, {
      tasks: state.tasks,
      documents: state.documents
    });

    state.chatMessages.push({
      id: `b-${Date.now() + 1}`,
      sender: "bot",
      text: replyText
    });

    storageSave(STORAGE_KEYS.chat, state.chatMessages);
    renderChatMessages();
  }

  function renderDocumentsView() {
    const list = document.getElementById("documentsList");
    const countLabel = document.getElementById("docsCountLabel");
    if (!list) return;

    const filterCat = state.filters.docCategory;
    const filtered = state.documents.filter(
      (doc) => filterCat === "ALL" || doc.category === filterCat
    );

    if (countLabel) {
      countLabel.textContent = `${state.documents.length} document${state.documents.length === 1 ? "" : "s"} saved locally`;
    }

    if (!filtered.length) {
      list.innerHTML = `<div class="empty-state">No documents uploaded${filterCat !== "ALL" ? ` under "${escapeHtml(filterCat)}"` : " yet"}. Select a file on the left to save its record.</div>`;
      return;
    }

    list.innerHTML = filtered
      .map(
        (doc) => `
        <article class="doc-item">
          <div class="doc-item-top">
            <div class="task-badges">
              <span class="badge badge-blue">${escapeHtml(doc.category)}</span>
              <span class="badge badge-lavender">${escapeHtml(doc.subject)}</span>
            </div>
            <button type="button" class="icon-btn icon-btn-danger" data-action="delete-doc" data-id="${escapeHtml(doc.id)}">
              Remove
            </button>
          </div>
          <h3 class="task-title">${escapeHtml(doc.name)}</h3>
          <div class="task-due-meta">
            Uploaded ${escapeHtml(formatDisplayDate(doc.uploadedAt))} &bull; ${escapeHtml(doc.sizeLabel)}
          </div>
        </article>
      `
      )
      .join("");
  }

  function renderProgressView() {
    const metrics = getTaskMetrics();

    const kpiGrid = document.getElementById("progressKpiGrid");
    if (kpiGrid) {
      kpiGrid.innerHTML = [
        renderKpiCard(
          "Overall Completion",
          `${metrics.completionPct}%`,
          `${metrics.completed} of ${metrics.total} tasks completed`,
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>'
        ),
        renderKpiCard(
          "Completed Tasks",
          metrics.completed,
          "Finished coursework",
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
        ),
        renderKpiCard(
          "In Progress",
          metrics.inProgress,
          "Currently working on",
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'
        ),
        renderKpiCard(
          "Pending Tasks",
          metrics.pending,
          "Not started yet",
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>'
        )
      ].join("");
    }

    const ringWrap = document.getElementById("overallProgressChart");
    if (ringWrap) {
      const radius = 58;
      const circumference = 2 * Math.PI * radius;
      const offset = circumference - (metrics.completionPct / 100) * circumference;

      ringWrap.innerHTML = `
        <svg class="ring-svg" viewBox="0 0 150 150" role="img" aria-label="Overall academic completion ${metrics.completionPct} percent">
          <defs>
            <linearGradient id="adaptixRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#624de3" />
              <stop offset="100%" stop-color="#3b82f6" />
            </linearGradient>
          </defs>
          <circle class="ring-bg" cx="75" cy="75" r="${radius}"></circle>
          <circle class="ring-fg" cx="75" cy="75" r="${radius}" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"></circle>
          <text class="ring-center-text" x="75" y="74" text-anchor="middle" dominant-baseline="middle">${metrics.completionPct}%</text>
          <text class="ring-center-sub" x="75" y="94" text-anchor="middle">Completed</text>
        </svg>
        <div class="ring-legend">
          <div><strong>Completed:</strong> ${metrics.completed}</div>
          <div><strong>In Progress:</strong> ${metrics.inProgress}</div>
          <div><strong>Pending:</strong> ${metrics.pending}</div>
          <div><strong>Total Tracked:</strong> ${metrics.total}</div>
        </div>
      `;
    }

    const subjectBars = document.getElementById("subjectProgressBars");
    if (subjectBars) {
      subjectBars.innerHTML = SUBJECTS.map((subject) => {
        const subTasks = state.tasks.filter((t) => t.subject === subject);
        const done = subTasks.filter((t) => t.status === "Completed").length;
        const pct = subTasks.length ? Math.round((done / subTasks.length) * 100) : 0;
        return `
          <div class="subject-progress-row">
            <div class="subject-progress-head">
              <span>${escapeHtml(subject)}</span>
              <span>${done}/${subTasks.length} (${pct}%)</span>
            </div>
            <div class="progress-track">
              <div class="progress-fill" style="width: ${pct}%"></div>
            </div>
          </div>
        `;
      }).join("");
    }

    const catChart = document.getElementById("categoryProgressChart");
    if (catChart) {
      catChart.innerHTML = TASK_CATEGORIES.map((category) => {
        const catTasks = state.tasks.filter((t) => t.category === category);
        const done = catTasks.filter((t) => t.status === "Completed").length;
        const pct = catTasks.length ? Math.round((done / catTasks.length) * 100) : 0;
        return `
          <div class="category-stat-card">
            <div class="category-stat-name">${escapeHtml(category)}</div>
            <div class="progress-track">
              <div class="progress-fill" style="width: ${pct}%"></div>
            </div>
            <div class="category-stat-nums">${done} done / ${catTasks.length} total</div>
          </div>
        `;
      }).join("");
    }
  }

  // ============================================================
  // Level 1 Browser Notification & Deadline Reminder Engine
  // ============================================================
  function getReminderStage(task, now = new Date()) {
    if (!task || (task.status !== "Pending" && task.status !== "In Progress")) {
      return null;
    }
    const deadline = getDeadlineDate(task);
    if (!deadline) return null;

    const msRemaining = deadline.getTime() - now.getTime();
    const hourMs = 3600000;

    if (msRemaining <= 0) return "overdue";
    if (msRemaining <= 6 * hourMs) return "6h";
    if (msRemaining <= 24 * hourMs) return "24h";
    if (msRemaining <= 72 * hourMs) return "3d";
    return null;
  }

  function buildReminderKey(task, stage) {
    return `${task.id}::${task.dueDate}::${task.dueTime || "23:59"}::${stage}`;
  }

  function formatNotifTimestamp(isoString) {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return "Just now";
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function dispatchBrowserNotification(title, body, tag) {
    if (!state.notifSettings.enabled) return;
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    try {
      new Notification(title, { body, tag });
    } catch (_err) {
      // Gracefully fall back to in-app bell history on browsers requiring ServiceWorker
    }
  }

  function updateNotificationDashboardUI() {
    const btn = document.getElementById("enableNotificationsBtn");
    const badge = document.getElementById("notifStatusBadge");
    const text = document.getElementById("notifStatusText");
    if (!btn || !badge || !text) return;

    if (!("Notification" in window)) {
      badge.textContent = "In-App Only";
      badge.className = "badge badge-blue";
      text.textContent = "Browser popups aren't supported here; in-app bell reminders remain active while ADAPTIX is open.";
      btn.textContent = "Browser Popups Unsupported";
      btn.disabled = true;
      return;
    }

    const perm = Notification.permission;
    btn.disabled = false;

    if (perm === "denied") {
      if (state.notifSettings.enabled) {
        state.notifSettings.enabled = false;
        storageSave(STORAGE_KEYS.notifSettings, state.notifSettings);
      }
      badge.textContent = "Blocked in Browser";
      badge.className = "badge badge-urgent";
      text.textContent = "Permission was denied. Enable notifications in browser site settings for popups; in-app bell reminders still work while ADAPTIX is open.";
      btn.textContent = "Notifications Blocked";
      return;
    }

    if (perm === "granted" && state.notifSettings.enabled) {
      badge.textContent = "Enabled";
      badge.className = "badge badge-done";
      text.textContent = "Browser & bell reminders active while ADAPTIX is open in your browser.";
      btn.textContent = "Pause Browser Alerts";
      return;
    }

    if (perm === "granted" && !state.notifSettings.enabled) {
      badge.textContent = "Paused";
      badge.className = "badge badge-today";
      text.textContent = "Browser alerts are paused. Click to resume deadline popups while ADAPTIX is open.";
      btn.textContent = "Enable Notifications";
      return;
    }

    badge.textContent = "Not Enabled";
    badge.className = "badge badge-lavender";
    text.textContent = "Click Enable Notifications for deadline alerts (3 days, 24h, 6h & overdue) while ADAPTIX is open.";
    btn.textContent = "Enable Notifications";
  }

  function renderNotificationUI() {
    const unreadCount = state.notifHistory.filter((item) => !item.read).length;

    const badge = document.getElementById("notifUnreadBadge");
    if (badge) {
      badge.hidden = unreadCount === 0;
      badge.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
    }

    const subtitle = document.getElementById("notifPanelSubtitle");
    if (subtitle) {
      subtitle.textContent = `${unreadCount} unread reminder${unreadCount === 1 ? "" : "s"}`;
    }

    const list = document.getElementById("notifHistoryList");
    if (list) {
      if (!state.notifHistory.length) {
        list.innerHTML = `<div class="empty-state">No deadline reminders logged yet. Reminders appear automatically for Pending and In Progress tasks within 3 days, 24h, 6h, or overdue.</div>`;
      } else {
        list.innerHTML = state.notifHistory
          .map((item) => {
            const meta = REMINDER_STAGE_META[item.stage] || REMINDER_STAGE_META["3d"];
            return `
              <article class="notif-item ${item.read ? "" : "is-unread"}" data-action="open-notif-item" data-id="${escapeHtml(item.id)}">
                <div class="notif-item-top">
                  <div class="task-badges">
                    <span class="badge ${escapeHtml(meta.badgeClass)}">${escapeHtml(meta.label)}</span>
                    <span class="badge badge-lavender">${escapeHtml(item.subject)}</span>
                  </div>
                  ${item.read ? "" : '<span class="notif-unread-dot" aria-label="Unread"></span>'}
                </div>
                <h3 class="notif-item-title">${escapeHtml(item.title)}</h3>
                <div class="notif-item-meta">${escapeHtml(item.message)}</div>
                <div class="notif-item-meta">Triggered ${escapeHtml(formatNotifTimestamp(item.createdAt))}</div>
              </article>
            `;
          })
          .join("");
      }
    }

    updateNotificationDashboardUI();
  }

  function toggleNotifPanel(isOpen) {
    const panel = document.getElementById("notificationPanel");
    const backdrop = document.getElementById("notifBackdrop");
    const bellBtn = document.getElementById("notificationBellBtn");
    if (!panel || !backdrop || !bellBtn) return;

    state.notifPanelOpen = isOpen;
    panel.hidden = !isOpen;
    backdrop.classList.toggle("is-visible", isOpen);
    bellBtn.setAttribute("aria-expanded", String(isOpen));
    document.body.classList.toggle("drawer-open", isOpen);

    if (isOpen) {
      renderNotificationUI();
    }
  }

  function checkDeadlines({ showNewToast = false, now = new Date() } = {}) {
    const sentSet = new Set(state.notifSettings.sentKeys || []);
    const newlyTriggered = [];

    state.tasks.forEach((task) => {
      const stage = getReminderStage(task, now);
      if (!stage) return;

      const dedupKey = buildReminderKey(task, stage);
      if (sentSet.has(dedupKey)) return;

      sentSet.add(dedupKey);
      const stageMeta = REMINDER_STAGE_META[stage];
      const dueStr = `${formatDisplayDate(task.dueDate)}${task.dueTime && task.dueTime !== "23:59" ? ` at ${task.dueTime}` : ""}`;
      const message = `${stageMeta.prefix} • Due ${dueStr}`;

      const entry = {
        id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        taskId: task.id,
        stage,
        title: task.title,
        subject: task.subject,
        message,
        createdAt: now.toISOString(),
        read: false
      };

      newlyTriggered.push({ entry, dedupKey, stageMeta });
    });

    if (newlyTriggered.length) {
      state.notifSettings.sentKeys = Array.from(sentSet).slice(-400);
      state.notifHistory = [
        ...newlyTriggered.map((n) => n.entry),
        ...state.notifHistory
      ].slice(0, 100);

      storageSave(STORAGE_KEYS.notifSettings, state.notifSettings);
      storageSave(STORAGE_KEYS.notifHistory, state.notifHistory);

      newlyTriggered.forEach(({ entry, dedupKey, stageMeta }) => {
        dispatchBrowserNotification(
          `ADAPTIX: ${stageMeta.label} — ${entry.subject}`,
          `${entry.title} (${entry.message})`,
          dedupKey
        );
      });

      if (showNewToast) {
        showToast(
          newlyTriggered.length === 1
            ? `Reminder: ${newlyTriggered[0].entry.title} (${newlyTriggered[0].stageMeta.label})`
            : `${newlyTriggered.length} new deadline reminders logged`
        );
      }
    }

    renderNotificationUI();
    return newlyTriggered.length;
  }

  async function handleEnableNotificationsClick() {
    if (!("Notification" in window)) {
      updateNotificationDashboardUI();
      showToast("This browser does not support Notification popups");
      return;
    }

    if (Notification.permission === "denied") {
      updateNotificationDashboardUI();
      showToast("Permission is blocked in browser settings; bell alerts stay active");
      return;
    }

    if (Notification.permission === "granted") {
      state.notifSettings.enabled = !state.notifSettings.enabled;
      storageSave(STORAGE_KEYS.notifSettings, state.notifSettings);
      updateNotificationDashboardUI();

      if (state.notifSettings.enabled) {
        dispatchBrowserNotification(
          "ADAPTIX Notifications Enabled",
          "You will receive deadline reminders while ADAPTIX is open.",
          "adaptix-enabled-confirm"
        );
        checkDeadlines({ showNewToast: false });
        showToast("Browser notifications enabled");
      } else {
        showToast("Browser notification popups paused");
      }
      return;
    }

    try {
      const result = await Notification.requestPermission();
      if (result === "granted") {
        state.notifSettings.enabled = true;
        storageSave(STORAGE_KEYS.notifSettings, state.notifSettings);
        dispatchBrowserNotification(
          "ADAPTIX Notifications Enabled",
          "You will receive deadline reminders while ADAPTIX is open.",
          "adaptix-enabled-confirm"
        );
        checkDeadlines({ showNewToast: false });
        showToast("Browser notifications enabled");
      } else {
        state.notifSettings.enabled = false;
        storageSave(STORAGE_KEYS.notifSettings, state.notifSettings);
        updateNotificationDashboardUI();
        showToast("Permission not granted — in-app bell alerts stay active");
      }
    } catch (_err) {
      updateNotificationDashboardUI();
      showToast("Could not request browser notification permission");
    }
  }

  function renderActiveView() {
    updateNavBadges();
    switch (state.activeView) {
      case "dashboard":
        renderDashboard();
        break;
      case "tasks":
        renderTasksView();
        break;
      case "deadlines":
        renderDeadlinesView();
        break;
      case "assistant":
        renderChatMessages();
        break;
      case "documents":
        renderDocumentsView();
        break;
      case "progress":
        renderProgressView();
        break;
      default:
        renderDashboard();
    }
  }

  // Form Population & Task Edit Helpers
  function populateSelectOptions() {
    const subjectOptions = SUBJECTS.map(
      (s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`
    ).join("");
    const categoryOptions = TASK_CATEGORIES.map(
      (c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`
    ).join("");

    const taskSubject = document.getElementById("taskSubject");
    const taskCategory = document.getElementById("taskCategory");
    const docSubject = document.getElementById("docSubject");
    const filterSubject = document.getElementById("taskFilterSubject");
    const filterCategory = document.getElementById("taskFilterCategory");

    if (taskSubject) taskSubject.innerHTML = subjectOptions;
    if (docSubject) docSubject.innerHTML = subjectOptions;
    if (taskCategory) taskCategory.innerHTML = categoryOptions;
    if (filterSubject) filterSubject.innerHTML = `<option value="ALL">All Subjects</option>${subjectOptions}`;
    if (filterCategory) filterCategory.innerHTML = `<option value="ALL">All Categories</option>${categoryOptions}`;
  }

  function resetTaskFormMode() {
    const form = document.getElementById("taskForm");
    const editId = document.getElementById("taskEditId");
    const heading = document.getElementById("taskFormHeading");
    const submitBtn = document.getElementById("taskSubmitBtn");
    const cancelBtn = document.getElementById("cancelEditTaskBtn");
    const dueInput = document.getElementById("taskDueDate");
    const dueTimeInput = document.getElementById("taskDueTime");

    if (form) form.reset();
    if (editId) editId.value = "";
    if (heading) heading.textContent = "Add Academic Task";
    if (submitBtn) submitBtn.textContent = "Save Task";
    if (cancelBtn) cancelBtn.hidden = true;
    if (dueInput) dueInput.value = addDaysIso(2);
    if (dueTimeInput) dueTimeInput.value = "23:59";
    const priorityEl = document.getElementById("taskPriority");
    const statusEl = document.getElementById("taskStatus");
    if (priorityEl) priorityEl.value = "Medium";
    if (statusEl) statusEl.value = "Pending";
  }

  function startEditingTask(taskId) {
    const task = state.tasks.find((t) => t.id === taskId);
    if (!task) return;

    document.getElementById("taskEditId").value = task.id;
    document.getElementById("taskTitle").value = task.title;
    document.getElementById("taskSubject").value = task.subject;
    document.getElementById("taskCategory").value = task.category;
    document.getElementById("taskDueDate").value = task.dueDate;
    const dueTimeInput = document.getElementById("taskDueTime");
    if (dueTimeInput) dueTimeInput.value = task.dueTime || "23:59";
    document.getElementById("taskPriority").value = task.priority;
    document.getElementById("taskStatus").value = task.status;
    document.getElementById("taskDescription").value = task.description || "";

    document.getElementById("taskFormHeading").textContent = "Edit Academic Task";
    document.getElementById("taskSubmitBtn").textContent = "Update Task";
    document.getElementById("cancelEditTaskBtn").hidden = false;

    document.getElementById("taskTitle").focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Event Binding
  function bindEvents() {
    // Sidebar navigation
    const sidebarNav = document.getElementById("sidebarNav");
    if (sidebarNav) {
      sidebarNav.addEventListener("click", (event) => {
        const navBtn = event.target.closest(".nav-item[data-view]");
        if (navBtn) navigateTo(navBtn.dataset.view);
      });
    }

    // Mobile bottom navigation
    const mobileBottomNav = document.getElementById("mobileBottomNav");
    if (mobileBottomNav) {
      mobileBottomNav.addEventListener("click", (event) => {
        const navBtn = event.target.closest(".bottom-nav-item[data-view]");
        if (navBtn) {
          navigateTo(navBtn.dataset.view);
          return;
        }
        if (event.target.closest('[data-action="open-drawer"]')) {
          setMobileDrawerOpen(true);
        }
      });
    }

    // Mobile drawer controls
    document.getElementById("mobileMenuBtn")?.addEventListener("click", () => setMobileDrawerOpen(true));
    document.getElementById("sidebarCloseBtn")?.addEventListener("click", () => setMobileDrawerOpen(false));
    document.getElementById("sidebarBackdrop")?.addEventListener("click", () => setMobileDrawerOpen(false));
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        setMobileDrawerOpen(false);
        toggleNotifPanel(false);
      }
    });

    // Notification controls (Permission requested ONLY when button is clicked)
    document.getElementById("enableNotificationsBtn")?.addEventListener("click", handleEnableNotificationsClick);
    document.getElementById("notificationBellBtn")?.addEventListener("click", () => {
      toggleNotifPanel(!state.notifPanelOpen);
    });
    document.getElementById("closeNotifPanelBtn")?.addEventListener("click", () => toggleNotifPanel(false));
    document.getElementById("notifBackdrop")?.addEventListener("click", () => toggleNotifPanel(false));

    document.getElementById("markAllNotifReadBtn")?.addEventListener("click", () => {
      state.notifHistory = state.notifHistory.map((item) => ({ ...item, read: true }));
      storageSave(STORAGE_KEYS.notifHistory, state.notifHistory);
      renderNotificationUI();
      showToast("All notifications marked as read");
    });

    document.getElementById("clearNotifHistoryBtn")?.addEventListener("click", () => {
      state.notifHistory = [];
      storageSave(STORAGE_KEYS.notifHistory, state.notifHistory);
      renderNotificationUI();
      showToast("Notification history cleared");
    });

    document.getElementById("notifHistoryList")?.addEventListener("click", (event) => {
      const card = event.target.closest('[data-action="open-notif-item"]');
      if (!card) return;
      const notifId = card.dataset.id;
      state.notifHistory = state.notifHistory.map((item) =>
        item.id === notifId ? { ...item, read: true } : item
      );
      storageSave(STORAGE_KEYS.notifHistory, state.notifHistory);
      renderNotificationUI();
      toggleNotifPanel(false);
      navigateTo("deadlines");
    });

    // Global delegated clicks (in-page navigation, quick complete, subject card drilldown, AI prompt chips)
    document.addEventListener("click", (event) => {
      const navTarget = event.target.closest("[data-nav-target]");
      if (navTarget) {
        navigateTo(navTarget.dataset.navTarget);
        return;
      }

      const brandLink = event.target.closest(".brand[data-nav]");
      if (brandLink) {
        event.preventDefault();
        navigateTo(brandLink.dataset.nav);
        return;
      }

      const quickCompleteBtn = event.target.closest('button[data-action="quick-complete"]');
      if (quickCompleteBtn) {
        const taskId = quickCompleteBtn.dataset.id;
        state.tasks = state.tasks.map((t) =>
          t.id === taskId ? { ...t, status: "Completed" } : t
        );
        storageSave(STORAGE_KEYS.tasks, state.tasks);
        checkDeadlines({ showNewToast: false });
        renderActiveView();
        showToast("Task marked as Completed");
        return;
      }

      const subjectBtn = event.target.closest('button[data-action="open-subject-tasks"]');
      if (subjectBtn) {
        const subject = subjectBtn.dataset.subject;
        state.filters.taskSubject = subject;
        const filterEl = document.getElementById("taskFilterSubject");
        if (filterEl) filterEl.value = subject;
        navigateTo("tasks");
        return;
      }

      const dashPromptBtn = event.target.closest("[data-ai-prompt]");
      if (dashPromptBtn) {
        const prompt = dashPromptBtn.dataset.aiPrompt;
        navigateTo("assistant");
        submitChatPrompt(prompt);
        return;
      }

      const chatSuggestBtn = event.target.closest("[data-chat-suggest]");
      if (chatSuggestBtn) {
        submitChatPrompt(chatSuggestBtn.dataset.chatSuggest);
      }
    });

    // Topbar Quick Buttons
    document.getElementById("quickAddTaskBtn")?.addEventListener("click", () => {
      navigateTo("tasks");
      resetTaskFormMode();
      document.getElementById("taskTitle")?.focus();
    });

    document.getElementById("quickAskAiBtn")?.addEventListener("click", () => {
      navigateTo("assistant");
      document.getElementById("chatInput")?.focus();
    });

    // Restore Demo Tasks
    document.getElementById("resetDemoBtn")?.addEventListener("click", () => {
      state.tasks = buildDemoTasks();
      storageSave(STORAGE_KEYS.tasks, state.tasks);
      state.filters.taskSearch = "";
      state.filters.taskSubject = "ALL";
      state.filters.taskCategory = "ALL";
      state.filters.taskStatus = "ALL";
      document.getElementById("taskSearchInput").value = "";
      document.getElementById("taskFilterSubject").value = "ALL";
      document.getElementById("taskFilterCategory").value = "ALL";
      document.getElementById("taskFilterStatus").value = "ALL";
      resetTaskFormMode();
      checkDeadlines({ showNewToast: false });
      renderActiveView();
      showToast("Demo academic tasks restored");
    });

    // Task Form Add / Edit
    const taskForm = document.getElementById("taskForm");
    if (taskForm) {
      taskForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const editId = document.getElementById("taskEditId").value;
        const title = document.getElementById("taskTitle").value.trim();
        const subject = document.getElementById("taskSubject").value;
        const category = document.getElementById("taskCategory").value;
        const dueDate = document.getElementById("taskDueDate").value;
        const dueTime = document.getElementById("taskDueTime")?.value || "23:59";
        const priority = document.getElementById("taskPriority").value;
        const status = document.getElementById("taskStatus").value;
        const description = document.getElementById("taskDescription").value.trim();

        if (!title || !dueDate) return;

        if (editId) {
          state.tasks = state.tasks.map((t) =>
            t.id === editId
              ? { ...t, title, subject, category, dueDate, dueTime, priority, status, description, isDemo: false }
              : t
          );
          showToast("Academic task updated");
        } else {
          state.tasks.unshift({
            id: `task-${Date.now()}`,
            title,
            subject,
            category,
            dueDate,
            dueTime,
            priority,
            status,
            description,
            isDemo: false
          });
          showToast("Academic task added");
        }

        storageSave(STORAGE_KEYS.tasks, state.tasks);
        resetTaskFormMode();
        checkDeadlines({ showNewToast: true });
        renderActiveView();
      });
    }

    document.getElementById("cancelEditTaskBtn")?.addEventListener("click", resetTaskFormMode);

    // Task List Actions (Edit, Delete, Status)
    const tasksList = document.getElementById("tasksListContainer");
    if (tasksList) {
      tasksList.addEventListener("click", (event) => {
        const editBtn = event.target.closest('button[data-action="edit-task"]');
        if (editBtn) {
          startEditingTask(editBtn.dataset.id);
          return;
        }
        const delBtn = event.target.closest('button[data-action="delete-task"]');
        if (delBtn) {
          const id = delBtn.dataset.id;
          state.tasks = state.tasks.filter((t) => t.id !== id);
          storageSave(STORAGE_KEYS.tasks, state.tasks);
          if (document.getElementById("taskEditId").value === id) {
            resetTaskFormMode();
          }
          checkDeadlines({ showNewToast: false });
          renderActiveView();
          showToast("Task deleted");
        }
      });

      tasksList.addEventListener("change", (event) => {
        const statusSelect = event.target.closest('select[data-action="change-status"]');
        if (!statusSelect) return;
        const id = statusSelect.dataset.id;
        state.tasks = state.tasks.map((t) =>
          t.id === id ? { ...t, status: statusSelect.value } : t
        );
        storageSave(STORAGE_KEYS.tasks, state.tasks);
        checkDeadlines({ showNewToast: true });
        renderActiveView();
        showToast(`Status changed to ${statusSelect.value}`);
      });
    }

    // Task Filters & Sorting
    const filterBindings = [
      ["taskSearchInput", "input", "taskSearch"],
      ["taskFilterSubject", "change", "taskSubject"],
      ["taskFilterCategory", "change", "taskCategory"],
      ["taskFilterStatus", "change", "taskStatus"],
      ["taskSortBy", "change", "taskSort"]
    ];
    filterBindings.forEach(([id, evt, key]) => {
      document.getElementById(id)?.addEventListener(evt, (e) => {
        state.filters[key] = e.target.value;
        renderTasksView();
      });
    });

    // ADAPTIX AI Chat
    const chatForm = document.getElementById("chatForm");
    if (chatForm) {
      chatForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const input = document.getElementById("chatInput");
        const val = input.value.trim();
        if (!val) return;
        input.value = "";
        submitChatPrompt(val);
      });
    }

    document.getElementById("clearChatBtn")?.addEventListener("click", () => {
      state.chatMessages = buildInitialChat();
      storageSave(STORAGE_KEYS.chat, state.chatMessages);
      renderChatMessages();
      showToast("Chat history cleared");
    });

    // Document Upload Form & Actions
    const docForm = document.getElementById("documentForm");
    if (docForm) {
      docForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const fileInput = document.getElementById("docFileInput");
        const category = document.getElementById("docCategory").value;
        const subject = document.getElementById("docSubject").value;

        const file = fileInput.files && fileInput.files[0];
        if (!file) {
          showToast("Please choose a file first");
          return;
        }

        state.documents.unshift({
          id: `doc-${Date.now()}`,
          name: file.name,
          category,
          subject,
          sizeLabel: formatFileSize(file.size),
          uploadedAt: toIsoDate(new Date())
        });

        storageSave(STORAGE_KEYS.documents, state.documents);
        docForm.reset();
        renderActiveView();
        showToast("Document record saved locally");
      });
    }

    document.getElementById("docFilterCategory")?.addEventListener("change", (e) => {
      state.filters.docCategory = e.target.value;
      renderDocumentsView();
    });

    document.getElementById("documentsList")?.addEventListener("click", (event) => {
      const delBtn = event.target.closest('button[data-action="delete-doc"]');
      if (!delBtn) return;
      const id = delBtn.dataset.id;
      state.documents = state.documents.filter((d) => d.id !== id);
      storageSave(STORAGE_KEYS.documents, state.documents);
      renderActiveView();
      showToast("Document record removed");
    });

    // Hash Navigation
    window.addEventListener("hashchange", () => {
      const hashView = window.location.hash.replace(/^#/, "");
      if (VIEW_META[hashView] && hashView !== state.activeView) {
        navigateTo(hashView, false);
      }
    });
  }

  function init() {
    state.tasks = storageLoad(STORAGE_KEYS.tasks, buildDemoTasks);
    state.documents = storageLoad(STORAGE_KEYS.documents, () => []);
    state.chatMessages = storageLoad(STORAGE_KEYS.chat, buildInitialChat);
    state.notifSettings = storageLoadObject(STORAGE_KEYS.notifSettings, () => ({
      enabled: false,
      sentKeys: []
    }));
    state.notifHistory = storageLoad(STORAGE_KEYS.notifHistory, () => []);

    populateSelectOptions();
    resetTaskFormMode();
    bindEvents();

    const initialHash = window.location.hash.replace(/^#/, "");
    const startView = VIEW_META[initialHash] ? initialHash : "dashboard";
    navigateTo(startView, false);

    // Check deadlines on page load, periodically while open, and when tab regains visibility
    checkDeadlines({ showNewToast: false });
    window.setInterval(() => checkDeadlines({ showNewToast: true }), 60000);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        checkDeadlines({ showNewToast: true });
      }
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
