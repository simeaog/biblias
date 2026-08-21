
    // ==========================================
    // DADOS DE FALLBACK (Garante funcionamento inicial)
    // ==========================================
    const fallbackData = [];

    // ==========================================
    // 1. INICIALIZAÇÃO ASSÍNCRONA E VERSÕES
    // ==========================================
    const versoesDisponiveis = [
        { id: 'acf.json', abbrev: 'ACF', nome: 'Almeida Corrigida Fiel', tipo: 'translation' },
        { id: 'ara.json', abbrev: 'ARA', nome: 'Almeida Revista e Atualizada', tipo: 'translation' },
        { id: 'arc.json', abbrev: 'ARC', nome: 'Almeida Revista e Corrigida' , tipo: 'translation'},
        { id: 'as21.json', abbrev: 'AS21', nome: 'Almeida Século 21' , tipo: 'translation'},
        { id: 'MENS.json', abbrev: 'MENS', nome: 'A Mensagem', tipo: 'paraphrase'},
        { id: 'naa.json', abbrev: 'NAA', nome: 'Nova Almeida Atualizada', tipo: 'translation'},
        { id: 'ntlh.json', abbrev: 'NTLH', nome: 'Nova Tradução na Linguagem de Hoje', tipo: 'translation' },
        { id: 'nvi.json', abbrev: 'NVI', nome: 'Nova Versão Internacional', tipo: 'translation' },
        { id: 'nvt.json', abbrev: 'NVT', nome: 'Nova Versão Transformadora', tipo: 'translation' },
        { id: 'int.json', abbrev: 'INT', nome: 'Bíblia Interlinear Trilíngue', tipo: 'translation' }
    ];

    // ==========================================================
    // CAMINHO CENTRAL DAS TRADUÇÕES
    // Os IDs continuam sendo apenas os nomes dos arquivos
    // (ex.: ara.json), enquanto os arquivos físicos ficam em
    // dados/. Isso preserva a compatibilidade com Ler, Planos,
    // Salvos, Notas e Comparação.
    // ==========================================================
    function getTranslationPath(versionId) {
        const id = String(versionId || '').trim();
        if (!id) throw new Error('ID de tradução não informado.');
        return `dados/${id}`;
    }

let bibleData = [];
let globalLexicon = null;
let lexiconLoadError = null;

// ==========================================
// CAMADA DE MORFOLOGIA POR OCORRÊNCIA
// ==========================================
// Fica separada do léxico para não duplicar
// informações.
// ==========================================
let morphologyData = null;
let morphologyIndex = new Map();
let morphologyLoadError = null;
// ==========================================
// CAMADA DE PERÍCОPES
// ==========================================
// Estrutura editorial separada do texto bíblico.
// ==========================================

let pericopeData = null;
let pericopeLoadError = null;

function getComparisonVerseSegments(
    chapter,
    verseNumber,
    versionId
) {
    if (!chapter) return [];

    const meta = versoesDisponiveis.find(
        v => v.id === versionId
    );

    const isParaphrase =
        meta?.tipo === 'paraphrase';

    // ==========================================================
    // PARÁFRASES / MENS
    // ==========================================================

    if (isParaphrase) {

        const verses = Array.isArray(chapter?.verses)
            ? chapter.verses
            : [];

        return verses
            .map((verse, index) => {

                const start =
                    Number(
                        verse?.number ??
                        index + 1
                    );

                const end =
                    Number(
                        verse?.endNumber ??
                        verse?.number ??
                        index + 1
                    );

                return {
                    verse,
                    start,
                    end
                };
            })
            .filter(item =>
                verseNumber + 1 >= item.start &&
                verseNumber + 1 <= item.end
            );
    }

    // ==========================================================
    // TRADUÇÕES NORMAIS
    // ==========================================================

    if (Array.isArray(chapter)) {

        const verse = chapter[verseNumber];

        if (verse === undefined) {
            return [];
        }

        return [{
            verse,
            start: verseNumber + 1,
            end: verseNumber + 1
        }];
    }

    return [];
}

async function carregarPericopes() {

    try {

        const response = await fetch(
            'dados/pericopes-2joao.json',
            { cache: 'no-cache' }
        );

        if (!response.ok) {
            throw new Error(
                'Arquivo pericopes-2joao.json não encontrado'
            );
        }

        pericopeData =
            await response.json();

        pericopeLoadError = null;

        console.info(
            'Perícopes de 2 João carregadas.'
        );

    } catch (error) {

        pericopeData = null;
        pericopeLoadError = error;

        console.warn(
            'Perícopes de 2 João indisponíveis.',
            error
        );
    }
}

function getPericopesForChapter(
    book,
    cIdx
) {

    if (!pericopeData) {
        return [];
    }

    if (!book) {
        return [];
    }

    if (
        normalizeStr(book.name) !==
        normalizeStr('2 João')
    ) {
        return [];
    }

    const chapterNumber =
        String(cIdx + 1);

    return (
        pericopeData.book &&
        pericopeData.book.chapters &&
        pericopeData.book.chapters[chapterNumber]
    ) || [];
}

function getPericopeForVerse(
    pericopes,
    verseNumber
) {

    return pericopes.find(
        pericope =>
            verseNumber >=
                pericope.start_verse &&
            verseNumber <=
                pericope.end_verse
    ) || null;
}

