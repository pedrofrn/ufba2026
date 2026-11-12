/**
 * EssayGuide — Guia Interativo de Redação Nota 60 (Tabela 13.2 do Edital UFBA nº 007/2026).
 * Inclui checklist oficial, regras eliminatórias (Itens 13.5–13.9), esqueletos dissertativos
 * de 20 a 30 linhas e rascunho guiado com simulador de nota.
 */
(() => {
  'use strict';

  const TABELA_13_2 = [
    {
      id: 'c1',
      aspecto: '1. Atendimento ao tema; informatividade e argumentação articuladas à temática proposta',
      maxPontos: 15,
      checklist: [
        { id: 'c1_1', label: 'Recorte temático integral já na Introdução (evitar tangenciamento ou fuga).' },
        { id: 'c1_2', label: 'Tese explícita com 2 eixos argumentativos claros para D1 e D2.' },
        { id: 'c1_3', label: 'Informatividade concreta (leis, CF/88, dados ou conceitos de gestão pública sem senso comum).' },
        { id: 'c1_4', label: 'Argumentação produtiva: explicar causa, consequência e relevância institucional.' }
      ]
    },
    {
      id: 'c2',
      aspecto: '2. Atendimento à norma padrão da Língua Portuguesa',
      maxPontos: 15,
      checklist: [
        { id: 'c2_1', label: 'Ausência de desvios de crase, regência, concordância e colocação pronominal.' },
        { id: 'c2_2', label: 'Pontuação precisa (não separar sujeito de verbo; isolar adjuntos deslocados e explicativas).' },
        { id: 'c2_3', label: 'Ortografia e acentuação rigorosas conforme o Acordo Ortográfico vigente.' },
        { id: 'c2_4', label: 'Sem marcas de oralidade, coloquialismos ou rasuras excessivas na folha definitiva.' }
      ]
    },
    {
      id: 'c3',
      aspecto: '3. Coerência (progressão, articulação, não-contradição) / Coesão referencial e sequencial',
      maxPontos: 15,
      checklist: [
        { id: 'c3_1', label: 'Conectivos interparágrafos claros no início de D1, D2 e Conclusão (ex.: Sob essa ótica, Ademais, Portanto).' },
        { id: 'c3_2', label: 'Coesão intraparágrafo articulando tópico frasal, fundamentação e fechamento.' },
        { id: 'c3_3', label: 'Uso preciso de anáforas (' + 'esse/essa/tal cenário) evitando repetição viciosa de palavras.' },
        { id: 'c3_4', label: 'Não-contradição entre a tese inicial, os desenvolvimentos e a síntese conclusiva.' }
      ]
    },
    {
      id: 'c4',
      aspecto: '4. Atendimento à tipologia textual (estrutura dissertativo-argumentativa, expressividade e adequação vocabular)',
      maxPontos: 15,
      checklist: [
        { id: 'c4_1', label: 'Estrutura em 4 parágrafos equilibrados (Intro 5-6l | D1 7-8l | D2 7-8l | Conclusão 5-6l = 25-28 linhas).' },
        { id: 'c4_2', label: 'Impessoalidade na 3ª pessoa do singular/plural (sem "eu acho" ou tom panfletário).' },
        { id: 'c4_3', label: 'Vocabulário formal, preciso e variado adequado ao serviço público e ao nível superior/médio.' },
        { id: 'c4_4', label: 'Respeito rigoroso aos limites de 20 (mínimo) a 30 (máximo) linhas na Versão Definitiva.' }
      ]
    }
  ];

  const ZERO_SCORE_RULES = [
    'Fuga ao tema proposto ou não atendimento à tipologia textual dissertativo-argumentativa.',
    'Menos de 20 linhas ou fragmento além de 30 linhas (texto além da 30ª linha é desconsiderado).',
    'Redigir a lápis ou com tinta diferente de caneta esferográfica transparente azul ou preta.',
    'Qualquer identificação na Folha Definitiva (nome, rubrica fora do campo, números, letras, sinais ou desenhos).',
    'Acentuada desestruturação textual, letra ilegível ou espaçamento artificial para "encher linhas".'
  ];

  const PROBABLE_THEMES = [
    {
      id: 'tema-1',
      titulo: 'Transformação Digital, Governo Eletrônico e Democratização do Acesso aos Serviços Públicos',
      eixo: 'Administração Pública Digital & Cidadania',
      recorte: 'Os desafios da modernização tecnológica nas instituições públicas brasileiras entre a eficiência administrativa e a inclusão digital.',
      repertorios: [
        'CF/88, Art. 37 (Princípio da Eficiência) e Art. 207 (Autonomia e função social das universidades)',
        'Lei nº 14.129/2021 (Lei do Governo Digital: simplificação, interoperabilidade e atendimento digital)',
        'Conceito de "Infoexclusão" (desigualdade no acesso à banda larga e letramento digital)'
      ],
      esqueleto: {
        intro: 'Contextualização histórica/constitucional (CF/88 Art. 37 — eficiência como dever estatal) + recorte do tema (digitalização dos serviços públicos) + Tese em 2 pilares: embora a transformação digital agilize processos, sua consolidação enfrenta o gargalo da burocracia herdada e da exclusão digital de parcela da população.',
        d1: 'Tópico frasal: racionalização de processos internos (não basta digitalizar rotinas ineficientes) -> Fundamentação (Lei nº 14.129/2021: interoperabilidade e fim da exigência redundante de documentos) -> Análise crítica da capacitação de servidores e revisão de fluxos.',
        d2: 'Tópico frasal: risco de aprofundar desigualdades sem inclusão digital -> Fundamentação (acessibilidade e multicanalidade no atendimento presencial + digital) -> Impacto na cidadania e nos princípios da impessoalidade e universalidade.',
        conclusao: 'Conectivo conclusivo (Portanto) + retomada da tese + encaminhamento propositivo coerente com o Estado democrático (integração entre capacitação técnica contínua, simplificação normativa e pontos de atendimento inclusivo para consolidar a eficiência pública).'
      }
    },
    {
      id: 'tema-2',
      titulo: 'Ética Pública, Transparência e Proteção de Dados na Sociedade Contemporânea',
      eixo: 'Ética, LAI e LGPD no Serviço Público',
      recorte: 'O equilíbrio entre o dever constitucional de transparência dos atos administrativos e a proteção aos dados pessoais e à privacidade do cidadão.',
      repertorios: [
        'CF/88, Art. 5º, XXXIII (acesso à informação) e LXXIX (proteção de dados pessoais como direito fundamental)',
        'Lei nº 12.527/2011 (LAI — publicidade como regra, sigilo como exceção) × Lei nº 13.709/2018 (LGPD)',
        'Decreto nº 1.171/1994 (Código de Ética: publicidade como requisito de eficácia e moralidade)'
      ],
      esqueleto: {
        intro: 'Alusão constitucional (Emenda Constitucional nº 115/2022 que elevou a proteção de dados a direito fundamental, em diálogo com o princípio da publicidade do Art. 37) + Tese: equilibrar transparência e privacidade exige governança informacional e cultura ética contínua dos agentes públicos.',
        d1: 'Tópico frasal: importância do controle social e da transparência ativa/passiva (LAI) no combate à corrupção e à opacidade patrimonialista -> Papel do servidor no atendimento tempestivo e na integridade documental.',
        d2: 'Tópico frasal: vulnerabilidades na exposição indevida de dados pessoais e sensíveis (LGPD) em sistemas eletrônicos -> Necessidade de anonimização, segurança cibernética e treinamento ético permanente.',
        conclusao: 'Síntese articulada + visão prospectiva: o amadurecimento institucional depende de compatibilizar o controle público dos gastos e atos com a salvaguarda rigorosa da intimidade cidadã.'
      }
    },
    {
      id: 'tema-3',
      titulo: 'Sustentabilidade Socioambiental e Responsabilidade Institucional nas Universidades Públicas',
      eixo: 'ESG Público, A3P e Desenvolvimento Sustentável',
      recorte: 'O papel das instituições públicas de ensino superior na promoção da sustentabilidade ambiental, econômica e social frente às mudanças climáticas.',
      repertorios: [
        'CF/88, Art. 225 (meio ambiente ecologicamente equilibrado como direito de todos e dever do Poder Público)',
        'Lei nº 14.133/2021, Art. 11, IV (incentivo à inovação e ao desenvolvimento nacional sustentável nas compras públicas)',
        'Agenda Ambiental na Administração Pública (A3P): consumo consciente, gestão de resíduos e eficiência energética'
      ],
      esqueleto: {
        intro: 'Referência ao Art. 225 da CF/88 + protagonismo das universidades públicas como laboratórios de inovação e exemplo administrativo + Tese: a efetivação da sustentabilidade institucional esbarra na cultura do desperdício e na ausência de critérios sustentáveis integrados às compras e rotinas.',
        d1: 'Tópico frasal: poder de compra do Estado como indutor ambiental (contratações sustentáveis na Lei 14.133/2021) + racionalização de papel/energia/água via digitalização e gestão de materiais.',
        d2: 'Tópico frasal: dimensão educativa e cultural interna (Agenda A3P e participação da comunidade acadêmica e técnico-administrativa) -> Superação de práticas meramente simbólicas por metas mensuráveis.',
        conclusao: 'Fecho retomando o papel exemplar da universidade pública + integração entre gestão responsável de recursos e consciência socioambiental duradoura.'
      }
    }
  ];

  function estimateEssayLines(text) {
    const trimmed = String(text || '').trim();
    if (!trimmed) return { words: 0, paragraphs: 0, estimatedLines: 0 };

    const rawLines = trimmed.split(/\r?\n/);
    let estimatedLines = 0;
    let paragraphs = 0;

    for (const line of rawLines) {
      const clean = line.trim();
      if (!clean) continue;
      paragraphs += 1;
      const lineWords = clean.split(/\s+/).filter(Boolean).length;
      // Estimativa conservadora para letra cursiva legível em folha padrão A4: ~10.5 palavras por linha
      estimatedLines += Math.max(1, Math.ceil(lineWords / 10.5));
    }

    const words = trimmed.split(/\s+/).filter(Boolean).length;
    return { words, paragraphs, estimatedLines };
  }

  window.AvaliaEssayGuide = {
    TABELA_13_2,
    ZERO_SCORE_RULES,
    PROBABLE_THEMES,
    estimateEssayLines
  };
})();

