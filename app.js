
    // ==========================================
    // DADOS DE FALLBACK (Garante funcionamento inicial)
    // ==========================================
    const fallbackData = [];

    // ==========================================
    // 1. INICIALIZAÇÃO ASSÍNCRONA E VERSÕES
    // ==========================================
    const versoesDisponiveis = [
        { id: 'acf.json', abbrev: 'ACF', nome: 'Almeida Corrigida Fiel' },
        { id: 'ara.json', abbrev: 'ARA', nome: 'Almeida Revista e Atualizada' },
        { id: 'arc.json', abbrev: 'ARC', nome: 'Almeida Revista e Corrigida' },
        { id: 'as21.json', abbrev: 'AS21', nome: 'Almeida Século 21' },
        { id: 'naa.json', abbrev: 'NAA', nome: 'Nova Almeida Atualizada' },
        { id: 'ntlh.json', abbrev: 'NTLH', nome: 'Nova Tradução na Linguagem de Hoje' },
        { id: 'nvi.json', abbrev: 'NVI', nome: 'Nova Versão Internacional' },
        { id: 'nvt.json', abbrev: 'NVT', nome: 'Nova Versão Transformadora' },
        { id: 'int.json', abbrev: 'INT', nome: 'Bíblia Interlinear Trilíngue' }
    ];

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

