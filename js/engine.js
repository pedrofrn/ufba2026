/**
 * ExamEngine — Regras oficiais do Edital UFBA nº 007/2026 (Cargo 201),
 * motores de sorteio/filtragem, cálculo de projeção na nota de corte e Raio-X da Banca.
 */
(() => {
  'use strict';

  const EDITAL_CONFIG = {
    concurso: 'UFBA — Edital nº 007/2026',
    cargo: '201 – Assistente em Administração (Salvador • Manhã)',
    banca: 'Instituto Avalia',
    examDateIso: '2026-12-20T08:00:00-03:00',
    totalQuestoes: 60,
    totalPontosObjetiva: 90.0,
    minimoEliminatorioObjetiva: 45.0,
    metaSeguraTop338: 74.0,
    targetSecondsPerQuestion: 150, // 2m30s por questão
    vagas: {
      total: 94,
      ac: 55,
      pp: 24,
      pcd: 10,
      indigenas: 3,
      quilombolas: 2
    },
    redacaoCutoffs: {
      ac: 338,
      pp: 141,
      pcd: 57,
      indigenas: 17,
      quilombolas: 11
    },
    areas: {
      'Língua Portuguesa': {
        questoes: 12,
        peso: 1.0,
        maxPontos: 12.0,
        shortLabel: 'Português',
        tipo: 'Conhecimentos Básicos'
      },
      'Noções de Informática': {
        questoes: 6,
        peso: 1.0,
        maxPontos: 6.0,
        shortLabel: 'Informática',
        tipo: 'Conhecimentos Básicos'
      },
      'Administração Pública': {
        questoes: 12,
        peso: 1.0,
        maxPontos: 12.0,
        shortLabel: 'Adm. Pública',
        tipo: 'Conhecimentos Básicos'
      },
      'Conhecimentos Específicos': {
        questoes: 30,
        peso: 2.0,
        maxPontos: 60.0,
        shortLabel: 'Específicos',
        tipo: 'Conhecimentos Específicos'
      }
    },
    areaOrder: [
      'Língua Portuguesa',
      'Noções de Informática',
      'Administração Pública',
      'Conhecimentos Específicos'
    ],
    tiebreakers: [
      '1º Maior idade ≥ 60 anos (Estatuto do Idoso)',
      '2º Maior pontuação em Conhecimentos Específicos (60 pts)',
      '3º Maior pontuação em Língua Portuguesa (12 pts)',
      '4º Maior pontuação em Noções de Informática (6 pts)',
      '5º Maior pontuação na Prova de Redação (60 pts)'
    ]
  };

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeSearchText(str) {
    return String(str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function shuffleArray(list) {
    const arr = list.slice();
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /**
   * Prioriza questões que o candidato errou -> inéditas -> acertadas (mais antigas primeiro).
   */
  function prioritizeQuestions(questions, answers) {
    const wrong = [];
    const unseen = [];
    const correct = [];

    for (const q of questions) {
      const rec = answers[q.id];
      if (!rec) {
        unseen.push(q);
      } else if (!rec.acertou) {
        wrong.push(q);
      } else {
        correct.push(q);
      }
    }

    const correctSorted = shuffleArray(correct).sort((a, b) => {
      const tA = new Date(answers[a.id]?.dataResposta || 0).getTime();
      const tB = new Date(answers[b.id]?.dataResposta || 0).getTime();
      return tA - tB;
    });

    return [
      ...shuffleArray(wrong),
      ...shuffleArray(unseen),
      ...correctSorted
    ];
  }

  /**
   * Modo "Tiro Curto Ponderado (15 Questões / 30 min)":
   * Proporção do Edital: 3 Português + 1 Informática + 3 Adm. Pública + 8 Conhecimentos Específicos = 15 questões.
   */
  function buildTiroCurtoDeck(allQuestions, answers = {}) {
    const quotas = {
      'Língua Portuguesa': 3,
      'Noções de Informática': 1,
      'Administração Pública': 3,
      'Conhecimentos Específicos': 8
    };

    const selected = [];
    const usedIds = new Set();

    for (const area of EDITAL_CONFIG.areaOrder) {
      const pool = prioritizeQuestions(
        allQuestions.filter((q) => q.area === area),
        answers
      );
      const count = quotas[area] || 0;
      const picked = pool.slice(0, count);
      for (const q of picked) {
        selected.push(q);
        usedIds.add(q.id);
      }
    }

    // Fallback se algum banco customizado não tiver o mínimo de uma disciplina
    if (selected.length < 15) {
      const remaining = prioritizeQuestions(
        allQuestions.filter((q) => !usedIds.has(q.id)),
        answers
      );
      for (const q of remaining) {
        if (selected.length >= 15) break;
        selected.push(q);
        usedIds.add(q.id);
      }
    }

    // Mantém a ordem das disciplinas do caderno real
    return selected.sort(
      (a, b) => EDITAL_CONFIG.areaOrder.indexOf(a.area) - EDITAL_CONFIG.areaOrder.indexOf(b.area)
    );
  }

  /**
   * Modo "Bateria de Conhecimentos Básicos (Desbloqueio de Pontos)":
   * Isola Língua Portuguesa + Noções de Informática + Administração Pública.
   */
  function buildBasicosDeck(allQuestions, answers = {}) {
    const basicAreas = new Set([
      'Língua Portuguesa',
      'Noções de Informática',
      'Administração Pública'
    ]);
    const pool = allQuestions.filter((q) => basicAreas.has(q.area));
    return prioritizeQuestions(pool, answers);
  }

  /**
   * Modo "Simulado Padrão Edital (60 Questões / 4h)":
   * Respeita a Tabela 10.1 (12 LP + 6 INF + 12 AP + 30 CE).
   */
  function buildSimulado60Deck(allQuestions, answers = {}) {
    const selected = [];
    const usedIds = new Set();

    for (const area of EDITAL_CONFIG.areaOrder) {
      const target = EDITAL_CONFIG.areas[area].questoes;
      const pool = prioritizeQuestions(
        allQuestions.filter((q) => q.area === area),
        answers
      );
      for (const q of pool.slice(0, target)) {
        selected.push(q);
        usedIds.add(q.id);
      }
    }

    return selected;
  }

  function filterQuestions(allQuestions, filters = {}, state = {}) {
    const answers = state.answers || {};
    const bookmarks = state.bookmarks || {};
    const notes = state.notes || {};
    const searchNorm = normalizeSearchText(filters.search);

    return allQuestions.filter((q) => {
      if (filters.area && filters.area !== 'ALL' && q.area !== filters.area) {
        return false;
      }
      if (filters.topico && filters.topico !== 'ALL' && q.topico_edital !== filters.topico) {
        return false;
      }
      if (filters.dificuldade && filters.dificuldade !== 'ALL' && q.dificuldade !== filters.dificuldade) {
        return false;
      }

      const rec = answers[q.id];
      const isBookmarked = Boolean(bookmarks[q.id]);
      const hasNote = Boolean(notes[q.id] && notes[q.id].trim());

      if (filters.status && filters.status !== 'ALL') {
        if (filters.status === 'UNSEEN' && rec) return false;
        if (filters.status === 'WRONG' && (!rec || rec.acertou)) return false;
        if (filters.status === 'CORRECT' && (!rec || !rec.acertou)) return false;
        if (filters.status === 'BOOKMARKED' && !isBookmarked && !(rec && !rec.acertou) && !hasNote) return false;
      }

      if (searchNorm) {
        const haystack = normalizeSearchText(
          `${q.id} ${q.area} ${q.topico_edital} ${q.perfil_cobranca} ${q.enunciado} ${q.texto_apoio || ''}`
        );
        if (!haystack.includes(searchNorm)) return false;
      }

      return true;
    });
  }

  /**
   * Formata texto de enunciado/alternativa com segurança XSS, inline code/bold e "Raio-X da Banca".
   */
  function formatExamText(rawText, xrayEnabled = false) {
    if (!rawText) return '';

    // Separa trechos em crase (`codigo`) para preservar integralmente sem aplicar highlight dentro de código
    const segments = String(rawText).split(/(`[^`]+`)/g);

    const htmlParts = segments.map((seg) => {
      if (seg.startsWith('`') && seg.endsWith('`') && seg.length >= 2) {
        const inner = escapeHtml(seg.slice(1, -1));
        return `<code class="inline-exam-code">${inner}</code>`;
      }

      let safe = escapeHtml(seg);

      // Suporte leve a negrito **texto** antes do highlight
      safe = safe.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

      if (xrayEnabled) {
        // 1) Termos restritivos / pegadinhas clássicas do Instituto Avalia
        const trapRegex = /(^|[^\p{L}\p{N}_])(EXCETO|INCORRETO|INCORRETA|INCORRETOS|INCORRETAS|RESPECTIVAMENTE|APENAS|EXCLUSIVAMENTE|SOMENTE|NÃO|NEM|NUNCA|JAMAIS|SALVO|VEDADO|VEDADA|VEDADOS|VEDADAS|PROIBIDO|PROIBIDA|OBRIGATÓRIO|OBRIGATÓRIA|IMPRESCINDÍVEL|PRESCINDE)(?=$|[^\p{L}\p{N}_])/giu;
        safe = safe.replace(trapRegex, '$1<mark class="xray-trap" title="Termo restritivo / pegadinha de banca">$2</mark>');

        // 2) Prazos, porcentagens e limites numéricos (ex: 30 (trinta) dias, 10%, 3 dias úteis, 5 anos, 20 linhas)
        const metricRegex = /(^|[^\p{L}\p{N}_])(\d+(?:[.,]\d+)?\s*(?:\([^)]{1,24}\)\s*)?(?:%|por cento|dias?\s*(?:úteis|corridos|consecutivos)?|meses|mês|anos?|horas?|minutos?|linhas?|pontos?|salários?|resmas?))(?=$|[^\p{L}\p{N}_])/giu;
        safe = safe.replace(metricRegex, '$1<mark class="xray-metric" title="Prazo, percentual ou métrica numérica">$2</mark>');
      }

      // Quebras de linha
      safe = safe.replace(/\n/g, '<br>');
      return safe;
    });

    return htmlParts.join('');
  }

  /**
   * Calcula telemetria completa segundo Tabela 10.1 e Cláusula de Barreira (10.3.1 / Tabela 13.1).
   */
  function computeTelemetry(allQuestions, state = {}) {
    const answers = state.answers || {};
    const bookmarks = state.bookmarks || {};

    let totalAnswered = 0;
    let totalCorrect = 0;
    let totalTimeSeconds = 0;
    let timedCount = 0;
    let rawPointsEarned = 0;
    let rawPointsPossibleAnswered = 0;

    const areaStats = {};
    for (const areaName of EDITAL_CONFIG.areaOrder) {
      const cfg = EDITAL_CONFIG.areas[areaName];
      areaStats[areaName] = {
        area: areaName,
        shortLabel: cfg.shortLabel,
        tipo: cfg.tipo,
        editalQuestoes: cfg.questoes,
        peso: cfg.peso,
        maxPontos: cfg.maxPontos,
        bankCount: 0,
        answered: 0,
        correct: 0,
        wrong: 0,
        accuracyPct: 0,
        projectedPoints: 0,
        earnedBankPoints: 0
      };
    }

    const topicMap = new Map();

    for (const q of allQuestions) {
      const aStat = areaStats[q.area];
      if (aStat) {
        aStat.bankCount += 1;
      }

      if (!topicMap.has(q.topico_edital)) {
        topicMap.set(q.topico_edital, {
          topico: q.topico_edital,
          area: q.area,
          peso: q.peso,
          total: 0,
          answered: 0,
          correct: 0,
          wrong: 0
        });
      }
      const tStat = topicMap.get(q.topico_edital);
      tStat.total += 1;

      const rec = answers[q.id];
      if (rec) {
        totalAnswered += 1;
        rawPointsPossibleAnswered += q.peso;

        if (typeof rec.tempoSegundos === 'number' && rec.tempoSegundos > 0) {
          totalTimeSeconds += rec.tempoSegundos;
          timedCount += 1;
        }

        if (aStat) aStat.answered += 1;
        tStat.answered += 1;

        if (rec.acertou) {
          totalCorrect += 1;
          rawPointsEarned += q.peso;
          if (aStat) {
            aStat.correct += 1;
            aStat.earnedBankPoints += q.peso;
          }
          tStat.correct += 1;
        } else {
          if (aStat) aStat.wrong += 1;
          tStat.wrong += 1;
        }
      }
    }

    let projectedScore90 = 0;
    const zeroedAreas = [];
    const unansweredAreas = [];

    for (const areaName of EDITAL_CONFIG.areaOrder) {
      const st = areaStats[areaName];
      if (st.answered > 0) {
        st.accuracyPct = (st.correct / st.answered) * 100;
        st.projectedPoints = Number(((st.correct / st.answered) * st.maxPontos).toFixed(2));
        projectedScore90 += st.projectedPoints;
        if (st.correct === 0) {
          zeroedAreas.push(areaName);
        }
      } else {
        st.accuracyPct = 0;
        st.projectedPoints = 0;
        unansweredAreas.push(areaName);
      }
    }

    projectedScore90 = Number(projectedScore90.toFixed(2));

    // Projeção condicional apenas com base nas áreas já iniciadas (para não desanimar antes da 1ª questão de cada área)
    const maxPontosAreasIniciadas = EDITAL_CONFIG.areaOrder.reduce(
      (sum, name) => sum + (areaStats[name].answered > 0 ? areaStats[name].maxPontos : 0),
      0
    );
    const paceProjected90 = maxPontosAreasIniciadas > 0
      ? Number(((projectedScore90 / maxPontosAreasIniciadas) * EDITAL_CONFIG.totalPontosObjetiva).toFixed(2))
      : 0;

    const avgSecondsPerQuestion = timedCount > 0 ? Math.round(totalTimeSeconds / timedCount) : 0;
    const overallAccuracyPct = totalAnswered > 0 ? Number(((totalCorrect / totalAnswered) * 100).toFixed(1)) : 0;

    let barrierStatus = 'SEM_DADOS';
    if (totalAnswered > 0) {
      if (zeroedAreas.length > 0 || unansweredAreas.length > 0) {
        barrierStatus = zeroedAreas.length > 0 ? 'RISCO_DISCIPLINA_ZERADA' : 'DISCIPLINA_PENDENTE';
      } else if (projectedScore90 < EDITAL_CONFIG.minimoEliminatorioObjetiva) {
        barrierStatus = 'ELIMINADO_NOTA_MINIMA';
      } else if (projectedScore90 < EDITAL_CONFIG.metaSeguraTop338) {
        barrierStatus = 'HABILITADO_ABAIXO_CORTE';
      } else {
        barrierStatus = 'ZONA_CORTE_338';
      }
    }

    const topicBreakdown = Array.from(topicMap.values()).map((t) => ({
      ...t,
      accuracyPct: t.answered > 0 ? Math.round((t.correct / t.answered) * 100) : null
    }));

    const wrongCount = Object.values(answers).filter((a) => a && !a.acertou).length;
    const bookmarkCount = Object.values(bookmarks).filter(Boolean).length;

    return {
      totalBank: allQuestions.length,
      totalAnswered,
      totalCorrect,
      totalWrong: wrongCount,
      bookmarkCount,
      overallAccuracyPct,
      rawPointsEarned: Number(rawPointsEarned.toFixed(2)),
      rawPointsPossibleAnswered: Number(rawPointsPossibleAnswered.toFixed(2)),
      projectedScore90,
      paceProjected90,
      avgSecondsPerQuestion,
      zeroedAreas,
      unansweredAreas,
      barrierStatus,
      areaStats: EDITAL_CONFIG.areaOrder.map((name) => areaStats[name]),
      topicBreakdown
    };
  }

  function formatDuration(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds));
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return hrs > 0 ? `${pad(hrs)}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
  }

  function getExamCountdown(now = new Date()) {
    const target = new Date(EDITAL_CONFIG.examDateIso).getTime();
    const diff = target - now.getTime();
    if (diff <= 0) {
      return { isPast: true, days: 0, hours: 0, minutes: 0, seconds: 0 };
    }
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((diff / (1000 * 60)) % 60);
    const seconds = Math.floor((diff / 1000) % 60);
    return { isPast: false, days, hours, minutes, seconds };
  }

  function getErrorNotebookQuestions(allQuestions, state = {}) {
    const answers = state.answers || {};
    const bookmarks = state.bookmarks || {};
    const notes = state.notes || {};

    const wrongItems = allQuestions.filter((q) => answers[q.id] && !answers[q.id].acertou);
    const bookmarkedOnly = allQuestions.filter((q) => bookmarks[q.id] && (!answers[q.id] || answers[q.id].acertou));
    const notedOnly = allQuestions.filter((q) => notes[q.id] && notes[q.id].trim() && !bookmarks[q.id] && (!answers[q.id] || answers[q.id].acertou));

    return {
      wrongItems,
      bookmarkedCount: Object.values(bookmarks).filter(Boolean).length,
      notedCount: Object.values(notes).filter((v) => v && v.trim()).length,
      combined: [...wrongItems, ...bookmarkedOnly, ...notedOnly]
    };
  }

  window.AvaliaEngine = {
    EDITAL_CONFIG,
    escapeHtml,
    normalizeSearchText,
    shuffleArray,
    prioritizeQuestions,
    buildTiroCurtoDeck,
    buildBasicosDeck,
    buildSimulado60Deck,
    filterQuestions,
    getErrorNotebookQuestions,
    formatExamText,
    computeTelemetry,
    formatDuration,
    getExamCountdown
  };
})();

/**
 * AvaliaAudio — Módulo Modo Áudio-Estudo (Hands-Free / Podcast Tático)
 * Utiliza Web Speech API nativa (window.speechSynthesis) com seleção de voz pt-BR,
 * fatiamento seguro de enunciados, pausa de reflexão (3s) e limpeza em page unload.
 */
(() => {
  'use strict';

  const VALID_RATES = [1, 1.25, 1.5];
  const VALID_MODES = ['pilulas', 'completa'];
  const PREFERRED_PTBR_NAMES = [
    'francisca', 'antonio', 'antônio', 'thalita', 'brenda', 'donato',
    'fabio', 'fábio', 'giovanna', 'humberto', 'julio', 'júlio',
    'leila', 'leticia', 'letícia', 'manuela', 'nicolau', 'valerio', 'valério', 'yara'
  ];

  function isSpeechSupported() {
    return Boolean(
      typeof window !== 'undefined' &&
      window.speechSynthesis &&
      typeof window.speechSynthesis.speak === 'function' &&
      typeof window.SpeechSynthesisUtterance === 'function'
    );
  }

  function scorePortugueseVoice(voice) {
    if (!voice || typeof voice !== 'object') return -1;
    const lang = String(voice.lang || '').replace('_', '-').toLowerCase();
    const name = String(voice.name || '').toLowerCase();

    let score = -1;
    if (lang === 'pt-br') {
      score = 1000;
    } else if (lang.startsWith('pt')) {
      score = 400;
    } else {
      return -1;
    }

    if (name.includes('natural') || name.includes('neural') || name.includes('online')) {
      score += 300;
    }
    if (name.includes('google')) {
      score += 240;
    }
    if (PREFERRED_PTBR_NAMES.some((candidate) => name.includes(candidate))) {
      score += 160;
    }
    if (name.includes('luciana') || name.includes('felipe') || name.includes('fernanda')) {
      score += 180;
    }
    if (name.includes('maria') || name.includes('daniel')) {
      score += 110;
    }
    if (voice.default) {
      score += 15;
    }

    return score;
  }

  function pickBestPortugueseVoice(voices) {
    if (!Array.isArray(voices) || voices.length === 0) return null;

    let bestVoice = null;
    let bestScore = -1;

    for (const v of voices) {
      const s = scorePortugueseVoice(v);
      if (s > bestScore) {
        bestScore = s;
        bestVoice = v;
      }
    }

    return bestVoice;
  }

  function normalizeTextForSpeech(rawText) {
    if (!rawText) return '';
    return String(rawText)
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/→|->/g, ', ')
      .replace(/•/g, ', ')
      .replace(/[—–]/g, ', ')
      .replace(/≥/g, ' maior ou igual a ')
      .replace(/≤/g, ' menor ou igual a ')
      .replace(/≠/g, ' diferente de ')
      .replace(/\bn\.?º\s*/gi, 'número ')
      .replace(/\barts\.\s*(?=\d)/gi, 'artigos ')
      .replace(/\bart\.\s*(?=\d)/gi, 'artigo ')
      .replace(/§§\s*/g, 'parágrafos ')
      .replace(/§\s*/g, 'parágrafo ')
      .replace(/\binc\.\s*/gi, 'inciso ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function splitIntoSpeechChunks(rawText, maxLen = 185) {
    const clean = normalizeTextForSpeech(rawText);
    if (!clean) return [];

    // Divide em sentenças preservando decimais/números de lei como 14.133 ou 007/2026
    const rawSentences = clean.match(/[^.!?;:\n]+(?:[.!?;:]+(?=\s|$)|$)/g) || [clean];
    const chunks = [];

    for (const rawSentence of rawSentences) {
      const sentence = rawSentence.trim();
      if (!sentence) continue;

      if (sentence.length <= maxLen) {
        chunks.push(sentence);
        continue;
      }

      // Se uma oração for longa, quebra com suavidade por vírgulas ou espaços
      const words = sentence.split(/\s+/);
      let current = '';
      for (const w of words) {
        if (!current) {
          current = w;
        } else if (current.length + 1 + w.length <= maxLen) {
          current += ` ${w}`;
        } else {
          chunks.push(current);
          current = w;
        }
      }
      if (current) {
        chunks.push(current);
      }
    }

    return chunks;
  }

  function createStep(stepLabel, text, pauseAfterMs = 0, pauseLabel = '') {
    return {
      stepLabel,
      text: normalizeTextForSpeech(text),
      chunks: splitIntoSpeechChunks(text),
      pauseAfterMs,
      pauseLabel
    };
  }

  function buildPilulasSteps(q, trackIdx = 0, totalTracks = 1) {
    const cc = q?.correcao_comentada || {};
    return [
      createStep(
        'Tópico do Edital',
        `Faixa ${trackIdx + 1} de ${totalTracks}, ${q.area}. Tópico do Edital: ${q.topico_edital}.`
      ),
      createStep(
        'Fundamento Legal / Teórico',
        `Fundamento legal ou teórico: ${cc.fundamento_legal_ou_teorico || ''}.`
      ),
      createStep(
        'Conexão Prática IF Baiano',
        `Conexão prática IF Baiano: ${cc.conexao_pratica_ifbaiano || ''}.`
      ),
      createStep(
        'Pílula de Fixação',
        `Pílula de fixação: ${cc.pilula_fixacao || ''}.`,
        650,
        'Avançando para a próxima faixa...'
      )
    ].filter((step) => step.chunks.length > 0);
  }

  function buildCompletaSteps(q, trackIdx = 0, totalTracks = 1) {
    const cc = q?.correcao_comentada || {};
    const promptPrefix = `Questão ${trackIdx + 1} de ${totalTracks}, ${q.area}.`;
    const supportPart = q.texto_apoio ? ` Texto de apoio: ${q.texto_apoio}.` : '';
    const promptPart = ` Enunciado: ${q.enunciado}.`;
    const correctOptionText = (q.alternativas && q.alternativas[q.gabarito]) || '';

    return [
      createStep(
        'Enunciado',
        `${promptPrefix}${supportPart}${promptPart}`,
        3000,
        'Pausa de reflexão (3s para o gabarito)'
      ),
      createStep(
        'Alternativa Correta',
        `Alternativa correta, letra ${q.gabarito}: ${correctOptionText}.`
      ),
      createStep(
        'Resumo Direto',
        `Resumo direto: ${cc.resumo_direto || ''}.`
      ),
      createStep(
        'Pílula de Fixação',
        `Pílula de fixação: ${cc.pilula_fixacao || ''}.`,
        700,
        'Avançando para a próxima questão...'
      )
    ].filter((step) => step.chunks.length > 0);
  }

  function buildFeedbackSteps(q) {
    const cc = q?.correcao_comentada || {};
    return [
      createStep(
        'Resumo Direto',
        `Comentário da questão de ${q.area}. Resumo direto: ${cc.resumo_direto || ''}.`
      ),
      createStep(
        'Fundamento Legal / Teórico',
        `Fundamento legal ou teórico: ${cc.fundamento_legal_ou_teorico || ''}.`
      ),
      createStep(
        'Conexão Prática IF Baiano',
        `Conexão prática IF Baiano: ${cc.conexao_pratica_ifbaiano || ''}.`
      ),
      createStep(
        'Pílula de Fixação',
        `Pílula de fixação: ${cc.pilula_fixacao || ''}.`
      )
    ].filter((step) => step.chunks.length > 0);
  }

  function createAudioController({
    initialMode = 'pilulas',
    initialRate = 1,
    onStateChange = () => {},
    onTrackAdvance = () => {},
    onPlaylistFinished = () => {},
    onError = () => {}
  } = {}) {
    const supported = isSpeechSupported();
    const internal = {
      supported,
      status: 'idle', // 'idle' | 'playing' | 'pausing_wait' | 'paused'
      context: 'playlist', // 'playlist' | 'feedback'
      mode: VALID_MODES.includes(initialMode) ? initialMode : 'pilulas',
      rate: VALID_RATES.includes(Number(initialRate)) ? Number(initialRate) : 1,
      playlist: [],
      playlistKind: 'exam', // 'exam' | 'errors'
      trackIndex: 0,
      steps: [],
      stepIndex: 0,
      chunkIndex: 0,
      feedbackQuestion: null,
      pauseRemainingMs: 0,
      pauseTotalMs: 0,
      voice: null,
      generation: 0,
      pauseTimeoutId: null,
      pauseTickId: null
    };

    function refreshBestVoice() {
      if (!internal.supported) {
        internal.voice = null;
        return null;
      }
      try {
        const voices = window.speechSynthesis.getVoices();
        internal.voice = pickBestPortugueseVoice(voices);
      } catch (_) {
        internal.voice = null;
      }
      return internal.voice;
    }

    if (supported) {
      refreshBestVoice();
      try {
        if (typeof window.speechSynthesis.addEventListener === 'function') {
          window.speechSynthesis.addEventListener('voiceschanged', () => {
            refreshBestVoice();
            emit();
          });
        }
      } catch (_) {}
    }

    function clearWaitTimers() {
      if (internal.pauseTimeoutId !== null && typeof clearTimeout === 'function') {
        clearTimeout(internal.pauseTimeoutId);
      }
      if (internal.pauseTickId !== null && typeof clearInterval === 'function') {
        clearInterval(internal.pauseTickId);
      }
      internal.pauseTimeoutId = null;
      internal.pauseTickId = null;
    }

    function safeCancelSynth() {
      if (!internal.supported) return;
      try {
        window.speechSynthesis.cancel();
      } catch (_) {}
    }

    function getSnapshot() {
      const currentTrack = internal.context === 'feedback'
        ? internal.feedbackQuestion
        : (internal.playlist[internal.trackIndex] || null);
      const currentStep = internal.steps[internal.stepIndex] || null;

      return {
        supported: internal.supported,
        status: internal.status,
        context: internal.context,
        mode: internal.mode,
        rate: internal.rate,
        playlistKind: internal.playlistKind,
        trackIndex: internal.trackIndex,
        trackCount: internal.playlist.length,
        currentTrackId: currentTrack?.id || null,
        currentArea: currentTrack?.area || null,
        currentTopic: currentTrack?.topico_edital || null,
        feedbackQid: internal.context === 'feedback' && internal.status !== 'idle'
          ? (internal.feedbackQuestion?.id || null)
          : null,
        stepIndex: internal.stepIndex,
        stepCount: internal.steps.length,
        stepLabel: currentStep?.stepLabel || '',
        pauseCountdownSeconds: internal.pauseRemainingMs > 0
          ? Math.ceil(internal.pauseRemainingMs / 1000)
          : 0,
        voiceName: internal.voice?.name || null,
        voiceLang: internal.voice?.lang || 'pt-BR'
      };
    }

    function emit() {
      onStateChange(getSnapshot());
    }

    function prepareCurrentTrackSteps() {
      if (internal.context === 'feedback') {
        internal.steps = internal.feedbackQuestion ? buildFeedbackSteps(internal.feedbackQuestion) : [];
      } else {
        const q = internal.playlist[internal.trackIndex];
        if (!q) {
          internal.steps = [];
        } else {
          internal.steps = internal.mode === 'completa'
            ? buildCompletaSteps(q, internal.trackIndex, internal.playlist.length)
            : buildPilulasSteps(q, internal.trackIndex, internal.playlist.length);
        }
      }
      internal.stepIndex = 0;
      internal.chunkIndex = 0;
      internal.pauseRemainingMs = 0;
      internal.pauseTotalMs = 0;
    }

    function finishCurrentTrack(gen) {
      if (gen !== internal.generation) return;

      if (internal.context === 'feedback') {
        internal.status = 'idle';
        internal.context = 'playlist';
        internal.feedbackQuestion = null;
        internal.steps = [];
        internal.stepIndex = 0;
        internal.chunkIndex = 0;
        emit();
        return;
      }

      const nextIndex = internal.trackIndex + 1;
      if (nextIndex < internal.playlist.length) {
        internal.trackIndex = nextIndex;
        prepareCurrentTrackSteps();
        onTrackAdvance(nextIndex, internal.playlist, internal.playlist[nextIndex]);
        speakNextChunk(gen);
      } else {
        internal.status = 'idle';
        internal.stepIndex = 0;
        internal.chunkIndex = 0;
        internal.pauseRemainingMs = 0;
        emit();
        onPlaylistFinished();
      }
    }

    function startPostStepPause(step, gen, overrideWaitMs = null) {
      const waitMs = overrideWaitMs !== null ? overrideWaitMs : step.pauseAfterMs;
      if (!waitMs || waitMs <= 0) {
        internal.stepIndex += 1;
        internal.chunkIndex = 0;
        speakNextChunk(gen);
        return;
      }

      clearWaitTimers();
      internal.status = 'pausing_wait';
      internal.pauseTotalMs = waitMs;
      internal.pauseRemainingMs = waitMs;
      emit();

      if (typeof setInterval === 'function') {
        internal.pauseTickId = setInterval(() => {
          if (gen !== internal.generation || internal.status !== 'pausing_wait') {
            clearWaitTimers();
            return;
          }
          internal.pauseRemainingMs = Math.max(0, internal.pauseRemainingMs - 1000);
          emit();
        }, 1000);
      }

      if (typeof setTimeout === 'function') {
        internal.pauseTimeoutId = setTimeout(() => {
          if (gen !== internal.generation || internal.status !== 'pausing_wait') return;
          clearWaitTimers();
          internal.pauseRemainingMs = 0;
          internal.pauseTotalMs = 0;
          internal.stepIndex += 1;
          internal.chunkIndex = 0;
          speakNextChunk(gen);
        }, waitMs);
      } else {
        internal.pauseRemainingMs = 0;
        internal.stepIndex += 1;
        internal.chunkIndex = 0;
        speakNextChunk(gen);
      }
    }

    function speakNextChunk(gen) {
      if (gen !== internal.generation) return;

      if (!internal.supported) {
        stop();
        onError('Navegador sem suporte à Web Speech API (window.speechSynthesis).');
        return;
      }

      if (internal.stepIndex >= internal.steps.length) {
        finishCurrentTrack(gen);
        return;
      }

      const step = internal.steps[internal.stepIndex];
      if (!step || internal.chunkIndex >= step.chunks.length) {
        startPostStepPause(step || { pauseAfterMs: 0 }, gen);
        return;
      }

      const chunkText = step.chunks[internal.chunkIndex];
      const utterance = new window.SpeechSynthesisUtterance(chunkText);
      const bestVoice = internal.voice || refreshBestVoice();
      if (bestVoice) {
        utterance.voice = bestVoice;
      }
      utterance.lang = bestVoice?.lang || 'pt-BR';
      utterance.rate = internal.rate;
      utterance.pitch = 1.0;

      internal.status = 'playing';
      emit();

      utterance.onend = () => {
        if (gen !== internal.generation) return;
        internal.chunkIndex += 1;
        if (internal.chunkIndex < step.chunks.length) {
          speakNextChunk(gen);
        } else {
          startPostStepPause(step, gen);
        }
      };

      utterance.onerror = (event) => {
        if (gen !== internal.generation) return;
        const code = event?.error || '';
        if (code === 'canceled' || code === 'interrupted') {
          return;
        }
        stop();
        onError('Não foi possível reproduzir o áudio neste dispositivo.');
      };

      try {
        window.speechSynthesis.speak(utterance);
      } catch (err) {
        stop();
        onError(err?.message || 'Erro ao iniciar síntese de voz.');
      }
    }

    function startPlaylist(playlist, startIndex = 0, playlistKind = 'exam') {
      if (!internal.supported) {
        onError('Seu navegador não possui suporte à leitura por voz (Web Speech API).');
        return false;
      }
      if (!Array.isArray(playlist) || playlist.length === 0) {
        onError('Nenhuma questão disponível na fila de áudio.');
        return false;
      }

      const wasActive = internal.status !== 'idle';
      internal.generation += 1;
      const gen = internal.generation;
      clearWaitTimers();
      if (wasActive) safeCancelSynth();

      internal.context = 'playlist';
      internal.feedbackQuestion = null;
      internal.playlist = playlist.slice();
      internal.playlistKind = playlistKind;
      internal.trackIndex = Math.max(0, Math.min(startIndex, playlist.length - 1));
      prepareCurrentTrackSteps();

      speakNextChunk(gen);
      return true;
    }

    function playFeedback(question) {
      if (!internal.supported) {
        onError('Seu navegador não possui suporte à leitura por voz (Web Speech API).');
        return false;
      }
      if (!question || !question.correcao_comentada) return false;

      if (
        internal.context === 'feedback' &&
        internal.status !== 'idle' &&
        internal.feedbackQuestion?.id === question.id
      ) {
        stop();
        return false;
      }

      const wasActive = internal.status !== 'idle';
      internal.generation += 1;
      const gen = internal.generation;
      clearWaitTimers();
      if (wasActive) safeCancelSynth();

      internal.context = 'feedback';
      internal.feedbackQuestion = question;
      prepareCurrentTrackSteps();

      speakNextChunk(gen);
      return true;
    }

    function pause() {
      if (internal.status !== 'playing' && internal.status !== 'pausing_wait') return;
      internal.generation += 1;
      clearWaitTimers();
      safeCancelSynth();
      internal.status = 'paused';
      emit();
    }

    function resume() {
      if (internal.status !== 'paused' || !internal.supported) return false;
      internal.generation += 1;
      const gen = internal.generation;

      if (internal.pauseRemainingMs > 0 && internal.steps[internal.stepIndex]) {
        startPostStepPause(internal.steps[internal.stepIndex], gen, internal.pauseRemainingMs);
      } else {
        speakNextChunk(gen);
      }
      return true;
    }

    function stop() {
      internal.generation += 1;
      clearWaitTimers();
      safeCancelSynth();
      internal.status = 'idle';
      internal.context = 'playlist';
      internal.feedbackQuestion = null;
      internal.stepIndex = 0;
      internal.chunkIndex = 0;
      internal.pauseRemainingMs = 0;
      internal.pauseTotalMs = 0;
      emit();
    }

    function syncPlaylist(playlist, activeIndex = 0, playlistKind = 'exam') {
      internal.playlist = Array.isArray(playlist) ? playlist.slice() : [];
      internal.playlistKind = playlistKind;
      if (internal.playlist.length === 0) {
        if (internal.context === 'playlist' && internal.status !== 'idle') {
          stop();
        } else {
          internal.trackIndex = 0;
          emit();
        }
        return;
      }
      if (internal.status === 'idle' && internal.context === 'playlist') {
        internal.trackIndex = Math.max(0, Math.min(activeIndex, internal.playlist.length - 1));
      } else if (internal.trackIndex >= internal.playlist.length) {
        internal.trackIndex = internal.playlist.length - 1;
      }
      emit();
    }

    function jumpToTrack(targetIndex, { forcePlay = false, silentAdvance = false } = {}) {
      if (!Array.isArray(internal.playlist) || internal.playlist.length === 0) return false;
      const clamped = Math.max(0, Math.min(targetIndex, internal.playlist.length - 1));
      const shouldSpeak = forcePlay || internal.status === 'playing' || internal.status === 'pausing_wait';
      const wasActive = internal.status !== 'idle';

      internal.generation += 1;
      const gen = internal.generation;
      clearWaitTimers();
      if (wasActive) safeCancelSynth();

      internal.context = 'playlist';
      internal.feedbackQuestion = null;
      internal.trackIndex = clamped;
      prepareCurrentTrackSteps();
      if (!silentAdvance) {
        onTrackAdvance(clamped, internal.playlist, internal.playlist[clamped]);
      }

      if (shouldSpeak && internal.supported) {
        speakNextChunk(gen);
      } else {
        emit();
      }
      return true;
    }

    function setRate(nextRate) {
      const parsed = Number(nextRate);
      if (!VALID_RATES.includes(parsed)) return internal.rate;
      if (internal.rate === parsed) return internal.rate;
      internal.rate = parsed;

      if (internal.status === 'playing') {
        internal.generation += 1;
        const gen = internal.generation;
        clearWaitTimers();
        safeCancelSynth();
        speakNextChunk(gen);
      } else {
        emit();
      }
      return internal.rate;
    }

    function setMode(nextMode) {
      if (!VALID_MODES.includes(nextMode)) return internal.mode;
      if (internal.mode === nextMode) return internal.mode;
      internal.mode = nextMode;

      if (internal.context === 'playlist' && internal.status !== 'idle') {
        const wasActive = internal.status === 'playing' || internal.status === 'pausing_wait';
        internal.generation += 1;
        const gen = internal.generation;
        clearWaitTimers();
        safeCancelSynth();
        prepareCurrentTrackSteps();

        if (wasActive && internal.supported) {
          speakNextChunk(gen);
        } else {
          internal.status = 'paused';
          emit();
        }
      } else {
        emit();
      }
      return internal.mode;
    }

    function destroy() {
      stop();
    }

    return {
      getSnapshot,
      startPlaylist,
      playFeedback,
      pause,
      resume,
      stop,
      syncPlaylist,
      jumpToTrack,
      setRate,
      setMode,
      destroy
    };
  }

  function describeAudioState(snapInput, trackIdFallback = '') {
    const snap = snapInput || {};
    const total = Number(snap.trackCount) || 0;
    const safeIdx = total > 0 ? Math.max(0, Math.min(Number(snap.trackIndex) || 0, total - 1)) : 0;
    const trackIdLabel = snap.currentTrackId || trackIdFallback || '';
    const isPlaying = snap.status === 'playing' || snap.status === 'pausing_wait';
    const isPaused = snap.status === 'paused';
    const disabledTransport = !snap.supported || total === 0;
    const disablePrev = disabledTransport || safeIdx <= 0;
    const disableNext = disabledTransport || safeIdx >= total - 1;
    const disableStop = !snap.supported || snap.status === 'idle';

    let statusText = 'Pronto para reprodução contínua (Atalho: A)';
    let dotClass = 'bg-slate-400 dark:bg-slate-500';
    if (!snap.supported) {
      statusText = 'Áudio indisponível: navegador sem suporte à Web Speech API';
      dotClass = 'bg-rose-500';
    } else if (total === 0) {
      statusText = 'Nenhuma questão no caderno atual para reproduzir';
      dotClass = 'bg-slate-400';
    } else if (snap.status === 'pausing_wait') {
      statusText = `Pausa para resposta: ${snap.pauseCountdownSeconds || 3}s...`;
      dotClass = 'bg-amber-500 audio-pulse-dot';
    } else if (snap.status === 'playing') {
      statusText = snap.context === 'feedback'
        ? `Comentário • ${snap.stepLabel || 'Reproduzindo'}`
        : `Lendo • ${snap.stepLabel || 'Reproduzindo'}`;
      dotClass = 'bg-teal-500 audio-pulse-dot';
    } else if (snap.status === 'paused') {
      statusText = `Pausado • ${snap.stepLabel || 'Aguardando retomada'}`;
      dotClass = 'bg-amber-500';
    }

    const shortVoice = snap.voiceName
      ? String(snap.voiceName).replace(/Microsoft\s+|Google\s+|\s+Online\s*\(Natural\)\s*/gi, '').trim()
      : 'Voz padrão pt-BR';

    const progressPct = total > 0 && snap.status !== 'idle'
      ? Math.min(100, Math.round(((safeIdx + ((Number(snap.stepIndex || 0) + 1) / Math.max(1, Number(snap.stepCount) || 4))) / total) * 100))
      : 0;

    const trackBadgeText = total > 0
      ? `Faixa ${String(safeIdx + 1).padStart(2, '0')}/${String(total).padStart(2, '0')}${trackIdLabel ? ` • ${String(trackIdLabel).replace('AVALIA-UFBA2026-', '')}` : ''}`
      : '0 faixas';

    return {
      safeIdx,
      total,
      isPlaying,
      isPaused,
      disabledTransport,
      disablePrev,
      disableNext,
      disableStop,
      statusText,
      dotClass,
      shortVoice: snap.supported ? shortVoice : 'Sem Web Speech',
      progressPct,
      trackBadgeText
    };
  }

  window.AvaliaAudio = {
    VALID_RATES,
    VALID_MODES,
    isSpeechSupported,
    scorePortugueseVoice,
    pickBestPortugueseVoice,
    normalizeTextForSpeech,
    splitIntoSpeechChunks,
    buildPilulasSteps,
    buildCompletaSteps,
    buildFeedbackSteps,
    describeAudioState,
    createAudioController
  };
})();

