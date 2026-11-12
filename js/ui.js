/**
 * AvaliaUI — Camada de renderização limpa (Caderno de Provas + Telemetria + Erros + Redação).
 */
(() => {
  'use strict';

  const { EDITAL_CONFIG, getErrorNotebookQuestions, escapeHtml, formatExamText, formatDuration } = window.AvaliaEngine;
  const { VALID_OPTIONS } = window.AvaliaStorage;
  const { TABELA_13_2, ZERO_SCORE_RULES, PROBABLE_THEMES, estimateEssayLines } = window.AvaliaEssayGuide;

  function buildAudioUiSnapshot(audio, fallbackCount = 0) {
    const src = audio && typeof audio === 'object' ? audio : {};
    const speechSupported = src.supported !== undefined
      ? Boolean(src.supported)
      : Boolean(window.AvaliaAudio && window.AvaliaAudio.isSpeechSupported());

    return {
      supported: speechSupported,
      status: src.status || 'idle',
      context: src.context || 'playlist',
      mode: src.mode || 'pilulas',
      rate: Number(src.rate) || 1,
      playlistKind: src.playlistKind || 'exam',
      trackIndex: Number.isFinite(src.trackIndex) ? src.trackIndex : 0,
      trackCount: Number.isFinite(src.trackCount) && src.trackCount > 0 ? src.trackCount : fallbackCount,
      currentTrackId: src.currentTrackId || null,
      feedbackQid: src.feedbackQid || null,
      stepIndex: Number.isFinite(src.stepIndex) ? src.stepIndex : 0,
      stepCount: Number.isFinite(src.stepCount) ? src.stepCount : 0,
      stepLabel: src.stepLabel || '',
      pauseCountdownSeconds: Number.isFinite(src.pauseCountdownSeconds) ? src.pauseCountdownSeconds : 0,
      voiceName: src.voiceName || null
    };
  }

  function renderAudioPlayButtonInner(isPlaying, isPaused) {
    if (isPlaying) {
      return `
        <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
        </svg>
        <span>Pausar</span>
      `;
    }
    return `
      <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polygon points="6 4 20 12 6 20 6 4"/>
      </svg>
      <span>${isPaused ? 'Continuar' : 'Play'}</span>
    `;
  }

  function renderAudioFeedbackButtonInner(isPlayingFeedback) {
    return `
      <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        ${isPlayingFeedback
          ? '<rect x="6" y="6" width="12" height="12" rx="1"/>'
          : '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>'}
      </svg>
      <span>${isPlayingFeedback ? 'Parar Áudio' : 'Ouvir Comentário / Pílula'}</span>
    `;
  }

  function renderAudioPlayerBar(audioInput, playlistItems = [], containerMaxClass = 'max-w-4xl') {
    const playlistCount = Array.isArray(playlistItems) ? playlistItems.length : 0;
    const snap = buildAudioUiSnapshot(audioInput, playlistCount);
    const activeItem = (playlistItems && playlistItems[snap.trackIndex]) || null;
    const {
      isPlaying,
      isPaused,
      disabledTransport,
      disablePrev,
      disableNext,
      disableStop,
      statusText,
      dotClass,
      shortVoice,
      progressPct,
      trackBadgeText
    } = window.AvaliaAudio.describeAudioState(snap, activeItem?.id || '');

    return `
      <aside id="audio-player-bar" aria-label="Player Modo Áudio-Estudo" class="sticky bottom-3 z-20 ${containerMaxClass} mx-auto mt-6 audio-player-dock rounded-2xl overflow-hidden">
        <!-- Hairline de Progresso do Áudio -->
        <div class="h-1 w-full bg-slate-200/80 dark:bg-slate-800">
          <div id="audio-progress-fill" class="h-full bg-teal-600 dark:bg-teal-400 transition-all duration-300" style="width: ${progressPct}%"></div>
        </div>

        <div class="px-4 py-3 space-y-2.5">
          <!-- Linha Superior: Identificação, Voz e Status -->
          <div class="flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <div class="flex items-center gap-2 min-w-0">
              <span id="audio-status-dot" class="w-2 h-2 rounded-full shrink-0 ${dotClass}"></span>
              <span class="font-bold uppercase tracking-wider text-teal-800 dark:text-teal-300 whitespace-nowrap">
                Modo Áudio-Estudo • Podcast Tático
              </span>
              <span id="audio-voice-label" title="${escapeHtml(snap.voiceName || 'Seleção automática pt-BR')}" class="hidden sm:inline-block truncate max-w-[180px] px-2 py-0.5 rounded border hairline-divider subtle-surface opacity-75">
                ${escapeHtml(shortVoice)}
              </span>
            </div>

            <div class="flex items-center gap-2.5 ml-auto">
              <span id="audio-status-label" class="font-medium opacity-80 truncate max-w-[260px]">
                ${escapeHtml(statusText)}
              </span>
              <span id="audio-track-badge" class="font-mono-tabular font-bold px-2 py-0.5 rounded border hairline-divider subtle-surface whitespace-nowrap">
                ${escapeHtml(trackBadgeText)}
              </span>
            </div>
          </div>

          <!-- Linha Principal: Transporte + Velocidade + Modo de Leitura -->
          <div class="flex flex-wrap items-center justify-between gap-2.5">
            <!-- Controles de Reprodução -->
            <div class="flex items-center gap-1.5">
              <button
                id="audio-prev-btn"
                type="button"
                data-action="audio-prev"
                ${disablePrev ? 'disabled' : ''}
                title="Faixa anterior"
                class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border hairline-divider hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-35 disabled:pointer-events-none transition">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/>
                </svg>
                <span class="hidden md:inline">Anterior</span>
              </button>

              <button
                id="audio-play-btn"
                type="button"
                data-action="audio-toggle-play"
                ${disabledTransport ? 'disabled' : ''}
                title="Play / Pausar Podcast Tático (Atalho: A)"
                class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-teal-700 text-white hover:bg-teal-800 disabled:opacity-40 disabled:pointer-events-none shadow-sm transition">
                ${renderAudioPlayButtonInner(isPlaying, isPaused)}
              </button>

              <button
                id="audio-next-btn"
                type="button"
                data-action="audio-next"
                ${disableNext ? 'disabled' : ''}
                title="Próxima faixa / questão"
                class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border hairline-divider hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-35 disabled:pointer-events-none transition">
                <span class="hidden md:inline">Próxima</span>
                <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/>
                </svg>
              </button>

              <button
                id="audio-stop-btn"
                type="button"
                data-action="audio-stop"
                ${disableStop ? 'disabled' : ''}
                title="Parar leitura de áudio"
                class="inline-flex items-center justify-center p-1.5 rounded-lg text-xs border hairline-divider hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300 dark:hover:bg-rose-950/50 dark:hover:text-rose-300 disabled:opacity-35 disabled:pointer-events-none transition">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <rect x="6" y="6" width="12" height="12" rx="1"/>
                </svg>
              </button>
            </div>

            <!-- Controle de Velocidade -->
            <div class="flex items-center gap-1" role="group" aria-label="Velocidade da narração">
              <span class="text-[11px] font-semibold opacity-65 mr-0.5 hidden sm:inline">Vel:</span>
              ${[1, 1.25, 1.5].map((r) => {
                const active = snap.rate === r;
                const label = r === 1 ? '1.0x' : `${r}x`;
                return `
                  <button
                    type="button"
                    data-action="audio-set-rate"
                    data-rate="${r}"
                    aria-pressed="${active}"
                    class="font-mono-tabular px-2 py-1 rounded-md text-[11px] font-bold border transition ${
                      active
                        ? 'bg-slate-900 text-white border-slate-900 dark:bg-teal-500 dark:text-slate-950 dark:border-teal-400'
                        : 'hairline-divider hover:bg-slate-100 dark:hover:bg-slate-800 opacity-80'
                    }">
                    ${label}
                  </button>
                `;
              }).join('')}
            </div>

            <!-- Seletor de Modo de Leitura -->
            <div class="flex flex-wrap items-center gap-1" role="group" aria-label="Modo de leitura do áudio">
              <button
                type="button"
                data-action="audio-set-mode"
                data-audio-mode="pilulas"
                aria-pressed="${snap.mode === 'pilulas'}"
                title="Lê em sequência: Tópico -> Fundamento Legal -> Conexão IF Baiano -> Pílula de Fixação"
                class="px-2.5 py-1 rounded-lg text-[11px] font-bold border transition ${
                  snap.mode === 'pilulas'
                    ? 'border-teal-600 bg-teal-50 text-teal-900 dark:bg-teal-950/60 dark:border-teal-400 dark:text-teal-200'
                    : 'hairline-divider opacity-75 hover:opacity-100 hover:bg-slate-100 dark:hover:bg-slate-800'
                }">
                Playlist de Pílulas &amp; Lei Seca
              </button>
              <button
                type="button"
                data-action="audio-set-mode"
                data-audio-mode="completa"
                aria-pressed="${snap.mode === 'completa'}"
                title="Lê o Enunciado -> pausa 3s -> Alternativa Correta -> Resumo Direto -> Pílula de Fixação"
                class="px-2.5 py-1 rounded-lg text-[11px] font-bold border transition ${
                  snap.mode === 'completa'
                    ? 'border-teal-600 bg-teal-50 text-teal-900 dark:bg-teal-950/60 dark:border-teal-400 dark:text-teal-200'
                    : 'hairline-divider opacity-75 hover:opacity-100 hover:bg-slate-100 dark:hover:bg-slate-800'
                }">
                Questão Completa + Correção
              </button>
            </div>
          </div>
        </div>
      </aside>
    `;
  }

  function renderCountdown(el, countdown) {
    if (!el) return;
    if (countdown.isPast) {
      el.innerHTML = `<span class="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Dia da Prova • 20/12/2026</span>`;
      return;
    }
    const pad = (n) => String(n).padStart(2, '0');
    el.innerHTML = `
      <div class="flex items-center gap-2">
        <span class="hidden sm:inline-block text-[11px] uppercase tracking-wider font-semibold opacity-75">Prova 20/12/2026 • 08h</span>
        <div class="font-mono-tabular text-xs sm:text-sm font-bold px-2.5 py-1 rounded-md border hairline-divider subtle-surface">
          <span class="text-teal-700 dark:text-teal-300">${countdown.days}d</span>
          <span class="opacity-40 mx-0.5">:</span>
          <span>${pad(countdown.hours)}h</span>
          <span class="opacity-40 mx-0.5">:</span>
          <span>${pad(countdown.minutes)}m</span>
          <span class="opacity-40 mx-0.5">:</span>
          <span>${pad(countdown.seconds)}s</span>
        </div>
      </div>
    `;
  }

  function renderQuickTelemetryStrip(telemetry) {
    const pctCorte = Math.min(100, Math.round((telemetry.projectedScore90 / EDITAL_CONFIG.totalPontosObjetiva) * 100));
    const avgStr = telemetry.avgSecondsPerQuestion > 0 ? formatDuration(telemetry.avgSecondsPerQuestion) : '--:--';
    const paceOk = telemetry.avgSecondsPerQuestion === 0 || telemetry.avgSecondsPerQuestion <= EDITAL_CONFIG.targetSecondsPerQuestion;

    return `
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <div class="paper-card rounded-lg px-4 py-3">
          <div class="text-[11px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">Nota Projetada (Tabela 10.1)</div>
          <div class="mt-1 flex items-baseline gap-2">
            <span class="font-mono-tabular text-xl font-bold ${telemetry.projectedScore90 >= EDITAL_CONFIG.metaSeguraTop338 ? 'text-emerald-600 dark:text-emerald-400' : telemetry.projectedScore90 >= EDITAL_CONFIG.minimoEliminatorioObjetiva ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}">
              ${telemetry.projectedScore90.toFixed(2).replace('.', ',')}
            </span>
            <span class="font-mono-tabular text-xs opacity-65">/ 90,00 pts</span>
          </div>
          <div class="mt-1.5 h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
            <div class="h-full bg-teal-600 dark:bg-teal-400 transition-all duration-300" style="width:${pctCorte}%"></div>
          </div>
        </div>

        <div class="paper-card rounded-lg px-4 py-3">
          <div class="text-[11px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">Aproveitamento no Banco</div>
          <div class="mt-1 flex items-baseline gap-2">
            <span class="font-mono-tabular text-xl font-bold">${telemetry.overallAccuracyPct.toFixed(1).replace('.', ',')}%</span>
            <span class="text-xs opacity-70">${telemetry.totalCorrect}/${telemetry.totalAnswered} acertos</span>
          </div>
          <div class="mt-1 text-[11px] opacity-65">Banco ativo: ${telemetry.totalBank} questões</div>
        </div>

        <div class="paper-card rounded-lg px-4 py-3">
          <div class="text-[11px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">Tempo Médio / Questão</div>
          <div class="mt-1 flex items-baseline gap-2">
            <span class="font-mono-tabular text-xl font-bold ${paceOk ? 'text-teal-700 dark:text-teal-300' : 'text-rose-600 dark:text-rose-400'}">${avgStr}</span>
            <span class="text-xs opacity-65">Meta ≤ 02:30</span>
          </div>
          <div class="mt-1 text-[11px] opacity-65">${paceOk ? 'Ritmo dentro do alvo' : 'Atenção: ritmo acima da meta'}</div>
        </div>

        <div class="paper-card rounded-lg px-4 py-3">
          <div class="text-[11px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">Caderno de Erros</div>
          <div class="mt-1 flex items-baseline gap-2">
            <span class="font-mono-tabular text-xl font-bold text-amber-600 dark:text-amber-400">${telemetry.totalWrong}</span>
            <span class="text-xs opacity-70">erradas • ${telemetry.bookmarkCount} salvas</span>
          </div>
          <div class="mt-1 text-[11px] opacity-65">Meta Top 338 AC: ≥ 74,00 pts</div>
        </div>
      </div>
    `;
  }

  function renderExamView(ctx) {
    const {
      allQuestions,
      deck,
      currentIndex,
      activeMode,
      filters,
      showFilters,
      state,
      pendingSelection,
      retakingIds,
      sessionTimer,
      questionElapsedSeconds,
      telemetry,
      audio = null
    } = ctx;

    const audioSnapshot = buildAudioUiSnapshot(audio, deck.length);
    const audioBarHtml = renderAudioPlayerBar(audioSnapshot, deck);

    const currentQ = deck[currentIndex] || null;
    const topics = Array.from(new Set(
      allQuestions
        .filter((q) => !filters.area || filters.area === 'ALL' || q.area === filters.area)
        .map((q) => q.topico_edital)
    )).sort();

    const modeButtons = [
      {
        id: 'tiro_curto',
        label: 'Tiro Curto Ponderado',
        sub: '15q (3 PT • 1 INF • 3 ADM • 8 CE) / 30 min'
      },
      {
        id: 'basicos',
        label: 'Bateria Conhecimentos Básicos',
        sub: 'Desbloqueio 30 pts (PT + INF + ADM)'
      },
      {
        id: 'simulado_60',
        label: 'Simulado Completo Edital',
        sub: '60q Tabela 10.1 / 4h'
      },
      {
        id: 'filtrado',
        label: 'Caderno Filtrado',
        sub: 'Filtro por área, tópico e status'
      }
    ];

    const modeStripHtml = `
      <div class="paper-card rounded-xl p-3 sm:p-4 mb-4">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div class="flex items-center gap-2">
            <span class="inline-flex h-2 w-2 rounded-full bg-teal-500"></span>
            <h2 class="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Modos de Treino Tático</h2>
          </div>
          <button type="button" data-action="toggle-filters" class="text-xs font-semibold px-2.5 py-1 rounded border hairline-divider hover:bg-slate-100 dark:hover:bg-slate-800 transition">
            ${showFilters ? 'Ocultar Filtros' : 'Abrir Filtros do Banco'}
          </button>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          ${modeButtons.map((m) => {
            const isActive = activeMode === m.id;
            return `
              <button
                type="button"
                data-action="select-mode"
                data-mode="${m.id}"
                class="text-left px-3.5 py-2.5 rounded-lg border transition ${
                  isActive
                    ? 'border-teal-600 bg-teal-50/70 dark:bg-teal-950/40 dark:border-teal-400 ring-1 ring-teal-500/30'
                    : 'hairline-divider hover:bg-slate-50 dark:hover:bg-slate-800/70'
                }">
                <div class="flex items-center justify-between gap-2">
                  <span class="text-xs font-bold ${isActive ? 'text-teal-800 dark:text-teal-300' : ''}">${m.label}</span>
                  ${isActive ? '<span class="text-[10px] font-mono-tabular uppercase px-1.5 py-0.5 rounded bg-teal-600 text-white">Ativo</span>' : ''}
                </div>
                <div class="text-[11px] opacity-70 mt-0.5">${m.sub}</div>
              </button>
            `;
          }).join('')}
        </div>

        ${showFilters ? `
          <div class="mt-3 pt-3 border-t hairline-divider grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 animate-panel-reveal">
            <div>
              <label class="block text-[11px] font-semibold uppercase tracking-wider opacity-70 mb-1">Área do Edital</label>
              <select data-filter="area" class="themed-input w-full rounded-md px-2.5 py-1.5 text-xs">
                <option value="ALL" ${filters.area === 'ALL' ? 'selected' : ''}>Todas as Áreas (${allQuestions.length})</option>
                ${EDITAL_CONFIG.areaOrder.map((a) => `
                  <option value="${escapeHtml(a)}" ${filters.area === a ? 'selected' : ''}>${escapeHtml(a)} (Peso ${EDITAL_CONFIG.areas[a].peso.toFixed(0)})</option>
                `).join('')}
              </select>
            </div>
            <div>
              <label class="block text-[11px] font-semibold uppercase tracking-wider opacity-70 mb-1">Tópico do Edital</label>
              <select data-filter="topico" class="themed-input w-full rounded-md px-2.5 py-1.5 text-xs">
                <option value="ALL" ${filters.topico === 'ALL' ? 'selected' : ''}>Todos os Tópicos</option>
                ${topics.map((t) => `
                  <option value="${escapeHtml(t)}" ${filters.topico === t ? 'selected' : ''}>${escapeHtml(t)}</option>
                `).join('')}
              </select>
            </div>
            <div>
              <label class="block text-[11px] font-semibold uppercase tracking-wider opacity-70 mb-1">Dificuldade</label>
              <select data-filter="dificuldade" class="themed-input w-full rounded-md px-2.5 py-1.5 text-xs">
                <option value="ALL" ${filters.dificuldade === 'ALL' ? 'selected' : ''}>Todas</option>
                ${['Fácil', 'Média', 'Média-Alta', 'Alta'].map((d) => `
                  <option value="${d}" ${filters.dificuldade === d ? 'selected' : ''}>${d}</option>
                `).join('')}
              </select>
            </div>
            <div>
              <label class="block text-[11px] font-semibold uppercase tracking-wider opacity-70 mb-1">Status</label>
              <select data-filter="status" class="themed-input w-full rounded-md px-2.5 py-1.5 text-xs">
                <option value="ALL" ${filters.status === 'ALL' ? 'selected' : ''}>Todas</option>
                <option value="UNSEEN" ${filters.status === 'UNSEEN' ? 'selected' : ''}>Não Resolvidas</option>
                <option value="WRONG" ${filters.status === 'WRONG' ? 'selected' : ''}>Erradas - Revisão Obrigatória</option>
                <option value="BOOKMARKED" ${filters.status === 'BOOKMARKED' ? 'selected' : ''}>Favoritas / Caderno de Erros</option>
                <option value="CORRECT" ${filters.status === 'CORRECT' ? 'selected' : ''}>Acertadas</option>
              </select>
            </div>
            <div>
              <label class="block text-[11px] font-semibold uppercase tracking-wider opacity-70 mb-1">Buscar Palavra / ID</label>
              <input
                type="search"
                data-filter="search"
                value="${escapeHtml(filters.search || '')}"
                placeholder="Ex: 14.133, crase, SEI..."
                class="themed-input w-full rounded-md px-2.5 py-1.5 text-xs"
              />
            </div>
          </div>
        ` : ''}
      </div>
    `;

    // Barra do Cronômetro Tático e Ferramentas do Caderno
    const timerDanger = sessionTimer.durationSeconds > 0 && sessionTimer.remainingSeconds <= 300;
    const timerDisplay = sessionTimer.durationSeconds > 0
      ? formatDuration(sessionTimer.remainingSeconds)
      : formatDuration(sessionTimer.elapsedSeconds);

    const sessionBarHtml = `
      <div class="paper-card rounded-xl px-4 py-3 mb-5 flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-2.5">
          <div class="flex items-center gap-1.5">
            <span class="text-[11px] font-bold uppercase tracking-wider opacity-70">Sessão:</span>
            <select id="session-duration-select" data-action="set-timer-duration" class="themed-input rounded px-2 py-1 text-xs font-medium">
              <option value="30" ${sessionTimer.presetMinutes === 30 ? 'selected' : ''}>30 min</option>
              <option value="45" ${sessionTimer.presetMinutes === 45 ? 'selected' : ''}>45 min</option>
              <option value="60" ${sessionTimer.presetMinutes === 60 ? 'selected' : ''}>60 min</option>
              <option value="240" ${sessionTimer.presetMinutes === 240 ? 'selected' : ''}>4h (Prova Real)</option>
              <option value="0" ${sessionTimer.presetMinutes === 0 ? 'selected' : ''}>Livre</option>
            </select>
          </div>
          <div id="session-timer-display" class="font-mono-tabular text-sm font-bold px-2.5 py-1 rounded border hairline-divider ${timerDanger ? 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-700' : 'subtle-surface'}">
            ${timerDisplay}
          </div>
          <button type="button" data-action="toggle-timer" class="px-2.5 py-1 rounded text-xs font-semibold border hairline-divider hover:bg-slate-100 dark:hover:bg-slate-800 transition">
            ${sessionTimer.running ? 'Pausar' : 'Iniciar'}
          </button>
          <button type="button" data-action="reset-timer" class="px-2 py-1 rounded text-xs opacity-75 hover:opacity-100 transition" title="Reiniciar cronômetro">
            Reset
          </button>
          ${currentQ ? `
            <span class="hidden md:inline-block text-xs font-mono-tabular opacity-70 pl-2 border-l hairline-divider">
              Questão atual: <strong id="question-elapsed-display">${formatDuration(questionElapsedSeconds)}</strong>
            </span>
          ` : ''}
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-action="toggle-xray"
            title="Atalho: R — Destaca EXCETO, NÃO, APENAS, prazos e porcentagens"
            class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
              state.xrayEnabled
                ? 'bg-amber-100/80 border-amber-400 text-amber-950 dark:bg-amber-500/20 dark:border-amber-400/60 dark:text-amber-200'
                : 'hairline-divider hover:bg-slate-100 dark:hover:bg-slate-800'
            }">
            <span>Raio-X da Banca</span>
            <span class="font-mono-tabular text-[10px] px-1 rounded bg-black/10 dark:bg-white/10">${state.xrayEnabled ? 'ON' : 'OFF'}</span>
          </button>
          <button
            type="button"
            data-action="open-shortcuts"
            class="px-2.5 py-1.5 rounded-lg text-xs font-medium border hairline-divider hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            title="Atalhos de teclado">
            Atalhos (1-5 • Enter)
          </button>
        </div>
      </div>
    `;

    if (!currentQ) {
      return `
        ${renderQuickTelemetryStrip(telemetry)}
        ${modeStripHtml}
        ${sessionBarHtml}
        <div class="paper-card rounded-xl p-10 text-center max-w-4xl mx-auto">
          <p class="font-exam-serif text-lg font-bold mb-2">Nenhuma questão encontrada neste recorte</p>
          <p class="text-sm opacity-75 mb-5">Ajuste os filtros aplicados ou importe um novo lote JSON com mais questões.</p>
          <div class="flex flex-wrap justify-center gap-3">
            <button type="button" data-action="reset-filters" class="px-4 py-2 rounded-lg text-xs font-bold bg-teal-700 text-white hover:bg-teal-800 transition">
              Limpar Filtros e Mostrar Todas
            </button>
            <button type="button" data-action="select-mode" data-mode="tiro_curto" class="px-4 py-2 rounded-lg text-xs font-bold border hairline-divider hover:bg-slate-100 dark:hover:bg-slate-800 transition">
              Iniciar Tiro Curto Ponderado (15q)
            </button>
          </div>
        </div>
        ${audioBarHtml}
      `;
    }

    const savedAnswer = state.answers[currentQ.id];
    const isRetaking = retakingIds.has(currentQ.id);
    const isLocked = Boolean(savedAnswer) && !isRetaking;
    const activeSelection = isLocked ? savedAnswer.alternativaMarcada : pendingSelection;
    const eliminatedList = state.eliminated[currentQ.id] || [];
    const isBookmarked = Boolean(state.bookmarks[currentQ.id]);
    const personalNote = state.notes[currentQ.id] || '';
    const isSpecificWeight = currentQ.peso >= 2.0;

    // Mapa de Questões do Caderno Atual (navegação rápida tipo folha de rosto/caderno)
    const navigatorHtml = `
      <div class="max-w-4xl mx-auto mb-4">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div class="text-xs font-semibold opacity-80">
            Caderno Ativo: <span class="font-mono-tabular font-bold">${currentIndex + 1}</span> de <span class="font-mono-tabular font-bold">${deck.length}</span> questões
          </div>
          <div class="flex items-center gap-3 text-[11px] opacity-75">
            <span class="inline-flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block"></span> Acerto</span>
            <span class="inline-flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-sm bg-rose-500 inline-block"></span> Erro</span>
            <span class="inline-flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-sm border hairline-divider inline-block"></span> Pendente</span>
          </div>
        </div>
        <div class="flex flex-wrap gap-1.5">
          ${deck.map((item, idx) => {
            const rec = state.answers[item.id];
            const active = idx === currentIndex;
            let colorClass = 'border hairline-divider subtle-surface hover:bg-slate-200 dark:hover:bg-slate-700';
            if (rec) {
              colorClass = rec.acertou
                ? 'bg-emerald-600/15 border border-emerald-500 text-emerald-700 dark:text-emerald-300'
                : 'bg-rose-600/15 border border-rose-500 text-rose-700 dark:text-rose-300';
            }
            if (active) {
              colorClass += ' ring-2 ring-teal-600 dark:ring-teal-400 font-bold';
            }
            return `
              <button
                type="button"
                data-action="jump-question"
                data-index="${idx}"
                class="w-7 h-7 rounded text-[11px] font-mono-tabular transition ${colorClass}"
                title="${escapeHtml(item.area)} • ${escapeHtml(item.id)}">
                ${idx + 1}
              </button>
            `;
          }).join('')}
        </div>
      </div>
    `;

    // Painel de Correção Pedagógica Instantânea
    let feedbackHtml = '';
    if (isLocked && savedAnswer) {
      const cc = currentQ.correcao_comentada;
      const earnedPts = savedAnswer.acertou ? currentQ.peso : 0;
      const tempoQuestao = savedAnswer.tempoSegundos ? formatDuration(savedAnswer.tempoSegundos) : '--:--';
      const isPlayingFeedbackThis = audioSnapshot.feedbackQid === currentQ.id && audioSnapshot.status !== 'idle';

      feedbackHtml = `
        <section id="pedagogical-feedback" class="mt-6 pt-6 border-t-2 hairline-divider animate-panel-reveal space-y-5">
          <!-- Banner de Resultado e Pontuação Ponderada -->
          <div class="rounded-xl p-4 border ${
            savedAnswer.acertou
              ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950 dark:bg-emerald-950/40 dark:border-emerald-700 dark:text-emerald-100'
              : 'bg-rose-50/90 border-rose-300 text-rose-950 dark:bg-rose-950/40 dark:border-rose-700 dark:text-rose-100'
          }">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div class="text-xs font-bold uppercase tracking-wider opacity-80">
                  ${savedAnswer.acertou ? 'Resposta Correta • Gabarito Confirmado' : 'Resposta Incorreta • Atenção ao Distrator'}
                </div>
                <div class="text-base sm:text-lg font-bold mt-0.5">
                  ${savedAnswer.acertou
                    ? `Você marcou ${savedAnswer.alternativaMarcada} e somou +${earnedPts.toFixed(2).replace('.', ',')} ponto(s) no Edital.`
                    : `Você marcou ${savedAnswer.alternativaMarcada} • Gabarito Oficial: ${currentQ.gabarito} (0,00 pt).`}
                </div>
              </div>
              <div class="flex flex-wrap items-center gap-2 font-mono-tabular text-xs">
                <button
                  id="btn-audio-feedback"
                  type="button"
                  data-action="audio-play-feedback"
                  data-qid="${escapeHtml(currentQ.id)}"
                  ${!audioSnapshot.supported ? 'disabled title="Navegador sem suporte à Web Speech API"' : 'title="Ouvir Resumo Direto, Fundamento Legal, Conexão IF Baiano e Pílula desta questão"'}
                  class="font-sans inline-flex items-center gap-1.5 px-3 py-1 rounded-md font-bold border transition ${
                    isPlayingFeedbackThis
                      ? 'bg-slate-900 text-white border-slate-900 dark:bg-teal-400 dark:text-slate-950 dark:border-teal-300'
                      : 'bg-white/85 dark:bg-slate-900/75 border-teal-600/40 text-teal-800 dark:text-teal-200 hover:bg-teal-50 dark:hover:bg-slate-800'
                  } disabled:opacity-40 disabled:pointer-events-none">
                  ${renderAudioFeedbackButtonInner(isPlayingFeedbackThis)}
                </button>
                <span class="px-2.5 py-1 rounded-md bg-white/70 dark:bg-black/30 border border-current/15 font-bold">
                  +${earnedPts.toFixed(2).replace('.', ',')} / ${currentQ.peso.toFixed(2).replace('.', ',')} pts
                </span>
                <span class="px-2.5 py-1 rounded-md bg-white/70 dark:bg-black/30 border border-current/15">
                  Tempo: ${tempoQuestao} (meta ${formatDuration(currentQ.tempo_estimado_segundos)})
                </span>
                <span class="px-2.5 py-1 rounded-md bg-white/70 dark:bg-black/30 border border-current/15">
                  Tentativas: ${savedAnswer.tentativas || 1}
                </span>
              </div>
            </div>
            <p class="mt-2.5 text-sm leading-relaxed">${formatExamText(cc.resumo_direto, false)}</p>
          </div>

          <!-- Fundamento Legal / Teórico Direto -->
          <div class="subtle-surface rounded-xl p-4">
            <div class="text-[11px] font-bold uppercase tracking-wider text-teal-700 dark:text-teal-300 mb-1">
              Fundamento Legal / Teórico Direto
            </div>
            <p class="text-sm font-medium leading-relaxed">${formatExamText(cc.fundamento_legal_ou_teorico, false)}</p>
          </div>

          <!-- Análise Alternativa por Alternativa (A a E) -->
          <div>
            <h3 class="text-xs font-bold uppercase tracking-wider opacity-75 mb-2.5">
              Análise Alternativa por Alternativa (Raio-X dos Distratores)
            </h3>
            <div class="space-y-2">
              ${VALID_OPTIONS.map((letter) => {
                const isRight = letter === currentQ.gabarito;
                const isChosen = letter === savedAnswer.alternativaMarcada;
                const analysisText = cc.analise_alternativas[letter] || '';
                return `
                  <div class="rounded-lg p-3 border text-sm ${
                    isRight
                      ? 'border-emerald-400/70 bg-emerald-50/50 dark:bg-emerald-950/25 dark:border-emerald-700'
                      : isChosen
                        ? 'border-rose-400/70 bg-rose-50/50 dark:bg-rose-950/25 dark:border-rose-700'
                        : 'hairline-divider subtle-surface'
                  }">
                    <div class="flex flex-wrap items-center gap-2 mb-1">
                      <span class="font-mono-tabular font-bold text-xs px-2 py-0.5 rounded ${
                        isRight ? 'bg-emerald-600 text-white' : isChosen ? 'bg-rose-600 text-white' : 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100'
                      }">${letter}</span>
                      <span class="text-[11px] font-bold uppercase tracking-wider ${
                        isRight ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'
                      }">${isRight ? 'CORRETA' : 'INCORRETA'}</span>
                      ${isChosen ? '<span class="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900">Sua marcação</span>' : ''}
                    </div>
                    <p class="leading-relaxed opacity-90">${formatExamText(analysisText, false)}</p>
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <!-- Box Especial: Conexão IF Baiano -> Lei Seca -->
          <div class="rounded-xl p-4 border-l-4 border-teal-600 dark:border-teal-400 bg-teal-50/60 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800/70">
            <div class="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-teal-800 dark:text-teal-300 mb-1.5">
              <span>Conexão IF Baiano (Reitoria / SEI / SUAP) → Lei Seca Avalia</span>
            </div>
            <p class="text-sm leading-relaxed">${formatExamText(cc.conexao_pratica_ifbaiano, false)}</p>
          </div>

          <!-- Pílula de Fixação (Flash-Resumo) -->
          <div class="rounded-xl px-4 py-3 bg-slate-900 text-slate-50 dark:bg-slate-950 border border-slate-700 flex items-start gap-3">
            <span class="shrink-0 font-mono-tabular text-[11px] uppercase tracking-wider font-bold px-2 py-0.5 rounded bg-amber-400 text-slate-950 mt-0.5">
              Pílula
            </span>
            <p class="text-sm font-semibold leading-snug">${formatExamText(cc.pilula_fixacao, false)}</p>
          </div>

          <!-- Anotação Pessoal & Caderno de Erros -->
          <div class="subtle-surface rounded-xl p-4">
            <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
              <label for="question-note-input" class="text-xs font-bold uppercase tracking-wider opacity-75">
                Anotação Pessoal de Pedro (Salva Automaticamente)
              </label>
              <button
                type="button"
                data-action="toggle-bookmark"
                data-qid="${escapeHtml(currentQ.id)}"
                class="text-xs font-semibold px-2.5 py-1 rounded border transition ${
                  isBookmarked
                    ? 'bg-amber-100 border-amber-400 text-amber-900 dark:bg-amber-500/20 dark:border-amber-400 dark:text-amber-200'
                    : 'hairline-divider hover:bg-slate-200 dark:hover:bg-slate-700'
                }">
                ${isBookmarked ? '★ Salva no Caderno de Erros' : '☆ Salvar no Caderno de Erros'}
              </button>
            </div>
            <textarea
              id="question-note-input"
              data-action="save-note"
              data-qid="${escapeHtml(currentQ.id)}"
              rows="2"
              placeholder="Escreva um lembrete pessoal, artigo de lei ou conexão com sua rotina..."
              class="themed-input w-full rounded-lg px-3 py-2 text-sm resize-y">${escapeHtml(personalNote)}</textarea>
          </div>
        </section>
      `;
    }

    return `
      ${renderQuickTelemetryStrip(telemetry)}
      ${modeStripHtml}
      ${sessionBarHtml}
      ${navigatorHtml}

      <!-- Caderno de Prova Real -->
      <article class="paper-card rounded-2xl max-w-4xl mx-auto overflow-hidden">
        <!-- Cabeçalho Técnico da Questão -->
        <header class="px-5 sm:px-7 py-4 border-b hairline-divider subtle-surface flex flex-wrap items-center justify-between gap-3">
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-mono-tabular text-xs font-bold px-2.5 py-1 rounded bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">
              QUESTÃO ${String(currentIndex + 1).padStart(2, '0')}
            </span>
            <span class="text-xs font-bold px-2.5 py-1 rounded border hairline-divider bg-white dark:bg-slate-800">
              ${escapeHtml(currentQ.area)}
            </span>
            <span class="font-mono-tabular text-xs font-bold px-2.5 py-1 rounded ${
              isSpecificWeight
                ? 'bg-teal-600 text-white'
                : 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200'
            }">
              Peso ${currentQ.peso.toFixed(2).replace('.', ',')} pt${currentQ.peso > 1 ? 's' : ''}
            </span>
            <span class="text-xs font-medium px-2 py-0.5 rounded border hairline-divider opacity-85">
              ${escapeHtml(currentQ.dificuldade)}
            </span>
          </div>

          <div class="flex items-center gap-2">
            <span class="font-mono-tabular text-[11px] opacity-65">${escapeHtml(currentQ.id)}</span>
            <button
              type="button"
              data-action="toggle-bookmark"
              data-qid="${escapeHtml(currentQ.id)}"
              title="Atalho: F — Favoritar / Caderno de Erros"
              class="px-2.5 py-1 rounded-md text-xs font-semibold border transition ${
                isBookmarked
                  ? 'bg-amber-100 border-amber-400 text-amber-900 dark:bg-amber-500/20 dark:border-amber-400 dark:text-amber-200'
                  : 'hairline-divider hover:bg-slate-200 dark:hover:bg-slate-700'
              }">
              ${isBookmarked ? '★ Revisar' : '☆ Revisar'}
            </button>
          </div>
        </header>

        <!-- Submeta: Tópico do Edital + Perfil de Cobrança -->
        <div class="px-5 sm:px-7 py-2.5 border-b hairline-divider flex flex-wrap items-center justify-between gap-2 text-xs opacity-80">
          <span><strong>Tópico:</strong> ${escapeHtml(currentQ.topico_edital)}</span>
          <span><strong>Perfil:</strong> ${escapeHtml(currentQ.perfil_cobranca)}</span>
        </div>

        <!-- Corpo Editorial da Questão -->
        <div class="px-5 sm:px-7 py-6">
          ${currentQ.texto_apoio ? `
            <blockquote class="mb-5 p-4 rounded-xl border-l-4 border-slate-400 dark:border-slate-500 subtle-surface font-exam-serif text-[15.5px] leading-relaxed">
              <div class="font-sans text-[10px] font-bold uppercase tracking-widest opacity-60 mb-1.5">Texto de Apoio</div>
              ${formatExamText(currentQ.texto_apoio, state.xrayEnabled)}
            </blockquote>
          ` : ''}

          <div class="font-exam-serif text-[16.5px] sm:text-[17.5px] leading-[1.7] mb-6">
            ${formatExamText(currentQ.enunciado, state.xrayEnabled)}
          </div>

          ${state.xrayEnabled ? `
            <div class="mb-4 flex flex-wrap items-center gap-3 text-[11px] opacity-75">
              <span><strong>Raio-X ativo:</strong></span>
              <span class="inline-flex items-center gap-1"><mark class="xray-trap">Termos restritivos</mark></span>
              <span class="inline-flex items-center gap-1"><mark class="xray-metric">Prazos / % / quantidades</mark></span>
              <span class="ml-auto hidden sm:inline opacity-75">Dica: clique direito ou tesoura risca alternativas</span>
            </div>
          ` : ''}

          <!-- Alternativas A-E -->
          <div class="space-y-2.5" role="radiogroup" aria-label="Alternativas da questão">
            ${VALID_OPTIONS.map((letter, idx) => {
              const isSelected = activeSelection === letter;
              const isEliminated = eliminatedList.includes(letter);
              const isCorrectOption = isLocked && letter === currentQ.gabarito;
              const isWrongSelected = isLocked && isSelected && !isCorrectOption;

              let rowClasses = 'hairline-divider hover:border-teal-600/60 hover:bg-slate-50 dark:hover:bg-slate-800/60';
              let badgeClasses = 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-600';

              if (isLocked) {
                if (isCorrectOption) {
                  rowClasses = 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/35 dark:border-emerald-500';
                  badgeClasses = 'bg-emerald-600 text-white border-emerald-600';
                } else if (isWrongSelected) {
                  rowClasses = 'border-rose-500 bg-rose-50/70 dark:bg-rose-950/35 dark:border-rose-500';
                  badgeClasses = 'bg-rose-600 text-white border-rose-600';
                } else {
                  rowClasses = 'hairline-divider opacity-80';
                }
              } else if (isSelected) {
                rowClasses = 'border-teal-600 bg-teal-50/70 dark:bg-teal-950/35 dark:border-teal-400 ring-1 ring-teal-500/30';
                badgeClasses = 'bg-teal-700 text-white border-teal-700 dark:bg-teal-500 dark:text-slate-950 dark:border-teal-500';
              }

              return `
                <div
                  data-option-row="${letter}"
                  class="option-row flex items-stretch gap-2 rounded-xl border p-3 sm:p-3.5 transition ${rowClasses} ${isEliminated ? 'is-eliminated' : ''}">
                  <button
                    type="button"
                    data-action="select-option"
                    data-option="${letter}"
                    ${isLocked ? 'disabled' : ''}
                    aria-pressed="${isSelected}"
                    class="flex-1 flex items-start gap-3 text-left focus:outline-none">
                    <span class="option-letter shrink-0 w-7 h-7 rounded-lg border font-mono-tabular text-xs font-bold flex items-center justify-center mt-0.5 transition ${badgeClasses}">
                      ${letter}
                    </span>
                    <span class="option-text text-[15px] leading-relaxed pt-0.5">
                      ${formatExamText(currentQ.alternativas[letter], false)}
                    </span>
                  </button>

                  ${!isLocked ? `
                    <button
                      type="button"
                      data-action="toggle-eliminate"
                      data-option="${letter}"
                      title="${isEliminated ? 'Restaurar alternativa' : 'Riscar alternativa (eliminação tática)'}"
                      class="shrink-0 self-center p-2 rounded-lg text-xs border transition ${
                        isEliminated
                          ? 'border-amber-400 bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200'
                          : 'border-transparent hover:border-slate-300 dark:hover:border-slate-600 opacity-55 hover:opacity-100'
                      }">
                      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/>
                      </svg>
                    </button>
                  ` : ''}
                </div>
              `;
            }).join('')}
          </div>

          <!-- Ações de Confirmação e Navegação -->
          <div class="mt-6 pt-4 border-t hairline-divider flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-2">
              <button
                type="button"
                data-action="prev-question"
                ${currentIndex <= 0 ? 'disabled' : ''}
                class="px-3.5 py-2 rounded-lg text-xs font-semibold border hairline-divider hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-35 disabled:pointer-events-none transition">
                ← Anterior
              </button>
              <button
                type="button"
                data-action="next-question"
                ${currentIndex >= deck.length - 1 ? 'disabled' : ''}
                class="px-3.5 py-2 rounded-lg text-xs font-semibold border hairline-divider hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-35 disabled:pointer-events-none transition">
                Próxima →
              </button>
            </div>

            <div class="flex items-center gap-2.5">
              ${isLocked ? `
                <button
                  type="button"
                  data-action="retake-question"
                  data-qid="${escapeHtml(currentQ.id)}"
                  class="px-4 py-2 rounded-lg text-xs font-semibold border hairline-divider hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                  Refazer Esta Questão
                </button>
                ${currentIndex < deck.length - 1 ? `
                  <button
                    type="button"
                    data-action="next-question"
                    class="px-5 py-2.5 rounded-lg text-xs font-bold bg-teal-700 text-white hover:bg-teal-800 shadow-sm transition">
                    Avançar para Próxima →
                  </button>
                ` : ''}
              ` : `
                <button
                  type="button"
                  data-action="confirm-answer"
                  ${!activeSelection ? 'disabled' : ''}
                  class="px-6 py-2.5 rounded-lg text-xs sm:text-sm font-bold bg-teal-700 text-white hover:bg-teal-800 disabled:opacity-40 disabled:pointer-events-none shadow-sm transition">
                  Confirmar Resposta (Enter)
                </button>
              `}
            </div>
          </div>

          ${feedbackHtml}
        </div>
      </article>

      ${audioBarHtml}
    `;
  }

  function renderTelemetryView(telemetry) {
    const score = telemetry.projectedScore90;
    const minPct = (EDITAL_CONFIG.minimoEliminatorioObjetiva / EDITAL_CONFIG.totalPontosObjetiva) * 100; // 50%
    const safePct = (EDITAL_CONFIG.metaSeguraTop338 / EDITAL_CONFIG.totalPontosObjetiva) * 100; // ~82.2%
    const currentPct = Math.min(100, (score / EDITAL_CONFIG.totalPontosObjetiva) * 100);

    let statusBanner = {
      tone: 'bg-slate-100 border-slate-300 text-slate-800 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100',
      title: 'Aguardando Primeiras Respostas',
      desc: 'Resolva questões de todas as 4 áreas para projetar sua nota real na Tabela 10.1.'
    };

    if (telemetry.barrierStatus === 'RISCO_DISCIPLINA_ZERADA') {
      statusBanner = {
        tone: 'bg-rose-50 border-rose-300 text-rose-950 dark:bg-rose-950/40 dark:border-rose-700 dark:text-rose-100',
        title: 'ALERTA DE CLÁUSULA DE BARREIRA (Item 10.3.1): Disciplina Zerada!',
        desc: `Você está com 0 acertos em: ${telemetry.zeroedAreas.join(', ')}. O Edital elimina automaticamente quem zerar qualquer área, mesmo somando ≥ 45 pontos.`
      };
    } else if (telemetry.barrierStatus === 'DISCIPLINA_PENDENTE') {
      statusBanner = {
        tone: 'bg-amber-50 border-amber-300 text-amber-950 dark:bg-amber-950/40 dark:border-amber-700 dark:text-amber-100',
        title: 'Disciplinas Ainda Não Avaliadas no Simulador',
        desc: `Você ainda não respondeu questões de: ${telemetry.unansweredAreas.join(', ')}. No ritmo atual das disciplinas respondidas, sua projeção proporcional seria de ${telemetry.paceProjected90.toFixed(2).replace('.', ',')} / 90,00 pts. Desbloqueie os pontos pendentes!`
      };
    } else if (telemetry.barrierStatus === 'ELIMINADO_NOTA_MINIMA') {
      statusBanner = {
        tone: 'bg-rose-50 border-rose-300 text-rose-950 dark:bg-rose-950/40 dark:border-rose-700 dark:text-rose-100',
        title: 'Abaixo do Mínimo Eliminatório (< 45,00 pontos)',
        desc: 'Pelo subitem 10.3.1, é obrigatório alcançar pelo menos 50% da Objetiva (45,00 pts) e não zerar nenhuma disciplina. Priorize os tópicos errados e Conhecimentos Específicos (peso 2,00).'
      };
    } else if (telemetry.barrierStatus === 'HABILITADO_ABAIXO_CORTE') {
      statusBanner = {
        tone: 'bg-amber-50 border-amber-300 text-amber-950 dark:bg-amber-950/40 dark:border-amber-700 dark:text-amber-100',
        title: 'Acima do Mínimo Eliminatório, mas Abaixo da Meta Segura Top 338 (74,00 pts)',
        desc: 'Você passou da barreira de 45 pts, mas para garantir a correção da Redação entre os 338 melhores da Ampla Concorrência (Tabela 13.1), o alvo seguro é ≥ 74,00 pontos.'
      };
    } else if (telemetry.barrierStatus === 'ZONA_CORTE_338') {
      statusBanner = {
        tone: 'bg-emerald-50 border-emerald-300 text-emerald-950 dark:bg-emerald-950/40 dark:border-emerald-700 dark:text-emerald-100',
        title: 'NA ZONA DE CLASSIFICAÇÃO PARA REDAÇÃO (Top 338 AC • Meta ≥ 74,00 pts)!',
        desc: 'Excelente projeção ponderada sem disciplinas zeradas. Mantenha a consistência nos Conhecimentos Básicos e no Caderno de Erros até 20/12.'
      };
    }

    return `
      <div class="max-w-5xl mx-auto space-y-6">
        <!-- Banner de Status Cláusula de Barreira -->
        <div class="rounded-2xl border p-5 ${statusBanner.tone}">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="text-sm sm:text-base font-bold">${statusBanner.title}</h2>
              <p class="text-sm mt-1 opacity-90">${statusBanner.desc}</p>
            </div>
            <button type="button" data-action="select-mode" data-mode="basicos" class="shrink-0 px-4 py-2 rounded-lg text-xs font-bold bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:opacity-90 transition">
              Treinar Conhecimentos Básicos
            </button>
          </div>
        </div>

        <!-- Termômetro da Linha de Corte (90,00 pontos) -->
        <section class="paper-card rounded-2xl p-6">
          <div class="flex flex-wrap items-end justify-between gap-4 mb-5">
            <div>
              <h3 class="text-xs font-bold uppercase tracking-wider text-teal-700 dark:text-teal-300">
                Termômetro da Linha de Corte — Edital UFBA nº 007/2026 (Tabelas 10.1 e 13.1)
              </h3>
              <p class="text-sm opacity-75 mt-1">
                Projeção calculada pelo aproveitamento real multiplicado pelo peso e total de questões de cada disciplina na prova oficial (60 questões = 90,00 pts).
              </p>
            </div>
            <div class="text-right">
              <div class="font-mono-tabular text-3xl font-bold">${score.toFixed(2).replace('.', ',')} <span class="text-base font-normal opacity-60">/ 90,00 pts</span></div>
              <div class="text-xs opacity-70">Vagas Cargo 201: 94 totais (55 AC) • Redações corrigidas AC: 338</div>
            </div>
          </div>

          <div class="relative pt-7 pb-9">
            <!-- Marcadores superiores -->
            <div class="absolute top-0 text-[11px] font-mono-tabular font-bold text-rose-600 dark:text-rose-400 -translate-x-1/2" style="left: ${minPct}%">
              45,00 pts (Mín. 50%)
            </div>
            <div class="absolute top-0 text-[11px] font-mono-tabular font-bold text-emerald-700 dark:text-emerald-300 -translate-x-1/2" style="left: ${safePct}%">
              74,00 pts (Meta Top 338)
            </div>

            <!-- Barra com zonas -->
            <div class="relative h-6 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden flex border hairline-divider">
              <div class="h-full bg-rose-500/20 border-r border-rose-500/40" style="width: 50%"></div>
              <div class="h-full bg-amber-500/20 border-r border-emerald-500/50" style="width: 32.22%"></div>
              <div class="h-full bg-emerald-500/20" style="width: 17.78%"></div>

              <!-- Preenchimento atual -->
              <div class="absolute inset-y-0 left-0 bg-gradient-to-r from-teal-700 to-teal-500 transition-all duration-500 rounded-l-full" style="width: ${currentPct}%"></div>
            </div>

            <!-- Linhas verticais de referência -->
            <div class="absolute top-6 h-8 w-0.5 bg-rose-600 dark:bg-rose-400" style="left: ${minPct}%"></div>
            <div class="absolute top-6 h-8 w-0.5 bg-emerald-600 dark:bg-emerald-400" style="left: ${safePct}%"></div>

            <!-- Legenda inferior -->
            <div class="mt-4 grid grid-cols-3 text-[11px] opacity-75">
              <div>0 – 44,99 pts: Eliminado</div>
              <div class="text-center">45,00 – 73,99 pts: Habilitado (Risco Corte)</div>
              <div class="text-right font-semibold text-emerald-700 dark:text-emerald-300">74,00 – 90,00 pts: Zona Top 338 AC</div>
            </div>
          </div>
        </section>

        <!-- Tabela 10.1 Detalhada por Disciplina -->
        <section class="paper-card rounded-2xl overflow-hidden">
          <div class="px-6 py-4 border-b hairline-divider subtle-surface flex flex-wrap items-center justify-between gap-2">
            <h3 class="text-sm font-bold">Desempenho por Disciplina (Tabela 10.1 Oficial)</h3>
            <span class="text-xs opacity-70">Proibido zerar qualquer disciplina (Subitem 10.3.1)</span>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead class="text-[11px] uppercase tracking-wider opacity-70 border-b hairline-divider">
                <tr>
                  <th class="px-5 py-3">Área de Conhecimento</th>
                  <th class="px-4 py-3 text-center">Prova Real</th>
                  <th class="px-4 py-3 text-center">Peso</th>
                  <th class="px-4 py-3 text-center">No Banco</th>
                  <th class="px-4 py-3 text-center">Respondidas</th>
                  <th class="px-4 py-3 text-center">Acerto (%)</th>
                  <th class="px-5 py-3 text-right">Nota Projetada</th>
                </tr>
              </thead>
              <tbody class="divide-y hairline-divider">
                ${telemetry.areaStats.map((st) => `
                  <tr class="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                    <td class="px-5 py-3.5">
                      <div class="font-semibold">${escapeHtml(st.area)}</div>
                      <div class="text-[11px] opacity-65">${escapeHtml(st.tipo)}</div>
                    </td>
                    <td class="px-4 py-3.5 text-center font-mono-tabular">${st.editalQuestoes} q</td>
                    <td class="px-4 py-3.5 text-center font-mono-tabular font-bold ${st.peso >= 2 ? 'text-teal-700 dark:text-teal-300' : ''}">${st.peso.toFixed(2).replace('.', ',')}</td>
                    <td class="px-4 py-3.5 text-center font-mono-tabular">${st.bankCount}</td>
                    <td class="px-4 py-3.5 text-center font-mono-tabular">${st.correct}/${st.answered}</td>
                    <td class="px-4 py-3.5 text-center font-mono-tabular font-semibold">
                      ${st.answered > 0 ? `${st.accuracyPct.toFixed(1).replace('.', ',')}%` : '—'}
                    </td>
                    <td class="px-5 py-3.5 text-right font-mono-tabular font-bold">
                      ${st.projectedPoints.toFixed(2).replace('.', ',')} <span class="font-normal opacity-60">/ ${st.maxPontos.toFixed(2).replace('.', ',')}</span>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </section>

        <!-- Subtópicos do Edital + Ordem de Desempate -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <section class="lg:col-span-2 paper-card rounded-2xl p-5">
            <h3 class="text-sm font-bold mb-3">Mapeamento por Tópico do Edital</h3>
            <div class="space-y-3 max-h-[420px] overflow-y-auto pr-1">
              ${telemetry.topicBreakdown.map((t) => {
                const barWidth = t.accuracyPct !== null ? t.accuracyPct : 0;
                const barColor = t.accuracyPct === null
                  ? 'bg-slate-300 dark:bg-slate-700'
                  : t.accuracyPct >= 80
                    ? 'bg-emerald-600'
                    : t.accuracyPct >= 50
                      ? 'bg-amber-500'
                      : 'bg-rose-600';
                return `
                  <div class="subtle-surface rounded-lg p-3">
                    <div class="flex flex-wrap items-center justify-between gap-2 text-xs mb-1.5">
                      <span class="font-semibold">${escapeHtml(t.topico)}</span>
                      <span class="font-mono-tabular opacity-80">
                        ${t.answered > 0 ? `${t.correct}/${t.answered} (${t.accuracyPct}%)` : `0/${t.total} respondidas`}
                      </span>
                    </div>
                    <div class="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                      <div class="h-full ${barColor}" style="width: ${barWidth}%"></div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </section>

          <section class="paper-card rounded-2xl p-5">
            <h3 class="text-sm font-bold mb-2">Critérios de Desempate (Item 19.2)</h3>
            <p class="text-xs opacity-75 mb-3">Em caso de empate na nota final (Objetiva + Redação), o Edital nº 007/2026 adota exatamente esta prioridade:</p>
            <ol class="space-y-2 text-xs">
              ${EDITAL_CONFIG.tiebreakers.map((tb) => `
                <li class="subtle-surface rounded-lg px-3 py-2 font-medium">${escapeHtml(tb)}</li>
              `).join('')}
            </ol>
            <div class="mt-4 p-3 rounded-lg border border-teal-500/30 bg-teal-50/50 dark:bg-teal-950/30 text-xs leading-relaxed">
              <strong>Estratégia Prática:</strong> Conhecimentos Específicos vale <strong>60 dos 90 pontos</strong> e é o <strong>1º desempate técnico</strong> (além da idade ≥ 60). Sem esquecer o desbloqueio dos 30 pontos básicos!
            </div>
          </section>
        </div>
      </div>
    `;
  }

  function renderErrorNotebookView(allQuestions, state, audio = null) {
    const answers = state.answers || {};
    const bookmarks = state.bookmarks || {};
    const notes = state.notes || {};

    const { wrongItems, bookmarkedCount, notedCount, combined } = getErrorNotebookQuestions(allQuestions, state);
    const audioSnapshot = buildAudioUiSnapshot(audio, combined.length);
    const isPlaylistActiveInErrors = audioSnapshot.playlistKind === 'errors' && audioSnapshot.status !== 'idle';
    const audioBarHtml = renderAudioPlayerBar(audioSnapshot, combined, 'max-w-5xl');

    return `
      <div class="max-w-5xl mx-auto space-y-5">
        <div class="paper-card rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 class="text-base font-bold">Caderno de Erros, Favoritas e Anotações Pessoais</h2>
            <p class="text-xs opacity-75 mt-1">
              ${wrongItems.length} errada(s) em revisão obrigatória • ${bookmarkedCount} marcada(s) como favorita • ${notedCount} anotação(ões)
            </p>
          </div>
          <button
            type="button"
            data-action="train-errors"
            ${combined.length === 0 ? 'disabled' : ''}
            class="px-4 py-2.5 rounded-lg text-xs font-bold bg-teal-700 text-white hover:bg-teal-800 disabled:opacity-40 disabled:pointer-events-none transition">
            Treinar Apenas Caderno de Erros (${combined.length})
          </button>
        </div>

        ${combined.length === 0 ? `
          <div class="paper-card rounded-2xl p-10 text-center">
            <p class="font-exam-serif text-base font-bold mb-1">Seu Caderno de Erros está limpo</p>
            <p class="text-sm opacity-75">Questões que você errar, favoritar com "☆ Revisar" ou anotar aparecerão organizadas aqui para revisão cirúrgica.</p>
          </div>
        ` : `
          <div class="space-y-3">
            ${combined.map((q) => {
              const rec = answers[q.id];
              const isWrong = rec && !rec.acertou;
              const isBookmarked = Boolean(bookmarks[q.id]);
              const note = notes[q.id] || '';
              const isAudioActiveCard = isPlaylistActiveInErrors && audioSnapshot.currentTrackId === q.id;
              return `
                <div data-error-qid="${escapeHtml(q.id)}" class="paper-card rounded-xl p-4 sm:p-5 transition ${isAudioActiveCard ? 'audio-playing-card' : ''}">
                  <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="font-mono-tabular text-[11px] font-bold px-2 py-0.5 rounded bg-slate-900 text-white dark:bg-slate-200 dark:text-slate-900">${escapeHtml(q.id)}</span>
                      <span class="text-xs font-semibold">${escapeHtml(q.area)} (Peso ${q.peso.toFixed(0)})</span>
                      ${isWrong ? '<span class="text-[11px] font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200">Revisão Obrigatória</span>' : ''}
                      ${isBookmarked ? '<span class="text-[11px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200">★ Favorita</span>' : ''}
                    </div>
                    <button
                      type="button"
                      data-action="open-question-from-notebook"
                      data-qid="${escapeHtml(q.id)}"
                      class="px-3 py-1.5 rounded-lg text-xs font-bold border hairline-divider hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                      Abrir no Caderno →
                    </button>
                  </div>
                  <div class="text-xs opacity-70 mb-2">${escapeHtml(q.topico_edital)}</div>
                  <p class="font-exam-serif text-sm leading-relaxed mb-3">${escapeHtml(q.enunciado)}</p>
                  <div class="rounded-lg px-3 py-2 bg-slate-900 text-slate-100 dark:bg-slate-950 text-xs">
                    <strong class="text-amber-300">Pílula:</strong> ${escapeHtml(q.correcao_comentada.pilula_fixacao)}
                  </div>
                  ${note.trim() ? `
                    <div class="mt-2.5 rounded-lg px-3 py-2 subtle-surface text-xs">
                      <strong>Sua nota:</strong> ${escapeHtml(note)}
                    </div>
                  ` : ''}
                </div>
              `;
            }).join('')}
          </div>
        `}
        ${audioBarHtml}
      </div>
    `;
  }

  function renderEssayGuideView(essayState) {
    const selectedTheme = PROBABLE_THEMES.find((t) => t.id === essayState.selectedThemeId) || PROBABLE_THEMES[0];
    const checklist = essayState.checklist || {};
    const scores = essayState.selfScores || { c1: 12, c2: 12, c3: 12, c4: 12 };
    const totalEssayScore = Number(scores.c1 || 0) + Number(scores.c2 || 0) + Number(scores.c3 || 0) + Number(scores.c4 || 0);
    const metrics = estimateEssayLines(essayState.draftText || '');

    const linesHealthy = metrics.estimatedLines >= 20 && metrics.estimatedLines <= 30;
    const totalChecked = Object.values(checklist).filter(Boolean).length;
    const totalCheckItems = TABELA_13_2.reduce((sum, crit) => sum + crit.checklist.length, 0);

    return `
      <div class="max-w-5xl mx-auto space-y-6">
        <!-- Cabeçalho da Prova de Redação (Item 13) -->
        <section class="paper-card rounded-2xl p-6">
          <div class="flex flex-wrap items-center justify-between gap-4">
            <div>
              <span class="text-[11px] font-bold uppercase tracking-wider text-teal-700 dark:text-teal-300">
                2ª Fase Eliminatória e Classificatória • Tabela 13.2 (Edital nº 007/2026)
              </span>
              <h2 class="text-lg sm:text-xl font-bold mt-1">Guia de Redação Nota 60 — Esqueletos & Checklist Oficial</h2>
              <p class="text-sm opacity-75 mt-1">
                Tipologia: <strong>Dissertação-Argumentativa</strong> • Extensão obrigatória: <strong>20 a 30 linhas</strong> • Mínimo eliminatório: <strong>30,00 / 60,00 pontos</strong>.
              </p>
            </div>
            <div class="subtle-surface rounded-xl px-4 py-3 text-right">
              <div class="text-[11px] uppercase tracking-wider font-semibold opacity-70">Checklist Concluído</div>
              <div class="font-mono-tabular text-xl font-bold text-teal-700 dark:text-teal-300">${totalChecked} / ${totalCheckItems}</div>
            </div>
          </div>

          <!-- Regras de Nota Zero (Item 13.8) -->
          <div class="mt-5 rounded-xl border border-rose-300 bg-rose-50/70 dark:bg-rose-950/30 dark:border-rose-800 p-4">
            <h3 class="text-xs font-bold uppercase tracking-wider text-rose-800 dark:text-rose-300 mb-2">
              Fatores de Nota ZERO e Eliminação Automática (Subitem 13.8)
            </h3>
            <ul class="grid grid-cols-1 md:grid-cols-2 gap-1.5 text-xs leading-relaxed">
              ${ZERO_SCORE_RULES.map((rule) => `
                <li class="flex items-start gap-2">
                  <span class="font-bold text-rose-600 dark:text-rose-400">×</span>
                  <span>${escapeHtml(rule)}</span>
                </li>
              `).join('')}
            </ul>
          </div>
        </section>

        <!-- Checklist Interativo dos 4 Critérios de 15 Pontos (Tabela 13.2) -->
        <section class="grid grid-cols-1 md:grid-cols-2 gap-4">
          ${TABELA_13_2.map((crit) => `
            <div class="paper-card rounded-xl p-5 flex flex-col justify-between">
              <div>
                <div class="flex items-start justify-between gap-2 mb-3">
                  <h3 class="text-sm font-bold leading-snug">${escapeHtml(crit.aspecto)}</h3>
                  <span class="shrink-0 font-mono-tabular text-xs font-bold px-2 py-0.5 rounded bg-teal-600 text-white">
                    ${crit.maxPontos} pts
                  </span>
                </div>
                <div class="space-y-2">
                  ${crit.checklist.map((item) => {
                    const checked = Boolean(checklist[item.id]);
                    return `
                      <label class="flex items-start gap-2.5 text-xs leading-relaxed cursor-pointer p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60 transition">
                        <input
                          type="checkbox"
                          data-action="toggle-essay-check"
                          data-check-id="${item.id}"
                          ${checked ? 'checked' : ''}
                          class="mt-0.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                        />
                        <span class="${checked ? 'line-through opacity-60' : ''}">${escapeHtml(item.label)}</span>
                      </label>
                    `;
                  }).join('')}
                </div>
              </div>

              <div class="mt-4 pt-3 border-t hairline-divider flex items-center justify-between gap-3">
                <span class="text-xs font-semibold opacity-75">Autoavaliação:</span>
                <div class="flex items-center gap-2">
                  <input
                    type="range"
                    min="0"
                    max="15"
                    step="0.5"
                    data-action="set-essay-score"
                    data-criterion="${crit.id}"
                    value="${scores[crit.id] ?? 12}"
                    class="w-28 accent-teal-600"
                  />
                  <span data-score-display="${crit.id}" class="font-mono-tabular text-xs font-bold w-12 text-right">${Number(scores[crit.id] ?? 12).toFixed(1).replace('.', ',')}</span>
                </div>
              </div>
            </div>
          `).join('')}
        </section>

        <!-- Simulador de Nota Total da Redação -->
        <div class="paper-card rounded-xl px-5 py-4 flex flex-wrap items-center justify-between gap-3">
          <div class="text-sm">
            <strong>Projeção na Prova de Redação (Tabela 13.2):</strong>
            <span id="essay-score-status" class="opacity-80 ml-1">${totalEssayScore >= 30 ? 'Aprovado na Redação (≥ 30,00 pts)' : 'Abaixo do mínimo eliminatório (< 30,00 pts)'}</span>
          </div>
          <div id="essay-total-score-badge" class="font-mono-tabular text-2xl font-bold ${totalEssayScore >= 48 ? 'text-emerald-600 dark:text-emerald-400' : totalEssayScore >= 30 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}">
            ${totalEssayScore.toFixed(1).replace('.', ',')} <span class="text-sm font-normal opacity-65">/ 60,00 pts</span>
          </div>
        </div>

        <!-- Biblioteca de Esqueletos e Temas Prováveis UFBA -->
        <section class="paper-card rounded-2xl p-6">
          <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h3 class="text-sm font-bold uppercase tracking-wider">Esqueletos Estratégicos (25–28 Linhas • 4 Parágrafos)</h3>
            <select data-action="select-essay-theme" class="themed-input rounded-lg px-3 py-1.5 text-xs font-semibold max-w-full">
              ${PROBABLE_THEMES.map((t) => `
                <option value="${t.id}" ${t.id === selectedTheme.id ? 'selected' : ''}>${escapeHtml(t.eixo)}: ${escapeHtml(t.titulo)}</option>
              `).join('')}
            </select>
          </div>

          <div class="subtle-surface rounded-xl p-4 mb-4">
            <div class="text-xs font-bold uppercase tracking-wider text-teal-700 dark:text-teal-300 mb-1">${escapeHtml(selectedTheme.eixo)}</div>
            <h4 class="font-exam-serif text-base font-bold mb-1">${escapeHtml(selectedTheme.titulo)}</h4>
            <p class="text-xs opacity-80">${escapeHtml(selectedTheme.recorte)}</p>
            <div class="mt-3 flex flex-wrap gap-2">
              ${selectedTheme.repertorios.map((rep) => `
                <span class="text-[11px] px-2.5 py-1 rounded-md border hairline-divider bg-white dark:bg-slate-800">${escapeHtml(rep)}</span>
              `).join('')}
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs leading-relaxed">
            <div class="subtle-surface rounded-xl p-3.5">
              <div class="font-bold text-teal-700 dark:text-teal-300 mb-1">1º Parágrafo • Introdução (5–6 linhas)</div>
              <p>${escapeHtml(selectedTheme.esqueleto.intro)}</p>
            </div>
            <div class="subtle-surface rounded-xl p-3.5">
              <div class="font-bold text-teal-700 dark:text-teal-300 mb-1">2º Parágrafo • Desenvolvimento 1 (7–8 linhas)</div>
              <p>${escapeHtml(selectedTheme.esqueleto.d1)}</p>
            </div>
            <div class="subtle-surface rounded-xl p-3.5">
              <div class="font-bold text-teal-700 dark:text-teal-300 mb-1">3º Parágrafo • Desenvolvimento 2 (7–8 linhas)</div>
              <p>${escapeHtml(selectedTheme.esqueleto.d2)}</p>
            </div>
            <div class="subtle-surface rounded-xl p-3.5">
              <div class="font-bold text-teal-700 dark:text-teal-300 mb-1">4º Parágrafo • Conclusão (5–6 linhas)</div>
              <p>${escapeHtml(selectedTheme.esqueleto.conclusao)}</p>
            </div>
          </div>
        </section>

        <!-- Rascunho Pautado com Contador de Linhas Estimado -->
        <section class="paper-card rounded-2xl p-6">
          <div class="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div>
              <h3 class="text-sm font-bold">Treino de Rascunho Estruturado (Salvo Automaticamente)</h3>
              <p class="text-xs opacity-75">Estimativa calibrada em ~10,5 palavras/linha manuscrita em folha definitiva.</p>
            </div>
            <div class="flex flex-wrap items-center gap-2 font-mono-tabular text-xs">
              <span id="essay-words-badge" class="px-2.5 py-1 rounded border hairline-divider">${metrics.words} palavras</span>
              <span id="essay-paras-badge" class="px-2.5 py-1 rounded border hairline-divider">${metrics.paragraphs} parágrafos</span>
              <span id="essay-lines-badge" class="px-2.5 py-1 rounded font-bold ${
                metrics.estimatedLines === 0
                  ? 'subtle-surface'
                  : linesHealthy
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                    : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200'
              }">
                ~${metrics.estimatedLines} linhas (meta: 20–30)
              </span>
            </div>
          </div>
          <textarea
            id="essay-draft-input"
            data-action="save-essay-draft"
            rows="12"
            placeholder="Digite aqui seu treino de redação dissertativo-argumentativa (4 parágrafos, sem título obrigatório)..."
            class="themed-input essay-ruled-textarea w-full rounded-xl px-4 text-sm font-exam-serif resize-y">${escapeHtml(essayState.draftText || '')}</textarea>
        </section>
      </div>
    `;
  }

  function renderSchemaExampleSnippet() {
    return JSON.stringify({
      metadata: {
        concurso: 'UFBA - Edital nº 007/2026',
        cargo: '201 - Assistente em Administração',
        banca: 'Instituto Avalia',
        data_prova: '2026-12-20',
        versao_banco: '1.0.1'
      },
      questoes: [
        {
          id: 'AVALIA-UFBA2026-CE-999',
          area: 'Conhecimentos Específicos',
          peso: 2.0,
          topico_edital: '7. Lei nº 14.133/2021 - Modalidades, Dispensa e Inexigibilidade',
          dificuldade: 'Média-Alta',
          tempo_estimado_segundos: 120,
          perfil_cobranca: 'Lei Seca Literal',
          texto_apoio: null,
          enunciado: 'Exemplo de enunciado...',
          alternativas: { A: '...', B: '...', C: '...', D: '...', E: '...' },
          gabarito: 'C',
          correcao_comentada: {
            resumo_direto: 'Explicação direta...',
            fundamento_legal_ou_teorico: 'Artigo de lei...',
            analise_alternativas: { A: 'INCORRETA...', B: 'INCORRETA...', C: 'CORRETA...', D: 'INCORRETA...', E: 'INCORRETA...' },
            conexao_pratica_ifbaiano: 'Ponte prática IF Baiano -> Lei Seca...',
            pilula_fixacao: 'Regra de ouro em 1 linha.'
          }
        }
      ]
    }, null, 2);
  }

  window.AvaliaUI = {
    renderCountdown,
    renderExamView,
    renderTelemetryView,
    renderErrorNotebookView,
    renderEssayGuideView,
    renderSchemaExampleSnippet,
    renderAudioPlayButtonInner,
    renderAudioFeedbackButtonInner
  };
})();
