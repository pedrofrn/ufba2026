/**
 * StorageService — Persistência segura em localStorage, validação estrita de schema JSON
 * e merge inteligente de lotes de questões (Edital UFBA nº 007/2026).
 */
(() => {
  'use strict';

  const STORAGE_KEYS = {
    STATE: 'ufba2026_pedro_progress_v1',
    CUSTOM_QUESTIONS: 'ufba2026_pedro_custom_questions_v1'
  };

  const VALID_OPTIONS = ['A', 'B', 'C', 'D', 'E'];
  const VALID_AUDIO_MODES = ['pilulas', 'completa'];
  const VALID_AUDIO_RATES = [1, 1.25, 1.5];
  const AREA_WEIGHTS = {
    'Língua Portuguesa': 1.0,
    'Noções de Informática': 1.0,
    'Administração Pública': 1.0,
    'Conhecimentos Específicos': 2.0
  };

  const memoryFallback = new Map();

  function safeGetItem(key) {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch (err) {
      console.warn('[Storage] localStorage.getItem indisponível, usando fallback em memória:', err);
    }
    return memoryFallback.has(key) ? memoryFallback.get(key) : null;
  }

  function safeSetItem(key, value) {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
        return true;
      }
    } catch (err) {
      console.warn('[Storage] localStorage.setItem falhou, salvando em memória:', err);
    }
    memoryFallback.set(key, value);
    return false;
  }

  function normalizeAudioPreferences(rawPrefs) {
    const src = rawPrefs && typeof rawPrefs === 'object' ? rawPrefs : {};
    const mode = VALID_AUDIO_MODES.includes(src.mode) ? src.mode : 'pilulas';
    const numericRate = Number(src.rate);
    const rate = VALID_AUDIO_RATES.includes(numericRate) ? numericRate : 1;
    return { mode, rate };
  }

  function createDefaultState() {
    return {
      version: '1.0.0',
      candidate: 'Pedro Araujo Fernandes',
      theme: 'light',
      xrayEnabled: true,
      sessionDurationMinutes: 30,
      audioPreferences: {
        mode: 'pilulas',
        rate: 1
      },
      answers: {},
      eliminated: {},
      bookmarks: {},
      notes: {},
      essayState: {
        selectedThemeId: 'tema-1',
        checklist: {},
        draftText: '',
        selfScores: { c1: 12, c2: 12, c3: 12, c4: 12 }
      },
      updatedAt: new Date().toISOString()
    };
  }

  function loadProgressState() {
    const fallback = createDefaultState();
    try {
      const raw = safeGetItem(STORAGE_KEYS.STATE);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return fallback;

      return {
        ...fallback,
        ...parsed,
        audioPreferences: normalizeAudioPreferences(parsed.audioPreferences),
        answers: parsed.answers && typeof parsed.answers === 'object' ? parsed.answers : {},
        eliminated: parsed.eliminated && typeof parsed.eliminated === 'object' ? parsed.eliminated : {},
        bookmarks: parsed.bookmarks && typeof parsed.bookmarks === 'object' ? parsed.bookmarks : {},
        notes: parsed.notes && typeof parsed.notes === 'object' ? parsed.notes : {},
        essayState: {
          ...fallback.essayState,
          ...(parsed.essayState && typeof parsed.essayState === 'object' ? parsed.essayState : {}),
          checklist: parsed.essayState?.checklist && typeof parsed.essayState.checklist === 'object'
            ? parsed.essayState.checklist
            : {},
          selfScores: {
            ...fallback.essayState.selfScores,
            ...(parsed.essayState?.selfScores || {})
          }
        }
      };
    } catch (err) {
      console.warn('[Storage] Erro ao ler progresso salvo; restaurando estado inicial:', err);
      return fallback;
    }
  }

  function saveProgressState(state) {
    try {
      const payload = {
        ...state,
        updatedAt: new Date().toISOString()
      };
      safeSetItem(STORAGE_KEYS.STATE, JSON.stringify(payload));
      return true;
    } catch (err) {
      console.error('[Storage] Erro ao persistir estado:', err);
      return false;
    }
  }

  function validateQuestion(rawQuestion, indexLabel = '') {
    const errors = [];
    const prefix = indexLabel ? `Questão ${indexLabel}: ` : '';

    if (!rawQuestion || typeof rawQuestion !== 'object' || Array.isArray(rawQuestion)) {
      return { valid: false, errors: [`${prefix}Objeto de questão inválido.`], normalized: null };
    }

    const q = rawQuestion;

    if (typeof q.id !== 'string' || !q.id.trim()) {
      errors.push(`${prefix}Campo obrigatório 'id' ausente ou inválido.`);
    }
    if (typeof q.area !== 'string' || !Object.prototype.hasOwnProperty.call(AREA_WEIGHTS, q.area)) {
      errors.push(`${prefix}'area' deve ser uma das 4 disciplinas oficiais do Edital (${Object.keys(AREA_WEIGHTS).join(', ')}).`);
    }
    if (typeof q.peso !== 'number' || Number.isNaN(q.peso) || q.peso <= 0) {
      errors.push(`${prefix}Campo 'peso' deve ser numérico positivo (1.0 ou 2.0).`);
    }
    if (typeof q.topico_edital !== 'string' || !q.topico_edital.trim()) {
      errors.push(`${prefix}Campo obrigatório 'topico_edital' ausente.`);
    }
    if (typeof q.dificuldade !== 'string' || !q.dificuldade.trim()) {
      errors.push(`${prefix}Campo obrigatório 'dificuldade' ausente.`);
    }
    if (typeof q.tempo_estimado_segundos !== 'number' || q.tempo_estimado_segundos <= 0) {
      errors.push(`${prefix}Campo 'tempo_estimado_segundos' deve ser número positivo.`);
    }
    if (typeof q.perfil_cobranca !== 'string' || !q.perfil_cobranca.trim()) {
      errors.push(`${prefix}Campo obrigatório 'perfil_cobranca' ausente.`);
    }
    if (q.texto_apoio !== null && q.texto_apoio !== undefined && typeof q.texto_apoio !== 'string') {
      errors.push(`${prefix}Campo 'texto_apoio' deve ser string ou null.`);
    }
    if (typeof q.enunciado !== 'string' || !q.enunciado.trim()) {
      errors.push(`${prefix}Campo obrigatório 'enunciado' ausente.`);
    }

    if (!q.alternativas || typeof q.alternativas !== 'object') {
      errors.push(`${prefix}Objeto 'alternativas' ausente.`);
    } else {
      for (const opt of VALID_OPTIONS) {
        if (typeof q.alternativas[opt] !== 'string' || !q.alternativas[opt].trim()) {
          errors.push(`${prefix}Alternativa '${opt}' ausente ou vazia.`);
        }
      }
    }

    const gabaritoUpper = typeof q.gabarito === 'string' ? q.gabarito.trim().toUpperCase() : '';
    if (!VALID_OPTIONS.includes(gabaritoUpper)) {
      errors.push(`${prefix}Campo 'gabarito' deve ser 'A', 'B', 'C', 'D' ou 'E'.`);
    }

    const cc = q.correcao_comentada;
    if (!cc || typeof cc !== 'object') {
      errors.push(`${prefix}Objeto 'correcao_comentada' ausente.`);
    } else {
      for (const field of ['resumo_direto', 'fundamento_legal_ou_teorico', 'conexao_pratica_ifbaiano', 'pilula_fixacao']) {
        if (typeof cc[field] !== 'string' || !cc[field].trim()) {
          errors.push(`${prefix}Campo 'correcao_comentada.${field}' ausente.`);
        }
      }
      if (!cc.analise_alternativas || typeof cc.analise_alternativas !== 'object') {
        errors.push(`${prefix}Objeto 'correcao_comentada.analise_alternativas' ausente.`);
      } else {
        for (const opt of VALID_OPTIONS) {
          if (typeof cc.analise_alternativas[opt] !== 'string' || !cc.analise_alternativas[opt].trim()) {
            errors.push(`${prefix}Análise da alternativa '${opt}' ausente em 'correcao_comentada.analise_alternativas'.`);
          }
        }
      }
    }

    if (errors.length > 0) {
      return { valid: false, errors, normalized: null };
    }

    const normalized = {
      id: q.id.trim(),
      area: q.area,
      peso: Number(q.peso),
      topico_edital: q.topico_edital.trim(),
      dificuldade: q.dificuldade.trim(),
      tempo_estimado_segundos: Number(q.tempo_estimado_segundos),
      perfil_cobranca: q.perfil_cobranca.trim(),
      texto_apoio: q.texto_apoio ? String(q.texto_apoio) : null,
      enunciado: q.enunciado.trim(),
      alternativas: {
        A: q.alternativas.A.trim(),
        B: q.alternativas.B.trim(),
        C: q.alternativas.C.trim(),
        D: q.alternativas.D.trim(),
        E: q.alternativas.E.trim()
      },
      gabarito: gabaritoUpper,
      correcao_comentada: {
        resumo_direto: cc.resumo_direto.trim(),
        fundamento_legal_ou_teorico: cc.fundamento_legal_ou_teorico.trim(),
        analise_alternativas: {
          A: cc.analise_alternativas.A.trim(),
          B: cc.analise_alternativas.B.trim(),
          C: cc.analise_alternativas.C.trim(),
          D: cc.analise_alternativas.D.trim(),
          E: cc.analise_alternativas.E.trim()
        },
        conexao_pratica_ifbaiano: cc.conexao_pratica_ifbaiano.trim(),
        pilula_fixacao: cc.pilula_fixacao.trim()
      }
    };

    return { valid: true, errors: [], normalized };
  }

  function parseQuestionImportPayload(rawInput) {
    let parsed = rawInput;
    if (typeof rawInput === 'string') {
      parsed = JSON.parse(rawInput);
    }

    let metadata = null;
    let list = null;

    if (Array.isArray(parsed)) {
      list = parsed;
    } else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.questoes)) {
      metadata = parsed.metadata || null;
      list = parsed.questoes;
    } else {
      throw new Error('Formato JSON inválido. Envie um objeto contendo "questoes": [...] ou um array direto [...] de questões.');
    }

    if (list.length === 0) {
      throw new Error('O lote JSON não contém nenhuma questão no array.');
    }

    const validQuestions = [];
    const validationErrors = [];

    list.forEach((item, idx) => {
      const label = item?.id ? `#${idx + 1} (${item.id})` : `#${idx + 1}`;
      const res = validateQuestion(item, label);
      if (res.valid) {
        validQuestions.push(res.normalized);
      } else {
        validationErrors.push(...res.errors);
      }
    });

    return { metadata, validQuestions, validationErrors };
  }

  function mergeQuestionBanks(existingList, incomingList, options = {}) {
    const { overwriteExisting = false } = options;
    const map = new Map();

    for (const q of existingList) {
      map.set(q.id, q);
    }

    let addedCount = 0;
    let skippedDuplicates = 0;
    let overwrittenCount = 0;
    const addedOrUpdated = [];

    for (const q of incomingList) {
      if (map.has(q.id)) {
        if (overwriteExisting) {
          map.set(q.id, q);
          overwrittenCount += 1;
          addedOrUpdated.push(q);
        } else {
          skippedDuplicates += 1;
        }
      } else {
        map.set(q.id, q);
        addedCount += 1;
        addedOrUpdated.push(q);
      }
    }

    return {
      merged: Array.from(map.values()),
      addedCount,
      skippedDuplicates,
      overwrittenCount,
      addedOrUpdated
    };
  }

  function loadCustomQuestions() {
    try {
      const raw = safeGetItem(STORAGE_KEYS.CUSTOM_QUESTIONS);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((q) => validateQuestion(q).valid);
    } catch (err) {
      console.warn('[Storage] Erro ao ler questões customizadas:', err);
      return [];
    }
  }

  function saveCustomQuestions(customQuestions) {
    try {
      safeSetItem(STORAGE_KEYS.CUSTOM_QUESTIONS, JSON.stringify(customQuestions));
      return true;
    } catch (err) {
      console.error('[Storage] Erro ao salvar questões customizadas:', err);
      return false;
    }
  }

  function buildProgressBackupPayload(state, customQuestions) {
    return {
      app: 'Simulador Tático UFBA 2026 - Cargo 201',
      schemaVersion: '1.0.0',
      exportedAt: new Date().toISOString(),
      progressState: state,
      customQuestions: customQuestions || []
    };
  }

  function parseProgressBackupPayload(rawJsonText) {
    const parsed = JSON.parse(rawJsonText);
    if (!parsed || typeof parsed !== 'object' || !parsed.progressState) {
      throw new Error('Arquivo de backup inválido. Certifique-se de selecionar um arquivo exportado por este sistema (progresso_pedro_ufba2026.json).');
    }

    const base = createDefaultState();
    const ps = parsed.progressState;
    const restoredState = {
      ...base,
      ...ps,
      audioPreferences: normalizeAudioPreferences(ps.audioPreferences),
      answers: ps.answers && typeof ps.answers === 'object' ? ps.answers : {},
      eliminated: ps.eliminated && typeof ps.eliminated === 'object' ? ps.eliminated : {},
      bookmarks: ps.bookmarks && typeof ps.bookmarks === 'object' ? ps.bookmarks : {},
      notes: ps.notes && typeof ps.notes === 'object' ? ps.notes : {},
      essayState: {
        ...base.essayState,
        ...(ps.essayState && typeof ps.essayState === 'object' ? ps.essayState : {})
      }
    };

    const rawCustom = Array.isArray(parsed.customQuestions) ? parsed.customQuestions : [];
    const validCustom = rawCustom.filter((q) => validateQuestion(q).valid);

    return {
      progressState: restoredState,
      customQuestions: validCustom,
      exportedAt: parsed.exportedAt || null
    };
  }

  window.AvaliaStorage = {
    STORAGE_KEYS,
    VALID_OPTIONS,
    AREA_WEIGHTS,
    createDefaultState,
    loadProgressState,
    saveProgressState,
    validateQuestion,
    parseQuestionImportPayload,
    mergeQuestionBanks,
    loadCustomQuestions,
    saveCustomQuestions,
    buildProgressBackupPayload,
    parseProgressBackupPayload
  };
})();