let currentVersionId = localStorage.getItem('bible_current_version') || 'int.json';

    async function carregarLexicoGlobal() {
        try {
            const response = await fetch('lexicon-pt.json', { cache: 'no-cache' });
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
                'morphology-2joao.json',
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
        wordObj
    ) {
        if (!morphologyIndex.size) {
            return null;
        }

        const book = bibleData[bIdx];

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
        renderVersionList();

        // Carrega o léxico global
        await carregarLexicoGlobal();

        // Carrega a morfologia por ocorrência
        await carregarMorfologia();

        // Depois carrega a Bíblia selecionada
        await carregarTraducao(currentVersionId);
    }

    async function carregarTraducao(versaoId) {
        try {
            document.getElementById('chapter-content').innerHTML = '<p style="text-align:center; color:#999; margin-top:50px;">Carregando tradução...</p>';
            
            const response = await fetch(versaoId);
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
    
    // Estado de Idiomas Interlinear
    let estadoIdiomas = JSON.parse(localStorage.getItem('bible_lang_state')) || { orig: false, pt: true, en: false };
    
    let currentBook = lastRead.bookIdx;
    let currentChap = lastRead.chapIdx;
    let selectedVersesMap = new Map();
    let pendingVerseScroll = null;

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

    function getSavedMatch(bIdx, cIdx, vIdx) {
        const version = getVersionMeta().abbrev;
        return savedVerses.some(item => {
            if (item.bookIdx !== bIdx || item.chapIdx !== cIdx) return false;
            if (item.version && String(item.version).toUpperCase() !== String(version).toUpperCase()) return false;
            return getSavedVerseSet(item).includes(vIdx);
        });
    }

    function getNoteMatch(bIdx, cIdx, vIdx) {
        return savedNotes.some(item => item.bookIdx === bIdx && item.chapIdx === cIdx && Array.isArray(item.verses) && item.verses.includes(vIdx));
    }

    function getSelectedNotes() {
        const selected = new Set(getSelectedOrdered().map(x => x.v));
        return savedNotes.filter(item => item.bookIdx === currentBook && item.chapIdx === currentChap && Array.isArray(item.verses) && item.verses.some(v => selected.has(v)));
    }

    function scrollToVerse(vIdx) {
        requestAnimationFrame(() => {
            const el = document.getElementById(`v-${vIdx}`);
            const main = document.getElementById('main-scroll');
            if (!el || !main) return;
            const top = el.offsetTop - 24;
            main.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
            el.classList.add('jump-highlight');
            setTimeout(() => el.classList.remove('jump-highlight'), 1800);
        });
    }

    function toggleExpandable(id, button) {
        const box = document.getElementById(id);
        if (!box) return;
        const expanded = box.classList.toggle('expanded');
        button.innerText = expanded ? 'Ver menos' : 'Ver mais';
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

    function openDrawer(id) {
        fecharGavetas();
        const drawer = document.getElementById(id);
        if (id === 'version-drawer') {
            document.querySelectorAll('.version-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.id === currentVersionId);
            });
        }
        if (id === 'language-drawer') syncLangButtons();
        
        drawer.classList.add('open');
        drawer.setAttribute('aria-hidden', 'false');
    }

    function renderVersionList() {
        const list = document.getElementById('version-list');
        let html = '';
        versoesDisponiveis.forEach(v => {
            html += `<button class="drawer-btn version-btn" data-id="${v.id}" onclick="carregarTraducao('${v.id}')">
                        <strong>${v.abbrev}</strong> ${v.nome}
                     </button>`;
        });
        list.innerHTML = html;
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
            return showToast("Pelo menos um idioma deve estar ativo.");
        }
        localStorage.setItem('bible_lang_state', JSON.stringify(estadoIdiomas));
        syncLangButtons();
        renderChapter(currentBook, currentChap);
    }

    function normalizarStrongCode(strongCode) {
        return String(strongCode || '').trim().toUpperCase().replace(/^([GH])0+/, '$1');
    }

    function getLexiconEntry(strongCode, bIdx) {
        const code = normalizarStrongCode(strongCode);
        if (globalLexicon && globalLexicon.entries && globalLexicon.entries[code]) {
            return { ...globalLexicon.entries[code], _source: 'global' };
        }
        const bookDict = bibleData[bIdx] && bibleData[bIdx].dictionary;
        if (bookDict) {
            const legacyEntry = bookDict[code] || bookDict[strongCode] || bookDict[String(strongCode || '').toLowerCase()];
            if (legacyEntry) return { ...legacyEntry, _source: 'book' };
        }
        return null;
    }

    function formatMorphology(morphology) {
        if (!morphology) return [];
        if (typeof morphology === 'string') return [morphology];
        if (Array.isArray(morphology)) return morphology.filter(Boolean).map(String);
        const labels = { pessoa:'Pessoa', numero:'Número', genero:'Gênero', caso:'Caso', tempo:'Tempo', modo:'Modo', voz:'Voz', forma:'Forma', aspecto:'Aspecto', grau:'Grau', funcao:'Função sintática' };
        return Object.entries(morphology).filter(([,v]) => v !== null && v !== undefined && v !== '').map(([k,v]) => `${labels[k] || k}: ${v}`);
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
        const tags = formatMorphology(occurrence && (occurrence.morphology || occurrence.morph || occurrence.grammar));
        const occurrenceForm = occurrence && (occurrence.form || occurrence.word || '');
        const occurrenceGloss = occurrence && (occurrence.gloss_pt || occurrence.text_pt || '');
        const transHtml = Array.isArray(translations) ? translations.filter(Boolean).map(escapeHTML).join(', ') : escapeHTML(translations);
        return `
            <h4 class="panel-lemma">${escapeHTML(lemma)} <span class="panel-strong">${escapeHTML(normalizarStrongCode(strongCode))}</span></h4>
            ${translit ? `<div class="panel-pronuncia">Transliteração: ${escapeHTML(translit)}</div>` : ''}
            ${pron ? `<div class="panel-pronuncia">Pronúncia: [ ${escapeHTML(pron)} ]</div>` : ''}
            ${grammar ? `<div class="panel-grammar">${escapeHTML(grammar)}</div>` : ''}
            ${occurrenceForm ? `<div class="dictionary-section"><div class="dictionary-section-title">Nesta ocorrência</div><div class="dictionary-occurrence"><div class="dictionary-occurrence-form">${escapeHTML(occurrenceForm)}</div>${occurrenceGloss ? `<div class="dictionary-occurrence-gloss">Equivalência: ${escapeHTML(occurrenceGloss)}</div>` : ''}${tags.length ? `<div class="dictionary-tags">${tags.map(t=>`<span class="dictionary-tag">${escapeHTML(t)}</span>`).join('')}</div>` : ''}${!tags.length ? `<div class="dictionary-note" style="margin-top:8px;">A morfologia desta ocorrência ainda não está disponível no arquivo interlinear.</div>` : ''}</div></div>` : ''}
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

        const data =
            getLexiconEntry(
                strongCode,
                bIdx
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

    function normalizeVerseObject(verse, index) {
        if (typeof verse === 'string') {
            return {
                id: `${bibleData[currentBook]?.id || 'verse'}-${index + 1}`,
                text_pt: verse,
                words: []
            };
        }
        return verse;
    }

    function getVerseTextForCopy(verseObj) {
        if (typeof verseObj === 'string') return verseObj;
        if (verseObj.text_pt) return verseObj.text_pt;
        return (verseObj.words || []).map(w => w.text_pt || w.word).join(' ').replace(/\s+/g, ' ').trim();
    }

    function renderChapter(bIdx, cIdx) {
        if (!bibleData || !bibleData[bIdx]) return;

        const sameChapter = currentBook === bIdx && currentChap === cIdx;
        currentBook = bIdx;
        currentChap = cIdx;
        localStorage.setItem('bible_last_read', JSON.stringify({ bookIdx: bIdx, chapIdx: cIdx }));
        clearSelection();
        fecharGavetas();

        const book = bibleData[bIdx];
        const verses = book.chapters[cIdx];
        document.getElementById('pill-title').innerText = `${book.name} ${cIdx + 1}`;
        const notesInChap = savedNotes.filter(n => n.bookIdx === bIdx && n.chapIdx === cIdx);

        let html = `<div class="chapter-header"><div class="book-name">${escapeHTML(book.name)}</div><div class="chap-number">${cIdx + 1}</div></div>`;
        const numActiveLangs = (estadoIdiomas.pt ? 1 : 0) + (estadoIdiomas.en ? 1 : 0) + (estadoIdiomas.orig ? 1 : 0);
        const isInt = currentVersionId === 'int.json';
        const isFluidMode = !isInt || numActiveLangs === 1;
        const dirAttr = (isFluidMode && estadoIdiomas.orig && !estadoIdiomas.pt && !estadoIdiomas.en && isInt) ? 'dir="rtl"' : 'dir="ltr"';

        verses.forEach((verse, i) => {
            const verseObj = normalizeVerseObject(verse, i);
            const hasNote = notesInChap.some(n => Array.isArray(n.verses) && n.verses.includes(i));
            const hasSaved = getSavedMatch(bIdx, cIdx, i);
            const stateClasses = `${hasNote ? 'has-note' : ''} ${hasSaved ? 'has-saved' : ''}`.trim();

            if (isFluidMode || !verseObj.words || verseObj.words.length === 0) {
                let fluidText = '';
                if (typeof verse === 'string') fluidText = verse;
                else if (estadoIdiomas.pt) fluidText = verseObj.text_pt || (verseObj.words || []).map(w => w.text_pt).join(' ');
                else if (estadoIdiomas.en) fluidText = (verseObj.words || []).map(w => w.text_en).join(' ');
                else if (estadoIdiomas.orig) fluidText = (verseObj.words || []).map(w => w.word).join(' ');
                fluidText = fluidText.replace(/\s+/g, ' ').trim();

                html += `<div class="verse fluid-mode ${stateClasses} ${estadoIdiomas.orig && !estadoIdiomas.pt && !estadoIdiomas.en ? 'original-only':''}" ${dirAttr} id="v-${i}" onclick="toggleVerse(${i})"><span class="verse-num">${i + 1}</span> ${escapeHTML(fluidText)}</div>`;
            } else {

                html += `
                    <div
                        class="verse interlinear-mode ${stateClasses}"
                        id="v-${i}"
                        onclick="toggleVerse(${i})"
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
                                w
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

        function bindDictionaryWordClicks() {

            const words = document.querySelectorAll(
                '#chapter-content .dictionary-word'
            );

            words.forEach(word => {

                word.addEventListener(
                    'click',
                    function(event) {

                        event.stopPropagation();

                        const strongCode =
                            this.dataset.strong || '';

                        const occurrenceForm =
                            this.dataset.occurrenceForm || '';

                        const occurrenceGloss =
                            this.dataset.occurrenceGloss || '';

                        const occurrenceMorphology =
                            this.dataset.occurrenceMorphology || '';

                        openDictionary(
                            event,
                            strongCode,
                            currentBook,
                            occurrenceForm,
                            occurrenceGloss,
                            occurrenceMorphology
                        );
                    }
                );
            });
        }

        document.getElementById('chapter-content').innerHTML = html;

        bindDictionaryWordClicks();

        if (!document.getElementById('tab-read').classList.contains('active')) {
            switchTab('read');
        }

        if (pendingVerseScroll !== null) {
            const target = pendingVerseScroll;
            pendingVerseScroll = null;
            scrollToVerse(target);
        } else if (!sameChapter) {
            requestAnimationFrame(() => document.getElementById('main-scroll').scrollTo({ top: 0, behavior: 'auto' }));
        }
    }

    function prevChapter() {
        if (currentChap > 0) renderChapter(currentBook, currentChap - 1);
        else if (currentBook > 0) renderChapter(currentBook - 1, bibleData[currentBook - 1].chapters.length - 1);
    }

    function bindDictionaryWordClicks() {

                event,
                    strongCode,
                    currentBook,
                    occurrenceForm,
                    occurrenceGloss,
                    occurrenceMorphology
        const words = document.querySelectorAll(
            '#chapter-content .dictionary-word'
        );

        words.forEach(word => {

            word.addEventListener('click', function(event) {

                event.stopPropagation();

                const strongCode =
                    this.dataset.strong || '';

                const occurrenceForm =
                    this.dataset.occurrenceForm || '';

                const occurrenceGloss =
                    this.dataset.occurrenceGloss || '';

                const occurrenceMorphology =
                    this.dataset.occurrenceMorphology || '';

                openDictionary(
                );
            });
        });
    }

    function nextChapter() {
        if (currentChap < bibleData[currentBook].chapters.length - 1) renderChapter(currentBook, currentChap + 1);
        else if (currentBook < bibleData.length - 1) renderChapter(currentBook + 1, 0);
    }

    function openSelector() { fecharGavetas(); document.getElementById('selector-modal').style.display = 'flex'; renderBookListModal(); }
    function closeSelector() { document.getElementById('selector-modal').style.display = 'none'; }
    function renderBookListModal() {
        document.getElementById('modal-title').innerText = "Selecione o Livro";
        let html = '';
        bibleData.forEach((b, i) => { html += `<div class="list-item" onclick="renderChapterGridModal(${i})"><span>${b.name}</span><span style="color:#ccc;">&#10095;</span></div>`; });
        document.getElementById('modal-body').innerHTML = html;
    }
    function renderChapterGridModal(bIdx) {
        document.getElementById('modal-title').innerText = bibleData[bIdx].name;
        let html = `<div style="margin-bottom:15px;"><button class="btn-min" onclick="renderBookListModal()">&#10094; Voltar</button></div><div class="grid-chapters">`;
        bibleData[bIdx].chapters.forEach((_, cIdx) => { html += `<div class="grid-item" onclick="selectFromModal(${bIdx}, ${cIdx})">${cIdx + 1}</div>`; });
        html += `</div>`; document.getElementById('modal-body').innerHTML = html;
    }
    function selectFromModal(bIdx, cIdx) { closeSelector(); renderChapter(bIdx, cIdx); }

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

    // ==========================================
    // ABAS
    // ==========================================
    function switchTab(tabId) {
        fecharGavetas();
        document.querySelectorAll('.tab-content, nav button').forEach(el => el.classList.remove('active'));
        document.getElementById('tab-' + tabId).classList.add('active');
        document.getElementById('nav-' + tabId).classList.add('active');
        document.getElementById('reader-pill').style.display = (tabId === 'read') ? 'flex' : 'none';
        
        // Exibe "Idiomas" (Visão) somente se for INT
        const btnLang = document.getElementById('btn-lang-menu');
        if(tabId === 'read' && currentVersionId === 'int.json') {
            btnLang.classList.remove('hidden');
        } else {
            btnLang.classList.add('hidden');
        }

        if (tabId === 'plans') renderPlanList();
        if (tabId === 'saved') renderSavedVerses();
        if (tabId === 'notes') renderNotesList();
        
        clearSelection(); 
        document.getElementById('main-scroll').scrollTo(0,0);
    }

    // ==========================================
    // BUSCA
    // ==========================================
    function searchBible() {
        const query = document.getElementById('search-input').value;
        if(!query || query.trim().length < 3) return showToast("Digite pelo menos 3 caracteres.");
        
        const nQuery = normalizeForSearch(query);
        const results = [];

        for(let bIdx = 0; bIdx < bibleData.length; bIdx++) {
            const book = bibleData[bIdx];
            for(let cIdx = 0; cIdx < book.chapters.length; cIdx++) {
                for(let vIdx = 0; vIdx < book.chapters[cIdx].length; vIdx++) {
                    const verseObj = book.chapters[cIdx][vIdx];
                    let searchable = "";
                    if(typeof verseObj === 'string') {
                        searchable = verseObj;
                    } else {
                        searchable = (verseObj.text_pt || '') + " " + (verseObj.words || []).map(w => (w.word||'') + " " + (w.text_pt||'') + " " + (w.text_en||'')).join(' ');
                    }
                    
                    if(normalizeForSearch(searchable).includes(nQuery)) {
                        results.push({ bIdx, cIdx, vIdx, bookName: book.name, text: getVerseTextForCopy(verseObj) });
                    }
                    if(results.length >= 100) break;
                }
                if(results.length >= 100) break;
            }
            if(results.length >= 100) break;
        }

        const resDiv = document.getElementById('search-results');
        let html = `<h3 style="font-size:16px;">${results.length}${results.length === 100 ? '+' : ''} resultados</h3>`;
        if(results.length === 0) html += `<p style="color:#777;">Nenhum resultado para "${escapeHTML(query)}".</p>`;
        
        results.forEach(res => {
            html += `<div class="card" style="padding:15px; cursor:pointer;" onclick="renderChapter(${res.bIdx}, ${res.cIdx})">
                    <p style="font-weight:700; color:var(--secondary); font-size:14px; margin-bottom:6px;">${res.bookName} ${res.cIdx + 1}:${res.vIdx + 1}</p>
                    <p style="font-size:15px; color:#444; line-height:1.4;">${escapeHTML(res.text)}</p></div>`;
        });
        resDiv.innerHTML = html;
    }

    // ==========================================
    // SELEÇÃO DE VERSÍCULOS
    // ==========================================
    function toggleVerse(vIdx) {
        const el = document.getElementById(`v-${vIdx}`);
        if (!el) return;
        if (selectedVersesMap.has(vIdx)) {
            selectedVersesMap.delete(vIdx);
            el.classList.remove('selected');
        } else {
            const plainText = getVerseTextForCopy(bibleData[currentBook].chapters[currentChap][vIdx]);
            selectedVersesMap.set(vIdx, { v: vIdx, text: plainText });
            el.classList.add('selected');
        }
        updateSelectionBar();
    }

    function clearSelection() {
        selectedVersesMap.clear();
        document.querySelectorAll('.verse.selected').forEach(el => el.classList.remove('selected'));
        updateSelectionBar();
    }

    function updateSelectionBar() {
        const bar = document.getElementById('selection-bar');
        const count = selectedVersesMap.size;

        const viewNoteBtn =
            document.getElementById('selection-view-note');

        const compareBtn =
            document.getElementById('selection-compare');

        const hasNote =
            getSelectedNotes().length > 0;

        // Ver nota:
        // aparece quando existe pelo menos uma nota
        // relacionada à seleção.
        if (viewNoteBtn) {
            viewNoteBtn.classList.toggle(
                'hidden',
                !hasNote
            );
        }

        // Comparar:
        // deliberadamente disponível somente para
        // exatamente um versículo.
        if (compareBtn) {
            compareBtn.classList.toggle(
                'hidden',
                count !== 1
            );
        }

        if (count > 0) {
            document.getElementById('selection-count').innerText =
                `${count} versículo${count > 1 ? 's' : ''}`;

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
            await fetch(versionId, {
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


    function getComparisonReference() {
        const book =
            bibleData[currentBook];

        if (!book) {
            return '';
        }

        return `${getAbbrev(book.name)} ${currentChap + 1}:${getSelectedOrdered()[0].v + 1}`;
    }


    function renderComparisonVersionButtons(activeVersionId) {

        const container =
            document.getElementById(
                'comparison-version-list'
            );

        if (!container) return;

        const available =
            versoesDisponiveis.filter(
                version =>
                    version.id !== currentVersionId
            );

        container.innerHTML =
            available.map(version => `
                <button
                    type="button"
                    class="comparison-version-btn"
                    data-version-id="${escapeHTML(version.id)}"
                    onclick="selectComparisonVersion('${escapeJS(version.id)}')">
                    ${escapeHTML(version.abbrev)}
                </button>
            `).join('');

        container
            .querySelectorAll('.comparison-version-btn')
            .forEach(button => {
                button.classList.toggle(
                    'active',
                    button.dataset.versionId === activeVersionId
                );
            });
    }


    async function selectComparisonVersion(versionId) {

        if (!selectedVersesMap.size ||
            selectedVersesMap.size !== 1) {
            return;
        }

        const content =
            document.getElementById(
                'comparison-content'
            );

        if (!content) return;

        renderComparisonVersionButtons(versionId);

        content.innerHTML = `
            <p class="comparison-loading">
                Carregando tradução...
            </p>
        `;

        try {

            const data =
                await loadComparisonVersion(
                    versionId
                );

            const currentBookName =
                bibleData[currentBook]?.name;

            const comparisonBookIndex =
                findComparisonBook(
                    data,
                    currentBookName
                );

            if (comparisonBookIndex === null) {
                throw new Error(
                    'Livro não encontrado na tradução selecionada.'
                );
            }

            const chapter =
                data[comparisonBookIndex]
                    ?.chapters?.[currentChap];

            if (!chapter) {
                throw new Error(
                    'Capítulo não encontrado na tradução selecionada.'
                );
            }

            const selected =
                getSelectedOrdered()[0];

            const verse =
                chapter[selected.v];

            if (verse === undefined) {
                throw new Error(
                    'Versículo não encontrado na tradução selecionada.'
                );
            }

            const text =
                getComparisonVerseText(verse);

            const meta =
                versoesDisponiveis.find(
                    v => v.id === versionId
                );

            content.innerHTML = `
                <div class="comparison-reference">
                    ${escapeHTML(getComparisonReference())}
                </div>

                <div class="comparison-version-name">
                    ${escapeHTML(meta?.nome || versionId)}
                </div>

                <div class="comparison-text">
                    ${escapeHTML(text)}
                </div>
            `;

        } catch (error) {

            console.error(
                'Erro na comparação:',
                error
            );

            content.innerHTML = `
                <p class="comparison-error">
                    Não foi possível carregar esta tradução.
                </p>
            `;
        }
    }


    async function compareSelectedVerse() {

        if (selectedVersesMap.size !== 1) {
            return showToast(
                'Selecione apenas um versículo para comparar.'
            );
        }

        const selected =
            getSelectedOrdered()[0];

        // Mantém o versículo selecionado visível
        // e faz o mesmo destaque usado na navegação.
        scrollToVerse(selected.v);

        const drawer =
            document.getElementById(
                'comparison-drawer'
            );

        if (!drawer) return;

        fecharGavetas();

        drawer.classList.add('open');

        drawer.setAttribute(
            'aria-hidden',
            'false'
        );

        // A tradução ativa fica fora da lista.
        const alternatives =
            versoesDisponiveis.filter(
                version =>
                    version.id !== currentVersionId
            );

        if (!alternatives.length) {
            document.getElementById(
                'comparison-content'
            ).innerHTML = `
                <p class="comparison-error">
                    Não existem outras traduções disponíveis.
                </p>
            `;

            return;
        }

        // Primeira alternativa disponível.
        await selectComparisonVersion(
            alternatives[0].id
        );
    }

    function getSelectedOrdered() { return Array.from(selectedVersesMap.values()).sort((a, b) => a.v - b.v); }

    function getShortReference() {
        if(selectedVersesMap.size === 0) return "";
        let arr = getSelectedOrdered(), ranges = [], start = arr[0].v, prev = start;
        for(let i = 1; i < arr.length; i++) {
            if(arr[i].v === prev + 1) prev = arr[i].v;
            else { ranges.push(start === prev ? (start + 1) : `${start + 1}-${prev + 1}`); start = arr[i].v; prev = start; }
        }
        ranges.push(start === prev ? (start + 1) : `${start + 1}-${prev + 1}`);
        let abbrev = getAbbrev(bibleData[currentBook].name);
        return `${abbrev} ${currentChap + 1}:${ranges.join(', ')}`;
    }

    function getFormattedReference() {
        if(selectedVersesMap.size === 0) return "";
        let arr = getSelectedOrdered();
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
        const verses = getSelectedOrdered().map(x => x.v).sort((a,b)=>a-b);
        return `${currentBook}|${currentChap}|${getVersionMeta().abbrev}|${verses.join(',')}`;
    }

    function savedSelectionExists() {
        const key = getSelectionKey();
        return savedVerses.some(item => {
            if (item.bookIdx !== currentBook || item.chapIdx !== currentChap) return false;
            if (item.version && String(item.version).toUpperCase() !== String(getVersionMeta().abbrev).toUpperCase()) return false;
            const verses = getSavedVerseSet(item);
            return verses.length && `${currentBook}|${currentChap}|${item.version || getVersionMeta().abbrev}|${verses.join(',')}` === key;
        });
    }

    async function saveVerses() {
        if (selectedVersesMap.size === 0) return;
        if (savedSelectionExists()) {
            clearSelection();
            return showToast('Este trecho já está salvo nesta tradução.');
        }
        const arr = getSelectedOrdered();
        const refStr = getFormattedReference();
        const shortRef = getShortReference();
        const themes = getExistingThemes(savedVerses);
        const tName = await showDialog({type:'custom', title:'Salvar', msg:'Tema:', customHTML:generateThemeSelectHTML(themes,'Geral'), onRender:()=>bindThemeSelectLogic(themes), extractData:extractThemeData});
        if (!tName) return;
        const now = new Date().toISOString();
        savedVerses.push({
            id: Date.now(), theme: tName, bookIdx: currentBook, chapIdx: currentChap, verses: arr.map(a=>a.v),
            bookName: bibleData[currentBook].name, content: refStr, reference: shortRef,
            version: getVersionMeta().abbrev, versionId: currentVersionId, versionName: getVersionMeta().nome,
            createdAt: now, preview: arr[0].text.substring(0, 50) + '...'
        });
        localStorage.setItem('bible_saved_verses', JSON.stringify(savedVerses));
        renderChapter(currentBook, currentChap);
        showToast('Trecho salvo!');
    }

    function renderSavedVerses() {
        const list = document.getElementById('saved-list');
        list.innerHTML = '';
        if (!savedVerses.length) return list.innerHTML = "<p style='color:#7f8c8d;'>Nenhum trecho salvo.</p>";
        const groups = {};
        savedVerses.forEach((it, i) => { const t = it.theme || 'Geral'; if (!groups[t]) groups[t] = []; groups[t].push({ ...it, idx: i }); });

        for (const [theme, items] of Object.entries(groups)) {
            const gDiv = document.createElement('div');
            gDiv.innerHTML = `<h3 class="theme-group-header">${escapeHTML(theme)}</h3>`;
            items.forEach(it => {
                const dispRef = (it.reference || (it.content ? it.content.split('\n').pop() : `${it.bookName} ${it.chapIdx + 1}`)).replace(/[\[\]]/g, '');
                const textOnly = it.content ? String(it.content).replace(/\n[^\n]*$/, '') : (it.preview || '');
                const textId = `saved-text-${it.id}`;
                const date = formatSavedDate(it.createdAt);
                const version = it.version || getVersionMeta().abbrev;
                gDiv.innerHTML += `<div class="card saved-card" id="saved-card-${it.id}">
                    <div class="expandable-text collapsed" id="${textId}">${escapeHTML(textOnly)}</div>
                    <button class="expand-toggle hidden" type="button" onclick="toggleExpandable('${textId}', this)">Ver mais</button>
                    <div class="saved-meta-row"><span class="saved-date">${escapeHTML(date)}</span><span class="ref-right">${escapeHTML(dispRef)}<span class="ver-badge">${escapeHTML(version)}</span></span></div>
                    <div class="btn-group">
                        <button class="btn-min" onclick="openSavedReference(${it.idx})">Abrir</button>
                        <button class="btn-min" onclick="moveSavedVerse(${it.idx})">Mover</button>
                        <button class="btn-min danger" onclick="deleteSavedVerse(${it.idx})">Excluir</button>
                    </div>
                </div>`;
            });
            list.appendChild(gDiv);
        }
        requestAnimationFrame(initExpandableControls);
    }

    function initExpandableControls() {
        document.querySelectorAll('#saved-list .expandable-text, #notes-list .expandable-text').forEach(box => {
            const btn = box.nextElementSibling;
            if (!btn) return;
            box.classList.add('collapsed');
            if (box.scrollHeight > box.clientHeight + 2) btn.classList.remove('hidden');
            else btn.classList.add('hidden');
        });
    }

    function openSavedReference(i) {
        const item = savedVerses[i];
        if (!item) return;
        pendingVerseScroll = Array.isArray(item.verses) && item.verses.length ? item.verses[0] : null;
        switchTab('read');
        renderChapter(item.bookIdx, item.chapIdx);
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
        if (selectedVersesMap.size === 0) return;
        const arr = getSelectedOrdered();
        const refStr = getFormattedReference();
        const shortRef = getShortReference();
        const themes = getExistingThemes(savedNotes);
        const res = await showDialog({
            type:'custom', title:'Anotação', msg:shortRef,
            customHTML:`${generateThemeSelectHTML(themes,'Geral')}<textarea id="cd-input-note" placeholder="Nota..." style="width:100%;margin-top:10px;padding:12px;"></textarea>`,
            onRender:()=>bindThemeSelectLogic(themes),
            extractData:()=>({theme:extractThemeData(), text:document.getElementById('cd-input-note').value.trim()})
        });
        if (!res || !res.text) return;
        const now = new Date().toISOString();
        savedNotes.push({
            id:Date.now(), theme:res.theme, bookIdx:currentBook, chapIdx:currentChap, verses:arr.map(a=>a.v),
            bookName:bibleData[currentBook].name, reference:shortRef, refStr, noteText:res.text,
            version:getVersionMeta().abbrev, versionId:currentVersionId, versionName:getVersionMeta().nome, createdAt:now
        });
        localStorage.setItem('bible_notes', JSON.stringify(savedNotes));
        renderChapter(currentBook, currentChap);
        showToast('Anotação salva!');
    }

    function renderNotesList() {
        const list = document.getElementById('notes-list');
        list.innerHTML = '';
        if (!savedNotes.length) return list.innerHTML = "<p style='color:#7f8c8d;'>Nenhuma anotação.</p>";
        const groups = {};
        savedNotes.forEach((it, i) => { const t = it.theme || 'Geral'; if (!groups[t]) groups[t] = []; groups[t].push({ ...it, idx: i }); });

        for (const [theme, items] of Object.entries(groups)) {
            const gDiv = document.createElement('div');
            gDiv.innerHTML = `<h3 class="theme-group-header">${escapeHTML(theme)}</h3>`;
            items.forEach(it => {
                const dispRef = (it.reference || `${it.bookName} ${it.chapIdx + 1}`).replace(/[\[\]]/g, '');
                const textId = `note-text-${it.id}`;
                const date = formatSavedDate(it.createdAt);
                const version = it.version || getVersionMeta().abbrev;
                gDiv.innerHTML += `<div class="card note-card" id="note-card-${it.id}">
                    <div class="note-box">
                        <div class="expandable-text collapsed" id="${textId}">${escapeHTML(it.noteText)}</div>
                        <button class="expand-toggle hidden" type="button" onclick="toggleExpandable('${textId}', this)">Ver mais</button>
                    </div>
                    <div class="saved-meta-row"><span class="saved-date">${escapeHTML(date)}</span><span class="ref-right">${escapeHTML(dispRef)}<span class="ver-badge">${escapeHTML(version)}</span></span></div>
                    <div class="btn-group">
                        <button class="btn-min" onclick="openNoteReference(${it.idx})">Abrir</button>
                        <button class="btn-min" onclick="editNote(${it.idx})">Editar</button>
                        <button class="btn-min danger" onclick="deleteNote(${it.idx})">Excluir</button>
                    </div>
                </div>`;
            });
            list.appendChild(gDiv);
        }
        requestAnimationFrame(initExpandableControls);
    }

    function openNoteReference(i) {
        const item = savedNotes[i];
        if (!item) return;
        pendingVerseScroll = Array.isArray(item.verses) && item.verses.length ? item.verses[0] : null;
        switchTab('read');
        renderChapter(item.bookIdx, item.chapIdx);
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
        sBooks.forEach(bName => { const bIdx = bookNameIndexMap[normalizeStr(bName)]; if(bIdx !== undefined) { const b = bibleData[bIdx]; if(sType === 'chapters') tItems += b.chapters.length; else b.chapters.forEach(c => { tItems += c.length; }); } });
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
                else arr.forEach((_, vIdx) => flat.push({ bookIdx: bIdx, chapIdx: cIdx, verseIdx: vIdx, bookName: bibleData[bIdx].name }));
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
        savedPlans.push({ id: Date.now(), name: pName.trim() || 'Meu Plano', created: new Date().toISOString(), schedule: sched });
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

    function openPlanDetail(i) {
        const plan = savedPlans[i]; document.getElementById('detail-plan-name').innerText = plan.name;
        document.getElementById('reorg-btn-container').innerHTML = getPlanDelayStatus(plan) ? `<button class="btn" style="background:#e67e22;" onclick="reorganizePlan(${i})">⚠️ Reorganizar Plano Atrasado</button>` : `<button class="btn-min" onclick="reorganizePlan(${i})">Reorganizar Plano</button>`;
        let html = '';
        plan.schedule.forEach((d, j) => {
            if(!d.startItem) return;
            let dStr = new Date(d.date).toLocaleDateString('pt-BR');
            let first = d.startItem, last = d.endItem;
            let b1 = getAbbrev(first.bookName);
            let b2 = getAbbrev(last.bookName);
            
            let title = "";
            if(d.type === 'verses' || first.verseIdx !== undefined) {
                let t1 = `${b1} ${first.chapIdx+1}:${first.verseIdx+1}`;
                let t2 = `${b2} ${last.chapIdx+1}:${last.verseIdx+1}`;
                title = (t1 === t2) ? t1 : `${t1} - ${t2}`;
            } else {
                if (first.bookIdx === last.bookIdx) {
                    title = (first.chapIdx === last.chapIdx) ? `${b1} ${first.chapIdx+1}` : `${b1} ${first.chapIdx+1} - ${last.chapIdx+1}`;
                } else {
                    title = `${b1} ${first.chapIdx+1} - ${b2} ${last.chapIdx+1}`;
                }
            }
            let colorToday = (!d.completed && new Date(d.date) < new Date(new Date().setHours(0,0,0,0))) ? 'color:#e74c3c;' : 'color:#95a5a6;';
            html += `<div class="card" style="display:flex; justify-content:space-between; align-items:center; padding:15px; opacity:${d.completed?0.6:1}" id="p-${i}-${j}">
                <div><div style="font-size:12px; font-weight:600; text-transform:uppercase; ${colorToday}">${dStr}</div><div onclick="renderChapter(${first.bookIdx}, ${first.chapIdx})" style="color:var(--primary); font-weight:600; font-size:15px; margin-top:2px; cursor:pointer;">${title}</div></div>
                <input type="checkbox" style="width:22px;height:22px;" ${d.completed?'checked':''} onchange="toggleDayStatus(${i}, ${j}, this.checked)"></div>`;
        });
        document.getElementById('plan-details-content').innerHTML = html; togglePlanView('detail');
    }
    function toggleDayStatus(pI, dI, st) { 
        savedPlans[pI].schedule[dI].completed = st; localStorage.setItem('bible_plans', JSON.stringify(savedPlans)); 
        document.getElementById(`p-${pI}-${dI}`).style.opacity = st ? '0.6' : '1'; 
        renderPlanList();
        openPlanDetail(pI); // Refresh detail and reorg badge
    }

    function getItemsForDay(startItem, endItem, type) {
        let items = [], inRange = false;
        for(let b=startItem.bookIdx; b<=endItem.bookIdx; b++) {
            if(!bibleData[b]) continue;
            for(let c=0; c<bibleData[b].chapters.length; c++) {
                if(type === 'chapters') {
                    if(b === startItem.bookIdx && c === startItem.chapIdx) inRange = true;
                    if(inRange) items.push({bookIdx: b, chapIdx: c, bookName: bibleData[b].name});
                    if(b === endItem.bookIdx && c === endItem.chapIdx) return items;
                } else {
                    for(let v=0; v<bibleData[b].chapters[c].length; v++) {
                        if(b === startItem.bookIdx && c === startItem.chapIdx && v === startItem.verseIdx) inRange = true;
                        if(inRange) items.push({bookIdx: b, chapIdx: c, verseIdx: v, bookName: bibleData[b].name});
                        if(b === endItem.bookIdx && c === endItem.chapIdx && v === endItem.verseIdx) return items;
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

        let unread = [], type = plan.schedule[firstUncompIdx].type || 'chapters';
        for(let i = firstUncompIdx; i < plan.schedule.length; i++) {
            let day = plan.schedule[i]; if(day.startItem && day.endItem) unread = unread.concat(getItemsForDay(day.startItem, day.endItem, type));
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
            let origPace = getItemsForDay(plan.schedule[firstUncompIdx].startItem, plan.schedule[firstUncompIdx].endItem, type).length;
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
