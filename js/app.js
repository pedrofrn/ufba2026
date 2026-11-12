/**
 * AvaliaApp — Controlador principal da SPA UFBA Edital nº 007/2026 (Cargo 201).
 * Integra Banco JSON + localStorage + Cronômetro Tático + Atalhos + Redação Nota 60.
 */
(() => {
  'use strict';

  const {
    loadProgressState,
    saveProgressState,
    parseQuestionImportPayload,
    mergeQuestionBanks,
    loadCustomQuestions,
    saveCustomQuestions,
    buildProgressBackupPayload,
    parseProgressBackupPayload,
    VALID_OPTIONS
  } = window.AvaliaStorage;

  const {
    EDITAL_CONFIG,
    escapeHtml,
    buildTiroCurtoDeck,
    buildBasicosDeck,
    buildSimulado60Deck,
    filterQuestions,
    getErrorNotebookQuestions,
    computeTelemetry,
    formatDuration,
    getExamCountdown
  } = window.AvaliaEngine;

  const { createAudioController, describeAudioState } = window.AvaliaAudio || {};

  const { estimateEssayLines } = window.AvaliaEssayGuide;

  const {
    renderCountdown,
    renderExamView,
    renderTelemetryView,
    renderErrorNotebookView,
    renderEssayGuideView,
    renderSchemaExampleSnippet,
    renderAudioPlayButtonInner,
    renderAudioFeedbackButtonInner
  } = window.AvaliaUI;

  // =========================================================================
  // Estado em Memória da Aplicação
  // =========================================================================
  const app = {
    bankMetadata: (window.UFBA_DEFAULT_BANK && window.UFBA_DEFAULT_BANK.metadata) || {},
    defaultQuestions: Array.isArray(window.UFBA_DEFAULT_BANK?.questoes)
      ? window.UFBA_DEFAULT_BANK.questoes.slice()
      : [],
    externalQuestions: [],
    customQuestions: [],
    allQuestions: [],

    state: loadProgressState(),

    activeTab: 'exam', // 'exam' | 'telemetry' | 'errors' | 'essay'
    activeMode: 'tiro_curto', // 'tiro_curto' | 'basicos' | 'simulado_60' | 'filtrado'
    showFilters: false,
    filters: {
      area: 'ALL',
      topico: 'ALL',
      dificuldade: 'ALL',
      status: 'ALL',
      search: ''
    },

    deck: [],
    currentIndex: 0,
    pendingSelections: {},
    retakingIds: new Set(),

    sessionTimer: {
      presetMinutes: 30,
      durationSeconds: 30 * 60,
      remainingSeconds: 30 * 60,
      elapsedSeconds: 0,
      running: false,
      expiredNotified: false
    },
    questionElapsedSeconds: 0,

    audioController: null,

    confirmResetStep: false,
    confirmClearCustomStep: false
  };

  // Referências DOM estáticas (presentes no index.html)
  const dom = {};

  function cacheDomReferences() {
    dom.countdownEl = document.getElementById('exam-countdown');
    dom.mainWorkspace = document.getElementById('main-workspace');
    dom.navTabButtons = document.querySelectorAll('[data-tab-target]');
    dom.btnThemeToggle = document.getElementById('btn-theme-toggle');
    dom.themeIconSun = document.getElementById('theme-icon-sun');
    dom.themeIconMoon = document.getElementById('theme-icon-moon');
    dom.themeLabel = document.getElementById('theme-label');
    dom.headerBankBadge = document.getElementById('header-bank-badge');
    dom.tabErrorsBadge = document.getElementById('tab-errors-badge');
    dom.toastContainer = document.getElementById('toast-container');

    // Modais
    dom.modalImport = document.getElementById('modal-import-json');
    dom.modalBackup = document.getElementById('modal-backup');
    dom.modalShortcuts = document.getElementById('modal-shortcuts');

    // Controles do Modal de Importação JSON
    dom.importFileInput = document.getElementById('import-file-input');
    dom.importTextarea = document.getElementById('import-json-textarea');
    dom.importOverwriteCheckbox = document.getElementById('import-overwrite-checkbox');
    dom.importFeedbackBox = document.getElementById('import-feedback-box');
    dom.customCountBadge = document.getElementById('custom-count-badge');
    dom.btnExecuteImport = document.getElementById('btn-execute-import');
    dom.btnCopySchema = document.getElementById('btn-copy-schema');
    dom.btnFillSchema = document.getElementById('btn-fill-schema');
    dom.btnClearCustom = document.getElementById('btn-clear-custom');

    // Controles do Modal de Backup
    dom.backupSummaryBox = document.getElementById('backup-summary-box');
    dom.backupFileInput = document.getElementById('backup-file-input');
    dom.btnExportProgress = document.getElementById('btn-export-progress');
    dom.btnExportUnifiedBank = document.getElementById('btn-export-unified-bank');
    dom.btnResetProgress = document.getElementById('btn-reset-progress');
  }

  // =========================================================================
  // Tema Visual (Papel de Prova <-> Modo Noturno)
  // =========================================================================
  function applyTheme(theme) {
    const resolved = theme === 'dark' ? 'dark' : 'light';
    app.state.theme = resolved;
    document.body.dataset.theme = resolved;
    document.documentElement.classList.toggle('dark', resolved === 'dark');

    if (dom.themeIconSun && dom.themeIconMoon && dom.themeLabel) {
      if (resolved === 'dark') {
        dom.themeIconSun.classList.remove('hidden');
        dom.themeIconMoon.classList.add('hidden');
        dom.themeLabel.textContent = 'Papel de Prova';
      } else {
        dom.themeIconSun.classList.add('hidden');
        dom.themeIconMoon.classList.remove('hidden');
        dom.themeLabel.textContent = 'Modo Noturno';
      }
    }
  }

  function toggleTheme() {
    const next = app.state.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    saveProgressState(app.state);
    showToast(
      next === 'dark' ? 'Modo Noturno de Leitura ativado.' : 'Tema Papel de Prova ativado.',
      'info'
    );
  }

  // =========================================================================
  // Notificações Toast Não-Bloqueantes
  // =========================================================================
  function showToast(message, type = 'info') {
    if (!dom.toastContainer) return;

    const palette = {
      info: 'bg-slate-900 text-white border-slate-700 dark:bg-slate-800 dark:border-slate-600',
      success: 'bg-emerald-800 text-white border-emerald-600',
      warning: 'bg-amber-700 text-white border-amber-500',
      error: 'bg-rose-800 text-white border-rose-600'
    };

    const toast = document.createElement('div');
    toast.className = `pointer-events-auto flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg border shadow-lg text-xs font-medium animate-panel-reveal ${palette[type] || palette.info}`;
    toast.setAttribute('role', 'status');
    toast.innerHTML = `
      <span>${escapeHtml(message)}</span>
      <button type="button" class="opacity-70 hover:opacity-100 font-bold text-sm leading-none" aria-label="Fechar aviso">×</button>
    `;

    const dismiss = () => {
      if (toast.parentNode) toast.remove();
    };
    toast.querySelector('button')?.addEventListener('click', dismiss);

    dom.toastContainer.appendChild(toast);
    window.setTimeout(dismiss, 4200);
  }

  // =========================================================================
  // Unificação do Banco de Questões (Fallback embutido + questions.json + Importadas)
  // =========================================================================
  function rebuildQuestionBank() {
    // 1. Base padrão embutida
    let combined = app.defaultQuestions.slice();

    // 2. Mescla questions.json caso servido via HTTP(S) sem sobrescrever customizações
    if (app.externalQuestions.length > 0) {
      combined = mergeQuestionBanks(combined, app.externalQuestions, { overwriteExisting: false }).merged;
    }

    // 3. Aplica questões importadas manualmente pelo usuário (sobrepõem se idênticas)
    if (app.customQuestions.length > 0) {
      combined = mergeQuestionBanks(combined, app.customQuestions, { overwriteExisting: true }).merged;
    }

    app.allQuestions = combined;
    updateGlobalHeaderBadges();
  }

  async function trySyncExternalQuestionsJson() {
    if (window.location.protocol === 'file:') return;
    try {
      const resp = await fetch('./questions.json', { cache: 'no-store' });
      if (!resp.ok) return;
      const payload = await resp.json();
      const parsed = parseQuestionImportPayload(payload);
      if (parsed.validQuestions.length > 0) {
        if (parsed.metadata) {
          app.bankMetadata = { ...app.bankMetadata, ...parsed.metadata };
        }
        const beforeCount = app.allQuestions.length;
        app.externalQuestions = parsed.validQuestions;
        rebuildQuestionBank();
        if (app.allQuestions.length !== beforeCount) {
          rebuildDeck({ preserveCurrentId: true });
          syncIdleAudioPlaylist();
          renderCurrentView();
        }
      }
    } catch (err) {
      // Fallback silencioso: banco embutido já está ativo.
      console.info('[AvaliaApp] Operando com banco embutido (questions.json externo não requisitado):', err.message);
    }
  }

  function updateGlobalHeaderBadges() {
    if (dom.headerBankBadge) {
      const customCount = app.customQuestions.length;
      dom.headerBankBadge.textContent = customCount > 0
        ? `${app.allQuestions.length} questões (${customCount} importadas)`
        : `${app.allQuestions.length} questões oficiais`;
    }

    if (dom.tabErrorsBadge) {
      const errorNotebookIds = new Set();
      for (const q of app.allQuestions) {
        const rec = app.state.answers[q.id];
        const isWrong = Boolean(rec && !rec.acertou);
        const isBookmarked = Boolean(app.state.bookmarks[q.id]);
        const hasNote = Boolean(app.state.notes[q.id] && app.state.notes[q.id].trim());
        if (isWrong || isBookmarked || hasNote) {
          errorNotebookIds.add(q.id);
        }
      }
      dom.tabErrorsBadge.textContent = String(errorNotebookIds.size);
      dom.tabErrorsBadge.classList.toggle('hidden', errorNotebookIds.size === 0);
    }

    if (dom.customCountBadge) {
      dom.customCountBadge.textContent = String(app.customQuestions.length);
    }
  }

  // =========================================================================
  // Construção de Cadernos e Navegação de Questões
  // =========================================================================
  function rebuildDeck({ preserveCurrentId = false, targetQid = null } = {}) {
    const previousQid = targetQid || (preserveCurrentId && app.deck[app.currentIndex]?.id) || null;
    let nextDeck = [];

    if (app.activeMode === 'tiro_curto') {
      nextDeck = buildTiroCurtoDeck(app.allQuestions, app.state.answers);
    } else if (app.activeMode === 'basicos') {
      nextDeck = buildBasicosDeck(app.allQuestions, app.state.answers);
    } else if (app.activeMode === 'simulado_60') {
      nextDeck = buildSimulado60Deck(app.allQuestions, app.state.answers);
    } else {
      nextDeck = filterQuestions(app.allQuestions, app.filters, app.state);
    }

    app.deck = nextDeck;

    if (previousQid) {
      const idx = app.deck.findIndex((q) => q.id === previousQid);
      app.currentIndex = idx >= 0 ? idx : 0;
    } else {
      app.currentIndex = 0;
    }
  }

  function switchMode(mode) {
    app.audioController?.stop();
    app.activeTab = 'exam';
    app.activeMode = mode;
    if (mode === 'filtrado') {
      app.showFilters = true;
    } else if (mode === 'tiro_curto') {
      configureTimerPreset(30, false);
    } else if (mode === 'simulado_60') {
      configureTimerPreset(240, false);
    }

    rebuildDeck({ preserveCurrentId: false });
    syncIdleAudioPlaylist();
    app.questionElapsedSeconds = 0;
    renderCurrentView();
    updateNavTabAppearance();

    const modeLabels = {
      tiro_curto: `Tiro Curto Ponderado (${app.deck.length} questões: 3 PT • 1 INF • 3 ADM • 8 CE)`,
      basicos: `Bateria de Conhecimentos Básicos (${app.deck.length} questões • 30,00 pts)`,
      simulado_60: `Simulado Completo Edital 007/2026 (${app.deck.length} questões)`,
      filtrado: `Caderno Filtrado (${app.deck.length} questões encontradas)`
    };
    showToast(modeLabels[mode] || 'Caderno atualizado.', 'info');
  }

  function jumpToQuestion(index) {
    if (index < 0 || index >= app.deck.length) return;
    app.currentIndex = index;
    app.questionElapsedSeconds = 0;

    const snap = getAudioUiState();
    if (
      app.audioController &&
      app.activeTab === 'exam' &&
      snap.context === 'playlist' &&
      snap.playlistKind === 'exam' &&
      (snap.status === 'playing' || snap.status === 'pausing_wait')
    ) {
      app.audioController.jumpToTrack(index, { forcePlay: true, silentAdvance: true });
    } else {
      syncIdleAudioPlaylist();
    }

    renderCurrentView();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function isCurrentQuestionLocked() {
    const currentQ = app.deck[app.currentIndex];
    if (!currentQ) return false;
    return Boolean(app.state.answers[currentQ.id]) && !app.retakingIds.has(currentQ.id);
  }

  // =========================================================================
  // Cronômetro Tático & Contagem Regressiva
  // =========================================================================
  function configureTimerPreset(minutes, announce = true) {
    const parsed = Number(minutes);
    const validPreset = Number.isFinite(parsed) && parsed >= 0 ? parsed : 30;
    app.state.sessionDurationMinutes = validPreset;
    saveProgressState(app.state);

    app.sessionTimer.presetMinutes = validPreset;
    app.sessionTimer.durationSeconds = validPreset * 60;
    app.sessionTimer.remainingSeconds = validPreset * 60;
    app.sessionTimer.elapsedSeconds = 0;
    app.sessionTimer.running = false;
    app.sessionTimer.expiredNotified = false;

    if (announce) {
      showToast(
        validPreset > 0 ? `Cronômetro ajustado para ${validPreset} minutos.` : 'Cronômetro ajustado para modo livre.',
        'info'
      );
    }
  }

  function updateTimerDomOnly() {
    const timerEl = document.getElementById('session-timer-display');
    if (timerEl) {
      const st = app.sessionTimer;
      const danger = st.durationSeconds > 0 && st.remainingSeconds <= 300;
      timerEl.textContent = st.durationSeconds > 0
        ? formatDuration(st.remainingSeconds)
        : formatDuration(st.elapsedSeconds);
      timerEl.className = `font-mono-tabular text-sm font-bold px-2.5 py-1 rounded border hairline-divider ${
        danger
          ? 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-700'
          : 'subtle-surface'
      }`;
    }

    const qElapsedEl = document.getElementById('question-elapsed-display');
    if (qElapsedEl) {
      qElapsedEl.textContent = formatDuration(app.questionElapsedSeconds);
    }
  }

  function hasOpenModal() {
    return (
      (dom.modalImport && !dom.modalImport.classList.contains('hidden')) ||
      (dom.modalBackup && !dom.modalBackup.classList.contains('hidden')) ||
      (dom.modalShortcuts && !dom.modalShortcuts.classList.contains('hidden'))
    );
  }

  function startIntervals() {
    // Atualiza imediatamente e depois a cada 1 segundo
    renderCountdown(dom.countdownEl, getExamCountdown(new Date()));

    window.setInterval(() => {
      renderCountdown(dom.countdownEl, getExamCountdown(new Date()));

      const st = app.sessionTimer;
      if (st.running && !document.hidden) {
        st.elapsedSeconds += 1;
        if (st.durationSeconds > 0 && st.remainingSeconds > 0) {
          st.remainingSeconds -= 1;
          if (st.remainingSeconds === 0 && !st.expiredNotified) {
            st.expiredNotified = true;
            st.running = false;
            showToast('Tempo da sessão tática encerrado! Confira seu desempenho e revise os erros.', 'warning');
            renderCurrentView();
            return;
          }
        }
      }

      if (
        app.activeTab === 'exam' &&
        app.deck[app.currentIndex] &&
        !isCurrentQuestionLocked() &&
        !document.hidden &&
        !hasOpenModal()
      ) {
        app.questionElapsedSeconds += 1;
      }

      updateTimerDomOnly();
    }, 1000);
  }

  // =========================================================================
  // Motor de Resposta & Ações da Questão
  // =========================================================================
  function selectOption(letter) {
    if (!VALID_OPTIONS.includes(letter)) return;
    const currentQ = app.deck[app.currentIndex];
    if (!currentQ || isCurrentQuestionLocked()) return;

    app.pendingSelections[currentQ.id] = letter;
    renderCurrentView();
  }

  function toggleEliminateOption(letter) {
    if (!VALID_OPTIONS.includes(letter)) return;
    const currentQ = app.deck[app.currentIndex];
    if (!currentQ || isCurrentQuestionLocked()) return;

    const currentList = Array.isArray(app.state.eliminated[currentQ.id])
      ? app.state.eliminated[currentQ.id].slice()
      : [];

    const existingIdx = currentList.indexOf(letter);
    if (existingIdx >= 0) {
      currentList.splice(existingIdx, 1);
    } else {
      currentList.push(letter);
      if (app.pendingSelections[currentQ.id] === letter) {
        delete app.pendingSelections[currentQ.id];
      }
    }

    app.state.eliminated[currentQ.id] = currentList;
    saveProgressState(app.state);
    renderCurrentView();
  }

  function confirmCurrentAnswer() {
    const currentQ = app.deck[app.currentIndex];
    if (!currentQ || isCurrentQuestionLocked()) return;

    const chosen = app.pendingSelections[currentQ.id];
    if (!chosen || !VALID_OPTIONS.includes(chosen)) {
      showToast('Selecione uma alternativa (A a E) antes de confirmar.', 'warning');
      return;
    }

    const previous = app.state.answers[currentQ.id];
    const isCorrect = chosen === currentQ.gabarito;
    const nowIso = new Date().toISOString();
    const spent = Math.max(1, app.questionElapsedSeconds || 1);

    const history = Array.isArray(previous?.historico) ? previous.historico.slice() : [];
    history.push({
      alternativa: chosen,
      acertou: isCorrect,
      data: nowIso,
      tempoSegundos: spent
    });

    app.state.answers[currentQ.id] = {
      acertou: isCorrect,
      alternativaMarcada: chosen,
      dataResposta: nowIso,
      tentativas: (previous?.tentativas || 0) + 1,
      tempoSegundos: spent,
      historico: history
    };

    delete app.pendingSelections[currentQ.id];
    app.retakingIds.delete(currentQ.id);
    saveProgressState(app.state);
    updateGlobalHeaderBadges();
    syncIdleAudioPlaylist();
    renderCurrentView();

    // Rolagem suave para o painel pedagógico se estiver fora da tela em telas menores
    const feedbackEl = document.getElementById('pedagogical-feedback');
    if (feedbackEl) {
      const rect = feedbackEl.getBoundingClientRect();
      if (rect.top > window.innerHeight * 0.72) {
        feedbackEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }

  function toggleBookmark(qid) {
    if (!qid) return;
    const next = !app.state.bookmarks[qid];
    if (next) {
      app.state.bookmarks[qid] = true;
    } else {
      delete app.state.bookmarks[qid];
    }
    saveProgressState(app.state);
    updateGlobalHeaderBadges();
    syncIdleAudioPlaylist();
    renderCurrentView();
    showToast(
      next ? 'Questão adicionada ao Caderno de Erros / Revisão.' : 'Questão removida dos favoritos.',
      'info'
    );
  }

  // =========================================================================
  // Modo Áudio-Estudo (Hands-Free / Podcast Tático)
  // =========================================================================
  function getAudioPlaylistContext() {
    if (app.activeTab === 'errors') {
      const errorList = getErrorNotebookQuestions(app.allQuestions, app.state).combined;
      return { kind: 'errors', list: errorList, startIndex: 0 };
    }
    return { kind: 'exam', list: app.deck, startIndex: app.currentIndex };
  }

  function getAudioUiState() {
    if (app.audioController) {
      return app.audioController.getSnapshot();
    }
    return {
      supported: false,
      status: 'idle',
      context: 'playlist',
      mode: app.state.audioPreferences?.mode || 'pilulas',
      rate: app.state.audioPreferences?.rate || 1,
      playlistKind: app.activeTab === 'errors' ? 'errors' : 'exam',
      trackIndex: 0,
      trackCount: 0
    };
  }

  function syncIdleAudioPlaylist() {
    if (!app.audioController) return;
    if (app.audioController.getSnapshot().status !== 'idle') return;
    const { kind, list, startIndex } = getAudioPlaylistContext();
    app.audioController.syncPlaylist(list, startIndex, kind);
  }

  function syncAudioDomOnly() {
    if (!app.audioController || !describeAudioState) return;
    const bar = document.getElementById('audio-player-bar');
    const snap = getAudioUiState();

    // Atualiza botão individual do Painel Pedagógico quando montado
    const fbBtn = document.getElementById('btn-audio-feedback');
    if (fbBtn && renderAudioFeedbackButtonInner) {
      const btnQid = fbBtn.dataset.qid;
      const isPlayingThis = snap.feedbackQid === btnQid && snap.status !== 'idle';
      fbBtn.innerHTML = renderAudioFeedbackButtonInner(isPlayingThis);
      fbBtn.className = `font-sans inline-flex items-center gap-1.5 px-3 py-1 rounded-md font-bold border transition ${
        isPlayingThis
          ? 'bg-slate-900 text-white border-slate-900 dark:bg-teal-400 dark:text-slate-950 dark:border-teal-300'
          : 'bg-white/85 dark:bg-slate-900/75 border-teal-600/40 text-teal-800 dark:text-teal-200 hover:bg-teal-50 dark:hover:bg-slate-800'
      } disabled:opacity-40 disabled:pointer-events-none`;
    }

    // Atualiza destaque do card no Caderno de Erros
    if (app.activeTab === 'errors' && dom.mainWorkspace) {
      const errorCards = dom.mainWorkspace.querySelectorAll('[data-error-qid]') || [];
      const activeId = snap.playlistKind === 'errors' && snap.status !== 'idle' ? snap.currentTrackId : null;
      errorCards.forEach((card) => {
        card.classList.toggle('audio-playing-card', Boolean(activeId && card.dataset.errorQid === activeId));
      });
    }

    if (!bar) return;

    const info = describeAudioState(snap, snap.currentTrackId || '');
    const fillEl = document.getElementById('audio-progress-fill');
    if (fillEl && fillEl.style) fillEl.style.width = `${info.progressPct}%`;

    const dotEl = document.getElementById('audio-status-dot');
    if (dotEl) dotEl.className = `w-2 h-2 rounded-full shrink-0 ${info.dotClass}`;

    const voiceEl = document.getElementById('audio-voice-label');
    if (voiceEl) {
      voiceEl.textContent = info.shortVoice;
      voiceEl.title = snap.voiceName || 'Seleção automática pt-BR';
    }

    const statusEl = document.getElementById('audio-status-label');
    if (statusEl) statusEl.textContent = info.statusText;

    const trackEl = document.getElementById('audio-track-badge');
    if (trackEl) trackEl.textContent = info.trackBadgeText;

    const prevBtn = document.getElementById('audio-prev-btn');
    if (prevBtn) prevBtn.disabled = info.disablePrev;

    const nextBtn = document.getElementById('audio-next-btn');
    if (nextBtn) nextBtn.disabled = info.disableNext;

    const stopBtn = document.getElementById('audio-stop-btn');
    if (stopBtn) stopBtn.disabled = info.disableStop;

    const playBtn = document.getElementById('audio-play-btn');
    if (playBtn && renderAudioPlayButtonInner) {
      playBtn.disabled = info.disabledTransport;
      playBtn.innerHTML = renderAudioPlayButtonInner(info.isPlaying, info.isPaused);
    }

    bar.querySelectorAll('[data-action="audio-set-rate"]').forEach((btn) => {
      const active = Number(btn.dataset.rate) === snap.rate;
      btn.setAttribute('aria-pressed', String(active));
      btn.className = `font-mono-tabular px-2 py-1 rounded-md text-[11px] font-bold border transition ${
        active
          ? 'bg-slate-900 text-white border-slate-900 dark:bg-teal-500 dark:text-slate-950 dark:border-teal-400'
          : 'hairline-divider hover:bg-slate-100 dark:hover:bg-slate-800 opacity-80'
      }`;
    });

    bar.querySelectorAll('[data-action="audio-set-mode"]').forEach((btn) => {
      const active = btn.dataset.audioMode === snap.mode;
      btn.setAttribute('aria-pressed', String(active));
      btn.className = `px-2.5 py-1 rounded-lg text-[11px] font-bold border transition ${
        active
          ? 'border-teal-600 bg-teal-50 text-teal-900 dark:bg-teal-950/60 dark:border-teal-400 dark:text-teal-200'
          : 'hairline-divider opacity-75 hover:opacity-100 hover:bg-slate-100 dark:hover:bg-slate-800'
      }`;
    });
  }

  function handleAudioTogglePlay() {
    if (!app.audioController) return;
    const snap = app.audioController.getSnapshot();
    const ctxPlaylist = getAudioPlaylistContext();

    if (snap.status === 'playing' || snap.status === 'pausing_wait') {
      app.audioController.pause();
      return;
    }

    if (snap.status === 'paused') {
      // Se trocou de aba entre Caderno de Questões e Caderno de Erros enquanto estava pausado em outra playlist
      if (snap.context === 'playlist' && snap.playlistKind !== ctxPlaylist.kind) {
        app.audioController.startPlaylist(ctxPlaylist.list, ctxPlaylist.startIndex, ctxPlaylist.kind);
      } else {
        app.audioController.resume();
      }
      return;
    }

    app.audioController.startPlaylist(ctxPlaylist.list, ctxPlaylist.startIndex, ctxPlaylist.kind);
  }

  function handleAudioTrackStep(delta) {
    if (!app.audioController) return;
    const snap = app.audioController.getSnapshot();
    const ctxPlaylist = getAudioPlaylistContext();

    if (snap.context !== 'playlist' || snap.playlistKind !== ctxPlaylist.kind || snap.trackCount !== ctxPlaylist.list.length) {
      app.audioController.syncPlaylist(ctxPlaylist.list, ctxPlaylist.startIndex, ctxPlaylist.kind);
    }

    const updated = app.audioController.getSnapshot();
    const targetIdx = updated.trackIndex + delta;
    if (targetIdx < 0 || targetIdx >= updated.trackCount) return;

    app.audioController.jumpToTrack(targetIdx, {
      forcePlay: updated.status === 'playing' || updated.status === 'pausing_wait'
    });
  }

  // =========================================================================
  // Renderização das Abas Principais
  // =========================================================================
  function updateNavTabAppearance() {
    dom.navTabButtons.forEach((btn) => {
      const tab = btn.dataset.tabTarget;
      const isActive = tab === app.activeTab;
      btn.setAttribute('aria-selected', String(isActive));
      if (isActive) {
        btn.classList.add('border-teal-600', 'text-teal-800', 'dark:text-teal-300', 'dark:border-teal-400', 'bg-teal-50/70', 'dark:bg-teal-950/35');
        btn.classList.remove('border-transparent', 'opacity-75');
      } else {
        btn.classList.remove('border-teal-600', 'text-teal-800', 'dark:text-teal-300', 'dark:border-teal-400', 'bg-teal-50/70', 'dark:bg-teal-950/35');
        btn.classList.add('border-transparent', 'opacity-75');
      }
    });
  }

  function renderCurrentView() {
    if (!dom.mainWorkspace) return;
    updateNavTabAppearance();
    updateGlobalHeaderBadges();

    const telemetry = computeTelemetry(app.allQuestions, app.state);
    const audioSnapshot = getAudioUiState();

    if (app.activeTab === 'exam') {
      const currentQ = app.deck[app.currentIndex] || null;
      const pendingSelection = currentQ ? (app.pendingSelections[currentQ.id] || null) : null;

      dom.mainWorkspace.innerHTML = renderExamView({
        allQuestions: app.allQuestions,
        deck: app.deck,
        currentIndex: app.currentIndex,
        activeMode: app.activeMode,
        filters: app.filters,
        showFilters: app.showFilters,
        state: app.state,
        pendingSelection,
        retakingIds: app.retakingIds,
        sessionTimer: app.sessionTimer,
        questionElapsedSeconds: app.questionElapsedSeconds,
        telemetry,
        audio: audioSnapshot
      });
    } else if (app.activeTab === 'telemetry') {
      dom.mainWorkspace.innerHTML = renderTelemetryView(telemetry);
    } else if (app.activeTab === 'errors') {
      dom.mainWorkspace.innerHTML = renderErrorNotebookView(app.allQuestions, app.state, audioSnapshot);
    } else if (app.activeTab === 'essay') {
      dom.mainWorkspace.innerHTML = renderEssayGuideView(app.state.essayState);
    }
  }

  function switchTab(tabName) {
    if (!['exam', 'telemetry', 'errors', 'essay'].includes(tabName)) return;
    app.activeTab = tabName;
    syncIdleAudioPlaylist();
    renderCurrentView();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // =========================================================================
  // Modais: Abertura/Fechamento, Importação JSON e Backup
  // =========================================================================
  function openModal(modalEl) {
    if (!modalEl) return;
    if (modalEl === dom.modalBackup) {
      refreshBackupSummary();
    }
    if (modalEl === dom.modalImport && dom.importFeedbackBox) {
      dom.importFeedbackBox.classList.add('hidden');
      dom.importFeedbackBox.innerHTML = '';
    }
    app.confirmResetStep = false;
    app.confirmClearCustomStep = false;
    if (dom.btnResetProgress) {
      dom.btnResetProgress.textContent = 'Zerar Histórico de Respostas';
    }
    if (dom.btnClearCustom) {
      dom.btnClearCustom.textContent = 'Remover Questões Importadas';
    }

    modalEl.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
  }

  function closeAllModals() {
    [dom.modalImport, dom.modalBackup, dom.modalShortcuts].forEach((m) => {
      if (m) m.classList.add('hidden');
    });
    document.body.classList.remove('overflow-hidden');
  }

  function refreshBackupSummary() {
    if (!dom.backupSummaryBox) return;
    const answeredCount = Object.keys(app.state.answers || {}).length;
    const bookmarksCount = Object.values(app.state.bookmarks || {}).filter(Boolean).length;
    const notesCount = Object.values(app.state.notes || {}).filter((v) => v && v.trim()).length;
    const updatedFormatted = app.state.updatedAt
      ? new Date(app.state.updatedAt).toLocaleString('pt-BR')
      : '--';

    dom.backupSummaryBox.innerHTML = `
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
        <div class="subtle-surface rounded-lg p-2.5">
          <div class="font-mono-tabular text-lg font-bold">${answeredCount}</div>
          <div class="text-[11px] opacity-75">Respondidas</div>
        </div>
        <div class="subtle-surface rounded-lg p-2.5">
          <div class="font-mono-tabular text-lg font-bold">${bookmarksCount}</div>
          <div class="text-[11px] opacity-75">Favoritas</div>
        </div>
        <div class="subtle-surface rounded-lg p-2.5">
          <div class="font-mono-tabular text-lg font-bold">${notesCount}</div>
          <div class="text-[11px] opacity-75">Anotações</div>
        </div>
        <div class="subtle-surface rounded-lg p-2.5">
          <div class="font-mono-tabular text-lg font-bold">${app.customQuestions.length}</div>
          <div class="text-[11px] opacity-75">Importadas</div>
        </div>
      </div>
      <div class="text-[11px] opacity-70 mt-2.5 text-center">
        Última gravação em localStorage: <strong>${escapeHtml(updatedFormatted)}</strong>
      </div>
    `;
  }

  function showImportFeedback(html, isError) {
    if (!dom.importFeedbackBox) return;
    dom.importFeedbackBox.classList.remove('hidden');
    dom.importFeedbackBox.className = `rounded-lg p-3 text-xs border ${
      isError
        ? 'bg-rose-50 border-rose-300 text-rose-900 dark:bg-rose-950/60 dark:border-rose-700 dark:text-rose-200'
        : 'bg-emerald-50 border-emerald-300 text-emerald-900 dark:bg-emerald-950/60 dark:border-emerald-700 dark:text-emerald-200'
    }`;
    dom.importFeedbackBox.innerHTML = html;
  }

  function handleImportJsonSubmission() {
    const raw = dom.importTextarea ? dom.importTextarea.value.trim() : '';
    if (!raw) {
      showImportFeedback('Cole um JSON válido ou carregue um arquivo <code>.json</code> antes de importar.', true);
      return;
    }

    let parsed;
    try {
      parsed = parseQuestionImportPayload(raw);
    } catch (err) {
      showImportFeedback(`<strong>Erro ao interpretar lote:</strong> ${escapeHtml(err.message)}`, true);
      return;
    }

    const overwriteExisting = Boolean(dom.importOverwriteCheckbox?.checked);

    if (parsed.validQuestions.length === 0) {
      const errs = parsed.validationErrors.slice(0, 6).map((e) => `<li>${escapeHtml(e)}</li>`).join('');
      showImportFeedback(
        `<strong>Nenhuma questão passou na validação do schema UFBA 2026:</strong><ul class="list-disc pl-4 mt-1 space-y-0.5">${errs}</ul>`,
        true
      );
      return;
    }

    // Verifica colisão contra o banco total existente (padrão + externo + custom)
    const activeMergeResult = mergeQuestionBanks(app.allQuestions, parsed.validQuestions, {
      overwriteExisting
    });

    // Salva em customQuestions apenas as questões adicionadas ou sobrescritas
    const customMergeResult = mergeQuestionBanks(
      app.customQuestions,
      activeMergeResult.addedOrUpdated,
      { overwriteExisting: true }
    );

    app.customQuestions = customMergeResult.merged;
    saveCustomQuestions(app.customQuestions);
    rebuildQuestionBank();

    // Atualiza o deck preservando modo selecionado (ou indo para o Caderno Filtrado se usuário quiser ver todas)
    rebuildDeck({ preserveCurrentId: true });
    syncIdleAudioPlaylist();
    renderCurrentView();

    const warnHtml = parsed.validationErrors.length > 0
      ? `<div class="mt-2 pt-2 border-t border-current/20"><strong>Avisos (${parsed.validationErrors.length} ignoradas):</strong><ul class="list-disc pl-4 mt-1">${parsed.validationErrors.slice(0, 4).map((e) => `<li>${escapeHtml(e)}</li>`).join('')}</ul></div>`
      : '';

    showImportFeedback(
      `<strong>Importação concluída com sucesso!</strong>
       <div class="mt-1">Adicionadas: <strong>${activeMergeResult.addedCount}</strong> • Sobrescritas: <strong>${activeMergeResult.overwrittenCount}</strong> • Ignoradas por ID duplicado: <strong>${activeMergeResult.skippedDuplicates}</strong>.</div>
       <div class="mt-0.5">Total no banco ativo: <strong>${app.allQuestions.length} questões</strong>.</div>
       ${warnHtml}`,
      false
    );

    showToast(
      `Lote importado: +${activeMergeResult.addedCount} nova(s), ${activeMergeResult.overwrittenCount} atualizada(s).`,
      'success'
    );
  }

  function triggerJsonDownload(filename, dataObject) {
    const content = JSON.stringify(dataObject, null, 2);
    const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // =========================================================================
  // Delegação de Eventos do Workspace Principal
  // =========================================================================
  function setupEventListeners() {
    // Alternar abas superiores
    dom.navTabButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        switchTab(btn.dataset.tabTarget);
      });
    });

    // Tema claro/escuro
    dom.btnThemeToggle?.addEventListener('click', toggleTheme);

    // Abrir modais a partir do cabeçalho
    document.querySelectorAll('[data-open-modal]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.openModal;
        openModal(document.getElementById(targetId));
      });
    });

    // Fechar modais via botão [data-close-modal] ou clique no backdrop
    document.querySelectorAll('[data-close-modal]').forEach((btn) => {
      btn.addEventListener('click', closeAllModals);
    });
    [dom.modalImport, dom.modalBackup, dom.modalShortcuts].forEach((modal) => {
      modal?.addEventListener('click', (e) => {
        if (e.target === modal) closeAllModals();
      });
    });

    // Controles internos do Modal Importar JSON
    dom.importFileInput?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (dom.importTextarea) {
          dom.importTextarea.value = String(reader.result || '');
        }
        showImportFeedback(`Arquivo <strong>${escapeHtml(file.name)}</strong> carregado no editor. Clique em <em>Importar Lote Agora</em>.`, false);
      };
      reader.onerror = () => {
        showImportFeedback('Não foi possível ler o arquivo selecionado.', true);
      };
      reader.readAsText(file, 'utf-8');
    });

    dom.btnExecuteImport?.addEventListener('click', handleImportJsonSubmission);

    dom.btnCopySchema?.addEventListener('click', async () => {
      const snippet = renderSchemaExampleSnippet();
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(snippet);
          showToast('Schema JSON de exemplo copiado para a área de transferência.', 'success');
          return;
        }
      } catch (_) {
        // Fallback manual caso clipboard bloqueie em file://
      }
      if (dom.importTextarea) {
        dom.importTextarea.value = snippet;
        dom.importTextarea.focus();
        dom.importTextarea.select();
        showToast('Exemplo inserido no editor (copie com Ctrl+C).', 'info');
      }
    });

    dom.btnFillSchema?.addEventListener('click', () => {
      if (dom.importTextarea) {
        dom.importTextarea.value = renderSchemaExampleSnippet();
        dom.importTextarea.focus();
      }
    });

    dom.btnClearCustom?.addEventListener('click', () => {
      if (app.customQuestions.length === 0) {
        showToast('Não há questões importadas para remover.', 'info');
        return;
      }
      if (!app.confirmClearCustomStep) {
        app.confirmClearCustomStep = true;
        dom.btnClearCustom.textContent = `Confirmar remoção de ${app.customQuestions.length} importada(s)?`;
        window.setTimeout(() => {
          app.confirmClearCustomStep = false;
          if (dom.btnClearCustom) dom.btnClearCustom.textContent = 'Remover Questões Importadas';
        }, 5000);
        return;
      }
      app.confirmClearCustomStep = false;
      app.audioController?.stop();
      app.customQuestions = [];
      saveCustomQuestions([]);
      rebuildQuestionBank();
      rebuildDeck({ preserveCurrentId: false });
      syncIdleAudioPlaylist();
      renderCurrentView();
      refreshBackupSummary();
      dom.btnClearCustom.textContent = 'Remover Questões Importadas';
      showImportFeedback('Questões importadas removidas. Banco restaurado para o lote oficial embutido.', false);
      showToast('Questões importadas removidas.', 'info');
    });

    // Controles do Modal Backup & Progresso
    dom.btnExportProgress?.addEventListener('click', () => {
      const payload = buildProgressBackupPayload(app.state, app.customQuestions);
      triggerJsonDownload('progresso_pedro_ufba2026.json', payload);
      showToast('Backup "progresso_pedro_ufba2026.json" exportado com sucesso.', 'success');
    });

    dom.btnExportUnifiedBank?.addEventListener('click', () => {
      const payload = {
        metadata: {
          ...app.bankMetadata,
          exportado_em: new Date().toISOString(),
          total_questoes: app.allQuestions.length
        },
        questoes: app.allQuestions
      };
      triggerJsonDownload('questions_ufba2026_unificado.json', payload);
      showToast(`Banco unificado (${app.allQuestions.length} questões) exportado.`, 'success');
    });

    dom.backupFileInput?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          app.audioController?.stop();
          const restored = parseProgressBackupPayload(String(reader.result || ''));
          app.state = restored.progressState;
          app.customQuestions = restored.customQuestions;
          saveProgressState(app.state);
          saveCustomQuestions(app.customQuestions);

          if (app.audioController && app.state.audioPreferences) {
            app.audioController.setMode(app.state.audioPreferences.mode);
            app.audioController.setRate(app.state.audioPreferences.rate);
          }

          applyTheme(app.state.theme);
          configureTimerPreset(app.state.sessionDurationMinutes || 30, false);
          rebuildQuestionBank();
          rebuildDeck({ preserveCurrentId: false });
          syncIdleAudioPlaylist();
          refreshBackupSummary();
          renderCurrentView();
          showToast('Progresso restaurado com sucesso!', 'success');
        } catch (err) {
          showToast(`Falha ao restaurar backup: ${err.message}`, 'error');
        } finally {
          e.target.value = '';
        }
      };
      reader.readAsText(file, 'utf-8');
    });

    dom.btnResetProgress?.addEventListener('click', () => {
      if (!app.confirmResetStep) {
        app.confirmResetStep = true;
        dom.btnResetProgress.textContent = 'Clique novamente para confirmar reset total';
        window.setTimeout(() => {
          app.confirmResetStep = false;
          if (dom.btnResetProgress) dom.btnResetProgress.textContent = 'Zerar Histórico de Respostas';
        }, 5000);
        return;
      }

      const keptTheme = app.state.theme;
      const keptXray = app.state.xrayEnabled;
      const keptDuration = app.state.sessionDurationMinutes;
      const keptAudioPrefs = app.state.audioPreferences;
      app.audioController?.stop();
      app.state = window.AvaliaStorage.createDefaultState();
      app.state.theme = keptTheme;
      app.state.xrayEnabled = keptXray;
      app.state.sessionDurationMinutes = keptDuration;
      if (keptAudioPrefs) app.state.audioPreferences = keptAudioPrefs;
      app.pendingSelections = {};
      app.retakingIds.clear();
      app.questionElapsedSeconds = 0;
      saveProgressState(app.state);

      rebuildDeck({ preserveCurrentId: false });
      syncIdleAudioPlaylist();
      refreshBackupSummary();
      renderCurrentView();
      dom.btnResetProgress.textContent = 'Zerar Histórico de Respostas';
      app.confirmResetStep = false;
      closeAllModals();
      showToast('Histórico zerado. O banco de questões foi mantido.', 'info');
    });

    // Delegação de cliques no #main-workspace
    dom.mainWorkspace?.addEventListener('click', (e) => {
      const actionEl = e.target.closest('[data-action]');
      if (!actionEl) return;

      const action = actionEl.dataset.action;

      if (action === 'toggle-filters') {
        app.showFilters = !app.showFilters;
        renderCurrentView();
      } else if (action === 'select-mode') {
        switchMode(actionEl.dataset.mode);
      } else if (action === 'reset-filters') {
        app.audioController?.stop();
        app.filters = { area: 'ALL', topico: 'ALL', dificuldade: 'ALL', status: 'ALL', search: '' };
        app.activeMode = 'filtrado';
        app.showFilters = true;
        rebuildDeck({ preserveCurrentId: false });
        syncIdleAudioPlaylist();
        renderCurrentView();
      } else if (action === 'toggle-timer') {
        app.sessionTimer.running = !app.sessionTimer.running;
        renderCurrentView();
      } else if (action === 'reset-timer') {
        configureTimerPreset(app.sessionTimer.presetMinutes, true);
        renderCurrentView();
      } else if (action === 'toggle-xray') {
        app.state.xrayEnabled = !app.state.xrayEnabled;
        saveProgressState(app.state);
        renderCurrentView();
        showToast(
          app.state.xrayEnabled ? 'Raio-X da Banca ativado.' : 'Raio-X da Banca desativado.',
          'info'
        );
      } else if (action === 'open-shortcuts') {
        openModal(dom.modalShortcuts);
      } else if (action === 'jump-question') {
        jumpToQuestion(Number(actionEl.dataset.index));
      } else if (action === 'prev-question') {
        jumpToQuestion(app.currentIndex - 1);
      } else if (action === 'next-question') {
        jumpToQuestion(app.currentIndex + 1);
      } else if (action === 'select-option') {
        selectOption(actionEl.dataset.option);
      } else if (action === 'toggle-eliminate') {
        toggleEliminateOption(actionEl.dataset.option);
      } else if (action === 'confirm-answer') {
        confirmCurrentAnswer();
      } else if (action === 'retake-question') {
        const qid = actionEl.dataset.qid;
        if (qid) {
          app.retakingIds.add(qid);
          delete app.pendingSelections[qid];
          app.questionElapsedSeconds = 0;
          renderCurrentView();
        }
      } else if (action === 'toggle-bookmark') {
        toggleBookmark(actionEl.dataset.qid);
      } else if (action === 'train-errors') {
        app.audioController?.stop();
        app.activeTab = 'exam';
        app.activeMode = 'filtrado';
        app.showFilters = true;
        app.filters = { area: 'ALL', topico: 'ALL', dificuldade: 'ALL', status: 'BOOKMARKED', search: '' };
        rebuildDeck({ preserveCurrentId: false });
        syncIdleAudioPlaylist();
        app.questionElapsedSeconds = 0;
        renderCurrentView();
        showToast(`Caderno de Erros & Favoritas carregado (${app.deck.length} questões).`, 'info');
      } else if (action === 'open-question-from-notebook') {
        app.audioController?.stop();
        const qid = actionEl.dataset.qid;
        app.activeTab = 'exam';
        app.activeMode = 'filtrado';
        app.showFilters = true;
        app.filters = { area: 'ALL', topico: 'ALL', dificuldade: 'ALL', status: 'ALL', search: '' };
        rebuildDeck({ targetQid: qid });
        syncIdleAudioPlaylist();
        app.questionElapsedSeconds = 0;
        renderCurrentView();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (action === 'audio-toggle-play') {
        handleAudioTogglePlay();
      } else if (action === 'audio-prev') {
        handleAudioTrackStep(-1);
      } else if (action === 'audio-next') {
        handleAudioTrackStep(1);
      } else if (action === 'audio-stop') {
        app.audioController?.stop();
      } else if (action === 'audio-set-rate') {
        const nextRate = Number(actionEl.dataset.rate);
        if (app.audioController) {
          const applied = app.audioController.setRate(nextRate);
          app.state.audioPreferences = {
            ...(app.state.audioPreferences || { mode: 'pilulas' }),
            rate: applied
          };
          saveProgressState(app.state);
          syncAudioDomOnly();
        }
      } else if (action === 'audio-set-mode') {
        const nextMode = actionEl.dataset.audioMode;
        if (app.audioController && nextMode) {
          const applied = app.audioController.setMode(nextMode);
          app.state.audioPreferences = {
            ...(app.state.audioPreferences || { rate: 1 }),
            mode: applied
          };
          saveProgressState(app.state);
          syncAudioDomOnly();
          showToast(
            applied === 'completa'
              ? 'Modo Áudio: Questão Completa + Correção (pausa de 3s).'
              : 'Modo Áudio: Playlist de Pílulas & Lei Seca.',
            'info'
          );
        }
      } else if (action === 'audio-play-feedback') {
        const qid = actionEl.dataset.qid;
        const targetQ = app.allQuestions.find((q) => q.id === qid) || app.deck[app.currentIndex];
        if (targetQ && app.audioController) {
          app.audioController.playFeedback(targetQ);
        }
      }
    });

    // Riscador de alternativas via clique direito (eliminação tática rápida)
    dom.mainWorkspace?.addEventListener('contextmenu', (e) => {
      const row = e.target.closest('[data-option-row]');
      if (!row || app.activeTab !== 'exam' || isCurrentQuestionLocked()) return;
      e.preventDefault();
      toggleEliminateOption(row.dataset.optionRow);
    });

    // Eventos 'change' (selects e checkboxes)
    dom.mainWorkspace?.addEventListener('change', (e) => {
      const target = e.target;

      // Filtros do Caderno Filtrado
      if (target.dataset.filter) {
        app.audioController?.stop();
        const filterKey = target.dataset.filter;
        app.filters[filterKey] = target.value;
        if (filterKey === 'area') {
          app.filters.topico = 'ALL';
        }
        app.activeMode = 'filtrado';
        app.showFilters = true;
        rebuildDeck({ preserveCurrentId: false });
        syncIdleAudioPlaylist();
        app.questionElapsedSeconds = 0;
        renderCurrentView();
        return;
      }

      const action = target.dataset.action;
      if (action === 'set-timer-duration') {
        configureTimerPreset(target.value, true);
        renderCurrentView();
      } else if (action === 'toggle-essay-check') {
        const checkId = target.dataset.checkId;
        if (checkId) {
          if (!app.state.essayState.checklist) app.state.essayState.checklist = {};
          app.state.essayState.checklist[checkId] = Boolean(target.checked);
          saveProgressState(app.state);
          renderCurrentView();
        }
      } else if (action === 'select-essay-theme') {
        app.state.essayState.selectedThemeId = target.value;
        saveProgressState(app.state);
        renderCurrentView();
      }
    });

    // Eventos 'input' (sem perda de foco/cursor para notas, busca, sliders e redação)
    dom.mainWorkspace?.addEventListener('input', (e) => {
      const target = e.target;

      // Campo de busca textual nos filtros
      if (target.dataset.filter === 'search') {
        if (app.audioController && app.audioController.getSnapshot().status !== 'idle') {
          app.audioController.stop();
        }
        const selStart = target.selectionStart;
        const selEnd = target.selectionEnd;
        app.filters.search = target.value;
        app.activeMode = 'filtrado';
        app.showFilters = true;
        rebuildDeck({ preserveCurrentId: false });
        syncIdleAudioPlaylist();
        renderCurrentView();

        const restoredSearch = dom.mainWorkspace.querySelector('[data-filter="search"]');
        if (restoredSearch) {
          restoredSearch.focus();
          if (typeof selStart === 'number' && typeof selEnd === 'number') {
            restoredSearch.setSelectionRange(selStart, selEnd);
          }
        }
        return;
      }

      const action = target.dataset.action;
      if (action === 'save-note') {
        const qid = target.dataset.qid;
        if (qid) {
          app.state.notes[qid] = target.value;
          saveProgressState(app.state);
          updateGlobalHeaderBadges();
        }
      } else if (action === 'save-essay-draft') {
        app.state.essayState.draftText = target.value;
        saveProgressState(app.state);

        const metrics = estimateEssayLines(target.value);
        const wordsEl = document.getElementById('essay-words-badge');
        const parasEl = document.getElementById('essay-paras-badge');
        const linesEl = document.getElementById('essay-lines-badge');
        if (wordsEl) wordsEl.textContent = `${metrics.words} palavras`;
        if (parasEl) parasEl.textContent = `${metrics.paragraphs} parágrafos`;
        if (linesEl) {
          const healthy = metrics.estimatedLines >= 20 && metrics.estimatedLines <= 30;
          linesEl.textContent = `~${metrics.estimatedLines} linhas (meta: 20–30)`;
          linesEl.className = `px-2.5 py-1 rounded font-bold ${
            metrics.estimatedLines === 0
              ? 'subtle-surface'
              : healthy
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200'
          }`;
        }
      } else if (action === 'set-essay-score') {
        const criterion = target.dataset.criterion;
        const val = Number(target.value);
        if (criterion && Number.isFinite(val)) {
          if (!app.state.essayState.selfScores) {
            app.state.essayState.selfScores = { c1: 12, c2: 12, c3: 12, c4: 12 };
          }
          app.state.essayState.selfScores[criterion] = val;
          saveProgressState(app.state);

          const singleDisplay = dom.mainWorkspace.querySelector(`[data-score-display="${criterion}"]`);
          if (singleDisplay) {
            singleDisplay.textContent = val.toFixed(1).replace('.', ',');
          }

          const s = app.state.essayState.selfScores;
          const total = Number(s.c1 || 0) + Number(s.c2 || 0) + Number(s.c3 || 0) + Number(s.c4 || 0);
          const statusEl = document.getElementById('essay-score-status');
          const totalEl = document.getElementById('essay-total-score-badge');
          if (statusEl) {
            statusEl.textContent = total >= 30
              ? 'Aprovado na Redação (≥ 30,00 pts)'
              : 'Abaixo do mínimo eliminatório (< 30,00 pts)';
          }
          if (totalEl) {
            totalEl.innerHTML = `${total.toFixed(1).replace('.', ',')} <span class="text-sm font-normal opacity-65">/ 60,00 pts</span>`;
            totalEl.className = `font-mono-tabular text-2xl font-bold ${
              total >= 48
                ? 'text-emerald-600 dark:text-emerald-400'
                : total >= 30
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-rose-600 dark:text-rose-400'
            }`;
          }
        }
      }
    });

    // Atalhos de teclado globais
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && hasOpenModal()) {
        closeAllModals();
        return;
      }

      if (hasOpenModal()) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') {
        return;
      }

      if (e.key === '?' ) {
        e.preventDefault();
        openModal(dom.modalShortcuts);
        return;
      }

      if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        toggleTheme();
        return;
      }

      if ((e.key === 'a' || e.key === 'A') && (app.activeTab === 'exam' || app.activeTab === 'errors')) {
        e.preventDefault();
        handleAudioTogglePlay();
        return;
      }

      if (app.activeTab !== 'exam') return;

      const currentQ = app.deck[app.currentIndex];
      if (!currentQ) return;

      if (['1', '2', '3', '4', '5'].includes(e.key)) {
        if (!isCurrentQuestionLocked()) {
          e.preventDefault();
          const letter = VALID_OPTIONS[Number(e.key) - 1];
          selectOption(letter);
        }
      } else if (e.key === 'Enter') {
        const focusedEl = document.activeElement;
        const isUnrelatedButton = focusedEl &&
          focusedEl.tagName === 'BUTTON' &&
          !['select-option', 'confirm-answer'].includes(focusedEl.dataset.action || '');
        if (!isUnrelatedButton && !isCurrentQuestionLocked() && app.pendingSelections[currentQ.id]) {
          e.preventDefault();
          confirmCurrentAnswer();
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        jumpToQuestion(app.currentIndex - 1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        jumpToQuestion(app.currentIndex + 1);
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        app.state.xrayEnabled = !app.state.xrayEnabled;
        saveProgressState(app.state);
        renderCurrentView();
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleBookmark(currentQ.id);
      }
    });
    // Limpeza segura da Web Speech API ao fechar ou recarregar a aba
    const cancelSpeechOnUnload = () => {
      app.audioController?.stop();
      try {
        if (window.speechSynthesis && typeof window.speechSynthesis.cancel === 'function') {
          window.speechSynthesis.cancel();
        }
      } catch (_) {}
    };
    if (typeof window.addEventListener === 'function') {
      window.addEventListener('beforeunload', cancelSpeechOnUnload);
      window.addEventListener('pagehide', cancelSpeechOnUnload);
    }
  }

  // =========================================================================
  // Inicialização (Bootstrap)
  // =========================================================================
  function init() {
    cacheDomReferences();
    app.customQuestions = loadCustomQuestions();

    if (typeof createAudioController === 'function') {
      app.audioController = createAudioController({
        initialMode: app.state.audioPreferences?.mode || 'pilulas',
        initialRate: app.state.audioPreferences?.rate || 1,
        onStateChange: () => {
          syncAudioDomOnly();
        },
        onTrackAdvance: (nextIdx, list, trackQ) => {
          if (app.activeTab === 'exam' && list && app.deck[nextIdx]?.id === trackQ?.id) {
            app.currentIndex = nextIdx;
            app.questionElapsedSeconds = 0;
            renderCurrentView();
          } else if (app.activeTab === 'errors') {
            syncAudioDomOnly();
          }
        },
        onPlaylistFinished: () => {
          showToast('Reprodução da playlist de áudio concluída.', 'success');
        },
        onError: (msg) => {
          showToast(msg, 'warning');
        }
      });
    }

    applyTheme(app.state.theme);
    configureTimerPreset(app.state.sessionDurationMinutes || 30, false);

    rebuildQuestionBank();
    rebuildDeck({ preserveCurrentId: false });
    syncIdleAudioPlaylist();

    setupEventListeners();
    renderCurrentView();
    startIntervals();

    // Se servido via HTTP/HTTPS, sincroniza silenciosamente com ./questions.json
    trySyncExternalQuestionsJson();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