let currentVersionId = localStorage.getItem('bible_current_version') || 'ara.json';

    async function carregarLexicoGlobal() {
        try {
            const response = await fetch('dados/lexicon-pt.json', { cache: 'no-cache' });
            if (!response.ok) throw new Error('Léxico global não encontrado');
            globalLexicon = await response.json();
            lexiconLoadError = null;
        } catch (error) {
            globalLexicon = null;
            lexiconLoadError = error;
            console.warn('Léxico global indisponível. Usando dicionário da versão quando existir.');
        }
    }

        // ==========================================
    // MORFOLOGIA — CARREGAMENTO E ÍNDICE
    // ==========================================

    function normalizarMorphologyRecord(record) {
        if (!record || typeof record !== 'object') return null;

        const morphology =
            record.morphology ||
            record.morph ||
            record.grammar ||
            null;

        return {
            ...record,
            morphology
        };
    }

    function adicionarIndiceMorfologia(record, fallbackVerseId = null) {
        const r = normalizarMorphologyRecord(record);
        if (!r) return;

        const verseId = String(
            r.verse_id ||
            r.verseId ||
            fallbackVerseId ||
            ''
        ).trim();

        const rawWordIndex =
            r.word_index !== undefined
                ? r.word_index
                : r.wordIndex;

        const wordIndex = Number.isInteger(Number(rawWordIndex))
            ? Number(rawWordIndex)
            : null;

        if (verseId && wordIndex !== null) {
            morphologyIndex.set(
                `${verseId}|${wordIndex}`,
                r
            );
        }

        // Índice auxiliar para futuras estruturas
        const strong = normalizarStrongCode(
            r.strong ||
            r.strong_code ||
            ''
        );

        const word = String(
            r.word ||
            r.form ||
            ''
        ).trim();

        if (verseId && strong && word) {
            morphologyIndex.set(
                `${verseId}|${strong}|${word}`,
                r
            );
        }
    }

    function construirIndiceMorfologia(data) {
        morphologyIndex = new Map();

        if (!data) return;

        // Formato atual:
        //
        // {
        //   verses: {
        //      "63001001": [ ... ]
        //   }
        // }
        //
        if (
            data.verses &&
            typeof data.verses === 'object' &&
            !Array.isArray(data.verses)
        ) {
            Object.entries(data.verses).forEach(
                ([verseId, records]) => {

                    if (Array.isArray(records)) {
                        records.forEach(record => {
                            adicionarIndiceMorfologia(
                                record,
                                verseId
                            );
                        });
                    }
                }
            );
        }

        // Formatos alternativos
        // para facilitar futuras expansões.
        const collections = [
            data.entries,
            data.occurrences,
            data.records,
            Array.isArray(data) ? data : null
        ];

        collections.forEach(collection => {
            if (Array.isArray(collection)) {
                collection.forEach(record => {
                    adicionarIndiceMorfologia(record);
                });
            }
        });
    }

    async function carregarMorfologia() {
        try {

            const response = await fetch(
                'dados/morphology-2joao.json',
                { cache: 'no-cache' }
            );

            if (!response.ok) {
                throw new Error(
                    'Arquivo morphology-2joao.json não encontrado'
                );
            }

            morphologyData = await response.json();

            construirIndiceMorfologia(
                morphologyData
            );

            morphologyLoadError = null;

            console.info(
                `Morfologia carregada: ${morphologyIndex.size} índices.`
            );

        } catch (error) {

            morphologyData = null;
            morphologyIndex = new Map();
            morphologyLoadError = error;

            console.warn(
                'Morfologia de 2 João indisponível. ' +
                'A gaveta continuará funcionando com os dados ' +
                'já existentes no interlinear.',
                error
            );
        }
    }

    function getMorphologyForOccurrence(
        bIdx,
        cIdx,
        vIdx,
        wordIndex,
        wordObj,
        data = bibleData
    ) {
        if (!morphologyIndex.size) {
            return null;
        }

        const book = data[bIdx];

        if (!book) {
            return null;
        }

        // Neste primeiro momento o arquivo morfológico
        // é específico para 2 João.
        if (
            normalizeStr(book.name) ===
            normalizeStr('2 João')
        ) {

            /*
            * Estrutura do verse_id:
            *
            * 63 = 2 João
            * 001 = capítulo
            * 001 = versículo
            *
            * Exemplo:
            * 63001001 = 2 João 1:1
            */

            const verseId =
                `63` +
                String(cIdx + 1).padStart(3, '0') +
                String(vIdx + 1).padStart(3, '0');

            // PRIMEIRA TENTATIVA:
            // correspondência exata pela posição da palavra.
            const exact =
                morphologyIndex.get(
                    `${verseId}|${wordIndex}`
                );

            if (exact) {
                return exact;
            }

            // SEGUNDA TENTATIVA:
            // Strong + palavra.
            const strong =
                normalizarStrongCode(
                    wordObj && wordObj.strong
                );

            const word = String(
                (wordObj && wordObj.word) || ''
            ).trim();

            if (strong && word) {

                const byFields =
                    morphologyIndex.get(
                        `${verseId}|${strong}|${word}`
                    );

                if (byFields) {
                    return byFields;
                }
            }
        }

        return null;
    }

    async function initAppAsync() {

        aplicarConfiguracoes();

        renderVersionList();

        // Carrega o léxico global
        await carregarLexicoGlobal();

        // Carrega a morfologia por ocorrência
        await carregarMorfologia();

        // Carrega as pericopes
        carregarPericopes()

        // Depois carrega a Bíblia selecionada
        await carregarTraducao(currentVersionId);

    }

    async function carregarTraducao(versaoId) {
        try {
            document.getElementById('chapter-content').innerHTML = '<p style="text-align:center; color:#999; margin-top:50px;">Carregando tradução...</p>';
            
            const response = await fetch(getTranslationPath(versaoId));
            if (!response.ok) throw new Error("Erro na rede ou arquivo não encontrado");
            bibleData = await response.json();
            
        } catch (error) {
            console.warn("Usando dados locais de fallback. Falha no fetch.");
            bibleData = fallbackData; 
            versaoId = 'int.json'; 
        }

        currentVersionId = versaoId;
        localStorage.setItem('bible_current_version', currentVersionId);
        
        const versaoAtiva = versoesDisponiveis.find(v => v.id === versaoId);
        if(versaoAtiva) {
            document.getElementById('btn-version-menu').innerText = versaoAtiva.abbrev;
        }
        
        // Exibe o botão de idiomas SOMENTE se a versão for INT
        const btnLangMenu = document.getElementById('btn-lang-menu');
        if (versaoId === 'int.json') {
            btnLangMenu.classList.remove('hidden');
        } else {
            btnLangMenu.classList.add('hidden');
        }
        
        fecharGavetas();
        atualizarIndexLivros(); 
        initApp(); 
    }

    // Abreviaturas para Planos e Referências
    const abrevMap = {
        "Gênesis": "Gn", "Êxodo": "Êx", "Levítico": "Lv", "Números": "Nm", "Deuteronômio": "Dt",
        "Josué": "Js", "Juízes": "Jz", "Rute": "Rt", "1 Samuel": "1Sm", "2 Samuel": "2Sm",
        "1 Reis": "1Rs", "2 Reis": "2Rs", "1 Crônicas": "1Cr", "2 Crônicas": "2Cr", "Esdras": "Ed",
        "Neemias": "Ne", "Ester": "Et", "Jó": "Jó", "Salmos": "Sl", "Provérbios": "Pv",
        "Eclesiastes": "Ec", "Cantares de Salomão": "Ct", "Isaías": "Is", "Jeremias": "Jr",
        "Lamentações": "Lm", "Ezequiel": "Ez", "Daniel": "Dn", "Oséias": "Os", "Joel": "Jl",
        "Amós": "Am", "Obadias": "Ob", "Jonas": "Jn", "Miquéias": "Mq", "Naum": "Na",
        "Habacuque": "Hc", "Sofonias": "Sf", "Ageu": "Ag", "Zacarias": "Zc", "Malaquias": "Ml",
        "Mateus": "Mt", "Marcos": "Mc", "Lucas": "Lc", "João": "Jo", "Atos": "At",
        "Romanos": "Rm", "1 Coríntios": "1Co", "2 Coríntios": "2Co", "Gálatas": "Gl",
        "Efésios": "Ef", "Filipenses": "Fp", "Colossenses": "Cl", "1 Tessalonicenses": "1Ts",
        "2 Tessalonicenses": "2Ts", "1 Timóteo": "1Tm", "2 Timóteo": "2Tm", "Tito": "Tt",
        "Filemom": "Fm", "Hebreus": "Hb", "Tiago": "Tg", "1 Pedro": "1Pe", "2 Pedro": "2Pe",
        "1 João": "1Jo", "2 João": "2Jo", "3 João": "3Jo", "Judas": "Jd", "Apocalipse": "Ap"
    };
    function getAbbrev(name) { return abrevMap[name] || name.substring(0,3); }

    const bookStructure = {
        "Antigo Testamento": {
            "Pentateuco": ["Gênesis", "Êxodo", "Levítico", "Números", "Deuteronômio"],
            "Livros Históricos": ["Josué", "Juízes", "Rute", "1 Samuel", "2 Samuel", "1 Reis", "2 Reis", "1 Crônicas", "2 Crônicas", "Esdras", "Neemias", "Ester"],
            "Livros Poéticos": ["Jó", "Salmos", "Provérbios", "Eclesiastes", "Cantares de Salomão"],
            "Profetas Maiores": ["Isaías", "Jeremias", "Lamentações", "Ezequiel", "Daniel"],
            "Profetas Menores": ["Oséias", "Joel", "Amós", "Obadias", "Jonas", "Miquéias", "Naum", "Habacuque", "Sofonias", "Ageu", "Zacarias", "Malaquias"]
        },
        "Novo Testamento": {
            "Evangelhos": ["Mateus", "Marcos", "Lucas", "João"],
            "Histórico": ["Atos"],
            "Cartas Paulinas": ["Romanos", "1 Coríntios", "2 Coríntios", "Gálatas", "Efésios", "Filipenses", "Colossenses", "1 Tessalonicenses", "2 Tessalonicenses", "1 Timóteo", "2 Timóteo", "Tito", "Filemom"],
            "Cartas Gerais": ["Hebreus", "Tiago", "1 Pedro", "2 Pedro", "1 João", "2 João", "3 João", "Judas"],
            "Profético": ["Apocalipse"]
        }
    };

    function normalizeStr(str) { return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
    function normalizeForSearch(str) { return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s]/gi, '').toLowerCase(); }
    function escapeHTML(value) { return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch])); }
    function escapeJS(value) { return String(value ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

    // ==========================================
    // 2. ESTADO E CACHE
    // ==========================================
    let savedPlans = JSON.parse(localStorage.getItem('bible_plans')) || [];
    let savedVerses = JSON.parse(localStorage.getItem('bible_saved_verses')) || [];
    let savedNotes = JSON.parse(localStorage.getItem('bible_notes')) || [];
    let lastRead = JSON.parse(localStorage.getItem('bible_last_read')) || { bookIdx: 0, chapIdx: 0 };
    const DEFAULT_APP_SETTINGS = {
        fontScale: 1,
        lineHeight: 'normal',
        theme: 'light'
    };

    let appSettings = {
        ...DEFAULT_APP_SETTINGS,
        ...(JSON.parse(
            localStorage.getItem('bible_app_settings') || '{}'
        ))
    };

    // Estado de Idiomas Interlinear
    let estadoIdiomas = JSON.parse(localStorage.getItem('bible_lang_state')) || { orig: false, pt: true, en: false };
    
    let currentBook = lastRead.bookIdx;
    let currentChap = lastRead.chapIdx;
    let selectedVersesMap = new Map();
    let pendingVerseScroll = null;
    const tabScrollPositions = {
        read: 0,
        search: 0,
        plans: 0,
        notes: 0,
        saved: 0,
        config: 0
    };

    // Aba atualmente ativa.
    let currentTabId = 'read';

    // ==========================================================
    // CONTEXTO INDEPENDENTE DO LEITOR DOS PLANOS
    // ==========================================================
    // Este estado nunca substitui nem modifica o estado da aba Ler.
    let planReadingState = {
        active: false,
        planIndex: null,
        dayIndex: null,
        plan: null,
        day: null,
        versionId: null,
        bibleData: [],
        bookIdx: 0,
        chapIdx: 0,
        startItem: null,
        endItem: null,
        type: 'chapters',
        pendingVerseScroll: null
    };

    let planSelectionContext = {
        bookIdx: 0,
        chapIdx: 0,
        versionId: null
    };

    let planSelectedVersesMap = new Map();
    const planBibleCache = new Map();
    let planReaderReturnScrollTop = 0;

    function isPlanReaderActive() {
        return !!planReadingState.active;
    }

    function getReaderContext() {
        if (isPlanReaderActive()) {
            return {
                kind: 'plan',
                bibleData: planReadingState.bibleData,
                bookIdx: planReadingState.bookIdx,
                chapIdx: planReadingState.chapIdx,
                versionId: planReadingState.versionId,
                selectedMap: planSelectedVersesMap,
                containerId: 'plan-chapter-content'
            };
        }

        return {
            kind: 'read',
            bibleData,
            bookIdx: currentBook,
            chapIdx: currentChap,
            versionId: currentVersionId,
            selectedMap: selectedVersesMap,
            containerId: 'chapter-content'
        };
    }

    function getReaderVersionMeta() {
        const ctx = getReaderContext();
        return versoesDisponiveis.find(v => v.id === ctx.versionId) || {
            id: ctx.versionId,
            abbrev: String(ctx.versionId || '').replace('.json','').toUpperCase(),
            nome: ctx.versionId || ''
        };
    }

    function getPlanVersionId(plan) {
        if (plan?.versionId && versoesDisponiveis.some(v => v.id === plan.versionId)) {
            return plan.versionId;
        }

        // Planos antigos sem versionId usam a tradução atual somente como fallback.
        return currentVersionId;
    }

    function getPlanDayTitle(day) {
        if (!day?.startItem || !day?.endItem) return 'Leitura';

        const first = day.startItem;
        const last = day.endItem;
        const b1 = getAbbrev(first.bookName);
        const b2 = getAbbrev(last.bookName);
        const isVersePlan = day.type === 'verses' || first.verseIdx !== undefined;

        if (isVersePlan) {
            const startRef = `${b1} ${first.chapIdx + 1}:${first.verseIdx + 1}`;
            const endRef = `${b2} ${last.chapIdx + 1}:${last.verseIdx + 1}`;
            return startRef === endRef ? `Leitura de ${startRef}` : `Leitura de ${startRef} - ${endRef}`;
        }

        if (first.bookIdx === last.bookIdx) {
            const ref = first.chapIdx === last.chapIdx
                ? `${b1} ${first.chapIdx + 1}`
                : `${b1} ${first.chapIdx + 1}-${last.chapIdx + 1}`;
            return `Leitura de ${ref}`;
        }

        return `Leitura de ${b1} ${first.chapIdx + 1} - ${b2} ${last.chapIdx + 1}`;
    }

    function getPlanVerseBounds(ctx, bIdx, cIdx) {
        if (ctx.kind !== 'plan') {
            return { start: 0, end: getChapterVerses(ctx.bibleData[bIdx]?.chapters?.[cIdx]).length - 1 };
        }

        const first = planReadingState.startItem;
        const last = planReadingState.endItem;
        if (!first || !last) return null;

        if (bIdx < first.bookIdx || bIdx > last.bookIdx) return null;
        if (bIdx === first.bookIdx && cIdx < first.chapIdx) return null;
        if (bIdx === last.bookIdx && cIdx > last.chapIdx) return null;

        const verses = getChapterVerses(ctx.bibleData[bIdx]?.chapters?.[cIdx]);
        if (!verses.length) return null;

        const start = (bIdx === first.bookIdx && cIdx === first.chapIdx && first.verseIdx !== undefined)
            ? first.verseIdx
            : 0;
        const end = (bIdx === last.bookIdx && cIdx === last.chapIdx && last.verseIdx !== undefined)
            ? Math.min(last.verseIdx, verses.length - 1)
            : verses.length - 1;

        return start <= end ? { start, end } : null;
    }

    function isPlanLastChapter(bIdx, cIdx) {
        return isPlanReaderActive() &&
            planReadingState.endItem &&
            bIdx === planReadingState.endItem.bookIdx &&
            cIdx === planReadingState.endItem.chapIdx;
    }

    function getPlanCurrentChapterIsAtEnd(bIdx, cIdx) {
        const bounds = getPlanVerseBounds(getReaderContext(), bIdx, cIdx);
        if (!bounds || !isPlanLastChapter(bIdx, cIdx)) return false;
        const last = planReadingState.endItem;
        return last.verseIdx === undefined || bounds.end === last.verseIdx;
    }

    async function carregarTraducaoPlano(versionId) {
        if (planBibleCache.has(versionId)) {
            return planBibleCache.get(versionId);
        }

        const response = await fetch(getTranslationPath(versionId), { cache: 'no-cache' });
        if (!response.ok) {
            throw new Error(`Não foi possível carregar ${versionId} para o Plano.`);
        }

        const data = await response.json();
        planBibleCache.set(versionId, data);
        return data;
    }

    function getPlanChapterNumberBounds() {
        if (!isPlanReaderActive()) return null;
        return {
            firstBookIdx: planReadingState.startItem?.bookIdx ?? 0,
            firstChapIdx: planReadingState.startItem?.chapIdx ?? 0,
            lastBookIdx: planReadingState.endItem?.bookIdx ?? 0,
            lastChapIdx: planReadingState.endItem?.chapIdx ?? 0
        };
    }

    function getReaderSelectionCount() {
        return getReaderContext().selectedMap.size;
    }

    const comparisonCache = new Map();

    const bookNameIndexMap = {};
    function atualizarIndexLivros() {
        for (let key in bookNameIndexMap) delete bookNameIndexMap[key];
        bibleData.forEach((b, i) => { bookNameIndexMap[normalizeStr(b.name)] = i; });
    }

    function getVersionMeta() {
        return versoesDisponiveis.find(v => v.id === currentVersionId) || {
            id: currentVersionId,
            abbrev: currentVersionId.replace('.json','').toUpperCase(),
            nome: currentVersionId
        };
    }

    function getSavedVersionId(item) {

        if (!item) {
            return currentVersionId;
        }

        // Preferimos o ID exato salvo no registro.
        if (item.versionId) {
            const exists = versoesDisponiveis.some(
                v => v.id === item.versionId
            );

            if (exists) {
                return item.versionId;
            }
        }

        // Compatibilidade com registros antigos
        // que possuem apenas a abreviação da tradução.
        if (item.version) {

            const normalizedVersion =
                String(item.version)
                    .replace('.json', '')
                    .trim()
                    .toUpperCase();

            const meta =
                versoesDisponiveis.find(
                    v =>
                        String(v.abbrev).toUpperCase() ===
                        normalizedVersion
                );

            if (meta) {
                return meta.id;
            }
        }

        // Último recurso:
        // mantém a tradução atualmente ativa.
        return currentVersionId;
    }

    function formatSavedDate(value) {
        if (!value) return '';
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return '';
        return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    function normalizeSavedRecords() {
        let changed = false;
        savedVerses = savedVerses.map(item => {
            const copy = { ...item };
            if (!copy.createdAt) { copy.createdAt = copy.date || new Date().toISOString(); changed = true; }
            if (!copy.version) { copy.version = getVersionMeta().abbrev; changed = true; }
            if (!copy.reference && copy.content) {
                const lines = String(copy.content).split('\n');
                copy.reference = lines[lines.length - 1].replace(/[\[\]]/g, '');
                changed = true;
            }
            return copy;
        });
        savedNotes = savedNotes.map(item => {
            const copy = { ...item };
            if (!copy.createdAt) { copy.createdAt = copy.date || new Date().toISOString(); changed = true; }
            if (!copy.version) { copy.version = getVersionMeta().abbrev; changed = true; }
            return copy;
        });
        if (changed) {
            localStorage.setItem('bible_saved_verses', JSON.stringify(savedVerses));
            localStorage.setItem('bible_notes', JSON.stringify(savedNotes));
        }
    }

    normalizeSavedRecords();

    function getSavedVerseSet(item) {
        return Array.isArray(item.verses) ? item.verses.map(Number).sort((a,b)=>a-b) : [];
    }

    function getSavedMatch(bIdx, cIdx, vIdx, context = getReaderContext()) {
        const meta = versoesDisponiveis.find(v => v.id === context.versionId);
        const version = meta?.abbrev || String(context.versionId || '').replace('.json','').toUpperCase();
        return savedVerses.some(item => {
            if (item.bookIdx !== bIdx || item.chapIdx !== cIdx) return false;
            if (item.versionId && item.versionId !== context.versionId) return false;
            if (item.version && String(item.version).toUpperCase() !== String(version).toUpperCase()) return false;
            return getSavedVerseSet(item).includes(vIdx);
        });
    }

    function getNoteMatch(bIdx, cIdx, vIdx, context = getReaderContext()) {
        return savedNotes.some(item => {
            if (item.bookIdx !== bIdx || item.chapIdx !== cIdx) return false;
            if (item.versionId && item.versionId !== context.versionId) return false;
            return Array.isArray(item.verses) && item.verses.includes(vIdx);
        });
    }

    function getSelectedNotes() {
        const ctx = getReaderContext();
        const selected = new Set(getSelectedOrdered().map(x => x.v));
        return savedNotes.filter(item =>
            item.bookIdx === ctx.bookIdx &&
            item.chapIdx === ctx.chapIdx &&
            (!item.versionId || item.versionId === ctx.versionId) &&
            Array.isArray(item.verses) &&
            item.verses.some(v => selected.has(v))
        );
    }

    function scrollToVerse(vIdx) {
        requestAnimationFrame(() => {
            const el = document.getElementById(`v-${vIdx}`);
            const main = document.getElementById('main-scroll');
            if (!el || !main) return;
            const top = el.offsetTop - 24;
            main.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
            el.classList.add('jump-highlight');
            setTimeout(() => el.classList.remove('jump-highlight'), 5000);
        });
    }

    function toggleExpandable(id, button) {
        const box = document.getElementById(id);
        if (!box) return;
        const expanded = box.classList.toggle('expanded');
        button.innerText = expanded ? 'Ver menos' : 'Ver mais';
    }

    function toggleThemeGroup(groupId) {

        const group =
            document.getElementById(groupId);

        if (!group) return;

        const collapsed =
            group.classList.toggle('theme-collapsed');

        const button =
            group.querySelector('.theme-group-toggle');

        if (button) {
            button.innerText =
                collapsed ? '▶' : '▼';
        }

        /*
        * Quando o tema é aberto, os cartões passam a existir
        * visualmente e podemos medir corretamente o conteúdo.
        */
        if (!collapsed) {

            requestAnimationFrame(() => {
                initExpandableControls();
            });

        }
    }

    function expandThemeForCard(card) {

        if (!card) return;

        const group =
            card.closest('.theme-group');

        if (!group) return;

        group.classList.remove('theme-collapsed');

        const button =
            group.querySelector('.theme-group-toggle');

        if (button) {
            button.innerText = '▼';
        }
    }

    // ==========================================
    // 3. SISTEMA DE GAVETAS (DRAWERS)
    // ==========================================
    function fecharGavetas() {
        document.querySelectorAll('.bottom-drawer').forEach(el => {
            el.classList.remove('open');
            el.setAttribute('aria-hidden', 'true');
        });
    }

    const TRANSLATIONS_CACHE_NAME = 'biblias-translations-v1';

    function getTranslationCacheFilename(request) {
        try {
            const url = new URL(request.url || request, window.location.href);
            const parts = url.pathname.split('/').filter(Boolean);
            return decodeURIComponent(parts[parts.length - 1] || '');
        } catch (error) {
            return '';
        }
    }

    async function getOfflineTranslationIds() {
        if (!('caches' in window)) return new Set();

        try {
            const cache = await caches.open(TRANSLATIONS_CACHE_NAME);
            const requests = await cache.keys();
            const ids = new Set();

            requests.forEach(request => {
                const filename = getTranslationCacheFilename(request);
                if (filename) ids.add(filename);
            });

            return ids;
        } catch (error) {
            console.warn('Não foi possível consultar o cache de traduções.', error);
            return new Set();
        }
    }

    async function atualizarEstadoOfflineTraducoes() {
        const offlineIds = await getOfflineTranslationIds();

        document.querySelectorAll('.version-offline-btn').forEach(button => {
            const id = button.dataset.id;
            const offline = offlineIds.has(id);

            button.dataset.offline = offline ? 'true' : 'false';
            button.classList.toggle('is-offline', offline);
            button.classList.remove('is-loading');
            button.disabled = false;
            button.innerHTML = offline ? '🗑' : '☁️';
            button.title = offline
                ? `Remover ${id} do armazenamento offline`
                : `Baixar ${id} para uso offline`;
            button.setAttribute('aria-label', offline
                ? `Remover ${id} do armazenamento offline`
                : `Baixar ${id} para uso offline`);
        });

        document.querySelectorAll('.version-btn').forEach(button => {
            button.classList.toggle('active', button.dataset.id === currentVersionId);
        });

        return offlineIds;
    }

    async function removerArquivoTraducaoDoCache(versaoId) {
        const cache = await caches.open(TRANSLATIONS_CACHE_NAME);
        const requests = await cache.keys();
        let removido = false;

        for (const request of requests) {
            if (getTranslationCacheFilename(request) === versaoId) {
                removido = (await cache.delete(request)) || removido;
            }
        }

        return removido;
    }

    async function baixarTraducaoOffline(versaoId) {
        const cache = await caches.open(TRANSLATIONS_CACHE_NAME);
        const offlineIds = await getOfflineTranslationIds();

        if (offlineIds.has(versaoId)) return true;

        const response = await fetch(getTranslationPath(versaoId), { cache: 'no-cache' });
        if (!response.ok) {
            throw new Error(`Não foi possível baixar ${versaoId}. HTTP ${response.status}.`);
        }

        await cache.put(new Request(new URL(getTranslationPath(versaoId), window.location.href).href), response.clone());
        return true;
    }

    async function alternarDownloadTraducao(versaoId, button) {
        if (!button || button.disabled) return;

        button.disabled = true;
        button.classList.add('is-loading');

        try {
            const offlineIds = await getOfflineTranslationIds();

            if (offlineIds.has(versaoId)) {
                const removido = await removerArquivoTraducaoDoCache(versaoId);
                if (!removido) {
                    throw new Error('A tradução estava marcada como offline, mas não foi possível removê-la do cache.');
                }
                showToast(`${versaoId} removida do modo offline.`);
            } else {
                await baixarTraducaoOffline(versaoId);
                showToast(`${versaoId} disponível offline.`);
            }
        } catch (error) {
            console.error(error);
            showToast(error.message || 'Não foi possível alterar o armazenamento offline.');
        } finally {
            await atualizarEstadoOfflineTraducoes();
        }
    }

    function openDrawer(id) {
        fecharGavetas();
        const drawer = document.getElementById(id);
        if (!drawer) return;

        if (id === 'version-drawer') {
            atualizarEstadoOfflineTraducoes();
        }

        if (id === 'language-drawer') syncLangButtons();
        
        drawer.classList.add('open');
        drawer.setAttribute('aria-hidden', 'false');
    }

    function renderVersionList() {
        const list = document.getElementById('version-list');
        if (!list) return;

        let html = '';
        versoesDisponiveis.forEach(v => {
            html += `
                <div class="version-row">
                    <button class="drawer-btn version-btn" data-id="${v.id}" type="button" onclick="carregarTraducao('${v.id}')">
                        <span class="version-info">
                            <strong>${v.abbrev}</strong> ${v.nome}
                        </span>
                    </button>
                    <button
                        class="version-offline-btn"
                        data-id="${v.id}"
                        data-offline="false"
                        type="button"
                        title="Verificando armazenamento offline"
                        aria-label="Verificando armazenamento offline"
                        onclick="alternarDownloadTraducao('${v.id}', this)"
                    >☁️</button>
                </div>`;
        });

        list.innerHTML = html;
        atualizarEstadoOfflineTraducoes();
    }

    function syncLangButtons() {
        document.getElementById('lang-orig').classList.toggle('active', estadoIdiomas.orig);
        document.getElementById('lang-pt').classList.toggle('active', estadoIdiomas.pt);
        document.getElementById('lang-en').classList.toggle('active', estadoIdiomas.en);
    }

    function toggleLanguage(lang) {
        estadoIdiomas[lang] = !estadoIdiomas[lang];
        if(!estadoIdiomas.orig && !estadoIdiomas.pt && !estadoIdiomas.en) {
            estadoIdiomas[lang] = true;
            return showToast('Pelo menos um idioma deve estar ativo.');
        }
        localStorage.setItem('bible_lang_state', JSON.stringify(estadoIdiomas));
        syncLangButtons();
        const ctx = getReaderContext();
        if (ctx.kind === 'plan') renderChapterForContext(ctx, ctx.bookIdx, ctx.chapIdx);
        else renderChapter(currentBook, currentChap);
    }

    function normalizarStrongCode(strongCode) {
        return String(strongCode || '').trim().toUpperCase().replace(/^([GH])0+/, '$1');
    }

    function getLexiconEntry(strongCode, bIdx, data = bibleData) {
        const code = normalizarStrongCode(strongCode);
        if (globalLexicon && globalLexicon.entries && globalLexicon.entries[code]) {
            return { ...globalLexicon.entries[code], _source: 'global' };
        }
        const bookDict = data[bIdx] && data[bIdx].dictionary;
        if (bookDict) {
            const legacyEntry = bookDict[code] || bookDict[strongCode] || bookDict[String(strongCode || '').toLowerCase()];
            if (legacyEntry) return { ...legacyEntry, _source: 'book' };
        }
        return null;
    }

    function formatMorphology(morphology) {

        if (!morphology) return [];

        if (typeof morphology === 'string') {
            return [morphology];
        }

        if (Array.isArray(morphology)) {
            return morphology
                .filter(Boolean)
                .map(String);
        }

        const labels = {
            pessoa: 'Pessoa',
            numero: 'Número',
            genero: 'Gênero',
            caso: 'Caso',
            tempo: 'Tempo',
            modo: 'Modo',
            voz: 'Voz',
            forma: 'Forma',
            aspecto: 'Aspecto',
            grau: 'Grau',
            funcao: 'Função sintática'
        };

        const result = [];

        Object.entries(morphology)
            .forEach(([key, value]) => {

                if (
                    value === null ||
                    value === undefined ||
                    value === ''
                ) {
                    return;
                }

                if (key === 'codigo_pos') {
                    return;
                }

                if (key === 'codigo_parse') {
                    return;
                }

                result.push({
                    key,
                    label: labels[key] || key,
                    value: String(value)
                });
            });

        return result;
    }

    function getMorphologyExplanation(key, value) {

        const explanations = {

            tempo: {
                presente:
                    'Apresenta normalmente a ação como presente, em desenvolvimento ou característica; o valor exato depende do contexto.',
                imperfeito:
                    'Apresenta normalmente uma ação passada em desenvolvimento, habitual ou contínua no contexto.',
                aoristo:
                    'Apresenta a ação de forma global, sem necessariamente definir sua duração interna. O valor contextual deve ser considerado.',
                perfeito:
                    'Apresenta uma ação ou estado visto em relação a um resultado ou estado presente.',
                mais_que_perfeito:
                    'Apresenta uma ação anterior a outra referência passada.',
                futuro:
                    'Apresenta normalmente uma ação ou estado futuro.'
            },

            voz: {
                ativa:
                    'O sujeito é apresentado como agente da ação.',
                passiva:
                    'O sujeito é apresentado como aquele que recebe ou sofre a ação.',
                média:
                    'A forma média pode apresentar envolvimento especial do sujeito na ação; o sentido preciso depende do verbo e do contexto.'
            },

            modo: {
                indicativo:
                    'Apresenta a ação ou estado como uma afirmação ou declaração.',
                subjuntivo:
                    'Pode expressar possibilidade, intenção, finalidade, exortação ou outras relações dependentes do contexto.',
                imperativo:
                    'Expressa normalmente uma ordem, instrução ou exortação.',
                infinitivo:
                    'Forma verbal não finita que pode funcionar em diferentes relações sintáticas.',
                particípio:
                    'Forma verbal não finita que combina características verbais e adjetivais.'
            },

            caso: {
                nominativo:
                    'Normalmente associado ao sujeito ou predicativo.',
                genitivo:
                    'Pode expressar relações como posse, origem, descrição ou associação.',
                dativo:
                    'Pode expressar relações como destinatário, interesse, instrumento ou localização, conforme o contexto.',
                acusativo:
                    'Frequentemente marca o objeto direto ou a extensão da ação, entre outras funções.'
            },

            numero: {
                singular:
                    'Refere-se a uma unidade.',
                plural:
                    'Refere-se a mais de uma unidade.'
            },

            genero: {
                masculino:
                    'Gênero gramatical masculino.',
                feminino:
                    'Gênero gramatical feminino.',
                neutro:
                    'Gênero gramatical neutro.'
            },

            pessoa: {
                '1ª':
                    'Primeira pessoa: quem fala ou escreve.',
                '2ª':
                    'Segunda pessoa: a quem se fala ou escreve.',
                '3ª':
                    'Terceira pessoa: aquele ou aquilo de que se fala.'
            },

            forma: {
                'verbo finito':
                    'Forma verbal que apresenta pessoa e número.',
                particípio:
                    'Forma verbal não finita com características verbais e adjetivais.',
                infinitivo:
                    'Forma verbal não finita.'
            }
        };

        return (
            explanations[key] &&
            explanations[key][value]
        ) || '';
    }

    function renderDictionaryEntry(strongCode, data, occurrence) {
        const source = data.source || {};
        const pt = data.pt || {};
        const study = data.study || {};
        const lemma = pt.lema || source.lemma || data.lemma || 'Sem lema';
        const translit = pt.transliteracao || source.transliteracao || data.xlit || data.translit || '';
        const pron = pt.pronuncia || source.pronuncia || data.pronunciation || data.pron || '';
        const translations = pt.traducoes || data.translations || data.translation || [];
        const definition = pt.definicao || data.definition || source.definicao_strongs || data.strongs_def || '';
        const summary = pt.resumo || data.summary || '';
        const observations = pt.observacoes || pt.observacao || data.observations || '';
        const derivation = pt.derivacao || source.derivacao || data.derivation || '';
        const grammar = study.classe_lexical || study.classe_gramatical || data.grammar || '';
        const morphologyData =
            occurrence &&
            (
                occurrence.morphology ||
                occurrence.morph ||
                occurrence.grammar
            );

        const morphologyFields =
            formatMorphology(
                morphologyData
            );
        const occurrenceForm = occurrence && (occurrence.form || occurrence.word || '');
        const occurrenceGloss = occurrence && (occurrence.gloss_pt || occurrence.text_pt || '');
        const transHtml = Array.isArray(translations) ? translations.filter(Boolean).map(escapeHTML).join(', ') : escapeHTML(translations);
        return `
            <h4 class="panel-lemma">${escapeHTML(lemma)} <span class="panel-strong">${escapeHTML(normalizarStrongCode(strongCode))}</span></h4>
            ${translit ? `<div class="panel-pronuncia">Transliteração: ${escapeHTML(translit)}</div>` : ''}
            ${pron ? `<div class="panel-pronuncia">Pronúncia: [ ${escapeHTML(pron)} ]</div>` : ''}
            ${grammar ? `<div class="panel-grammar">${escapeHTML(grammar)}</div>` : ''}
            ${occurrenceForm ? `
                <div class="dictionary-section">

                    <div class="dictionary-section-title">
                        Nesta ocorrência
                    </div>

                    <div class="dictionary-occurrence">

                        <div class="dictionary-occurrence-form">
                            ${escapeHTML(occurrenceForm)}
                        </div>

                        ${
                            occurrenceGloss
                                ? `
                                    <div class="dictionary-occurrence-gloss">
                                        Equivalência:
                                        ${escapeHTML(occurrenceGloss)}
                                    </div>
                                `
                                : ''
                        }

                        ${
                            morphologyFields.length
                                ? `
                                    <div class="morphology-study">

                                        <div class="morphology-study-title">
                                            Análise morfológica
                                        </div>

                                        ${morphologyFields.map(field => {

                                            const explanation =
                                                getMorphologyExplanation(
                                                    field.key,
                                                    field.value
                                                );

                                            return `
                                                <div class="morphology-field">

                                                    <div class="morphology-field-label">
                                                        ${escapeHTML(field.label)}
                                                    </div>

                                                    <div class="morphology-field-value">
                                                        ${escapeHTML(field.value)}
                                                    </div>

                                                    ${
                                                        explanation
                                                            ? `
                                                                <div class="morphology-field-help">
                                                                    ${escapeHTML(explanation)}
                                                                </div>
                                                            `
                                                            : ''
                                                    }

                                                </div>
                                            `;

                                        }).join('')}

                                    </div>
                                `
                                : `
                                    <div class="dictionary-note">
                                        A morfologia desta ocorrência ainda
                                        não está disponível.
                                    </div>
                                `
                        }

                    </div>
                </div>
            ` : ''}
            ${
                morphologyData &&
                morphologyData.codigo_parse
                    ? `
                        <div class="dictionary-section">

                            <div class="dictionary-section-title">
                                Código morfológico
                            </div>

                            <div class="morphology-code">
                                ${escapeHTML(
                                    morphologyData.codigo_parse
                                )}
                            </div>

                        </div>
                    `
                    : ''
            }
            ${transHtml ? `<div class="dictionary-section"><div class="dictionary-section-title">Traduções principais</div><div class="panel-traducoes" style="font-weight:normal;">${transHtml}</div></div>` : ''}
            ${definition ? `<div class="dictionary-section"><div class="dictionary-section-title">Definição</div><div class="dictionary-definition">${escapeHTML(definition)}</div></div>` : ''}
            ${summary ? `<div class="dictionary-section"><div class="dictionary-section-title">Resumo para estudo</div><div class="dictionary-summary">${escapeHTML(summary)}</div></div>` : ''}
            ${derivation ? `<div class="dictionary-section"><div class="dictionary-section-title">Derivação</div><div class="dictionary-note">${escapeHTML(derivation)}</div></div>` : ''}
            ${observations ? `<div class="dictionary-section"><div class="dictionary-section-title">Observação</div><div class="dictionary-note">${escapeHTML(observations)}</div></div>` : ''}
        `;
    }

    function openDictionary(
        event,
        strongCode,
        bIdx,
        occurrenceForm,
        occurrenceGloss,
        occurrenceMorphologyJson
    ) {

        event.stopPropagation();

        fecharGavetas();

        const content =
            document.getElementById(
                'dictionary-content'
            );

        const reader = getReaderContext();
        const data =
            getLexiconEntry(
                strongCode,
                bIdx,
                reader.bibleData
            );

        let morphology = null;

        if (occurrenceMorphologyJson) {

            try {

                morphology =
                    JSON.parse(
                        occurrenceMorphologyJson
                    );

            } catch (_) {

                morphology =
                    occurrenceMorphologyJson;
            }
        }

        /*
        * Alguns arquivos podem entregar:
        *
        * {
        *   morphology: {...}
        * }
        *
        * ou diretamente:
        *
        * {
        *   caso: "...",
        *   numero: "..."
        * }
        *
        * Normalizamos aqui.
        */

        if (morphology) {

            morphology =
                morphology.morphology ||
                morphology.morph ||
                morphology;
        }

        const occurrence = {

            form:
                occurrenceForm || '',

            gloss_pt:
                occurrenceGloss || '',

            morphology:
                morphology || null
        };

        if (data) {

            content.innerHTML =
                renderDictionaryEntry(
                    strongCode,
                    data,
                    occurrence
                );

        } else {

            content.innerHTML = `
                <h4 class="panel-lemma">
                    ${escapeHTML(
                        occurrenceForm || 'Palavra'
                    )}

                    <span class="panel-strong">
                        ${escapeHTML(
                            normalizarStrongCode(
                                strongCode
                            )
                        )}
                    </span>
                </h4>

                <p style="color:#777;line-height:1.5;">
                    Este Strong ainda não possui
                    verbete no léxico global.
                </p>
            `;
        }

        const drawer =
            document.getElementById(
                'dictionary-drawer'
            );

        drawer.classList.add('open');

        drawer.setAttribute(
            'aria-hidden',
            'false'
        );
    }

    function diagnosticoMorfologia2Joao() {

        const result = {

            arquivoCarregado:
                !!morphologyData,

            entradasIndexadas:
                morphologyIndex.size,

            erro:
                morphologyLoadError
                    ? morphologyLoadError.message
                    : null
        };

        console.table(result);

        return result;
    }

    // ==========================================
    // 4. LÓGICA DE LEITURA E INTERLINEAR
    // ==========================================
    function initApp() {
        if (!bibleData || bibleData.length === 0) return;
        if(!bibleData[currentBook] || !bibleData[currentBook].chapters || !bibleData[currentBook].chapters[currentChap]) {
            currentBook = 0; currentChap = 0;
        }
        renderChapter(currentBook, currentChap);
        setTimeout(() => buildBookSelectionUI(), 100);
    }

    function normalizeVerseObject(verse, index, data = bibleData, bIdx = currentBook) {
        if (typeof verse === 'string') {
            return {
                id: `${data[bIdx]?.id || 'verse'}-${index + 1}`,
                text_pt: verse,
                words: []
            };
        }

        return verse || {
            id: `${data[bIdx]?.id || 'verse'}-${index + 1}`,
            text_pt: '',
            words: []
        };
    }


    // ==========================================================
    // NORMALIZAÇÃO DA ESTRUTURA DO CAPÍTULO
    // ==========================================================
    // Traduções normais:
    //     chapter = [versículo, versículo, ...]
    //
    // A Mensagem:
    //     chapter = {
    //         verses: [versículo, versículo, ...]
    //     }
    //
    // Todas as funções de leitura devem passar por aqui.
    // ==========================================================

    function getChapterVerses(chapterData) {
        if (Array.isArray(chapterData)) {
            return chapterData;
        }

        if (Array.isArray(chapterData?.verses)) {
            return chapterData.verses;
        }

        return [];
    }


    function getChapterVerse(chapterData, vIdx) {
        const verses = getChapterVerses(chapterData);
        return verses[vIdx];
    }


    function getVerseTextForCopy(verseObj) {

        if (typeof verseObj === 'string') {
            return verseObj;
        }

        if (!verseObj || typeof verseObj !== 'object') {
            return '';
        }

        // Texto principal das traduções normais
        if (verseObj.text_pt) {
            return verseObj.text_pt;
        }

        // Estrutura alternativa usada por algumas versões
        if (verseObj.text) {
            return verseObj.text;
        }

        // Outros nomes possíveis de campo de texto
        if (verseObj.content) {
            return verseObj.content;
        }

        if (verseObj.texto) {
            return verseObj.texto;
        }

        // Fallback para estruturas baseadas em palavras
        if (Array.isArray(verseObj.words)) {
            return verseObj.words
                .map(w => w.text_pt || w.word || '')
                .join(' ')
                .replace(/\s+/g, ' ')
                .trim();
        }

        return '';
    }

    function renderChapter(bIdx, cIdx) {
        renderChapterForContext(getReaderContext(), bIdx, cIdx);
    }

    function renderChapterForContext(ctx, bIdx, cIdx) {
        const data = ctx.bibleData;
        if (!data || !data[bIdx]) return;

        const sameChapter = ctx.bookIdx === bIdx && ctx.chapIdx === cIdx;
        if (ctx.kind === 'read') {
            currentBook = bIdx;
            currentChap = cIdx;
            localStorage.setItem('bible_last_read', JSON.stringify({ bookIdx: bIdx, chapIdx: cIdx }));
        } else {
            planReadingState.bookIdx = bIdx;
            planReadingState.chapIdx = cIdx;
            planSelectionContext.bookIdx = bIdx;
            planSelectionContext.chapIdx = cIdx;
        }

        clearSelection();
        fecharGavetas();

        const book = data[bIdx];

        const chapterData = book.chapters[cIdx];

        const allVerses = getChapterVerses(chapterData);
        const bounds = getPlanVerseBounds(ctx, bIdx, cIdx);
        if (!bounds) return;
        const renderStart = bounds.start;
        const renderEnd = bounds.end;
        const verses = allVerses.slice(renderStart, renderEnd + 1);

        document.getElementById('pill-title').innerText =
            ctx.kind === 'plan' ? `${book.name} ${cIdx + 1}` : `${book.name} ${cIdx + 1}`;

        if (ctx.kind === 'plan') {
            document.getElementById('app-title').innerText = getPlanDayTitle(planReadingState.day);
        }

        const notesInChap =
            savedNotes.filter(
                n => n.bookIdx === bIdx && n.chapIdx === cIdx
            );

        const pericopes =
            getPericopesForChapter(
                book,
                cIdx
            );

        let html = `
            <div class="chapter-header">
                <div class="book-name">
                    ${escapeHTML(book.name)}
                </div>

                <div class="chap-number">
                    ${cIdx + 1}
                </div>
            </div>
        `;
        const numActiveLangs = (estadoIdiomas.pt ? 1 : 0) + (estadoIdiomas.en ? 1 : 0) + (estadoIdiomas.orig ? 1 : 0);
        const isInt = ctx.versionId === 'int.json';
        const isFluidMode = !isInt || numActiveLangs === 1;
        const dirAttr = (isFluidMode && estadoIdiomas.orig && !estadoIdiomas.pt && !estadoIdiomas.en && isInt) ? 'dir="rtl"' : 'dir="ltr"';

        verses.forEach((verse, localIndex) => {
            const i = renderStart + localIndex;
            const verseObj = normalizeVerseObject(verse, i, data, bIdx);
            const verseNumber = i + 1;

            const currentPericope =
                getPericopeForVerse(
                    pericopes,
                    verseNumber
                );
            const isPericopeStart =
                currentPericope &&
                verseNumber ===
                    currentPericope.start_verse;
            const hasNote = getNoteMatch(bIdx, cIdx, i, ctx);
            const hasSaved = getSavedMatch(bIdx, cIdx, i, ctx);

            const isSelected =
                ctx.selectedMap.has(i);

            const stateClasses = `
                ${hasNote ? 'has-note' : ''}
                ${hasSaved ? 'has-saved' : ''}
                ${isSelected ? 'selected' : ''}
            `.trim();

            if (isFluidMode || !verseObj.words || verseObj.words.length === 0) {

                let fluidText = '';

                // ==========================================================
                // TRADUÇÕES / PARÁFRASES NÃO INTERLINEARES
                // ==========================================================
                // MENS não deve depender do estado dos idiomas do
                // interlinear. A gaveta de idiomas só controla o INT.
                // ==========================================================

                if (!isInt) {

                    fluidText = getVerseTextForCopy(verseObj);

                } else {

                    // ======================================================
                    // INT — respeita os idiomas selecionados
                    // ======================================================

                    if (typeof verse === 'string') {

                        fluidText = verse;

                    } else if (estadoIdiomas.pt) {

                        fluidText =
                            verseObj.text_pt ||
                            (verseObj.words || [])
                                .map(w => w.text_pt || '')
                                .join(' ');

                    } else if (estadoIdiomas.en) {

                        fluidText =
                            (verseObj.words || [])
                                .map(w => w.text_en || '')
                                .join(' ');

                    } else if (estadoIdiomas.orig) {

                        fluidText =
                            (verseObj.words || [])
                                .map(w => w.word || '')
                                .join(' ');
                    }
                }

                fluidText =
                    String(fluidText || '')
                        .replace(/\s+/g, ' ')
                        .trim();

                if (isPericopeStart) {

                    html += `
                        <div
                            class="pericope-header"
                            data-pericope-id="${escapeHTML(
                                currentPericope.id
                            )}"
                        >

                            <div class="pericope-title">
                                ${escapeHTML(
                                    currentPericope.title
                                )}
                            </div>

                            <div class="pericope-range">
                                ${currentPericope.start_verse}–${currentPericope.end_verse}
                            </div>

                        </div>
                    `;
                }

                html += `<div class="verse fluid-mode ${stateClasses} ${estadoIdiomas.orig && !estadoIdiomas.pt && !estadoIdiomas.en ? 'original-only':''}" ${dirAttr} id="v-${i}" onclick="${ctx.kind === 'plan' ? `togglePlanVerse(${i})` : `toggleVerse(${i})`}"><span class="verse-num">${i + 1}</span> ${escapeHTML(fluidText)}</div>`;
            } else {

                html += `
                    <div
                        class="verse interlinear-mode ${stateClasses}"
                        id="v-${i}"
                        onclick="${ctx.kind === 'plan' ? `togglePlanVerse(${i})` : `toggleVerse(${i})`}"
                    >
                        <span class="verse-num">${i + 1}</span>

                        <div
                            class="interlinear-row"
                            ${dirAttr}
                        >
                `;

                (verseObj.words || []).forEach(
                    (w, wordIndex) => {

                        // ==========================================
                        // MORFOLOGIA EXISTENTE NO INT.JSON
                        // ==========================================

                        const morphologyFromBible =
                            w.morphology ||
                            w.morph ||
                            null;


                        // ==========================================
                        // MORFOLOGIA EXTERNA
                        // ==========================================

                        const externalMorphology =
                            getMorphologyForOccurrence(
                                bIdx,
                                cIdx,
                                i,
                                wordIndex,
                                w,
                                data
                            );


                        // ==========================================
                        // PRIORIDADE
                        // ==========================================

                        const morphJson =
                            morphologyFromBible ||
                            externalMorphology ||
                            null;


                        // ==========================================
                        // DADOS PARA A GAVETA
                        // ==========================================

                        const strongCode =
                            w.strong
                                ? escapeHTML(w.strong)
                                : '';

                        const morphologyAttribute =
                            morphJson
                                ? escapeHTML(
                                    JSON.stringify(morphJson)
                                )
                                : '';


                        // ==========================================
                        // PALAVRA
                        // ==========================================

                        html += `
                            <div
                                class="palavra-bloco ${
                                    w.strong
                                        ? 'dictionary-word'
                                        : ''
                                }"

                                ${
                                    w.strong
                                        ? `data-strong="${strongCode}"`
                                        : ''
                                }

                                ${
                                    w.strong
                                        ? `data-occurrence-form="${escapeHTML(
                                            w.word || ''
                                        )}"`
                                        : ''
                                }

                                ${
                                    w.strong
                                        ? `data-occurrence-gloss="${escapeHTML(
                                            w.text_pt || ''
                                        )}"`
                                        : ''
                                }

                                ${
                                    w.strong
                                        ? `data-occurrence-morphology="${morphologyAttribute}"`
                                        : ''
                                }
                            >

                                <span
                                    class="lang-orig ${
                                        estadoIdiomas.orig
                                            ? ''
                                            : 'hidden'
                                    }"
                                >
                                    ${escapeHTML(w.word)}
                                </span>

                                <span
                                    class="lang-pt ${
                                        estadoIdiomas.pt
                                            ? ''
                                            : 'hidden'
                                    }"
                                >
                                    ${escapeHTML(w.text_pt)}
                                </span>

                                <span
                                    class="lang-en ${
                                        estadoIdiomas.en
                                            ? ''
                                            : 'hidden'
                                    }"
                                >
                                    ${escapeHTML(w.text_en)}
                                </span>

                            </div>
                        `;
                    }
                );

                html += `
                        </div>
                    </div>
                `;
            }
        });

        document.getElementById(ctx.containerId).innerHTML = html;

        bindDictionaryWordClicks(ctx);

        if (ctx.kind === 'read' && !document.getElementById('tab-read').classList.contains('active')) {
            switchTab('read');
        }

        if (ctx.kind === 'plan' && getPlanCurrentChapterIsAtEnd(bIdx, cIdx)) {
            document.getElementById(ctx.containerId).insertAdjacentHTML('beforeend', `
                <div class="plan-complete-wrap">
                    <button class="btn" type="button" onclick="completePlanReading()">Concluir leitura</button>
                </div>
            `);
        }

        const pending = ctx.kind === 'plan' ? planReadingState.pendingVerseScroll : pendingVerseScroll;
        if (pending !== null && pending !== undefined) {
            if (ctx.kind === 'plan') planReadingState.pendingVerseScroll = null;
            else pendingVerseScroll = null;
            scrollToVerse(pending);
        } else if (!sameChapter) {
            requestAnimationFrame(() => document.getElementById('main-scroll').scrollTo({ top: 0, behavior: 'auto' }));
        }
    }

    function prevChapter() {
        const ctx = getReaderContext();
        if (ctx.kind === 'plan') {
            const first = planReadingState.startItem;
            if (!first) return;
            if (ctx.chapIdx > first.chapIdx && ctx.bookIdx === first.bookIdx) {
                renderChapterForContext(ctx, ctx.bookIdx, ctx.chapIdx - 1);
                return;
            }
            if (ctx.bookIdx > first.bookIdx) {
                const prevBook = ctx.bibleData[ctx.bookIdx - 1];
                if (prevBook) renderChapterForContext(ctx, ctx.bookIdx - 1, prevBook.chapters.length - 1);
            }
            return;
        }

        if (currentChap > 0) renderChapter(currentBook, currentChap - 1);
        else if (currentBook > 0) renderChapter(currentBook - 1, bibleData[currentBook - 1].chapters.length - 1);
    }

    function bindDictionaryWordClicks(context = getReaderContext()) {
        const words = document.querySelectorAll(
            `#${context.containerId} .dictionary-word`
        );

        words.forEach(word => {
            word.addEventListener('click', function(event) {
                event.stopPropagation();
                const strongCode = this.dataset.strong || '';
                const occurrenceForm = this.dataset.occurrenceForm || '';
                const occurrenceGloss = this.dataset.occurrenceGloss || '';
                const occurrenceMorphology = this.dataset.occurrenceMorphology || '';
                openDictionary(
                    event,
                    strongCode,
                    context.bookIdx,
                    occurrenceForm,
                    occurrenceGloss,
                    occurrenceMorphology
                );
            });
        });
    }

    function nextChapter() {
        const ctx = getReaderContext();
        if (ctx.kind === 'plan') {
            const last = planReadingState.endItem;
            if (!last) return;
            if (ctx.chapIdx < last.chapIdx && ctx.bookIdx === last.bookIdx) {
                renderChapterForContext(ctx, ctx.bookIdx, ctx.chapIdx + 1);
                return;
            }
            if (ctx.bookIdx < last.bookIdx) {
                renderChapterForContext(ctx, ctx.bookIdx + 1, 0);
            }
            return;
        }

        if (currentChap < bibleData[currentBook].chapters.length - 1) renderChapter(currentBook, currentChap + 1);
        else if (currentBook < bibleData.length - 1) renderChapter(currentBook + 1, 0);
    }

    function openSelector() { if (isPlanReaderActive()) return showToast('A leitura do Plano está limitada ao trecho do dia.'); fecharGavetas(); document.getElementById('selector-modal').style.display = 'flex'; renderBookListModal(); }
    function closeSelector() { document.getElementById('selector-modal').style.display = 'none'; }
    function renderBookListModal() {
        document.getElementById('modal-title').innerText = "Selecione o Livro";
        let html = '';
        bibleData.forEach((b, i) => { html += `<div class="list-item" onclick="renderChapterGridModal(${i})"><span>${b.name}</span><span style="color:#ccc;">&#10095;</span></div>`; });
        document.getElementById('modal-body').innerHTML = html;
    }
    function renderChapterGridModal(bIdx) {

        const book = bibleData[bIdx];

        if (!book) return;

        document.getElementById('modal-title').innerText =
            book.name;

        let html = `
            <div style="margin-bottom:15px;">
                <button
                    class="btn-min"
                    onclick="renderBookListModal()"
                >
                    &#10094; Voltar
                </button>
            </div>

            <div class="grid-chapters">
        `;

        book.chapters.forEach((_, cIdx) => {

            html += `
                <div
                    class="grid-item"
                    onclick="renderVerseGridModal(${bIdx}, ${cIdx})"
                >
                    ${cIdx + 1}
                </div>
            `;

        });

        html += `</div>`;

        document.getElementById('modal-body').innerHTML =
            html;
    }


    function renderVerseGridModal(bIdx, cIdx) {

    const book = bibleData[bIdx];

    if (!book) return;

    const chapter = book.chapters[cIdx];

    if (!chapter) return;

    const verses = getChapterVerses(chapter);

    document.getElementById('modal-title').innerText =
        `${book.name} ${cIdx + 1}`;

    let html = `
        <div style="margin-bottom:15px;">
            <button
                class="btn-min"
                onclick="renderChapterGridModal(${bIdx})"
            >
                &#10094; Capítulos
            </button>
        </div>

        <div class="grid-chapters">
    `;

    verses.forEach((_, vIdx) => {

        html += `
            <div
                class="grid-item"
                onclick="selectVerseFromModal(${bIdx}, ${cIdx}, ${vIdx})"
            >
                ${vIdx + 1}
            </div>
        `;

    });

    html += `</div>`;

    document.getElementById('modal-body').innerHTML =
        html;
}


    function selectVerseFromModal(bIdx, cIdx, vIdx) {

        /*
        * Guarda o versículo que deverá receber
        * o destaque depois que o capítulo for renderizado.
        */
        pendingVerseScroll = vIdx;

        closeSelector();

        /*
        * renderChapter() já possui toda a lógica necessária
        * para:
        *
        * - mudar livro/capítulo;
        * - renderizar o conteúdo;
        * - ir para a aba Ler;
        * - executar scrollToVerse();
        * - aplicar o destaque temporário.
        */
        renderChapter(
            bIdx,
            cIdx
        );
    }


    function selectFromModal(bIdx, cIdx) {

        /*
        * Mantemos a função antiga para compatibilidade
        * com qualquer chamada existente no app.
        */
        closeSelector();

        renderChapter(
            bIdx,
            cIdx
        );
    }

    // ==========================================
    // UI CORE: TOAST E DIALOG
    // ==========================================
    function showToast(msg) {
        const toast = document.getElementById("toast"); toast.innerText = msg;
        toast.classList.add("show"); setTimeout(() => toast.classList.remove("show"), 3000);
    }
    function showDialog({ type, title, msg, customHTML, extractData, onRender }) {
        return new Promise((resolve) => {
            const modal = document.getElementById('custom-dialog'), customBody = document.getElementById('cd-custom-body');
            document.getElementById('cd-title').innerText = title || "Atenção"; document.getElementById('cd-msg').innerText = msg || "";
            customBody.innerHTML = customHTML ? customHTML : (type === 'prompt' ? `<input type="text" id="cd-input-val" style="width:100%; padding:12px; border:1px solid #ccc; border-radius:8px;">` : '');
            customBody.style.display = customHTML || type === 'prompt' ? 'block' : 'none';
            document.getElementById('cd-btn-cancel').style.display = (type === 'alert') ? 'none' : 'block';
            modal.style.display = 'flex';
            if(onRender) onRender();

            document.getElementById('cd-btn-ok').onclick = () => {
                modal.style.display = 'none';
                if (extractData) resolve(extractData());
                else if (type === 'prompt') resolve(document.getElementById('cd-input-val').value);
                else resolve(true);
            };
            document.getElementById('cd-btn-cancel').onclick = () => { modal.style.display = 'none'; resolve(null); };
        });
    }

    function getExistingThemes(arr) {
        let themes = new Set(); arr.forEach(v => { if(v.theme && v.theme.trim() !== "") themes.add(v.theme); }); return Array.from(themes);
    }
    function generateThemeSelectHTML(themes, defaultT) {
        let opt = themes.map(t => `<option value="${t}" ${t===defaultT?'selected':''}>${t}</option>`).join('');
        return `<select id="cd-select-theme">${opt}<option value="_NEW_">-- Novo Tema --</option></select><input type="text" id="cd-input-theme" placeholder="Digite o tema" style="display:none;">`;
    }
    function bindThemeSelectLogic(themes) {
        const sel = document.getElementById('cd-select-theme'), inp = document.getElementById('cd-input-theme');
        if(!sel || !inp) return;
        if(themes.length === 0) { sel.value = '_NEW_'; inp.style.display = 'block'; }
        sel.onchange = (e) => { inp.style.display = (e.target.value === '_NEW_') ? 'block' : 'none'; };
    }
    function extractThemeData() {
        const sel = document.getElementById('cd-select-theme').value;
        return (sel === '_NEW_') ? (document.getElementById('cd-input-theme').value.trim() || 'Geral') : sel;
    }

    // ==========================================================
    // CONFIGURAÇÕES
    // ==========================================================

    function salvarConfiguracoes() {
        localStorage.setItem(
            'bible_app_settings',
            JSON.stringify(appSettings)
        );
    }


    function aplicarConfiguracoes() {

        document.documentElement.style.setProperty(
            '--bible-font-scale',
            appSettings.fontScale
        );

        document.documentElement.dataset.lineHeight =
            appSettings.lineHeight;

        document.documentElement.dataset.theme =
            appSettings.theme;

        atualizarInterfaceConfig();

        atualizarSplashTema();
    }


    function alterarFonte(direcao) {

        const passo = 0.05;

        let novoValor =
            Number(appSettings.fontScale) +
            (direcao * passo);

        novoValor =
            Math.max(
                0.85,
                Math.min(1.30, novoValor)
            );

        appSettings.fontScale =
            Number(novoValor.toFixed(2));

        salvarConfiguracoes();
        aplicarConfiguracoes();
    }


    function definirEspacamento(valor) {

        if (
            ![
                'compact',
                'normal',
                'comfortable'
            ].includes(valor)
        ) {
            valor = 'normal';
        }

        appSettings.lineHeight = valor;

        salvarConfiguracoes();
        aplicarConfiguracoes();
    }


    function definirTema(valor) {

        if (
            ![
                'light',
                'dark',
                'system'
            ].includes(valor)
        ) {
            valor = 'light';
        }

        appSettings.theme = valor;

        salvarConfiguracoes();
        aplicarConfiguracoes();
    }


    function atualizarInterfaceConfig() {

        const percentual =
            Math.round(
                Number(appSettings.fontScale) * 100
            );

        const indicador =
            document.getElementById(
                'font-size-value'
            );

        if (indicador) {
            indicador.innerText =
                `${percentual}%`;
        }


        document
            .querySelectorAll(
                '[data-line-height]'
            )
            .forEach(botao => {

                botao.classList.toggle(
                    'active',
                    botao.dataset.lineHeight ===
                    appSettings.lineHeight
                );
            });


        document
            .querySelectorAll(
                '[data-theme]'
            )
            .forEach(botao => {

                botao.classList.toggle(
                    'active',
                    botao.dataset.theme ===
                    appSettings.theme
                );
            });
    }


    function restaurarConfiguracoes() {

        appSettings = {
            ...DEFAULT_APP_SETTINGS
        };

        salvarConfiguracoes();
        aplicarConfiguracoes();

        showToast(
            'Configurações restauradas.'
        );
    }

    function saveCurrentTabScroll() {
        const main = document.getElementById('main-scroll');
        if (!main || !currentTabId) return;

        tabScrollPositions[currentTabId] = main.scrollTop;
    }

    function restoreTabScroll(tabId) {
        const main = document.getElementById('main-scroll');
        if (!main) return;

        const position = tabScrollPositions[tabId] || 0;

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                main.scrollTo(0, position);
            });
        });
    }

    // ==========================================
    // ABAS
    // ==========================================

    function switchTab(tabId) {

        saveCurrentTabScroll();

        /*
        * ------------------------------------------------------
        * RETORNO AO LEITOR DE PLANO
        * ------------------------------------------------------
        *
        * Se existe uma leitura de Plano ativa e o usuário voltou
        * para a aba Planos, não devemos:
        *
        * - fechar a leitura;
        * - renderizar a lista;
        * - resetar o título;
        * - esconder o botão de fechar;
        * - perder a posição da leitura.
        *
        * Apenas reativamos visualmente a aba e restauramos o
        * leitor que continua existente na memória.
        */
        if (isPlanReaderActive() && tabId === 'plans') {

            fecharGavetas();

            document.querySelectorAll(
                '.tab-content, nav button'
            ).forEach(
                el => el.classList.remove('active')
            );

            document.getElementById(
                'tab-plans'
            ).classList.add('active');

            document.getElementById(
                'nav-plans'
            ).classList.add('active');

            document.getElementById(
                'plan-reader-view'
            ).classList.remove('hidden');

            document.getElementById(
                'plan-list-view'
            ).classList.add('hidden');

            document.getElementById(
                'plan-create-view'
            ).classList.add('hidden');

            document.getElementById(
                'plan-detail-view'
            ).classList.add('hidden');

            document.getElementById(
                'reader-pill'
            ).style.display = 'flex';

            document.getElementById(
                'btn-plan-close'
            ).classList.remove('hidden');

            document.getElementById(
                'btn-version-menu'
            ).classList.add('hidden');

            document.getElementById(
                'btn-lang-menu'
            ).classList.add('hidden');

            const planVersionLabel =
                document.getElementById(
                    'plan-version-label'
                );

            if (planVersionLabel) {
                planVersionLabel.classList.remove('hidden');
            }

            document.getElementById(
                'app-title'
            ).classList.add(
                'plan-reader-app-title'
            );

            document.getElementById(
                'app-title'
            ).innerText =
                getPlanDayTitle(
                    planReadingState.day
                );

            currentTabId = 'plans';
            restoreTabScroll('plans');
            updateSelectionBar();
            return;
        }

        if (isPlanReaderActive()) {
        }

        const preservePendingVerseScroll =
            tabId === 'read' &&
            pendingVerseScroll !== null &&
            pendingVerseScroll !== undefined;

        fecharGavetas();

        document.querySelectorAll(
            '.tab-content, nav button'
        ).forEach(
            el => el.classList.remove('active')
        );

        document.getElementById(
            'tab-' + tabId
        ).classList.add('active');

        document.getElementById(
            'nav-' + tabId
        ).classList.add('active');

        document.getElementById(
            'reader-pill'
        ).style.display =
            (tabId === 'read')
                ? 'flex'
                : 'none';


        const btnLang =
            document.getElementById(
                'btn-lang-menu'
            );

        const btnApoio =
            document.getElementById(
                'btn-apoio'
            );


        if (btnApoio) {
            btnApoio.classList.toggle(
                'hidden',
                tabId !== 'read'
            );
        }

        if (
            tabId === 'read' &&
            currentVersionId === 'int.json'
        ) {
            btnLang.classList.remove(
                'hidden'
            );
        } else {
            btnLang.classList.add(
                'hidden'
            );
        }

        document.getElementById(
            'btn-plan-close'
        ).classList.add('hidden');

        document.getElementById(
            'plan-version-label'
        )?.classList.add('hidden');


        const versionMenu =
            document.getElementById(
                'btn-version-menu'
            );


        if (versionMenu) {
            versionMenu.classList.toggle(
                'hidden',
                tabId !== 'read'
            );
        }


        document.getElementById(
            'app-title'
        ).classList.remove(
            'plan-reader-app-title'
        );

        document.getElementById(
            'app-title'
        ).innerText = 'Bíblia';

        if (tabId === 'read') {

            renderChapter(
                currentBook,
                currentChap
            );
        }

        if (
            tabId === 'plans' &&
            !isPlanReaderActive()
        ) {
            renderPlanList();
        }


        if (tabId === 'saved') {
            renderSavedVerses();
        }


        if (tabId === 'notes') {

            renderNotesList();
        }

        clearSelection();

        if (!preservePendingVerseScroll) {
            currentTabId = tabId;
            restoreTabScroll(
                tabId
            );
        } else {
            currentTabId = tabId;
        }

    }

    function openSearchResult(bIdx, cIdx, vIdx) {

        /*
        * Informa ao renderChapter qual versículo
        * deverá ser localizado depois da renderização.
        */
        pendingVerseScroll = vIdx;

        /*
        * renderChapter já:
        *
        * - muda para a aba Ler;
        * - renderiza o capítulo;
        * - faz o scroll;
        * - aplica o destaque azul;
        */
        renderChapter(
            bIdx,
            cIdx
        );
    }

    // ==========================================
    // BUSCA
    // ==========================================
    function searchBible() {

        const input =
            document.getElementById('search-input');

        const resDiv =
            document.getElementById('search-results');

        if (!input || !resDiv) return;

        const query =
            input.value.trim();

        if (!query) {
            resDiv.innerHTML =
                '<p style="color:#777;">Digite uma palavra ou frase para pesquisar.</p>';
            return;
        }

        const nQuery =
            normalizeForSearch(query);

        const results = [];

        for (let bIdx = 0; bIdx < bibleData.length; bIdx++) {

            const book =
                bibleData[bIdx];

            if (!book || !Array.isArray(book.chapters)) {
                continue;
            }

            for (
                let cIdx = 0;
                cIdx < book.chapters.length;
                cIdx++
            ) {

                const verses =
                    getChapterVerses(
                        book.chapters[cIdx]
                    );

                for (
                    let vIdx = 0;
                    vIdx < verses.length;
                    vIdx++
                ) {

                    const verseObj =
                        verses[vIdx];

                    let searchable = '';

                    // ------------------------------------------
                    // Texto principal do versículo
                    // ------------------------------------------

                    searchable =
                        getVerseTextForCopy(
                            verseObj
                        );

                    // ------------------------------------------
                    // Segurança para estruturas alternativas
                    // ------------------------------------------

                    if (
                        !searchable &&
                        typeof verseObj === 'string'
                    ) {
                        searchable =
                            verseObj;
                    }

                    // ------------------------------------------
                    // Para o INT, também pesquisamos as palavras
                    // ------------------------------------------

                    if (
                        verseObj &&
                        typeof verseObj === 'object' &&
                        Array.isArray(verseObj.words)
                    ) {

                        const wordsText =
                            verseObj.words
                                .map(w =>
                                    [
                                        w?.word || '',
                                        w?.text_pt || '',
                                        w?.text_en || ''
                                    ].join(' ')
                                )
                                .join(' ');

                        searchable +=
                            ' ' +
                            wordsText;
                    }

                    // ------------------------------------------
                    // Compara sem acentos/pontuação
                    // ------------------------------------------

                    const normalizedText =
                        normalizeForSearch(
                            searchable
                        );

                    if (
                        normalizedText.includes(
                            nQuery
                        )
                    ) {

                        results.push({
                            bIdx,
                            cIdx,
                            vIdx,
                            bookName:
                                book.name,
                            text:
                                getVerseTextForCopy(
                                    verseObj
                                )
                        });
                    }

                    // Limite de segurança
                    if (results.length >= 100) {
                        break;
                    }
                }

                if (results.length >= 100) {
                    break;
                }
            }

            if (results.length >= 100) {
                break;
            }
        }

        // ------------------------------------------
        // Renderiza resultados
        // ------------------------------------------

        let html =
            `<h3 style="font-size:16px;">
                ${results.length}${results.length === 100 ? '+' : ''} resultados
            </h3>`;

        if (results.length === 0) {

            html += `
                <p style="color:#777;">
                    Nenhum resultado para
                    "${escapeHTML(query)}".
                </p>
            `;

        } else {

            results.forEach(res => {

                html += `
                    <div
                        class="card"
                        style="padding:15px; cursor:pointer;"
                        onclick="openSearchResult(
                            ${res.bIdx},
                            ${res.cIdx},
                            ${res.vIdx}
                        )"
                    >

                        <p
                            style="
                                font-weight:700;
                                color:var(--secondary);
                                font-size:14px;
                                margin-bottom:6px;
                            "
                        >
                            ${escapeHTML(res.bookName)}
                            ${res.cIdx + 1}:${res.vIdx + 1}
                        </p>

                        <p
                            style="
                                font-size:15px;
                                color:#444;
                                line-height:1.4;
                            "
                        >
                            ${escapeHTML(res.text)}
                        </p>

                    </div>
                `;
            });
        }

        resDiv.innerHTML = html;
    }

    async function toggleVerse(vIdx) {
        const ctx = getReaderContext();
        const el = document.getElementById(`v-${vIdx}`);
        if (!el) return;

        const comparisonDrawer = document.getElementById('comparison-drawer');
        const comparisonOpen = !!comparisonDrawer && comparisonDrawer.classList.contains('open');
        const map = ctx.selectedMap;

        if (comparisonOpen) {
            document
                .querySelectorAll(`#${ctx.containerId} .verse.selected`)
                .forEach(item => item.classList.remove('selected'));

            map.clear();

            const chapterData = ctx.bibleData[ctx.bookIdx]?.chapters?.[ctx.chapIdx];
            const verseObj = getChapterVerse(chapterData, vIdx);
            const plainText = getVerseTextForCopy(verseObj);

            map.set(vIdx, { v: vIdx, text: plainText });
            el.classList.add('selected');
            updateSelectionBar();

            const activeButton = comparisonDrawer.querySelector('.comparison-version-btn.active');
            const activeVersionId = activeButton?.dataset?.versionId || null;
            if (activeVersionId) {
                await selectComparisonVersion(activeVersionId);
            }
            return;
        }

        if (map.has(vIdx)) {
            map.delete(vIdx);
            el.classList.remove('selected');
        } else {
            const chapterData = ctx.bibleData[ctx.bookIdx]?.chapters?.[ctx.chapIdx];
            const verseObj = getChapterVerse(chapterData, vIdx);
            const plainText = getVerseTextForCopy(verseObj);
            map.set(vIdx, { v: vIdx, text: plainText });
            el.classList.add('selected');
        }

        updateSelectionBar();
    }

    function togglePlanVerse(vIdx) {

        const el =
            document
                .getElementById('plan-chapter-content')
                ?.querySelector(`#v-${vIdx}`);

        if (!el) return;

        // Se já estiver selecionado,
        // remove a seleção.
        if (
            planSelectedVersesMap.has(vIdx)
        ) {

            planSelectedVersesMap.delete(
                vIdx
            );

            el.classList.remove(
                'selected'
            );

        } else {

            const chapter =
                planReadingState.bibleData?.[
                    planReadingState.bookIdx
                ]?.chapters?.[
                    planReadingState.chapIdx
                ];

            const verseObj =
                getChapterVerse(
                    chapter,
                    vIdx
                );

            planSelectedVersesMap.set(
                vIdx,
                {
                    v: vIdx,
                    text:
                        getVerseTextForCopy(
                            verseObj
                        )
                }
            );

            // Mantém o fundo azul
            // enquanto estiver selecionado.
            el.classList.add(
                'selected'
            );
        }

        updatePlanSelectionBar();
    }

    function updatePlanSelectionBar() {
        updateSelectionBar();
    }

    function clearSelection() {
        const ctx = getReaderContext();
        ctx.selectedMap.clear();
        document.querySelectorAll(`#${ctx.containerId} .verse.selected`).forEach(el => el.classList.remove('selected'));
        updateSelectionBar();
    }

    function updateSelectionBar() {
        const ctx = getReaderContext();
        const bar = document.getElementById('selection-bar');
        const count = ctx.selectedMap.size;

        const viewNoteBtn = document.getElementById('selection-view-note');
        const compareBtn = document.getElementById('selection-compare');
        const hasNote = getSelectedNotes().length > 0;

        if (viewNoteBtn) viewNoteBtn.classList.toggle('hidden', !hasNote);
        if (compareBtn) compareBtn.classList.toggle('hidden', count !== 1);

        if (count > 0) {
            document.getElementById('selection-count').innerText = `${count} versículo${count > 1 ? 's' : ''}`;
            bar.style.display = 'flex';
        } else {
            bar.style.display = 'none';
        }
    }

    function viewSelectedNote() {

        const notes =
            getSelectedNotes();

        if (!notes.length) {
            return showToast(
                'Nenhuma nota encontrada para a seleção.'
            );
        }

        const target =
            notes[0];

        switchTab('notes');

        requestAnimationFrame(() => {

            const card =
                document.getElementById(
                    `note-card-${target.id}`
                );

            if (!card) return;

            expandThemeForCard(card);

            card.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            });

            card.classList.remove(
                'note-jump-highlight'
            );

            // força reinício da animação
            void card.offsetWidth;

            card.classList.add(
                'note-jump-highlight'
            );

            setTimeout(() => {
                card.classList.remove(
                    'note-jump-highlight'
                );
            }, 1900);
        });

        clearSelection();
    }

    // =========================================================
    // COMPARAÇÃO DE TRADUÇÕES
    // =========================================================

    function getComparisonVerseText(verseObj) {
        if (typeof verseObj === 'string') {
            return verseObj;
        }

        if (!verseObj) {
            return '';
        }

        // Traduções normais
        if (verseObj.text_pt) {
            return verseObj.text_pt;
        }

        // Estruturas que eventualmente tragam texto
        // diretamente em outros campos.
        if (verseObj.text) {
            return verseObj.text;
        }

        // Fallback para estruturas baseadas em words.
        if (Array.isArray(verseObj.words)) {
            return verseObj.words
                .map(word => word.text_pt || word.word || '')
                .join(' ')
                .replace(/\s+/g, ' ')
                .trim();
        }

        return '';
    }


    function findComparisonBook(data, currentBookName) {
        if (!Array.isArray(data)) {
            return null;
        }

        const target =
            normalizeStr(currentBookName || '');

        const index =
            data.findIndex(book =>
                normalizeStr(book.name || '') === target
            );

        return index >= 0 ? index : null;
    }


    async function loadComparisonVersion(versionId) {

        if (comparisonCache.has(versionId)) {
            return comparisonCache.get(versionId);
        }

        const response =
            await fetch(getTranslationPath(versionId), {
                cache: 'no-cache'
            });

        if (!response.ok) {
            throw new Error(
                `Não foi possível carregar ${versionId}`
            );
        }

        const data = await response.json();

        comparisonCache.set(
            versionId,
            data
        );

        return data;
    }

    function getSelectedSourceReferenceRange() {
        const ctx = getReaderContext();
        const selected = getSelectedOrdered()[0];
        if (!selected) return null;

        const book = ctx.bibleData[ctx.bookIdx];
        if (!book) return null;

        const chapter = book.chapters[ctx.chapIdx];
        const meta = versoesDisponiveis.find(v => v.id === ctx.versionId);

        if (meta?.tipo === 'paraphrase') {
            const verseObj = getChapterVerse(chapter, selected.v);
            return getVerseReferenceRange(verseObj, selected.v);
        }

        return { start: selected.v + 1, end: selected.v + 1 };
    }

    function getComparisonReference() {
        const ctx = getReaderContext();
        const book = ctx.bibleData[ctx.bookIdx];
        if (!book) return '';

        const range = getSelectedSourceReferenceRange();
        if (!range) return '';

        const chapterRef = `${getAbbrev(book.name)} ${ctx.chapIdx + 1}`;
        return range.start === range.end
            ? `${chapterRef}:${range.start}`
            : `${chapterRef}:${range.start}-${range.end}`;
    }


    function renderComparisonVersionButtons(activeVersionId) {
        const ctx = getReaderContext();
        const container = document.getElementById('comparison-version-list');
        if (!container) return;

        const primary = versoesDisponiveis.find(version => version.id === ctx.versionId);
        const available = versoesDisponiveis.filter(version => version.id !== ctx.versionId);
        const primaryButton = primary ? `
            <button
                type="button"
                class="comparison-version-btn primary-source"
                data-version-id="${escapeHTML(primary.id)}"
                aria-label="Tradução primária: ${escapeHTML(primary.nome)}"
                disabled>
                ${escapeHTML(primary.abbrev)}
            </button>
        ` : '';
        container.innerHTML = primaryButton + available.map(version => `
            <button
                type="button"
                class="comparison-version-btn"
                data-version-id="${escapeHTML(version.id)}"
                onclick="selectComparisonVersion('${escapeJS(version.id)}')">
                ${escapeHTML(version.abbrev)}
            </button>
        `).join('');

        container.querySelectorAll('.comparison-version-btn').forEach(button => {
            button.classList.toggle('active', button.dataset.versionId === activeVersionId || (button.classList.contains('primary-source') && !activeVersionId));
        });
    }

    function getComparisonSegments(chapter, verseNumber) {

        if (!chapter) return [];

        // Traduções normais:
        // cada posição do array corresponde a um versículo.
        if (Array.isArray(chapter)) {

            const direct = chapter[verseNumber];

            if (direct !== undefined) {
                return [{
                    verse: direct,
                    start: verseNumber + 1,
                    end: verseNumber + 1
                }];
            }

            return [];
        }

        return [];
    }

    async function selectComparisonVersion(versionId) {
        const ctx = getReaderContext();
        if (!ctx.selectedMap.size || ctx.selectedMap.size !== 1) return;

        const content = document.getElementById('comparison-content');
        if (!content) return;

        renderComparisonVersionButtons(versionId);
        content.innerHTML = '<p class="comparison-loading">Carregando tradução...</p>';

        try {
            const data = await loadComparisonVersion(versionId);
            const currentBookName = ctx.bibleData[ctx.bookIdx]?.name;
            const comparisonBookIndex = findComparisonBook(data, currentBookName);
            if (comparisonBookIndex === null) throw new Error('Livro não encontrado na tradução selecionada.');

            const chapter = data[comparisonBookIndex]?.chapters?.[ctx.chapIdx];
            if (!chapter) throw new Error('Capítulo não encontrado na tradução selecionada.');

            const sourceRange = getSelectedSourceReferenceRange();
            let segments = [];

            if (sourceRange) {
                const targetMeta = versoesDisponiveis.find(v => v.id === versionId);
                if (targetMeta?.tipo === 'paraphrase') {
                    segments = getComparisonVerseSegments(chapter, sourceRange.start - 1, versionId);
                } else {
                    for (let n = sourceRange.start; n <= sourceRange.end; n++) {
                        segments.push(...getComparisonVerseSegments(chapter, n - 1, versionId));
                    }
                }

                const uniqueSegments = [];
                const seenSegments = new Set();
                segments.forEach(segment => {
                    const key = `${segment.start}-${segment.end}-${getComparisonVerseText(segment.verse)}`;
                    if (!seenSegments.has(key)) {
                        seenSegments.add(key);
                        uniqueSegments.push(segment);
                    }
                });
                segments = uniqueSegments;
            }

            if (!segments.length) throw new Error('Versículo não encontrado na tradução selecionada.');

            const text = segments.map(segment => {
                const segmentText = getComparisonVerseText(segment.verse);
                return segment.start === segment.end
                    ? `${segment.start}. ${segmentText}`
                    : `${segment.start}-${segment.end}. ${segmentText}`;
            }).join('\n\n');

            const meta = versoesDisponiveis.find(v => v.id === versionId);
            content.innerHTML = `
                <div class="comparison-reference">${escapeHTML(getComparisonReference())}</div>
                <div class="comparison-version-name">${escapeHTML(meta?.nome || versionId)}</div>
                <div class="comparison-text">${escapeHTML(text)}</div>
            `;
        } catch (error) {
            console.error('Erro na comparação:', error);
            content.innerHTML = '<p class="comparison-error">Não foi possível carregar esta tradução.</p>';
        }
    }

    function getVerseReferenceRange(verseObj, index) {

        const start =
            Number(
                verseObj?.number ??
                index + 1
            );

        const end =
            Number(
                verseObj?.endNumber ??
                start
            );

        return {
            start,
            end
        };
    }

    async function compareSelectedVerse() {
        const ctx = getReaderContext();
        if (ctx.selectedMap.size !== 1) return showToast('Selecione apenas um versículo para comparar.');

        const selected = getSelectedOrdered()[0];
        scrollToVerse(selected.v);

        const drawer = document.getElementById('comparison-drawer');
        if (!drawer) return;

        fecharGavetas();
        drawer.classList.add('open');
        drawer.setAttribute('aria-hidden', 'false');

        const alternatives = versoesDisponiveis.filter(version => version.id !== ctx.versionId);
        if (!alternatives.length) {
            document.getElementById('comparison-content').innerHTML = '<p class="comparison-error">Não existem outras traduções disponíveis.</p>';
            return;
        }

        await selectComparisonVersion(alternatives[0].id);
    }

    function getSelectedOrdered() {
        return Array.from(getReaderContext().selectedMap.values()).sort((a, b) => a.v - b.v);
    }

    function getShortReference() {
        const ctx = getReaderContext();
        if (ctx.selectedMap.size === 0) return '';
        const arr = getSelectedOrdered();
        const ranges = [];
        let start = arr[0].v;
        let prev = start;

        for (let i = 1; i < arr.length; i++) {
            if (arr[i].v === prev + 1) {
                prev = arr[i].v;
            } else {
                ranges.push(start === prev ? `${start + 1}` : `${start + 1}-${prev + 1}`);
                start = arr[i].v;
                prev = start;
            }
        }

        ranges.push(start === prev ? `${start + 1}` : `${start + 1}-${prev + 1}`);
        const book = ctx.bibleData[ctx.bookIdx];
        return `${getAbbrev(book.name)} ${ctx.chapIdx + 1}:${ranges.join(', ')}`;
    }

    function getFormattedReference() {
        const ctx = getReaderContext();
        if (ctx.selectedMap.size === 0) return '';
        const arr = getSelectedOrdered();
        return arr.map(item => `${item.v + 1}. ${item.text}`).join(' ') + `\n${getShortReference()}`;
    }

    function copyFallback(text) {
        let ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta);
        ta.focus(); ta.select(); try { document.execCommand('copy'); showToast('Copiado!'); } catch(e) { showToast('Erro ao copiar.'); }
        document.body.removeChild(ta); clearSelection();
    }
    function copyVerses() {
        const txt = getFormattedReference();
        if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(txt).then(() => { showToast('Copiado!'); clearSelection(); }).catch(() => copyFallback(txt));
        else copyFallback(txt);
    }

    // SALVOS
    function getSelectionKey() {
        const ctx = getReaderContext();
        const verses = getSelectedOrdered().map(x => x.v).sort((a,b) => a-b);
        return `${ctx.bookIdx}|${ctx.chapIdx}|${getReaderVersionMeta().abbrev}|${verses.join(',')}`;
    }

    function savedSelectionExists() {
        const ctx = getReaderContext();
        const key = getSelectionKey();
        return savedVerses.some(item => {
            if (item.bookIdx !== ctx.bookIdx || item.chapIdx !== ctx.chapIdx) return false;
            if (item.versionId && item.versionId !== ctx.versionId) return false;
            if (item.version && String(item.version).toUpperCase() !== String(getReaderVersionMeta().abbrev).toUpperCase()) return false;
            const verses = getSavedVerseSet(item);
            return verses.length && `${ctx.bookIdx}|${ctx.chapIdx}|${item.version || getReaderVersionMeta().abbrev}|${verses.join(',')}` === key;
        });
    }

    async function saveVerses() {
        const ctx = getReaderContext();
        if (ctx.selectedMap.size === 0) return;
        if (savedSelectionExists()) {
            clearSelection();
            return showToast('Este trecho já está salvo nesta tradução.');
        }

        const arr = getSelectedOrdered();
        const refStr = getFormattedReference();
        const shortRef = getShortReference();
        const themes = getExistingThemes(savedVerses);
        const tName = await showDialog({
            type:'custom',
            title:'Salvar',
            msg:'Tema:',
            customHTML:generateThemeSelectHTML(themes,'Geral'),
            onRender:()=>bindThemeSelectLogic(themes),
            extractData:extractThemeData
        });
        if (!tName) return;

        const meta = getReaderVersionMeta();
        const now = new Date().toISOString();
        savedVerses.push({
            id: Date.now(),
            theme: tName,
            bookIdx: ctx.bookIdx,
            chapIdx: ctx.chapIdx,
            verses: arr.map(a=>a.v),
            bookName: ctx.bibleData[ctx.bookIdx].name,
            content: refStr,
            reference: shortRef,
            version: meta.abbrev,
            versionId: ctx.versionId,
            versionName: meta.nome,
            createdAt: now,
            preview: arr[0].text.substring(0, 50) + '...'
        });

        localStorage.setItem('bible_saved_verses', JSON.stringify(savedVerses));
        if (ctx.kind === 'plan') renderChapterForContext(ctx, ctx.bookIdx, ctx.chapIdx);
        else renderChapter(ctx.bookIdx, ctx.chapIdx);
        showToast('Trecho salvo!');
    }

    function renderSavedVerses() {

        const list =
            document.getElementById('saved-list');

        list.innerHTML = '';

        if (!savedVerses.length) {
            return list.innerHTML =
                "<p style='color:#7f8c8d;'>Nenhum trecho salvo.</p>";
        }

        const groups = {};

        savedVerses.forEach((it, i) => {

            const theme =
                it.theme || 'Geral';

            if (!groups[theme]) {
                groups[theme] = [];
            }

            groups[theme].push({
                ...it,
                idx: i
            });

        });

        let groupCounter = 0;

        for (const [theme, items] of Object.entries(groups)) {

            const groupId =
                `saved-theme-${groupCounter++}`;

            const gDiv =
                document.createElement('div');

            gDiv.className =
                'theme-group theme-collapsed';

            gDiv.id = groupId;

            gDiv.innerHTML = `
                <button
                    type="button"
                    class="theme-group-header"
                    onclick="toggleThemeGroup('${groupId}')"
                >
                    <span>${escapeHTML(theme)}</span>
                    <span class="theme-group-toggle">▶</span>
                </button>
            `;

            items.forEach(it => {

                const dispRef =
                    (
                        it.reference ||
                        (
                            it.content
                                ? it.content.split('\n').pop()
                                : `${it.bookName} ${it.chapIdx + 1}`
                        )
                    ).replace(/[\[\]]/g, '');

                const textOnly =
                    it.content
                        ? String(it.content)
                            .replace(/\n[^\n]*$/, '')
                        : (it.preview || '');

                const textId =
                    `saved-text-${it.id}`;

                const date =
                    formatSavedDate(it.createdAt);

                const version =
                    it.version ||
                    getVersionMeta().abbrev;

                gDiv.innerHTML += `
                    <div
                        class="card saved-card"
                        id="saved-card-${it.id}"
                    >

                        <div class="expandable-text collapsed" id="${textId}">${escapeHTML(textOnly)}</div>

                        <button
                            class="expand-toggle hidden"
                            type="button"
                            onclick="toggleExpandable(
                                '${textId}',
                                this
                            )"
                        >
                            Ver mais
                        </button>

                        <div class="saved-meta-row">

                            <span class="saved-date">
                                ${escapeHTML(date)}
                            </span>

                            <span class="ref-right">
                                ${escapeHTML(dispRef)}
                                <span class="ver-badge">
                                    ${escapeHTML(version)}
                                </span>
                            </span>

                        </div>

                        <div class="btn-group">

                            <button
                                class="btn-min"
                                onclick="openSavedReference(${it.idx})"
                            >
                                Abrir
                            </button>

                            <button
                                class="btn-min"
                                onclick="moveSavedVerse(${it.idx})"
                            >
                                Mover
                            </button>

                            <button
                                class="btn-min danger"
                                onclick="deleteSavedVerse(${it.idx})"
                            >
                                Excluir
                            </button>

                        </div>

                    </div>
                `;

            });

            list.appendChild(gDiv);
        }

        requestAnimationFrame(
            initExpandableControls
        );
    }

    function initExpandableControls() {

        document
            .querySelectorAll(
                '#saved-list .expandable-text, #notes-list .expandable-text'
            )
            .forEach(box => {

                const btn = box.nextElementSibling;

                if (!btn) return;

                /*
                * Se o cartão estiver dentro de um tema recolhido,
                * não tentamos medir agora.
                *
                * Quando o tema for aberto, a medição será refeita.
                */
                const card = box.closest('.card');

                if (
                    card &&
                    getComputedStyle(card).display === 'none'
                ) {
                    return;
                }

                box.classList.add('collapsed');
                box.classList.remove('expanded');

                if (box.scrollHeight > box.clientHeight + 2) {
                    btn.classList.remove('hidden');
                    btn.innerText = 'Ver mais';
                } else {
                    btn.classList.add('hidden');
                }
            });
    }

    async function openSavedReference(i) {

        const item = savedVerses[i];

        if (!item) return;

        const versionId =
            getSavedVersionId(item);

        switchTab('read');

        await carregarTraducao(versionId);

        pendingVerseScroll =
            Array.isArray(item.verses) &&
            item.verses.length
                ? item.verses[0]
                : null;

        renderChapter(
            item.bookIdx,
            item.chapIdx
        );
    }

    function refreshCurrentVerseHighlights() {
        const verses = bibleData[currentBook]?.chapters?.[currentChap] || [];
        verses.forEach((_, i) => {
            const el = document.getElementById(`v-${i}`);
            if (!el) return;
            el.classList.toggle('has-note', getNoteMatch(currentBook, currentChap, i));
            el.classList.toggle('has-saved', getSavedMatch(currentBook, currentChap, i));
        });
    }

    async function deleteSavedVerse(i) { if(await showDialog({type:'confirm', title:'Excluir', msg:'Remover trecho?'})) { savedVerses.splice(i, 1); localStorage.setItem('bible_saved_verses', JSON.stringify(savedVerses)); renderSavedVerses(); refreshCurrentVerseHighlights(); showToast('Removido'); } }
    async function moveSavedVerse(i) {
        let it = savedVerses[i], themes = getExistingThemes(savedVerses);
        let nTh = await showDialog({type:'custom', title:'Mover', msg:'Selecione o novo tema:', customHTML:generateThemeSelectHTML(themes, it.theme||'Geral'), onRender:()=>bindThemeSelectLogic(themes), extractData:extractThemeData});
        if(nTh) { savedVerses[i].theme = nTh; localStorage.setItem('bible_saved_verses', JSON.stringify(savedVerses)); renderSavedVerses(); showToast('Movido!'); }
    }

    // NOTAS
    async function noteVerses() {
        const ctx = getReaderContext();
        if (ctx.selectedMap.size === 0) return;

        const arr = getSelectedOrdered();
        const refStr = getFormattedReference();
        const shortRef = getShortReference();
        const themes = getExistingThemes(savedNotes);
        const res = await showDialog({
            type:'custom',
            title:'Anotação',
            msg:shortRef,
            customHTML:`${generateThemeSelectHTML(themes,'Geral')}<textarea id="cd-input-note" placeholder="Nota..." style="width:100%;margin-top:10px;padding:12px;"></textarea>`,
            onRender:()=>bindThemeSelectLogic(themes),
            extractData:()=>({theme:extractThemeData(), text:document.getElementById('cd-input-note').value.trim()})
        });
        if (!res || !res.text) return;

        const meta = getReaderVersionMeta();
        const now = new Date().toISOString();
        savedNotes.push({
            id:Date.now(),
            theme:res.theme,
            bookIdx:ctx.bookIdx,
            chapIdx:ctx.chapIdx,
            verses:arr.map(a=>a.v),
            bookName:ctx.bibleData[ctx.bookIdx].name,
            reference:shortRef,
            refStr,
            noteText:res.text,
            version:meta.abbrev,
            versionId:ctx.versionId,
            versionName:meta.nome,
            createdAt:now
        });

        localStorage.setItem('bible_notes', JSON.stringify(savedNotes));
        if (ctx.kind === 'plan') renderChapterForContext(ctx, ctx.bookIdx, ctx.chapIdx);
        else renderChapter(ctx.bookIdx, ctx.chapIdx);
        showToast('Anotação salva!');
    }

    function renderNotesList() {

        const list =
            document.getElementById('notes-list');

        list.innerHTML = '';

        if (!savedNotes.length) {
            return list.innerHTML =
                "<p style='color:#7f8c8d;'>Nenhuma anotação.</p>";
        }

        const groups = {};

        savedNotes.forEach((it, i) => {

            const theme =
                it.theme || 'Geral';

            if (!groups[theme]) {
                groups[theme] = [];
            }

            groups[theme].push({
                ...it,
                idx: i
            });

        });

        let groupCounter = 0;

        for (const [theme, items] of Object.entries(groups)) {

            const groupId =
                `notes-theme-${groupCounter++}`;

            const gDiv =
                document.createElement('div');

            gDiv.className =
                'theme-group theme-collapsed';

            gDiv.id = groupId;

            gDiv.innerHTML = `
                <button
                    type="button"
                    class="theme-group-header"
                    onclick="toggleThemeGroup('${groupId}')"
                >
                    <span>${escapeHTML(theme)}</span>
                    <span class="theme-group-toggle">▶</span>
                </button>
            `;

            items.forEach(it => {

                const dispRef =
                    (
                        it.reference ||
                        `${it.bookName} ${it.chapIdx + 1}`
                    ).replace(/[\[\]]/g, '');

                const textId =
                    `note-text-${it.id}`;

                const date =
                    formatSavedDate(it.createdAt);

                const version =
                    it.version ||
                    getVersionMeta().abbrev;

                gDiv.innerHTML += `
                    <div
                        class="card note-card"
                        id="note-card-${it.id}"
                    >

                        <div class="note-box">

                            <div class="expandable-text collapsed" id="${textId}">${escapeHTML(it.noteText)}</div>

                            <button
                                class="expand-toggle hidden"
                                type="button"
                                onclick="toggleExpandable(
                                    '${textId}',
                                    this
                                )"
                            >
                                Ver mais
                            </button>

                        </div>

                        <div class="saved-meta-row">
                            <span class="saved-date">
                                ${escapeHTML(date)}
                            </span>

                            <span class="ref-right">
                                ${escapeHTML(dispRef)}
                                <span class="ver-badge">
                                    ${escapeHTML(version)}
                                </span>
                            </span>
                        </div>

                        <div class="btn-group">

                            <button
                                class="btn-min"
                                onclick="openNoteReference(${it.idx})"
                            >
                                Abrir
                            </button>

                            <button
                                class="btn-min"
                                onclick="editNote(${it.idx})"
                            >
                                Editar
                            </button>

                            <button
                                class="btn-min danger"
                                onclick="deleteNote(${it.idx})"
                            >
                                Excluir
                            </button>

                        </div>

                    </div>
                `;

            });

            list.appendChild(gDiv);
        }

        requestAnimationFrame(
            initExpandableControls
        );
    }

    async function openNoteReference(i) {

        const item = savedNotes[i];

        if (!item) return;

        const versionId =
            getSavedVersionId(item);

        switchTab('read');

        await carregarTraducao(versionId);

        pendingVerseScroll =
            Array.isArray(item.verses) &&
            item.verses.length
                ? item.verses[0]
                : null;

        renderChapter(
            item.bookIdx,
            item.chapIdx
        );
    }

    async function editNote(i) {
        let it = savedNotes[i], themes = getExistingThemes(savedNotes);
        let res = await showDialog({type:'custom', title:'Editar Anotação', msg:'Edite o tema ou nota:', customHTML:`${generateThemeSelectHTML(themes, it.theme||'Geral')}<textarea id="cd-input-note" style="width:100%;margin-top:10px;padding:12px;">${escapeHTML(it.noteText)}</textarea>`, onRender:()=>bindThemeSelectLogic(themes), extractData:()=>({theme:extractThemeData(), text:document.getElementById('cd-input-note').value.trim()})});
        if(res && res.text!=="") { savedNotes[i].theme = res.theme; savedNotes[i].noteText = res.text; localStorage.setItem('bible_notes', JSON.stringify(savedNotes)); renderNotesList(); showToast('Atualizada!'); }
    }
    async function deleteNote(i) { if(await showDialog({type:'confirm', title:'Excluir', msg:'Remover anotação?'})) { savedNotes.splice(i, 1); localStorage.setItem('bible_notes', JSON.stringify(savedNotes)); renderNotesList(); refreshCurrentVerseHighlights(); showToast('Removida'); } }

    // ==========================================
    // PLANOS DE LEITURA
    // ==========================================
    function togglePlanView(view) {
        document.getElementById('plan-list-view').classList.toggle('hidden', view !== 'list');
        document.getElementById('plan-create-view').classList.toggle('hidden', view !== 'create');
        document.getElementById('plan-detail-view').classList.toggle('hidden', view !== 'detail');
        if(view === 'create') calculatePlanPreview();
    }
    function togglePlanSplit() { document.getElementById('lbl-pace').innerText = document.getElementById('plan-split').value === 'verses' ? 'Versículos por dia' : 'Capítulos por dia'; calculatePlanPreview(); }
    function togglePlanMode() { const m = document.getElementById('plan-mode').value; document.getElementById('mode-dates').classList.toggle('hidden', m !== 'dates'); document.getElementById('mode-pace').classList.toggle('hidden', m !== 'pace'); calculatePlanPreview(); }

    function buildBookSelectionUI() {
        const container = document.getElementById('book-selection'); let html = '';
        for (const [testament, blocks] of Object.entries(bookStructure)) {
            const testId = testament.replace(/\s+/g, '');
            html += `<div class="plan-testament"><label class="plan-testament-label"><input type="checkbox" class="cb-group cb-all-${testId}" onchange="toggleCheckboxGroup('.cb-test-${testId}', this.checked)"> <span>${testament}</span></label>`;
            for (const [block, books] of Object.entries(blocks)) {
                const blockId = block.replace(/\s+/g, '');
                html += `<div class="plan-block"><label class="plan-block-label"><input type="checkbox" class="cb-group cb-test-${testId} cb-blk-${blockId}" onchange="toggleCheckboxGroup('.cb-blk-items-${blockId}', this.checked)"> <span>${block}</span></label><div class="plan-books">`;
                books.forEach(b => {
                    const exists = bookNameIndexMap[normalizeStr(b)] !== undefined;
                    html += `<label class="book-item" style="color:${exists ? '#333' : '#bbb'}"><input type="checkbox" class="plan-book-cb cb-test-${testId} cb-blk-items-${blockId}" value="${b}" ${exists?'':'disabled'} onchange="syncParentCheckbox()"> <span>${b}</span></label>`;
                });
                html += `</div></div>`;
            } html += `</div>`;
        }
        container.innerHTML = html;
        ['plan-split', 'plan-start', 'plan-end', 'plan-chapters-day'].forEach(id => document.getElementById(id).addEventListener('change', calculatePlanPreview));
    }
    function toggleCheckboxGroup(selector, isChecked) { document.querySelectorAll(selector).forEach(cb => { if(!cb.disabled) cb.checked = isChecked; }); calculatePlanPreview(); }
    function syncParentCheckbox() { calculatePlanPreview(); }

    function calculatePlanPreview() {
        const sBooks = Array.from(document.querySelectorAll('.plan-book-cb:checked')).map(cb => cb.value);
        const resDiv = document.getElementById('plan-result');
        if(sBooks.length === 0) return resDiv.innerText = "Selecione livros.";
        let tItems = 0; const sType = document.getElementById('plan-split').value;
        sBooks.forEach(bName => { const bIdx = bookNameIndexMap[normalizeStr(bName)]; if(bIdx !== undefined) { const b = bibleData[bIdx]; if(sType === 'chapters') tItems += b.chapters.length; else b.chapters.forEach(c => { tItems += getChapterVerses(c).length; }); } });
        const mode = document.getElementById('plan-mode').value, sVal = document.getElementById('plan-start').value, lbl = sType === 'chapters' ? 'cap.' : 'vers.';
        if(!sVal) return resDiv.innerText = `Total: ${tItems} ${lbl} selecionados.`;
        const start = new Date(sVal + "T00:00:00");
        if(mode === 'dates') {
            const eVal = document.getElementById('plan-end').value;
            if(eVal) { const end = new Date(eVal + "T00:00:00"); if(start <= end) { let d = Math.ceil(Math.abs(end - start)/86400000)+1; resDiv.innerText = `${tItems} ${lbl} em ${d} dias = ~${(tItems/d).toFixed(1)}/dia.`; } else resDiv.innerText = "Data final inválida."; }
        } else {
            const pace = parseInt(document.getElementById('plan-chapters-day').value);
            if(pace > 0) { let eDate = new Date(start); eDate.setDate(eDate.getDate() + Math.ceil(tItems/pace) - 1); resDiv.innerText = `${tItems} ${lbl}. Fim: ${eDate.toLocaleDateString('pt-BR')}`; }
        }
    }

    async function generatePlan() {
        const sBooks = Array.from(document.querySelectorAll('.plan-book-cb:checked')).map(cb => cb.value), sVal = document.getElementById('plan-start').value;
        if(sBooks.length === 0 || !sVal) return showDialog({type:'alert', title:'Erro', msg:'Dados incompletos.'});
        const sType = document.getElementById('plan-split').value; let flat = [];
        sBooks.forEach(bName => {
            const bIdx = bookNameIndexMap[normalizeStr(bName)];
            if(bIdx !== undefined) bibleData[bIdx].chapters.forEach((arr, cIdx) => {
                if(sType === 'chapters') flat.push({ bookIdx: bIdx, chapIdx: cIdx, bookName: bibleData[bIdx].name });
                else getChapterVerses(arr).forEach((_, vIdx) => flat.push({
                    bookIdx: bIdx,
                    chapIdx: cIdx,
                    verseIdx: vIdx,
                    bookName: bibleData[bIdx].name
                }));
            });
        });
        const mode = document.getElementById('plan-mode').value; let sched = [], cDate = new Date(sVal + "T00:00:00");
        if(mode === 'dates') {
            const eVal = document.getElementById('plan-end').value; if(!eVal) return;
            let d = Math.ceil(Math.abs(new Date(eVal + "T00:00:00") - new Date(sVal + "T00:00:00"))/86400000)+1;
            const bItems = Math.floor(flat.length/d); let ext = flat.length%d, ptr = 0;
            for(let i=0; i<d; i++) { let count = bItems + (ext > 0 ? 1 : 0); ext--; if(count > 0 && ptr < flat.length) { sched.push({ date: new Date(cDate).toISOString(), startItem: flat[ptr], endItem: flat[ptr+count-1], type: sType, completed: false }); ptr+=count; } cDate.setDate(cDate.getDate()+1); }
        } else {
            const pace = parseInt(document.getElementById('plan-chapters-day').value);
            for(let i=0; i<flat.length; i+=pace) { sched.push({ date: new Date(cDate).toISOString(), startItem: flat[i], endItem: flat[Math.min(i+pace-1, flat.length-1)], type: sType, completed: false }); cDate.setDate(cDate.getDate()+1); }
        }
        let pName = await showDialog({type:'prompt', title:'Nome', defaultValue:'Meu Plano'});
        if(pName === null) return;
        savedPlans.push({ id: Date.now(), name: pName.trim() || 'Meu Plano', created: new Date().toISOString(), versionId: currentVersionId, version: getVersionMeta().abbrev, versionName: getVersionMeta().nome, schedule: sched });
        localStorage.setItem('bible_plans', JSON.stringify(savedPlans)); togglePlanView('list'); renderPlanList(); showToast("Criado!");
    }

    function renderPlanList() {
        const list = document.getElementById('my-plans'); list.innerHTML = "";
        if(savedPlans.length === 0) return list.innerHTML = "<p style='color:#7f8c8d;'>Nenhum plano.</p>";
        savedPlans.forEach((plan, i) => {
            let tot = plan.schedule.length, don = plan.schedule.filter(d => d.completed).length;
            let isDelayed = getPlanDelayStatus(plan), delayBadge = isDelayed ? `<span class="delay-badge">Atrasado</span>` : '';
            list.innerHTML += `<div class="card"><h3>${escapeHTML(plan.name)} ${delayBadge}<span style="float:right; font-size:13px;">${don}/${tot}</span></h3><div class="btn-group"><button class="btn-min" onclick="openPlanDetail(${i})">Abrir</button><button class="btn-min danger" onclick="deletePlan(${i})">Excluir</button></div></div>`;
        });
    }
    async function deletePlan(i) { if(await showDialog({type:'confirm', title:'Excluir', msg:'Excluir plano?'})) { savedPlans.splice(i, 1); localStorage.setItem('bible_plans', JSON.stringify(savedPlans)); renderPlanList(); } }

    function getPlanDelayStatus(plan) {
        const today = new Date(); today.setHours(0,0,0,0);
        const firstUncomp = plan.schedule.find(d => !d.completed);
        return firstUncomp && (new Date(firstUncomp.date) < today);
    }

    function closePlanReading() {
        if (!isPlanReaderActive()) return;

        const restoreScroll = planReaderReturnScrollTop;
        planSelectedVersesMap.clear();
        document.querySelectorAll('#plan-chapter-content .verse.selected').forEach(el => el.classList.remove('selected'));
        fecharGavetas();

        document.getElementById('plan-reader-view').classList.add('hidden');
        document.getElementById('plan-list-view').classList.add('hidden');
        document.getElementById('plan-create-view').classList.add('hidden');
        document.getElementById('plan-version-label')?.classList.add('hidden');
        document.getElementById('plan-detail-view').classList.remove('hidden');

        document.getElementById('reader-pill').style.display = 'none';
        document.getElementById('btn-plan-close').classList.add('hidden');
        document.getElementById('btn-version-menu').classList.remove('hidden');
        document.getElementById('app-title').classList.remove('plan-reader-app-title');
        document.getElementById('app-title').innerText = 'Bíblia';

        if (currentVersionId === 'int.json') document.getElementById('btn-lang-menu').classList.remove('hidden');
        else document.getElementById('btn-lang-menu').classList.add('hidden');

        planReadingState = {
            active: false,
            planIndex: null,
            dayIndex: null,
            plan: null,
            day: null,
            versionId: null,
            bibleData: [],
            bookIdx: 0,
            chapIdx: 0,
            startItem: null,
            endItem: null,
            type: 'chapters',
            pendingVerseScroll: null
        };
        planSelectionContext = { bookIdx: 0, chapIdx: 0, versionId: null };

        document.getElementById('nav-plans').classList.add('active');
        document.querySelectorAll('nav button:not(#nav-plans)').forEach(btn => btn.classList.remove('active'));
        document.getElementById('main-scroll').scrollTo(0, restoreScroll);
        updateSelectionBar();
    }

    function completePlanReading() {
        if (!isPlanReaderActive()) return;

        const planIndex = planReadingState.planIndex;
        const dayIndex = planReadingState.dayIndex;
        const plan = savedPlans[planIndex];
        if (!plan?.schedule?.[dayIndex]) return;

        plan.schedule[dayIndex].completed = true;
        localStorage.setItem('bible_plans', JSON.stringify(savedPlans));

        closePlanReading();
        renderPlanList();
        openPlanDetail(planIndex);
        showToast('Leitura concluída!');
    }

    async function openPlanReading(planIndex, dayIndex) {
        const plan = savedPlans[planIndex];
        const day = plan?.schedule?.[dayIndex];
        if (!plan || !day?.startItem || !day?.endItem) return;

        const versionId = getPlanVersionId(plan);
        const previousTab = document.querySelector('nav button.active')?.id || 'nav-plans';
        if (previousTab !== 'nav-plans') {
            switchTab('plans');
        }

        planReaderReturnScrollTop = document.getElementById('main-scroll')?.scrollTop || 0;

        let data;
        try {
            data = await carregarTraducaoPlano(versionId);
        } catch (error) {
            console.error('Erro ao carregar tradução do Plano:', error);
            showToast('Não foi possível carregar a tradução deste Plano.');
            return;
        }

        planReadingState = {
            active: true,
            planIndex,
            dayIndex,
            plan,
            day,
            versionId,
            bibleData: data,
            bookIdx: day.startItem.bookIdx,
            chapIdx: day.startItem.chapIdx,
            startItem: day.startItem,
            endItem: day.endItem,
            type: day.type || (day.startItem.verseIdx !== undefined ? 'verses' : 'chapters'),
            pendingVerseScroll: day.startItem.verseIdx !== undefined ? day.startItem.verseIdx : 0
        };

        planSelectionContext = {
            bookIdx: planReadingState.bookIdx,
            chapIdx: planReadingState.chapIdx,
            versionId
        };
        planSelectedVersesMap.clear();

        document.getElementById('plan-list-view').classList.add('hidden');
        document.getElementById('plan-create-view').classList.add('hidden');
        document.getElementById('plan-detail-view').classList.add('hidden');
        document.getElementById('plan-reader-view').classList.remove('hidden');
        document.getElementById('nav-plans').classList.add('active');
        document.querySelectorAll('nav button:not(#nav-plans)').forEach(btn => btn.classList.remove('active'));
        document.getElementById('reader-pill').style.display = 'flex';
        document.getElementById('btn-version-menu').classList.add('hidden');
        document.getElementById('btn-lang-menu').classList.add('hidden');
        document.getElementById('btn-plan-close').classList.remove('hidden');
        const planVersionMeta =
            versoesDisponiveis.find(
                v => v.id === versionId
            );

        const planVersionLabel =
            document.getElementById('plan-version-label');

        if (planVersionLabel) {
            planVersionLabel.innerText =
                planVersionMeta?.abbrev ||
                String(versionId || '')
                    .replace('.json', '')
                    .toUpperCase();

            planVersionLabel.classList.remove('hidden');
        }
        document.getElementById('app-title').classList.add('plan-reader-app-title');
        document.getElementById('app-title').innerText = getPlanDayTitle(day);

        const main = document.getElementById('main-scroll');
        main.scrollTo(0, 0);
        renderChapterForContext(getReaderContext(), planReadingState.bookIdx, planReadingState.chapIdx);
    }

    function openPlanDetail(i) {

        const plan = savedPlans[i];

        if (!plan) return;

        document.getElementById('detail-plan-name').innerText =
            plan.name;

        document.getElementById('reorg-btn-container').innerHTML =
            getPlanDelayStatus(plan)
                ? `<button class="btn" style="background:#e67e22;" onclick="reorganizePlan(${i})">
                        ⚠️ Reorganizar Plano Atrasado
                </button>`
                : `<button class="btn-min" onclick="reorganizePlan(${i})">
                        Reorganizar Plano
                </button>`;

        let html = '';

        plan.schedule.forEach((d, j) => {

            if (!d.startItem) return;

            const dStr =
                new Date(d.date).toLocaleDateString('pt-BR');

            const first = d.startItem;
            const last = d.endItem;

            const b1 = getAbbrev(first.bookName);
            const b2 = getAbbrev(last.bookName);

            let title = '';

            /*
            * PLANO POR VERSÍCULOS
            */
            if (
                d.type === 'verses' ||
                first.verseIdx !== undefined
            ) {

                const t1 =
                    `${b1} ${first.chapIdx + 1}:${first.verseIdx + 1}`;

                const t2 =
                    `${b2} ${last.chapIdx + 1}:${last.verseIdx + 1}`;

                title =
                    (t1 === t2)
                        ? t1
                        : `${t1} - ${t2}`;

            }

            /*
            * PLANO POR CAPÍTULOS
            */
            else {

                if (first.bookIdx === last.bookIdx) {

                    title =
                        (first.chapIdx === last.chapIdx)
                            ? `${b1} ${first.chapIdx + 1}`
                            : `${b1} ${first.chapIdx + 1} - ${last.chapIdx + 1}`;

                } else {

                    title =
                        `${b1} ${first.chapIdx + 1} - ${b2} ${last.chapIdx + 1}`;

                }
            }

            const colorToday =
                (
                    !d.completed &&
                    new Date(d.date) <
                    new Date(new Date().setHours(0,0,0,0))
                )
                    ? 'color:#e74c3c;'
                    : 'color:#95a5a6;';

            html += `
                <div
                    class="card"
                    style="
                        display:flex;
                        justify-content:space-between;
                        align-items:center;
                        padding:15px;
                        opacity:${d.completed ? 0.6 : 1};
                    "
                    id="p-${i}-${j}"
                >

                    <div>

                        <div
                            style="
                                font-size:12px;
                                font-weight:600;
                                text-transform:uppercase;
                                ${colorToday}
                            "
                        >
                            ${dStr}
                        </div>

                        <div
                            <div
                                onclick="openPlanReading(
                                    ${i},
                                    ${j}
                                )"
                            )"
                            style="
                                color:var(--primary);
                                font-weight:600;
                                font-size:15px;
                                margin-top:2px;
                                cursor:pointer;
                            "
                        >
                            ${title}
                        </div>

                    </div>

                    <input
                        type="checkbox"
                        style="width:22px;height:22px;"
                        ${d.completed ? 'checked' : ''}
                        onchange="toggleDayStatus(
                            ${i},
                            ${j},
                            this.checked
                        )"
                    >

                </div>
            `;
        });

        document.getElementById('plan-details-content').innerHTML =
            html;

        togglePlanView('detail');

        /*
        * Depois que a lista for inserida na tela,
        * posiciona automaticamente no próximo dia
        * ainda não concluído.
        */
        requestAnimationFrame(() => {

            const firstPendingIndex =
                plan.schedule.findIndex(
                    day => !day.completed
                );

            if (firstPendingIndex < 0) return;

            const target =
                document.getElementById(
                    `p-${i}-${firstPendingIndex}`
                );

            if (!target) return;

            target.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            });

        });
    }

    function toggleDayStatus(pI, dI, st) { 
        savedPlans[pI].schedule[dI].completed = st; localStorage.setItem('bible_plans', JSON.stringify(savedPlans)); 
        document.getElementById(`p-${pI}-${dI}`).style.opacity = st ? '0.6' : '1'; 
        renderPlanList();
        openPlanDetail(pI); // Refresh detail and reorg badge
    }

    function getItemsForDay(startItem, endItem, type, data = bibleData) {
        const items = [];
        let inRange = false;

        for (let b = startItem.bookIdx; b <= endItem.bookIdx; b++) {
            if (!data[b]) continue;
            for (let c = 0; c < data[b].chapters.length; c++) {
                const chapterVerses = getChapterVerses(data[b].chapters[c]);

                if (type === 'chapters') {
                    if (b === startItem.bookIdx && c === startItem.chapIdx) inRange = true;
                    if (inRange) items.push({ bookIdx:b, chapIdx:c, bookName:data[b].name });
                    if (b === endItem.bookIdx && c === endItem.chapIdx) return items;
                } else {
                    for (let v = 0; v < chapterVerses.length; v++) {
                        if (b === startItem.bookIdx && c === startItem.chapIdx && v === startItem.verseIdx) inRange = true;
                        if (inRange) items.push({ bookIdx:b, chapIdx:c, verseIdx:v, bookName:data[b].name });
                        if (b === endItem.bookIdx && c === endItem.chapIdx && v === endItem.verseIdx) return items;
                    }
                }
            }
        }
        return items;
    }

    async function reorganizePlan(planIdx) {
        const plan = savedPlans[planIdx];
        const firstUncompIdx = plan.schedule.findIndex(d => !d.completed);
        if (firstUncompIdx === -1) return showDialog({type:'alert', title:'Concluído', msg:'Este plano já está todo concluído!'});

        let mode = await showDialog({
            type: 'custom', title: 'Reorganizar Plano', msg: 'Reajustar a leitura pendente a partir de hoje.',
            customHTML: `<div class="radio-group"><label><input type="radio" name="r_mod" value="end" checked> Manter data final</label><label><input type="radio" name="r_mod" value="pace"> Manter ritmo atual</label></div>`,
            extractData: () => document.querySelector('input[name="r_mod"]:checked').value
        });
        if(!mode) return;

        let planData;
        try {
            planData = await carregarTraducaoPlano(getPlanVersionId(plan));
        } catch (error) {
            console.error('Erro ao carregar a tradução do Plano para reorganização:', error);
            return showToast('Não foi possível carregar a tradução deste Plano.');
        }

        let unread = [], type = plan.schedule[firstUncompIdx].type || 'chapters';
        for(let i = firstUncompIdx; i < plan.schedule.length; i++) {
            let day = plan.schedule[i]; if(day.startItem && day.endItem) unread = unread.concat(getItemsForDay(day.startItem, day.endItem, type, planData));
        }
        if(unread.length === 0) return;

        let today = new Date(); today.setHours(0,0,0,0);
        let newTail = [];

        if (mode === 'end') {
            const endObj = new Date(plan.schedule[plan.schedule.length - 1].date);
            let diffDays = Math.ceil((endObj - today) / 86400000) + 1;
            if (diffDays <= 0) {
                if(!await showDialog({type:'confirm', title:'Atenção', msg:'A data final já passou. Mudar para ritmo atual?'})) return;
                mode = 'pace'; 
            } else {
                const bItems = Math.floor(unread.length / diffDays); let ext = unread.length % diffDays, ptr = 0, iter = new Date(today);
                for(let i = 0; i < diffDays; i++) {
                    let dCount = bItems + (ext > 0 ? 1 : 0); ext--;
                    if (dCount > 0 && ptr < unread.length) {
                        newTail.push({ date: new Date(iter).toISOString(), startItem: unread[ptr], endItem: unread[ptr + dCount - 1], type: type, completed: false }); ptr += dCount;
                    } iter.setDate(iter.getDate() + 1);
                }
            }
        }
        if (mode === 'pace') {
            let origPace = getItemsForDay(plan.schedule[firstUncompIdx].startItem, plan.schedule[firstUncompIdx].endItem, type, planData).length;
            if(origPace <= 0) origPace = 3; 
            let iter = new Date(today);
            for(let i = 0; i < unread.length; i += origPace) {
                newTail.push({ date: new Date(iter).toISOString(), startItem: unread[i], endItem: unread[Math.min(i + origPace - 1, unread.length - 1)], type: type, completed: false });
                iter.setDate(iter.getDate() + 1);
            }
        }
        plan.schedule = plan.schedule.slice(0, firstUncompIdx).concat(newTail);
        localStorage.setItem('bible_plans', JSON.stringify(savedPlans));
        renderPlanList();
        showToast('Plano reorganizado!');
        openPlanDetail(planIdx);
    }

    window.onload = initAppAsync;

    // PWA: o Service Worker cuida apenas da infraestrutura offline.
    // A lógica da Bíblia continua neste app.js.
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./service-worker.js')
                .then(registration => {
                    console.info('Service Worker registrado:', registration.scope);
                })
                .catch(error => {
                    console.warn('Service Worker não pôde ser registrado.', error);
                });
        });
    }

    // ==========================================================
    // INSTALAÇÃO DO WEB APP (PWA)
    // ==========================================================

    let deferredInstallPrompt = null;

    function configurarInstalacaoPWA() {

        const btnInstall = document.getElementById('btn-install-app');

        if (!btnInstall) return;

        // Se o aplicativo já estiver instalado como PWA,
        // não exibe o botão.
        const appJaInstalado =
            window.matchMedia('(display-mode: standalone)').matches ||
            window.navigator.standalone === true;

        if (appJaInstalado) {
            btnInstall.classList.add('hidden');
            return;
        }

        // O navegador disponibiliza o evento quando
        // considera o aplicativo instalável.
        window.addEventListener('beforeinstallprompt', event => {

            event.preventDefault();

            deferredInstallPrompt = event;

            btnInstall.classList.remove('hidden');

            console.info('Aplicativo disponível para instalação.');
        });

        btnInstall.addEventListener('click', async () => {

            if (!deferredInstallPrompt) return;

            const promptEvent = deferredInstallPrompt;

            deferredInstallPrompt = null;

            btnInstall.classList.add('hidden');

            try {

                await promptEvent.prompt();

                const resultado = await promptEvent.userChoice;

                console.info(
                    'Resultado da instalação:',
                    resultado.outcome
                );

            } catch (error) {

                console.warn(
                    'Não foi possível iniciar a instalação:',
                    error
                );

            }
        });

        // Quando a instalação realmente for concluída.
        window.addEventListener('appinstalled', () => {

            deferredInstallPrompt = null;

            btnInstall.classList.add('hidden');

            console.info('Aplicativo instalado.');
        });
    }

    // =========================================================
    // MATERIAL DE APOIO BÍBLICO
    // Arquivo externo: dados/apoio/apoio_biblico.json
    // =========================================================

    let apoioBiblicoData = null;
    let apoioBiblicoCarregado = false;

    async function carregarMaterialApoio() {
        if (apoioBiblicoCarregado && apoioBiblicoData) return apoioBiblicoData;

        const resposta = await fetch('dados/apoio/apoio_biblico.json', {
            cache: 'no-cache'
        });

        if (!resposta.ok) {
            throw new Error(`Falha ao carregar material de apoio: HTTP ${resposta.status}`);
        }

        apoioBiblicoData = await resposta.json();
        apoioBiblicoCarregado = true;
        return apoioBiblicoData;
    }

    async function abrirMaterialApoio() {
        try {
            await carregarMaterialApoio();
            renderizarCategoriasApoio();

            const busca = document.getElementById('apoio-search');
            if (busca) {
                busca.value = '';
                busca.oninput = pesquisarMaterialApoio;
            }

            openDrawer('apoio-drawer');
        } catch (erro) {
            console.error(erro);
            if (typeof showToast === 'function') {
                showToast('Não foi possível carregar o material de apoio.');
            }
        }
    }

    function renderizarCategoriasApoio() {
        const box = document.getElementById('apoio-categorias');
        const conteudo = document.getElementById('apoio-conteudo');
        if (!box || !apoioBiblicoData) return;

        box.classList.remove('hidden');
        if (conteudo) conteudo.classList.add('hidden');

        const categorias = [...(apoioBiblicoData.categorias || [])]
            .sort((a, b) => (a.ordem || 999) - (b.ordem || 999));

        box.innerHTML = categorias.map(cat => `
            <button class="apoio-cat-btn" type="button"
                    onclick="abrirCategoriaApoio('${cat.id}')">
                <strong>${escapeHTML(cat.icone || '')} ${escapeHTML(cat.titulo)}</strong>
                <small>${escapeHTML(cat.descricao || '')}</small>
            </button>
        `).join('');
    }

    function abrirCategoriaApoio(id) {
        const categoria = (apoioBiblicoData?.categorias || [])
            .find(cat => cat.id === id);
        if (!categoria) return;

        const box = document.getElementById('apoio-categorias');
        const conteudo = document.getElementById('apoio-conteudo');
        if (!box || !conteudo) return;

        box.classList.add('hidden');
        conteudo.classList.remove('hidden');

        conteudo.innerHTML = `
            <button class="apoio-voltar" type="button"
                    onclick="renderizarCategoriasApoio()">
                ← Categorias
            </button>
            <h4 class="apoio-section-title">
                ${escapeHTML(categoria.icone || '')} ${escapeHTML(categoria.titulo)}
            </h4>
            ${renderizarConteudoApoio(categoria.conteudo || [])}
        `;
    }

    function renderizarConteudoApoio(conteudos) {
        return conteudos.map(bloco => {
            if (bloco.tipo === 'observacao') {
                return `<p class="apoio-text"><strong>${escapeHTML(bloco.titulo || '')}</strong><br>${escapeHTML(bloco.texto || '')}</p>`;
            }

            if (bloco.tipo === 'subtitulo') {
                return `<h5 class="apoio-subtitle">${escapeHTML(bloco.titulo || '')}</h5>`;
            }

            if (bloco.tipo === 'nota') {
                return `<div class="apoio-note">${escapeHTML(bloco.texto || '')}</div>`;
            }

            if (bloco.tipo === 'lista') {
                return `<ul class="apoio-list">${
                    (bloco.itens || []).map(item => `<li>${escapeHTML(item)}</li>`).join('')
                }</ul>`;
            }

            if (bloco.tipo === 'item') {
                return `
                    <div class="apoio-item">
                        <div class="apoio-item-title">
                            ${escapeHTML(bloco.titulo || '')}
                            ${bloco.referencia ? `<span class="apoio-ref">${escapeHTML(bloco.referencia)}</span>` : ''}
                        </div>
                        <div class="apoio-text">${escapeHTML(bloco.texto || '')}</div>
                    </div>
                `;
            }

            if (bloco.tipo === 'lista_detalhada') {
                return (bloco.itens || []).map(item => `
                    <div class="apoio-item">
                        <div class="apoio-item-title">
                            ${escapeHTML(item.nome || '')}
                            ${(item.referencias || []).length
                                ? `<span class="apoio-ref">${escapeHTML(item.referencias.join('; '))}</span>`
                                : ''}
                        </div>
                        <div class="apoio-text">${escapeHTML(item.texto || '')}</div>
                    </div>
                `).join('');
            }

            if (bloco.tipo === 'tabela') {
                const cabecalho = (bloco.colunas || [])
                    .map(col => `<th>${escapeHTML(col)}</th>`).join('');

                const linhas = (bloco.linhas || []).map(linha => `
                    <tr>
                        ${(bloco.colunas || []).map(coluna => {
                            const mapa = {
                                'Nome': 'nome',
                                'Referência': 'referencia',
                                'Correspondente bíblico': 'correspondente',
                                'Tipo / correspondente bíblico': 'tipo',
                                'Proporção': 'proporcao',
                                'Equivalente atual': 'equivalente',
                                'Equivalente': 'equivalente'
                            };
                            return `<td>${escapeHTML(String(linha[mapa[coluna]] ?? ''))}</td>`;
                        }).join('')}
                    </tr>
                `).join('');

                return `
                    <div class="apoio-table-wrap">
                        <table class="apoio-table">
                            <thead><tr>${cabecalho}</tr></thead>
                            <tbody>${linhas}</tbody>
                        </table>
                    </div>
                `;
            }

            return '';
        }).join('');
    }

    function pesquisarMaterialApoio() {
        const termo = String(document.getElementById('apoio-search')?.value || '')
            .trim()
            .toLocaleLowerCase('pt-BR');

        if (!termo) {
            renderizarCategoriasApoio();
            return;
        }

        const resultados = [];

        for (const categoria of (apoioBiblicoData?.categorias || [])) {
            const texto = JSON.stringify(categoria).toLocaleLowerCase('pt-BR');
            if (texto.includes(termo)) {
                resultados.push(categoria);
            }
        }

        const box = document.getElementById('apoio-categorias');
        const conteudo = document.getElementById('apoio-conteudo');

        box?.classList.remove('hidden');
        conteudo?.classList.add('hidden');

        if (!box) return;

        if (!resultados.length) {
            box.innerHTML = `<p class="apoio-text">Nenhum resultado encontrado.</p>`;
            return;
        }

        box.innerHTML = resultados.map(cat => `
            <button class="apoio-cat-btn" type="button"
                    onclick="abrirCategoriaApoio('${cat.id}')">
                <strong>${escapeHTML(cat.icone || '')} ${escapeHTML(cat.titulo)}</strong>
                <small>Resultado relacionado à busca</small>
            </button>
        `).join('');
    }

    /* =========================================================
    SPLASH SCREEN
    ========================================================= */

    function atualizarSplashTema() {

        const splashLogo = document.getElementById('splash-logo');
        const splashTitle = document.getElementById('splash-title');

        if (!splashLogo || !splashTitle) return;

        let temaEscuro = false;

        /*
        * Tema definido explicitamente pelo usuário.
        */
        if (appSettings.theme === 'dark') {

            temaEscuro = true;

        } else if (appSettings.theme === 'light') {

            temaEscuro = false;

        } else if (appSettings.theme === 'system') {

            /*
            * Quando estiver em "Sistema", acompanha
            * a preferência de aparência do dispositivo/navegador.
            */
            temaEscuro =
                window.matchMedia &&
                window.matchMedia('(prefers-color-scheme: dark)').matches;
        }

        if (temaEscuro) {

            splashLogo.src = './icon-splash_b.png';

            splashTitle.classList.add(
                'splash-title-dark'
            );

        } else {

            splashLogo.src = './icon-splash_a.png';

            splashTitle.classList.remove(
                'splash-title-dark'
            );
        }
    }

    window.addEventListener('load', () => {
        const splash = document.getElementById('splash-screen');

        if (!splash) return;

        setTimeout(() => {
            splash.classList.add('splash-hidden');

            setTimeout(() => {
                splash.remove();
            }, 200);

        }, 1500);
    });

    configurarInstalacaoPWA();