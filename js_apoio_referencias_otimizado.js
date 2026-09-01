/* ============================================================
   MATERIAL DE APOIO + REFERÊNCIAS — integração otimizada
   ------------------------------------------------------------
   PRINCÍPIO:
   - NÃO altera o núcleo do leitor.
   - NÃO intercepta renderChapter().
   - NÃO carrega os 66 livros/referências ao iniciar.
   - Usa o material legado existente para as categorias antigas.
   - Carrega índices somente quando o usuário abre Material de Apoio.
   - Carrega o JSON do livro/referências somente quando solicitado.
   ============================================================ */
(() => {
    'use strict';

    const BASE = 'dados/apoio/';
    const state = {
        index: null,
        refsIndex: null,
        books: new Map(),
        refs: new Map(),
        reverse: new Map(),
        translations: new Map(),
        currentBookId: null,
        currentSection: null,
        currentRefs: [],
        currentRefsPage: 0,
        currentRefsMode: 'chapter',
        refIconIndex: null,
        refIconIndexPromise: null
    };

    // Captura a implementação original ANTES de substituí-la.
    // Assim o material antigo continua exatamente como antes.
    const legacyOpenMaterial = window.abrirMaterialApoio;

    const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
        '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
    }[ch]));

    const escAttr = value => esc(value)
        .replace(/`/g, '&#96;');

    const norm = value => String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('pt-BR')
        .replace(/\s+/g, ' ')
        .trim();

    const normRef = value => String(value ?? '')
        .replace(/[–—]/g, '-')
        .replace(/\s+/g, '')
        .trim();

    async function fetchJson(path, optional = false) {
        try {
            const response = await fetch(path);
            if (!response.ok) {
                if (optional) return null;
                throw new Error(`HTTP ${response.status}: ${path}`);
            }
            return await response.json();
        } catch (error) {
            if (optional) return null;
            throw error;
        }
    }

    async function loadIndexes() {
        if (!state.index) {
            state.index = await fetchJson(`${BASE}indice_livros.json`);
        }
        if (!state.refsIndex) {
            state.refsIndex = await fetchJson(`${BASE}indice_referencias.json`);
        }
        return state;
    }

    function getBookMeta(id) {
        return (state.index?.livros || []).find(x => x.id === id) || null;
    }

    function getCurrentBookId() {
        const last = JSON.parse(localStorage.getItem('bible_last_read') || '{}');
        const idx = Number(last.bookIdx);
        if (!Number.isInteger(idx) || idx < 0) return state.index?.livros?.[0]?.id || null;
        return state.index?.livros?.[idx]?.id || state.index?.livros?.[0]?.id || null;
    }

    function getCurrentChapter() {
        const last = JSON.parse(localStorage.getItem('bible_last_read') || '{}');
        const chap = Number(last.chapIdx);
        return Number.isInteger(chap) && chap >= 0 ? chap + 1 : 1;
    }

    async function loadBook(id) {
        await loadIndexes();
        if (state.books.has(id)) return state.books.get(id);

        const meta = getBookMeta(id);
        if (!meta) throw new Error(`Livro de apoio inexistente: ${id}`);

        const data = await fetchJson(`${BASE}${meta.arquivo}`);
        state.books.set(id, data);
        return data;
    }

    async function loadRefs(id) {
        await loadIndexes();
        if (state.refs.has(id)) return state.refs.get(id);

        const meta = (state.refsIndex?.livros || []).find(x => x.livro === id);
        if (!meta) {
            const empty = { entradas: [] };
            state.refs.set(id, empty);
            return empty;
        }

        const data = await fetchJson(`${BASE}${meta.arquivo}`);
        state.refs.set(id, data);
        return data;
    }

    async function loadReverse(id) {
        await loadIndexes();
        if (state.reverse.has(id)) return state.reverse.get(id);

        const meta = (state.refsIndex?.livros || []).find(x => x.livro === id);
        if (!meta?.reversas) {
            const empty = { entradas: [] };
            state.reverse.set(id, empty);
            return empty;
        }

        const data = await fetchJson(`${BASE}${meta.reversas}`, true) || { entradas: [] };
        state.reverse.set(id, data);
        return data;
    }

    // Renderiza o Esboço diretamente da árvore armazenada no JSON.
    // Não tenta reconstruir níveis a partir de texto corrido.
    function renderOutline(value) {
        let items = [];

        if (Array.isArray(value)) {
            items = value;
        } else if (value && typeof value === 'object') {
            items = Array.isArray(value.itens) ? value.itens : [];
        } else if (typeof value === 'string' && value.trim()) {
            // Compatibilidade com versões antigas: somente neste caso
            // usamos o parser legado de texto.
            const raw = value.replace(/\s+/g, ' ').trim();
            const mains = raw.split(/\s+(?=\d+\.\s)/).filter(Boolean);
            items = mains.map(main => {
                const m = main.match(/^(\d+)\.\s*(.*)$/);
                if (!m) return { nivel: 1, titulo: main, subniveis: [] };
                return { nivel: 1, titulo: `${m[1]}. ${m[2]}`, subniveis: [] };
            });
        }

        if (!items.length) {
            return '<p class="apoio-opt-muted">Esboço não disponível.</p>';
        }

        const renderItems = (list, depth = 1) => list.map(item => {
            if (!item || typeof item !== 'object') return '';

            const titulo = item.titulo ?? item.text ?? item.nome ?? '';
            const referencia = item.referencia
                ? `<span class="apoio-opt-outline-ref">${esc(item.referencia)}</span>`
                : '';
            const children = Array.isArray(item.subniveis) ? item.subniveis : [];

            return `
                <div class="apoio-opt-outline-item level-${depth}">
                    <div class="apoio-opt-outline-title">
                        ${esc(titulo)}${referencia}
                    </div>
                    ${children.length
                        ? `<div class="apoio-opt-outline-children">${renderItems(children, depth + 1)}</div>`
                        : ''}
                </div>
            `;
        }).join('');

        return `<div class="apoio-opt-outline">${renderItems(items)}</div>`;
    }

    function ensureCrossRefDrawer() {
        let drawer = document.getElementById('apoio-opt-crossref-drawer');

        if (drawer) return drawer;

        drawer = document.createElement('div');
        drawer.id = 'apoio-opt-crossref-drawer';
        drawer.className = 'bottom-drawer apoio-opt-crossref-drawer';
        drawer.setAttribute('aria-hidden', 'true');

        drawer.innerHTML = `
            <div class="drawer-header">
                <h3>Referências cruzadas</h3>
                <button type="button" class="drawer-close" data-opt-close>✖</button>
            </div>
            <div id="apoio-opt-crossref-source" class="apoio-opt-crossref-source"></div>
            <div id="apoio-opt-crossref-list" class="apoio-opt-crossref-list"></div>
            <div id="apoio-opt-crossref-preview" class="apoio-opt-crossref-preview">
                <p class="apoio-opt-muted">Escolha uma referência para visualizar o texto.</p>
            </div>
        `;

        document.body.appendChild(drawer);

        drawer.addEventListener('click', event => {
            if (event.target.closest('[data-opt-close]')) {
                window.fecharGavetas?.();
            }
        });

        return drawer;
    }

    function formatRef(bookId, reference) {
        const meta = getBookMeta(bookId);
        return `${meta?.abreviacao || bookId} ${canonicalReference(bookId, reference)}`;
    }

    function getBookIndex(bookId) {
        return (state.index?.livros || []).findIndex(x => x.id === bookId);
    }

    function parseReference(bookId, reference) {
        const raw = normRef(reference);
        if (!bookId || !raw) return null;

        const segments = [];
        let implicitChapter = null;

        // Livros de um capítulo.
        const chapterCount = getBookChapterCount(bookId);
        const singleChapterBook = chapterCount === 1;

        for (const part of raw.split(',').filter(Boolean)) {
            const full = part.match(/^(\d+)\.(\d+)(?:-(?:(\d+)\.)?(\d+))?$/);

            if (full) {
                const startChapter = Number(full[1]);
                const startVerse = Number(full[2]);
                const endChapter = Number(full[3] || startChapter);
                const endVerse = Number(full[4] || startVerse);

                segments.push({
                    startChapter,
                    startVerse,
                    endChapter,
                    endVerse
                });

                implicitChapter = startChapter;
                continue;
            }

            if (/^\d+(?:-\d+)?$/.test(part) && implicitChapter !== null) {
                const m = part.match(/^(\d+)(?:-(\d+))?$/);

                segments.push({
                    startChapter: implicitChapter,
                    startVerse: Number(m[1]),
                    endChapter: implicitChapter,
                    endVerse: Number(m[2] || m[1])
                });

                continue;
            }

            const bare = part.match(/^(\d+)(?:-(\d+))?$/);

            if (bare) {
                const a = Number(bare[1]);
                const b = Number(bare[2] || bare[1]);

                if (singleChapterBook) {
                    segments.push({
                        startChapter: 1,
                        startVerse: a,
                        endChapter: 1,
                        endVerse: b
                    });
                } else {
                    segments.push({
                        startChapter: a,
                        startVerse: 1,
                        endChapter: b,
                        endVerse: Number.MAX_SAFE_INTEGER
                    });
                }

                implicitChapter = null;
            }
        }

        return segments.length ? { bookId, raw, segments } : null;
    }

    const SINGLE_CHAPTER_BOOKS = new Set(['Ob', 'Fm', '2Jo', '3Jo', 'Jd']);

    // Contagem canônica de capítulos usada somente para interpretar
    // referências abreviadas. O conteúdo continua independente da tradução.
    const BOOK_CHAPTER_COUNTS = {"1Co": 16, "1Cr": 29, "1Jo": 5, "1Pe": 5, "1Rs": 22, "1Sm": 31, "1Tm": 6, "1Ts": 5, "2Co": 13, "2Cr": 36, "2Jo": 1, "2Pe": 3, "2Rs": 25, "2Sm": 24, "2Tm": 4, "2Ts": 3, "3Jo": 1, "Ag": 2, "Am": 9, "Ap": 22, "At": 28, "Cl": 4, "Ct": 8, "Dn": 12, "Dt": 34, "Ec": 12, "Ed": 10, "Ef": 6, "Et": 10, "Ex": 40, "Ez": 48, "Fm": 1, "Fp": 4, "Gl": 6, "Gn": 50, "Hb": 13, "Hc": 3, "Is": 66, "Jd": 1, "Jl": 3, "Jn": 4, "Jo": 21, "Job": 42, "Jr": 52, "Js": 24, "Jz": 21, "Lc": 24, "Lm": 5, "Lv": 27, "Mc": 16, "Ml": 4, "Mq": 7, "Mt": 28, "Na": 3, "Ne": 13, "Nm": 36, "Ob": 1, "Os": 14, "Pv": 31, "Rm": 16, "Rt": 4, "Sf": 3, "Sl": 150, "Tg": 5, "Tt": 3, "Zc": 14};

    function getBookChapterCount(bookId) {
        return Number(BOOK_CHAPTER_COUNTS[bookId] || 0);
    }

    function canonicalReference(bookId, reference) {
        const raw = String(reference ?? '').replace(/[–—]/g, '-').trim();
        if (!raw) return raw;
        if (SINGLE_CHAPTER_BOOKS.has(bookId) && /^\d+(?:-\d+)?$/.test(raw)) {
            return `1.${raw}`;
        }
        return raw;
    }

    function verseInReference(chapter, verse, bookId, reference) {
        const parsed = parseReference(bookId, reference);
        if (!parsed) return false;

        return parsed.segments.some(s => {
            if (chapter < s.startChapter || chapter > s.endChapter) return false;

            if (s.startChapter === s.endChapter) {
                return verse >= s.startVerse && verse <= s.endVerse;
            }

            if (chapter === s.startChapter) return verse >= s.startVerse;
            if (chapter === s.endChapter) return verse <= s.endVerse;

            return true;
        });
    }

    function buildReferenceRows(bookId, direct, reverse) {
        const map = new Map();

        for (const item of (direct?.entradas || [])) {
            const sourceRef = canonicalReference(bookId, item.origem);
            const key = normRef(sourceRef);
            const row = map.get(key) || {
                ref: sourceRef,
                ida: [],
                volta: []
            };

            row.ida.push(...(item.destinos || []).map(target => ({
                ...target,
                referencia: canonicalReference(target.livro, target.referencia)
            })));
            map.set(key, row);
        }

        for (const item of (reverse?.entradas || [])) {
            const sourceRef = canonicalReference(bookId, item.destino);
            const key = normRef(sourceRef);
            const row = map.get(key) || {
                ref: sourceRef,
                ida: [],
                volta: []
            };

            row.volta.push(...(item.origens || []).map(target => ({
                ...target,
                referencia: canonicalReference(target.livro, target.referencia)
            })));
            map.set(key, row);
        }

        return [...map.values()]
            .sort((a, b) =>
                normRef(a.ref).localeCompare(
                    normRef(b.ref),
                    undefined,
                    { numeric: true }
                )
            );
    }

    function rowBelongsToChapter(row, chapter, bookId) {
        const ref = normRef(row.ref || '');
        if (!ref) return false;

        const m = ref.match(/^(\d+)(?:\.|$)/);
        if (!m) return false;

        const first = Number(m[1]);
        const chapterCount = getBookChapterCount(bookId);

        // O livro é recebido explicitamente pelo chamador. Nunca usamos
        // state.currentBookId para decidir o contexto do leitor.
        if (ref.includes('.')) return first === Number(chapter);

        return chapterCount === 1
            ? Number(chapter) === 1
            : first === Number(chapter);
    }

    function renderReferencePage(bookId, chapter = getCurrentChapter()) {
        const target = document.getElementById('apoio-opt-ref-list');

        if (!target) return;

        const all = state.currentRefs || [];

        let rows = all;

        if (state.currentRefsMode === 'chapter') {
            rows = all.filter(row =>
                rowBelongsToChapter(row, chapter, bookId)
            );
        }

        const PAGE_SIZE = 50;
        const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));

        if (state.currentRefsPage >= totalPages) {
            state.currentRefsPage = totalPages - 1;
        }

        const start = state.currentRefsPage * PAGE_SIZE;
        const page = rows.slice(start, start + PAGE_SIZE);

        target.innerHTML = `
            <div class="apoio-opt-ref-toolbar">
                <div class="apoio-opt-ref-mode">
                    <button type="button"
                        class="${state.currentRefsMode === 'chapter' ? 'active' : ''}"
                        data-ref-mode="chapter">
                        Capítulo ${chapter}
                    </button>
                    <button type="button"
                        class="${state.currentRefsMode === 'all' ? 'active' : ''}"
                        data-ref-mode="all">
                        Todas
                    </button>
                </div>
                <span>${rows.length} referência(s)</span>
            </div>

            <div class="apoio-opt-ref-page">
                ${page.length ? page.map(row => `
                    <details class="apoio-opt-ref-group">
                        <summary>${esc(formatRef(bookId, row.ref))}</summary>
                        <div class="apoio-opt-ref-direction">
                            ${row.ida.length ? `
                                <strong>Referências relacionadas</strong>
                                <div class="apoio-opt-ref-targets">
                                    ${row.ida.map(t => `
                                        <button type="button"
                                            class="apoio-opt-ref-link"
                                            data-ref-book="${escAttr(t.livro)}"
                                            data-ref-reference="${escAttr(t.referencia)}">
                                            ${esc(formatRef(t.livro, t.referencia))}
                                        </button>
                                    `).join('')}
                                </div>
                            ` : ''}

                            ${row.volta.length ? `
                                <strong class="apoio-opt-back-title">
                                    Também relacionado a este trecho
                                </strong>
                                <div class="apoio-opt-ref-targets">
                                    ${row.volta.map(t => `
                                        <button type="button"
                                            class="apoio-opt-ref-link"
                                            data-ref-book="${escAttr(t.livro)}"
                                            data-ref-reference="${escAttr(t.referencia)}">
                                            ${esc(formatRef(t.livro, t.referencia))}
                                        </button>
                                    `).join('')}
                                </div>
                            ` : ''}
                        </div>
                    </details>
                `).join('') : `
                    <p class="apoio-opt-muted">
                        Não há referências estruturadas para este capítulo.
                    </p>
                `}
            </div>

            ${totalPages > 1 ? `
                <div class="apoio-opt-pagination">
                    <button type="button" data-ref-page="${state.currentRefsPage - 1}"
                        ${state.currentRefsPage <= 0 ? 'disabled' : ''}>‹</button>
                    <span>${state.currentRefsPage + 1} / ${totalPages}</span>
                    <button type="button" data-ref-page="${state.currentRefsPage + 1}"
                        ${state.currentRefsPage >= totalPages - 1 ? 'disabled' : ''}>›</button>
                </div>
            ` : ''}
        `;

        target.querySelectorAll('[data-ref-mode]').forEach(button => {
            button.addEventListener('click', () => {
                state.currentRefsMode = button.dataset.refMode;
                state.currentRefsPage = 0;
                renderReferencePage(bookId);
            });
        });

        target.querySelectorAll('[data-ref-page]').forEach(button => {
            button.addEventListener('click', () => {
                state.currentRefsPage = Number(button.dataset.refPage);
                renderReferencePage(bookId);
            });
        });

        target.querySelectorAll('[data-ref-book]').forEach(button => {
            button.addEventListener('click', () => {
                openReference(
                    button.dataset.refBook,
                    button.dataset.refReference,
                    true
                );
            });
        });
    }

    async function renderBookReferences(bookId) {
        const target = document.getElementById('apoio-opt-ref-list');

        if (!target) return;

        target.innerHTML = `
            <p class="apoio-opt-loading">
                Carregando referências cruzadas...
            </p>
        `;

        try {
            const [direct, reverse] = await Promise.all([
                loadRefs(bookId),
                loadReverse(bookId)
            ]);

            state.currentRefs = buildReferenceRows(bookId, direct, reverse);
            state.currentRefsPage = 0;
            state.currentRefsMode = 'chapter';

            renderReferencePage(bookId);
        } catch (error) {
            console.error('[APOIO REFERÊNCIAS]', error);
            target.innerHTML = `
                <p class="apoio-opt-error">
                    Não foi possível carregar as referências cruzadas.
                </p>
            `;
        }
    }

    function formatMaterialSectionTitle(key) {
        const labels = {
            introducao: 'Introdução',
            esquema_conteudo: 'Esquema de estudo',
            titulo: 'Título',
            autor: 'Autor',
            data_circunstancias: 'Data e circunstâncias',
            genero: 'Gênero',
            caracteristicas_literarias: 'Características literárias',
            caracteristicas_temas_principais: 'Características e temas principais',
            temas_principais: 'Temas principais',
            exodo_historia_ampla_biblia: 'Êxodo na história mais ampla da Bíblia',
            teologia_exodo: 'Teologia de Êxodo',
            cristo_em_exodo: 'Cristo em Êxodo',
            historia_interpretacao: 'História de interpretação',
            assuntos_especiais: 'Assuntos especiais',
            esboço_exodo: 'Esboço de Êxodo'
        };

        if (labels[key]) return labels[key];

        return String(key || '')
            .replace(/[_-]+/g, ' ')
            .replace(/\b\w/g, ch => ch.toLocaleUpperCase('pt-BR'))
            .trim();
    }

    function normalizeMaterialSections(book) {
        const material = book?.material;
        if (!material || typeof material !== 'object') return [];

        /*
         * Formato preferencial:
         * material.secoes = [
         *   {
         *     id: 'autor',
         *     titulo: 'Autor',
         *     tipo: 'texto',
         *     ordem: 2,
         *     conteudo: '...'
         *   }
         * ]
         *
         * Quando esse formato existir, a ordem do JSON é preservada.
         */
        if (Array.isArray(material.secoes) && material.secoes.length) {
            return material.secoes
                .map((item, index) => {
                    if (item == null) return null;

                    if (typeof item !== 'object' || Array.isArray(item)) {
                        return {
                            id: `secao-${index + 1}`,
                            titulo: `Seção ${index + 1}`,
                            tipo: 'texto',
                            ordem: index,
                            conteudo: item
                        };
                    }

                    return {
                        id: String(item.id || `secao-${index + 1}`),
                        titulo: String(
                            item.titulo ||
                            item.nome ||
                            item.id ||
                            `Seção ${index + 1}`
                        ),
                        tipo: String(item.tipo || 'texto'),
                        ordem: Number.isFinite(Number(item.ordem))
                            ? Number(item.ordem)
                            : index,
                        conteudo:
                            item.conteudo ??
                            item.texto ??
                            item.itens ??
                            item.linhas ??
                            ''
                    };
                })
                .filter(Boolean)
                .sort((a, b) => a.ordem - b.ordem);
        }

        /*
         * Compatibilidade com o formato atual/legado:
         * material.introducao
         * material.esquema_conteudo
         * material.autor
         * material.teologia_exodo
         * etc.
         *
         * Assim, um JSON mais completo pode simplesmente acrescentar
         * propriedades dentro de "material" sem exigir outra alteração
         * no JavaScript.
         */
        const sections = [];

        const push = (id, titulo, tipo, conteudo, ordem) => {
            if (
                conteudo === null ||
                conteudo === undefined ||
                conteudo === '' ||
                (Array.isArray(conteudo) && !conteudo.length)
            ) {
                return;
            }

            sections.push({
                id,
                titulo,
                tipo,
                conteudo,
                ordem
            });
        };

        push(
            'intro',
            'Introdução',
            'texto',
            material.introducao,
            0
        );

        push(
            'outline',
            'Esquema de estudo',
            'outline',
            material.esquema_conteudo,
            1
        );

        let ordem = 2;

        Object.entries(material).forEach(([key, value]) => {
            if (
                key === 'titulo' ||
                key === 'introducao' ||
                key === 'esquema_conteudo' ||
                key === 'secoes'
            ) {
                return;
            }

            if (
                value === null ||
                value === undefined ||
                value === '' ||
                (Array.isArray(value) && !value.length)
            ) {
                return;
            }

            sections.push({
                id: key,
                titulo: formatMaterialSectionTitle(key),
                tipo: Array.isArray(value) ? 'auto' : 'texto',
                conteudo: value,
                ordem: ordem++
            });
        });

        return sections;
    }

    function renderMaterialValue(value, tipo = 'texto') {
        if (
            tipo === 'outline' ||
            tipo === 'esboco' ||
            tipo === 'esquema' ||
            tipo === 'esquema_conteudo'
        ) {
            return renderOutline(value);
        }

        if (tipo === 'lista') {
            const itens = Array.isArray(value) ? value : [value];
            return `<ul class="apoio-opt-list">${
                itens.map(item => `<li>${esc(
                    typeof item === 'object'
                        ? (item?.texto ?? item?.nome ?? JSON.stringify(item))
                        : item
                )}</li>`).join('')
            }</ul>`;
        }

        if (tipo === 'lista_detalhada') {
            const itens = Array.isArray(value) ? value : [];
            return itens.map(item => `
                <div class="apoio-opt-detail-item">
                    <div class="apoio-opt-detail-title">
                        ${esc(item?.titulo ?? item?.nome ?? '')}
                        ${item?.referencia
                            ? `<span class="apoio-opt-detail-ref">${esc(item.referencia)}</span>`
                            : ''}
                    </div>
                    ${item?.texto || item?.conteudo
                        ? `<div class="apoio-opt-text">${esc(item.texto ?? item.conteudo)}</div>`
                        : ''}
                </div>
            `).join('');
        }

        if (tipo === 'tabela') {
            const columns = Array.isArray(value?.colunas)
                ? value.colunas
                : [];
            const rows = Array.isArray(value?.linhas)
                ? value.linhas
                : [];

            if (!columns.length) {
                return renderMaterialValue(
                    rows,
                    'auto'
                );
            }

            return `
                <div class="apoio-opt-table-wrap">
                    <table class="apoio-opt-table">
                        <thead>
                            <tr>${columns.map(col => `<th>${esc(col)}</th>`).join('')}</tr>
                        </thead>
                        <tbody>
                            ${rows.map(row => `
                                <tr>
                                    ${columns.map(col => `
                                        <td>${esc(
                                            row?.[col] ??
                                            row?.[String(col).toLocaleLowerCase('pt-BR')] ??
                                            ''
                                        )}</td>
                                    `).join('')}
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }

        if (Array.isArray(value)) {
            if (!value.length) {
                return '<p class="apoio-opt-muted">Conteúdo não disponível.</p>';
            }

            const hasObjects = value.some(
                item => item && typeof item === 'object'
            );

            if (!hasObjects) {
                return `<ul class="apoio-opt-list">${
                    value.map(item => `<li>${esc(item)}</li>`).join('')
                }</ul>`;
            }

            return value.map((item, index) => {
                if (!item || typeof item !== 'object') {
                    return `<p class="apoio-opt-text">${esc(item)}</p>`;
                }

                const titulo =
                    item.titulo ??
                    item.nome ??
                    item.heading ??
                    `Item ${index + 1}`;

                const texto =
                    item.texto ??
                    item.conteudo ??
                    item.descricao ??
                    '';

                const itens =
                    Array.isArray(item.itens)
                        ? renderMaterialValue(item.itens, 'lista')
                        : '';

                return `
                    <div class="apoio-opt-detail-item">
                        <div class="apoio-opt-detail-title">${esc(titulo)}</div>
                        ${texto
                            ? `<div class="apoio-opt-text">${esc(texto)}</div>`
                            : ''}
                        ${itens}
                    </div>
                `;
            }).join('');
        }

        if (value && typeof value === 'object') {
            if (value.texto || value.conteudo) {
                return `<div class="apoio-opt-text">${esc(
                    value.texto ?? value.conteudo
                )}</div>`;
            }

            if (Array.isArray(value.itens)) {
                return renderMaterialValue(value.itens, 'auto');
            }

            const entries = Object.entries(value);

            if (!entries.length) {
                return '<p class="apoio-opt-muted">Conteúdo não disponível.</p>';
            }

            return entries.map(([key, item]) => `
                <div class="apoio-opt-detail-item">
                    <div class="apoio-opt-detail-title">${esc(
                        formatMaterialSectionTitle(key)
                    )}</div>
                    ${renderMaterialValue(item, 'auto')}
                </div>
            `).join('');
        }

        const text = String(value ?? '').trim();

        if (!text) {
            return '<p class="apoio-opt-muted">Conteúdo não disponível.</p>';
        }

        return `<div class="apoio-opt-text">${esc(text)}</div>`;
    }

    function renderMaterialSection(section, index) {
        return `
            <section
                class="apoio-opt-section${index === 0 ? ' is-open' : ''}"
                data-opt-material-section="${escAttr(section.id)}"
            >
                <button
                    type="button"
                    class="apoio-opt-section-head"
                    data-opt-section="${escAttr(section.id)}"
                >
                    <span>${esc(section.titulo)}</span>
                    <span>${index === 0 ? '▼' : '▶'}</span>
                </button>
                <div class="apoio-opt-section-body">
                    ${renderMaterialValue(section.conteudo, section.tipo)}
                </div>
            </section>
        `;
    }

    async function openBook(bookId, section = 'introducao') {
        try {
            const book = await loadBook(bookId);
            state.currentBookId = bookId;
            state.currentSection = section;

            const box = document.getElementById('apoio-categorias');
            const content = document.getElementById('apoio-conteudo');

            if (!box || !content) return;

            box.classList.add('hidden');
            content.classList.remove('hidden');

            const materialSections = normalizeMaterialSections(book);

            const count = (state.refsIndex?.livros || [])
                .find(x => x.livro === bookId)?.entradas || 0;

            const materialHtml = materialSections.length
                ? materialSections
                    .map((item, index) => renderMaterialSection(item, index))
                    .join('')
                : `
                    <p class="apoio-opt-muted">
                        Material de apoio não disponível para este livro.
                    </p>
                `;

            content.innerHTML = `
                <button type="button"
                    class="apoio-opt-back"
                    data-opt-back>
                    ← Material de Apoio
                </button>

                <h4 class="apoio-opt-title">
                    ${esc(book.material?.titulo || `Sobre ${book.nome}`)}
                </h4>

                ${materialHtml}

                <section class="apoio-opt-section">
                    <button type="button" class="apoio-opt-section-head"
                        data-opt-section="refs">
                        <span>Referências cruzadas</span>
                        <span>▶</span>
                    </button>
                    <div class="apoio-opt-section-body">
                        <p class="apoio-opt-muted">
                            Material independente da tradução ativa.
                            ${count ? `${count} referências de origem.` : ''}
                        </p>
                        <div id="apoio-opt-ref-list"></div>
                    </div>
                </section>
            `;

            content.querySelector('[data-opt-back]')?.addEventListener(
                'click',
                () => window.abrirMaterialApoio?.()
            );

            content.querySelectorAll('[data-opt-section]').forEach(head => {
                head.addEventListener('click', async () => {
                    const currentSectionEl =
                        head.closest('.apoio-opt-section');

                    if (!currentSectionEl) return;

                    const wasOpen =
                        currentSectionEl.classList.contains('is-open');

                    content.querySelectorAll('.apoio-opt-section')
                        .forEach(s => {
                            s.classList.remove('is-open');
                            s.querySelector(
                                '.apoio-opt-section-head span:last-child'
                            )?.replaceChildren(
                                document.createTextNode('▶')
                            );
                        });

                    if (wasOpen) return;

                    currentSectionEl.classList.add('is-open');

                    head.querySelector('span:last-child')
                        ?.replaceChildren(
                            document.createTextNode('▼')
                        );

                    if (head.dataset.optSection === 'refs') {
                        await renderBookReferences(bookId);
                    }
                });
            });

        } catch (error) {
            console.error('[APOIO LIVRO]', error);
            window.showToast?.('Não foi possível carregar este material.');
        }
    }

    async function chooseBook() {
        try {
            await loadIndexes();

            const box = document.getElementById('apoio-categorias');
            const content = document.getElementById('apoio-conteudo');

            if (!box || !content) return;

            box.classList.add('hidden');
            content.classList.remove('hidden');

            content.innerHTML = `
                <button type="button" class="apoio-opt-back"
                    data-opt-back>
                    ← Material de Apoio
                </button>

                <h4 class="apoio-opt-title">Escolher livro</h4>

                <div class="apoio-opt-books">
                    ${(state.index.livros || []).map(meta => `
                        <button type="button"
                            class="apoio-opt-book"
                            data-opt-book="${escAttr(meta.id)}">
                            <strong>${esc(meta.abreviacao)}</strong>
                            <span>${esc(meta.nome)}</span>
                        </button>
                    `).join('')}
                </div>
            `;

            content.querySelector('[data-opt-back]')?.addEventListener(
                'click',
                () => window.abrirMaterialApoio?.()
            );

            content.querySelectorAll('[data-opt-book]').forEach(button => {
                button.addEventListener('click', () =>
                    openBook(button.dataset.optBook, 'introducao')
                );
            });
        } catch (error) {
            console.error('[APOIO LIVROS]', error);
        }
    }

    function injectBookActions() {
        const box = document.getElementById('apoio-categorias');
        if (!box || !state.index) return;

        box.querySelectorAll('.apoio-opt-generated').forEach(el => el.remove());

        const currentId = getCurrentBookId();
        const current = getBookMeta(currentId);

        const fragment = document.createDocumentFragment();

        if (current) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'apoio-cat-btn apoio-opt-generated apoio-opt-book-primary';
            button.innerHTML = `
                <strong>📖 Sobre ${esc(current.nome)}</strong>
                <small>Introdução, esquema de estudo e referências cruzadas</small>
            `;
            button.addEventListener('click', () => openBook(current.id));
            fragment.appendChild(button);
        }

        const choose = document.createElement('button');
        choose.type = 'button';
        choose.className = 'apoio-cat-btn apoio-opt-generated apoio-opt-book-secondary';
        choose.innerHTML = `
            <strong>📚 Escolher outro livro</strong>
            <small>Consultar o material de apoio de qualquer livro da Bíblia</small>
        `;
        choose.addEventListener('click', chooseBook);

        fragment.appendChild(choose);

        box.prepend(fragment);
    }

    async function openMaterial() {
        try {
            // O primeiro carregamento continua usando exatamente o material
            // legado já existente no aplicativo.
            if (typeof legacyOpenMaterial === 'function') {
                await legacyOpenMaterial();
            } else {
                window.openDrawer?.('apoio-drawer');
            }

            await loadIndexes();
            injectBookActions();
        } catch (error) {
            console.error('[APOIO OTIMIZADO]', error);
            window.showToast?.('Não foi possível carregar o material de apoio.');
        }
    }

    async function loadTranslation(versionId) {
        const id = String(versionId || 'ara.json');

        if (state.translations.has(id)) {
            return state.translations.get(id);
        }

        const data = await fetchJson(`dados/${id}`);
        state.translations.set(id, data);
        return data;
    }

    function chapterVerses(book, chapterNumber) {
        const chapter = book?.chapters?.[Number(chapterNumber) - 1]
            ?? book?.chapters?.[String(chapterNumber)];

        if (Array.isArray(chapter)) return chapter;
        if (Array.isArray(chapter?.verses)) return chapter.verses;

        return [];
    }

    function verseNumber(verse, index) {
        if (typeof verse === 'object' && verse !== null) {
            return Number(
                verse.number ??
                verse.numero ??
                verse.verse ??
                index + 1
            );
        }

        return index + 1;
    }

    function verseText(verse) {
        if (typeof verse === 'string') return verse;

        if (verse && typeof verse === 'object') {
            return String(
                verse.text_pt ??
                verse.text ??
                verse.content ??
                verse.texto ??
                ''
            );
        }

        return '';
    }

    async function previewReference(bookId, reference) {
        const preview = document.getElementById('apoio-opt-crossref-preview');

        if (!preview) return;

        const parsed = parseReference(bookId, reference);

        if (!parsed) {
            preview.innerHTML =
                '<p class="apoio-opt-error">Referência inválida.</p>';
            return;
        }

        preview.innerHTML =
            '<p class="apoio-opt-loading">Carregando texto da tradução ativa...</p>';

        try {
            const versionId =
                localStorage.getItem('bible_current_version') || 'ara.json';

            const data = await loadTranslation(versionId);
            const bookIndex = getBookIndex(bookId);

            let bibleBook = data?.[bookIndex];

            if (!bibleBook) {
                const meta = getBookMeta(bookId);
                bibleBook = (Array.isArray(data) ? data : []).find(book =>
                    norm(book?.name) === norm(meta?.nome) ||
                    norm(book?.abbrev) === norm(meta?.abreviacao)
                );
            }

            if (!bibleBook) {
                throw new Error('Livro não encontrado na tradução ativa.');
            }

            const chunks = [];

            for (const segment of parsed.segments) {
                for (
                    let chapter = segment.startChapter;
                    chapter <= segment.endChapter;
                    chapter++
                ) {
                    const verses = chapterVerses(bibleBook, chapter);

                    for (let i = 0; i < verses.length; i++) {
                        const n = verseNumber(verses[i], i);
                        const min = chapter === segment.startChapter
                            ? segment.startVerse
                            : 1;
                        const max = chapter === segment.endChapter
                            ? segment.endVerse
                            : Number.MAX_SAFE_INTEGER;

                        if (n >= min && n <= max) {
                            chunks.push({
                                chapter,
                                number: n,
                                text: verseText(verses[i])
                            });
                        }
                    }
                }
            }

            const refText = formatRef(bookId, parsed.raw);
            const versionLabel = versionId
                .replace(/\.json$/i, '')
                .toUpperCase();

            preview.innerHTML = `
                <div class="apoio-opt-preview-header">
                    <strong>${esc(refText)}</strong>
                    <span>${esc(versionLabel)}</span>
                </div>

                <div class="apoio-opt-preview-text">
                    ${chunks.length
                        ? chunks.map(v => `
                            <div class="apoio-opt-preview-verse">
                                <sup>${v.number}</sup>
                                <span>${esc(v.text)}</span>
                            </div>
                        `).join('')
                        : '<p class="apoio-opt-muted">Texto não encontrado.</p>'}
                </div>

                <button type="button"
                    class="apoio-opt-context-button"
                    data-context-book="${escAttr(bookId)}"
                    data-context-reference="${escAttr(parsed.raw)}">
                    Ler no contexto
                </button>
            `;

            preview.querySelector('[data-context-book]')
                ?.addEventListener('click', () =>
                    goToContext(bookId, parsed.raw)
                );

        } catch (error) {
            console.error('[APOIO REFERÊNCIA]', error);
            preview.innerHTML = `
                <p class="apoio-opt-error">
                    Não foi possível carregar o texto da referência.
                </p>
            `;
        }
    }

    async function openReference(bookId, reference, fromMaterial = false) {
        await loadIndexes();

        const drawer = ensureCrossRefDrawer();
        const source = document.getElementById('apoio-opt-crossref-source');
        const list = document.getElementById('apoio-opt-crossref-list');

        if (source) {
            source.innerHTML = `
                <strong>${esc(formatRef(bookId, reference))}</strong>
                <div>Referência cruzada · tradução ativa na prévia</div>
            `;
        }

        if (list) {
            list.innerHTML = `
                <div class="apoio-opt-reference-current">
                    <button type="button" class="apoio-opt-ref-link active">
                        ${esc(formatRef(bookId, reference))}
                    </button>
                </div>
            `;
        }

        drawer.classList.add('open');
        drawer.setAttribute('aria-hidden', 'false');

        await previewReference(bookId, reference);
    }

    async function loadReferenceIconIndex() {
        if (state.refIconIndex) return state.refIconIndex;
        if (!state.refIconIndexPromise) {
            state.refIconIndexPromise = fetchJson(`${BASE}indice_icones_referencias.json`, true)
                .then(data => {
                    state.refIconIndex = data || { livros: {} };
                    return state.refIconIndex;
                })
                .catch(() => {
                    state.refIconIndex = { livros: {} };
                    return state.refIconIndex;
                });
        }
        return state.refIconIndexPromise;
    }

    function hasCrossRefAt(index, bookId, chapter, verse) {
        const intervals = index?.livros?.[bookId]?.[String(chapter)] || [];
        return intervals.some(([start, end]) => verse >= start && verse <= end);
    }

    function createCrossRefVerseButton(bookId, chapter, verse) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'crossref-verse-button';
        button.title = 'Referências cruzadas';
        button.setAttribute('aria-label', `Referências cruzadas de ${formatRef(bookId, `${chapter}.${verse}`)}`);
        button.innerHTML = `
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M6.5 3.75h9A2.75 2.75 0 0 1 18.25 6.5v10A2.75 2.75 0 0 1 15.5 19.25h-9A2.75 2.75 0 0 1 3.75 16.5v-10A2.75 2.75 0 0 1 6.5 3.75Zm0 1.5a1.25 1.25 0 0 0-1.25 1.25v10c0 .69.56 1.25 1.25 1.25h9c.69 0 1.25-.56 1.25-1.25v-10c0-.69-.56-1.25-1.25-1.25h-9Zm2.25 3h4.5v1.5h-4.5v-1.5Zm0 3h6.5v1.5h-6.5v-1.5Zm0 3h6.5v1.5h-6.5v-1.5Z" fill="currentColor"/>
            </svg>
        `;
        button.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            openReferencesForVerse(bookId, chapter, verse);
        });
        return button;
    }

    // Token global de renderização. Se o usuário trocar de capítulo
    // enquanto os índices ainda estão sendo carregados, a execução antiga
    // não poderá aplicar ícones no novo capítulo.
    let refIconRenderToken = 0;

    async function aplicarIconesReferencias(bookIndex, chapterIndex, containerId) {
        const renderToken = ++refIconRenderToken;

        const container = document.getElementById(containerId);
        if (!container) return;

        const targetBookIndex = Number(bookIndex);
        const targetChapterIndex = Number(chapterIndex);

        if (
            !Number.isInteger(targetBookIndex) ||
            targetBookIndex < 0 ||
            !Number.isInteger(targetChapterIndex) ||
            targetChapterIndex < 0
        ) {
            return;
        }

        const index = await loadReferenceIconIndex();
        await loadIndexes();

        // Outra chamada começou enquanto esta aguardava os dados.
        if (renderToken !== refIconRenderToken) return;

        const meta = state.index?.livros?.[targetBookIndex];
        const bookId = meta?.id;
        const chapter = targetChapterIndex + 1;

        if (!bookId || !Number.isInteger(chapter)) return;

        // A chamada ainda deve estar atuando sobre o mesmo container.
        const activeContainer = document.getElementById(containerId);
        if (!activeContainer || activeContainer !== container) return;

        // Remove somente a decoração gerada por este módulo.
        // Não altera o conteúdo dos versículos.
        container.querySelectorAll('.crossref-verse-button').forEach(button => {
            button.remove();
        });

        container.querySelectorAll('.verse.has-crossref').forEach(verseEl => {
            verseEl.classList.remove('has-crossref');
        });

        const verses = container.querySelectorAll('.verse');

        verses.forEach(verseEl => {
            const numEl = verseEl.querySelector('.verse-num');
            const verse = Number(numEl?.textContent?.trim());

            if (
                !Number.isInteger(verse) ||
                !hasCrossRefAt(index, bookId, chapter, verse)
            ) {
                return;
            }

            verseEl.classList.add('has-crossref');
            verseEl.appendChild(
                createCrossRefVerseButton(
                    bookId,
                    chapter,
                    verse
                )
            );
        });
    }

    let crossRefRequestToken = 0;

    async function openReferencesForVerse(bookId, chapter, verse) {
        const requestToken = ++crossRefRequestToken;

        const sourceBookId = String(bookId || '').trim();
        const sourceChapter = Number(chapter);
        const sourceVerse = Number(verse);

        if (
            !sourceBookId ||
            !Number.isInteger(sourceChapter) ||
            sourceChapter < 1 ||
            !Number.isInteger(sourceVerse) ||
            sourceVerse < 1
        ) {
            return;
        }

        try {
            await loadIndexes();

            const [direct, reverse] = await Promise.all([
                loadRefs(sourceBookId),
                loadReverse(sourceBookId)
            ]);

            // Se outra consulta foi aberta depois desta, esta resposta
            // não pode substituir o conteúdo mais recente da gaveta.
            if (requestToken !== crossRefRequestToken) return;

            const rows = buildReferenceRows(
                sourceBookId,
                direct,
                reverse
            ).filter(row =>
                verseInReference(
                    sourceChapter,
                    sourceVerse,
                    sourceBookId,
                    row.ref
                )
            );

            const targets = [];
            const seen = new Set();

            rows.forEach(row => {
                [...(row.ida || []), ...(row.volta || [])].forEach(target => {
                    const targetBookId = String(target.livro || '').trim();
                    const targetReference = canonicalReference(
                        targetBookId,
                        target.referencia
                    );

                    if (!targetBookId || !targetReference) return;

                    const key = `${targetBookId}|${normRef(targetReference)}`;
                    if (seen.has(key)) return;

                    seen.add(key);

                    targets.push({
                        ...target,
                        livro: targetBookId,
                        referencia: targetReference
                    });
                });
            });

            const drawer = ensureCrossRefDrawer();
            const source = document.getElementById(
                'apoio-opt-crossref-source'
            );
            const list = document.getElementById(
                'apoio-opt-crossref-list'
            );
            const preview = document.getElementById(
                'apoio-opt-crossref-preview'
            );

            if (source) {
                source.innerHTML = `
                    <strong>${esc(formatRef(
                        sourceBookId,
                        `${sourceChapter}.${sourceVerse}`
                    ))}</strong>
                    <div>Referências cruzadas · tradução ativa na prévia</div>
                `;
            }

            if (list) {
                list.innerHTML = targets.length
                    ? targets.map((target, index) => `
                        <button type="button"
                            class="apoio-opt-ref-link${index === 0 ? ' active' : ''}"
                            data-crossref-book="${escAttr(target.livro)}"
                            data-crossref-reference="${escAttr(target.referencia)}">
                            ${esc(formatRef(
                                target.livro,
                                target.referencia
                            ))}
                        </button>
                    `).join('')
                    : '<p class="apoio-opt-muted">Não há referências cruzadas para este versículo.</p>';

                list.querySelectorAll('[data-crossref-book]').forEach(button => {
                    button.addEventListener('click', () => {
                        list.querySelectorAll('.apoio-opt-ref-link')
                            .forEach(el => el.classList.remove('active'));

                        button.classList.add('active');

                        previewReference(
                            button.dataset.crossrefBook,
                            button.dataset.crossrefReference
                        );
                    });
                });
            }

            if (preview) {
                preview.innerHTML = targets.length
                    ? '<p class="apoio-opt-loading">Carregando a primeira referência...</p>'
                    : '<p class="apoio-opt-muted">Nenhuma referência disponível.</p>';
            }

            drawer.classList.add('open');
            drawer.setAttribute('aria-hidden', 'false');

            if (targets[0]) {
                await previewReference(
                    targets[0].livro,
                    targets[0].referencia
                );
            }

        } catch (error) {
            if (requestToken !== crossRefRequestToken) return;

            console.error(
                '[APOIO REFERÊNCIAS NO VERSÍCULO]',
                error
            );

            window.showToast?.(
                'Não foi possível carregar as referências deste versículo.'
            );
        }
    }

    function resolveContextTarget(bookId, reference) {
        const canonical = canonicalReference(bookId, reference);
        const parsed = parseReference(bookId, canonical);
        const first = parsed?.segments?.[0];
        const bookIndex = getBookIndex(bookId);

        if (
            !first ||
            !Number.isInteger(bookIndex) ||
            bookIndex < 0
        ) {
            return null;
        }

        return {
            bookId,
            bookIndex,
            chapterIndex: Number(first.startChapter) - 1,
            verseIndex: Number(first.startVerse) - 1,
            reference: canonical
        };
    }

    function goToContext(bookId, reference) {
        const target = resolveContextTarget(bookId, reference);

        if (!target) {
            window.showToast?.('Não foi possível localizar esta referência.');
            return;
        }

        localStorage.setItem(
            'bible_last_read',
            JSON.stringify({
                bookIdx: target.bookIndex,
                chapIdx: target.chapterIndex
            })
        );

        window.fecharGavetas?.();

        if (typeof window.abrirCapituloNoLeitor === 'function') {
            window.abrirCapituloNoLeitor(
                target.bookIndex,
                target.chapterIndex,
                target.verseIndex
            );
            return;
        }

        if (typeof window.renderChapter === 'function') {
            window.renderChapter(
                target.bookIndex,
                target.chapterIndex
            );
        }
    }

    // API pública apenas do módulo novo.
    window.abrirMaterialApoio = openMaterial;
    window.apoioRefAbrirLivro = openBook;
    window.apoioRefEscolherLivro = chooseBook;
    window.apoioRefAbrirReferencia = openReference;
    window.aplicarIconesReferencias = aplicarIconesReferencias;
    window.apoioRefAbrirReferenciasVersiculo = openReferencesForVerse;

    // O índice compacto dos ícones é leve e pode ser carregado em segundo
    // plano. Nenhuma referência completa ou tradução é carregada aqui.
    loadReferenceIconIndex();

    document.addEventListener('DOMContentLoaded', () => {
        const bookIndex = Number(window.currentBook);
        const chapterIndex = Number(window.currentChap);
        const container = document.getElementById('chapter-content');
        if (container && Number.isInteger(bookIndex) && Number.isInteger(chapterIndex)) {
            aplicarIconesReferencias(bookIndex, chapterIndex, 'chapter-content');
        }
    });
})();
