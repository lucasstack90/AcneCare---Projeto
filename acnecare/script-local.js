// ==========================================================
// AcneCare - versão local PHP + MySQL
// Substitui Firebase Auth / Firestore / Storage.
// ==========================================================

const MAX_FILE_SIZE_MB = 15;
let currentUser = null;
let allApprovedPosts = [];

const authArea = document.getElementById('authArea');
const authModalOverlay = document.getElementById('authModalOverlay');
const authModalClose = document.getElementById('authModalClose');
const authTabButtons = document.querySelectorAll('.auth-tab-btn');
const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');
const loginError = document.getElementById('loginError');
const signupError = document.getElementById('signupError');
const btnGateLogin = document.getElementById('btnGateLogin');
const postGate = document.getElementById('postGate');
const postFormWrapper = document.getElementById('postFormWrapper');
const postSubmitBtn = document.getElementById('postSubmitBtn');
const myPostsList = document.getElementById('myPostsList');
const navAdminLink = document.getElementById('navAdminLink');
const adminSection = document.getElementById('admin');
const adminPendingList = document.getElementById('adminPendingList');
const adminEmptyState = document.getElementById('adminEmptyState');
const blogGrid = document.getElementById('blogGrid');

function openAuthModal(tab = 'login') {
    authModalOverlay.hidden = false;
    setAuthTab(tab);
}

function closeAuthModal() {
    authModalOverlay.hidden = true;
    loginError.hidden = true;
    signupError.hidden = true;
    loginForm.reset();
    signupForm.reset();
}

function setAuthTab(tab) {
    authTabButtons.forEach(btn => {
        const active = btn.dataset.tab === tab;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-selected', String(active));
    });
    loginForm.hidden = tab !== 'login';
    signupForm.hidden = tab !== 'signup';
}

authTabButtons.forEach(btn => btn.addEventListener('click', () => setAuthTab(btn.dataset.tab)));
authModalClose?.addEventListener('click', closeAuthModal);
authModalOverlay?.addEventListener('click', e => {
    if (e.target === authModalOverlay) closeAuthModal();
});
document.getElementById('btnOpenAuth')?.addEventListener('click', () => openAuthModal('login'));
btnGateLogin?.addEventListener('click', () => openAuthModal('login'));

function showError(el, message) {
    el.textContent = message;
    el.hidden = false;
}

async function api(action, options = {}) {
    const response = await fetch(`api.php?action=${encodeURIComponent(action)}`, {
        credentials: 'same-origin',
        ...options
    });

    let data;
    try {
        data = await response.json();
    } catch {
        throw new Error('O servidor não retornou uma resposta JSON válida.');
    }

    if (!response.ok || !data.ok) {
        throw new Error(data.message || 'Ocorreu um erro.');
    }

    return data;
}

loginForm?.addEventListener('submit', async e => {
    e.preventDefault();
    loginError.hidden = true;

    const form = new FormData();
    form.append('email', document.getElementById('loginEmail').value.trim());
    form.append('password', document.getElementById('loginPassword').value);

    try {
        await api('login', { method: 'POST', body: form });
        closeAuthModal();
        await loadSession();
    } catch (err) {
        showError(loginError, err.message);
    }
});

signupForm?.addEventListener('submit', async e => {
    e.preventDefault();
    signupError.hidden = true;

    const form = new FormData();
    form.append('name', document.getElementById('signupName').value.trim());
    form.append('email', document.getElementById('signupEmail').value.trim());
    form.append('password', document.getElementById('signupPassword').value);

    try {
        await api('register', { method: 'POST', body: form });
        closeAuthModal();
        await loadSession();
    } catch (err) {
        showError(signupError, err.message);
    }
});

function renderAuthUI() {
    if (!currentUser) {
        authArea.innerHTML = '';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-nav';
        btn.textContent = 'Entrar';
        btn.addEventListener('click', () => openAuthModal('login'));
        authArea.appendChild(btn);

        postGate.hidden = false;
        postFormWrapper.hidden = true;
        navAdminLink.hidden = true;
        adminSection.hidden = true;
        return;
    }

    authArea.innerHTML = '';

    const userInfo = document.createElement('span');
    userInfo.className = 'auth-user-info';
    userInfo.textContent = currentUser.name;

    const logoutBtn = document.createElement('button');
    logoutBtn.type = 'button';
    logoutBtn.className = 'btn-nav btn-logout';
    logoutBtn.textContent = 'Sair';
    logoutBtn.addEventListener('click', async () => {
        try {
            await api('logout', { method: 'POST' });
            currentUser = null;
            renderAuthUI();
            await loadApprovedPosts();
        } catch (err) {
            alert(err.message);
        }
    });

    authArea.append(userInfo, logoutBtn);
    postGate.hidden = true;
    postFormWrapper.hidden = false;

    const isAdmin = currentUser.role === 'admin';
    navAdminLink.hidden = !isAdmin;
    adminSection.hidden = !isAdmin;
}

function formatDate(value) {
    if (!value) return 'Data pendente';
    const date = new Date(value.replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return 'Data pendente';
    return date.toLocaleDateString('pt-BR', {
        day: '2-digit', month: 'long', year: 'numeric'
    });
}

function badgeClassFor(category) {
    if (category === 'Estética') return 'badge-estetica';
    if (category === 'Enfermagem') return 'badge-enfermagem';
    return 'badge-farmacia';
}

function createPostCard({ title, category, description, date, mediaURL, mediaType }) {
    const card = document.createElement('div');
    card.classList.add('post-card');
    card.dataset.category = category;

    const mediaWrapper = document.createElement('div');
    mediaWrapper.classList.add('media-placeholder');

    if (mediaURL) {
        if (mediaType === 'video') {
            const video = document.createElement('video');
            video.src = mediaURL;
            video.controls = true;
            mediaWrapper.appendChild(video);
        } else {
            const img = document.createElement('img');
            img.src = mediaURL;
            img.alt = title || 'Imagem do post';
            img.loading = 'lazy';
            mediaWrapper.appendChild(img);
        }
    }

    const content = document.createElement('div');
    content.classList.add('post-content');

    const badge = document.createElement('span');
    badge.classList.add('badge', badgeClassFor(category));
    badge.textContent = category;

    const h3 = document.createElement('h3');
    h3.textContent = title;

    const p = document.createElement('p');
    p.textContent = description;

    const dateSpan = document.createElement('span');
    dateSpan.classList.add('post-date');
    dateSpan.textContent = date;

    content.append(badge, h3, p, dateSpan);
    card.append(mediaWrapper, content);

    return card;
}

async function loadApprovedPosts() {
    try {
        const data = await api('posts');
        allApprovedPosts = (data.posts || []).filter(post => post.status === undefined || post.status === 'aprovado');
        renderBlog();
    } catch (err) {
        console.error(err);
        blogGrid.innerHTML = '';
    }
}

function renderBlog(category = 'todos') {
    blogGrid.innerHTML = '';

    const posts = category === 'todos'
        ? allApprovedPosts
        : allApprovedPosts.filter(post => post.category === category);

    posts.forEach(post => {
        blogGrid.appendChild(createPostCard({
            title: post.title,
            category: post.category,
            description: post.description,
            date: formatDate(post.createdAt),
            mediaURL: post.mediaURL,
            mediaType: post.mediaType
        }));
    });

    toggleEmptyMessage(posts.length === 0, category);
}

let emptyMessageEl = null;

function toggleEmptyMessage(show, category) {
    if (!emptyMessageEl) {
        emptyMessageEl = document.createElement('p');
        emptyMessageEl.classList.add('empty-state');
        blogGrid.parentElement.insertBefore(emptyMessageEl, blogGrid.nextSibling);
    }

    emptyMessageEl.textContent = show
        ? `Ainda não há postagens${category === 'todos' ? '' : ` em "${category}"`}. Volte em breve!`
        : '';
    emptyMessageEl.style.display = show ? 'block' : 'none';
}

document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => {
            b.classList.remove('active');
            b.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
        renderBlog(btn.dataset.categoria);
    });
});

const postForm = document.getElementById('postForm');

postForm?.addEventListener('submit', async e => {
    e.preventDefault();

    if (!currentUser) {
        openAuthModal('login');
        return;
    }

    const mediaFile = document.getElementById('postMedia').files[0];
    if (!mediaFile) return;

    if (mediaFile.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        alert(`O arquivo é muito grande. O limite é ${MAX_FILE_SIZE_MB} MB.`);
        return;
    }

    if (!mediaFile.type.startsWith('image/') && !mediaFile.type.startsWith('video/')) {
        alert('Por favor, envie apenas arquivos de imagem ou vídeo.');
        return;
    }

    const form = new FormData();
    form.append('title', document.getElementById('postTitle').value.trim());
    form.append('category', document.getElementById('postCategory').value);
    form.append('description', document.getElementById('postDescription').value.trim());
    form.append('media', mediaFile);

    postSubmitBtn.disabled = true;
    const originalText = postSubmitBtn.textContent;
    postSubmitBtn.textContent = 'Enviando...';

    try {
        await api('create_post', { method: 'POST', body: form });
        postForm.reset();
        alert('Postagem enviada! Ela aparecerá no blog depois da aprovação do administrador.');
        await loadMyPosts();
        if (currentUser.role === 'admin') await loadPendingPosts();
    } catch (err) {
        alert(err.message);
    } finally {
        postSubmitBtn.disabled = false;
        postSubmitBtn.textContent = originalText;
    }
});

const STATUS_LABELS = {
    pendente: { label: 'Aguardando aprovação', className: 'status-pendente' },
    aprovado: { label: 'Aprovado', className: 'status-aprovado' },
    rejeitado: { label: 'Rejeitado', className: 'status-rejeitado' }
};

async function loadMyPosts() {
    if (!currentUser) return;

    try {
        const data = await api('my_posts');
        myPostsList.innerHTML = '';

        if (!data.posts.length) {
            const empty = document.createElement('p');
            empty.className = 'empty-state';
            empty.textContent = 'Você ainda não enviou nenhuma postagem.';
            myPostsList.appendChild(empty);
            return;
        }

        data.posts.forEach(post => {
            const item = document.createElement('div');
            item.className = 'my-post-item';

            const title = document.createElement('span');
            title.className = 'my-post-title';
            title.textContent = post.title;

            const info = STATUS_LABELS[post.status] || STATUS_LABELS.pendente;
            const status = document.createElement('span');
            status.className = `status-badge ${info.className}`;
            status.textContent = info.label;

            item.append(title, status);
            myPostsList.appendChild(item);
        });
    } catch (err) {
        console.error(err);
    }
}

async function loadPendingPosts() {
    if (!currentUser || currentUser.role !== 'admin') return;

    try {
        const data = await api('posts');
        adminPendingList.innerHTML = '';

        if (!data.posts.length) {
            adminEmptyState.hidden = false;
            adminPendingList.appendChild(adminEmptyState);
            return;
        }

        adminEmptyState.hidden = true;
        data.posts.forEach(post => {
            adminPendingList.appendChild(buildAdminReviewCard(post.id, post));
        });
    } catch (err) {
        console.error(err);
    }
}

function buildAdminReviewCard(postId, data) {
    const card = document.createElement('div');
    card.classList.add('admin-review-card');

    const mediaWrapper = document.createElement('div');
    mediaWrapper.classList.add('media-placeholder');

    if (data.mediaType === 'video') {
        const video = document.createElement('video');
        video.src = data.mediaURL;
        video.controls = true;
        mediaWrapper.appendChild(video);
    } else {
        const img = document.createElement('img');
        img.src = data.mediaURL;
        img.alt = data.title || 'Imagem do post';
        img.loading = 'lazy';
        mediaWrapper.appendChild(img);
    }

    const content = document.createElement('div');
    content.classList.add('admin-review-content');

    const badge = document.createElement('span');
    badge.classList.add('badge', badgeClassFor(data.category));
    badge.textContent = data.category;

    const h3 = document.createElement('h3');
    h3.textContent = data.title;

    const p = document.createElement('p');
    p.textContent = data.description;

    const author = document.createElement('span');
    author.classList.add('admin-review-author');
    author.textContent = `Enviado por: ${data.authorEmail}`;

    const actions = document.createElement('div');
    actions.classList.add('admin-review-actions');

    const approveBtn = document.createElement('button');
    approveBtn.type = 'button';
    approveBtn.classList.add('btn-approve');
    approveBtn.textContent = 'Aprovar';
    approveBtn.addEventListener('click', () => reviewPost(postId, 'aprovado'));

    const rejectBtn = document.createElement('button');
    rejectBtn.type = 'button';
    rejectBtn.classList.add('btn-reject');
    rejectBtn.textContent = 'Rejeitar';
    rejectBtn.addEventListener('click', () => reviewPost(postId, 'rejeitado'));

    actions.append(approveBtn, rejectBtn);
    content.append(badge, h3, p, author, actions);
    card.append(mediaWrapper, content);

    return card;
}

async function reviewPost(postId, status) {
    const form = new FormData();
    form.append('post_id', postId);
    form.append('status', status);

    try {
        await api('review', { method: 'POST', body: form });
        await loadPendingPosts();
        await loadApprovedPosts();
    } catch (err) {
        alert(err.message);
    }
}

async function loadSession() {
    try {
        const data = await api('session');
        currentUser = data.user;
        renderAuthUI();

        if (currentUser) {
            await loadMyPosts();
            if (currentUser.role === 'admin') await loadPendingPosts();
        }
    } catch (err) {
        console.error(err);
        currentUser = null;
        renderAuthUI();
    }
}

// ==========================================================
// Quiz original do projeto
// ==========================================================
const QUIZ_DATA = [
    { statement: 'Lavar o rosto várias vezes ao dia cura a acne mais rápido.', answer: 'mito', explanation: 'A limpeza excessiva remove a proteção natural da pele e pode causar efeito rebote, aumentando a produção de oleosidade. O ideal é higienizar 2 vezes ao dia com produto adequado.' },
    { statement: 'Pele oleosa também precisa de hidratação.', answer: 'verdade', explanation: 'Pular a hidratação pode fazer a pele produzir ainda mais oleosidade para compensar o ressecamento. O segredo é usar um hidratante leve e não comedogênico.' },
    { statement: 'Estourar espinhas ajuda a eliminar a acne mais rápido.', answer: 'mito', explanation: 'Estourar espinhas aumenta o risco de inflamação, infecção e cicatrizes. O tratamento correto deve ser orientado por um profissional de saúde.' },
    { statement: 'O uso de protetor solar é indispensável mesmo para peles oleosas ou acneicas.', answer: 'verdade', explanation: 'Existem versões de protetor solar em gel ou toque seco, formuladas para peles oleosas, que não obstruem os poros e protegem contra manchas pós-inflamatórias.' },
    { statement: 'A acne é causada apenas por falta de higiene.', answer: 'mito', explanation: 'A acne tem origem multifatorial: alterações hormonais, genética, produção de sebo e obstrução dos folículos pilosos, entre outros fatores — não apenas higiene.' },
    { statement: 'As alterações hormonais da adolescência favorecem o surgimento da acne.', answer: 'verdade', explanation: 'O aumento de hormônios androgênicos na puberdade estimula as glândulas sebáceas, elevando a produção de sebo e favorecendo a obstrução dos poros.' },
    { statement: 'Toda maquiagem piora a acne.', answer: 'mito', explanation: 'Produtos rotulados como "não comedogênicos" são formulados para não obstruir os poros e podem ser usados sem piorar o quadro, desde que a pele seja bem higienizada ao final do dia.' },
    { statement: 'O ácido salicílico ajuda a desobstruir os poros.', answer: 'verdade', explanation: 'É um beta-hidroxiácido (BHA) com ação esfoliante e anti-inflamatória, muito usado em produtos para peles acneicas por penetrar no folículo e ajudar a desobstruí-lo.' },
    { statement: 'A acne sempre desaparece sozinha, sem necessidade de tratamento.', answer: 'mito', explanation: 'Em muitos casos a acne persiste ou piora sem tratamento adequado, podendo deixar marcas e cicatrizes. Acompanhamento profissional é recomendado, especialmente em casos moderados a graves.' },
    { statement: 'A niacinamida pode ajudar a reduzir a inflamação da pele com acne.', answer: 'verdade', explanation: 'A niacinamida (vitamina B3) tem propriedades anti-inflamatórias e ajuda a regular a produção de sebo, sendo um ativo comum em cosméticos para pele acneica.' }
];

let quizState = { currentIndex: 0, score: 0, answered: false };
const quizStatementEl = document.getElementById('quizStatement');
const quizCounterEl = document.getElementById('quizCounter');
const quizProgressBarEl = document.getElementById('quizProgressBar');
const quizScoreLiveEl = document.getElementById('quizScoreLive');
const quizFeedbackEl = document.getElementById('quizFeedback');
const quizFeedbackResultEl = document.getElementById('quizFeedbackResult');
const quizFeedbackExplanationEl = document.getElementById('quizFeedbackExplanation');
const quizNextBtn = document.getElementById('quizNextBtn');
const quizCardEl = document.getElementById('quizCard');
const quizResultEl = document.getElementById('quizResult');
const quizResultEmojiEl = document.getElementById('quizResultEmoji');
const quizResultTitleEl = document.getElementById('quizResultTitle');
const quizResultMessageEl = document.getElementById('quizResultMessage');
const quizRestartBtn = document.getElementById('quizRestartBtn');
const btnMito = document.getElementById('btnMito');
const btnVerdade = document.getElementById('btnVerdade');

function renderQuizQuestion() {
    const question = QUIZ_DATA[quizState.currentIndex];
    quizState.answered = false;
    quizStatementEl.textContent = question.statement;
    quizCounterEl.textContent = `Pergunta ${quizState.currentIndex + 1} de ${QUIZ_DATA.length}`;
    quizScoreLiveEl.textContent = quizState.score;
    quizProgressBarEl.style.width = `${(quizState.currentIndex / QUIZ_DATA.length) * 100}%`;

    [btnMito, btnVerdade].forEach(btn => {
        btn.disabled = false;
        btn.classList.remove('correct', 'incorrect');
    });

    quizFeedbackEl.hidden = true;
    quizCardEl.hidden = false;
    quizResultEl.hidden = true;
}

function handleQuizAnswer(selected) {
    if (quizState.answered) return;
    quizState.answered = true;

    const question = QUIZ_DATA[quizState.currentIndex];
    const correct = selected === question.answer;
    const selectedBtn = selected === 'mito' ? btnMito : btnVerdade;
    const correctBtn = question.answer === 'mito' ? btnMito : btnVerdade;

    if (correct) {
        selectedBtn.classList.add('correct');
        quizState.score++;
    } else {
        selectedBtn.classList.add('incorrect');
        correctBtn.classList.add('correct');
    }

    btnMito.disabled = true;
    btnVerdade.disabled = true;
    quizScoreLiveEl.textContent = quizState.score;
    quizFeedbackResultEl.textContent = correct ? 'Você acertou!' : 'Não foi dessa vez.';
    quizFeedbackResultEl.classList.toggle('is-correct', correct);
    quizFeedbackResultEl.classList.toggle('is-incorrect', !correct);
    quizFeedbackExplanationEl.textContent = question.explanation;
    quizNextBtn.textContent = quizState.currentIndex === QUIZ_DATA.length - 1 ? 'Ver resultado' : 'Próxima pergunta';
    quizFeedbackEl.hidden = false;
}

function showQuizResult() {
    quizProgressBarEl.style.width = '100%';
    quizCardEl.hidden = true;
    quizResultEl.hidden = false;

    const total = QUIZ_DATA.length;
    const score = quizState.score;
    const percent = Math.round((score / total) * 100);

    let emoji = '📘';
    let title = 'Continue estudando!';
    let message = `Você acertou ${score} de ${total} perguntas (${percent}%). Revise a seção "Sobre a Acne" e tente novamente.`;

    if (percent >= 80) {
        emoji = '🏆';
        title = 'Excelente!';
        message = `Você acertou ${score} de ${total} perguntas (${percent}%). Você entende bem os cuidados com a pele acneica!`;
    } else if (percent >= 50) {
        emoji = '👍';
        title = 'Bom trabalho!';
        message = `Você acertou ${score} de ${total} perguntas (${percent}%). Está no caminho certo, mas ainda dá para melhorar.`;
    }

    quizResultEmojiEl.textContent = emoji;
    quizResultTitleEl.textContent = title;
    quizResultMessageEl.textContent = message;
}

function nextQuizQuestion() {
    quizState.currentIndex++;
    if (quizState.currentIndex >= QUIZ_DATA.length) showQuizResult();
    else renderQuizQuestion();
}

function restartQuiz() {
    quizState = { currentIndex: 0, score: 0, answered: false };
    renderQuizQuestion();
}

btnMito?.addEventListener('click', () => handleQuizAnswer('mito'));
btnVerdade?.addEventListener('click', () => handleQuizAnswer('verdade'));
quizNextBtn?.addEventListener('click', nextQuizQuestion);
quizRestartBtn?.addEventListener('click', restartQuiz);

document.addEventListener('DOMContentLoaded', async () => {
    renderQuizQuestion();
    await loadSession();
    await loadApprovedPosts();
});

// ==========================================================
// AcneCare - camada de experiência visual / UX
// ==========================================================
(() => {
    const $ = (selector) => document.querySelector(selector);
    const $$ = (selector) => [...document.querySelectorAll(selector)];

    const themeToggle = $('#themeToggle');
    const menuToggle = $('#menuToggle');
    const nav = document.querySelector('nav');
    const progress = $('#scrollProgress');
    const backTop = $('#backTop');
    const toastContainer = $('#toastContainer');
    const search = $('#blogSearch');
    const count = $('#blogCount');
    const fileInput = $('#postMedia');
    const fileDrop = $('#fileDrop');
    const filePreview = $('#filePreview');

    // Tema persistente.
    const savedTheme = localStorage.getItem('acnecare-theme');
    if (savedTheme === 'dark') document.body.classList.add('dark');
    updateThemeIcon();

    themeToggle?.addEventListener('click', () => {
        document.body.classList.toggle('dark');
        localStorage.setItem('acnecare-theme', document.body.classList.contains('dark') ? 'dark' : 'light');
        updateThemeIcon();
    });

    function updateThemeIcon() {
        if (!themeToggle) return;
        const dark = document.body.classList.contains('dark');
        themeToggle.textContent = dark ? '☀' : '☾';
        themeToggle.setAttribute('aria-label', dark ? 'Ativar tema claro' : 'Ativar tema escuro');
    }

    // Menu mobile.
    menuToggle?.addEventListener('click', () => {
        const open = nav?.classList.toggle('open');
        menuToggle.setAttribute('aria-expanded', String(Boolean(open)));
        menuToggle.textContent = open ? '×' : '☰';
    });
    $$('#navAdminLink a, nav a').forEach(link => link.addEventListener('click', () => {
        nav?.classList.remove('open');
        menuToggle?.setAttribute('aria-expanded', 'false');
        if (menuToggle) menuToggle.textContent = '☰';
    }));

    // Barra de progresso e botão voltar ao topo.
    window.addEventListener('scroll', () => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        if (progress) progress.style.width = `${max > 0 ? (window.scrollY / max) * 100 : 0}%`;
        backTop?.classList.toggle('show', window.scrollY > 500);
    }, { passive: true });
    backTop?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

    // Entrada suave das seções/cards.
    const revealTargets = $$('.section-title, .info-card, .quiz-container, .form-container, .post-card, .admin-review-card');
    revealTargets.forEach(el => el.classList.add('reveal'));
    if ('IntersectionObserver' in window) {
        const observer = new IntersectionObserver(entries => entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        }), { threshold: .08 });
        revealTargets.forEach(el => observer.observe(el));
    } else revealTargets.forEach(el => el.classList.add('visible'));

    // Busca instantânea no blog (respeitando os filtros existentes).
    search?.addEventListener('input', applyBlogSearch);
    const originalRenderBlog = window.renderBlog;
    // renderBlog é escopada no script principal; por isso o filtro é reaplicado via DOM.
    function applyBlogSearch() {
        const term = (search.value || '').trim().toLowerCase();
        const cards = $$('#blogGrid .post-card');
        let visible = 0;
        cards.forEach(card => {
            const text = card.textContent.toLowerCase();
            const show = !term || text.includes(term);
            card.style.display = show ? '' : 'none';
            if (show) visible++;
        });
        updateCount(visible);
    }
    function updateCount(value) {
        if (count) count.textContent = `${value} ${value === 1 ? 'atividade' : 'atividades'}`;
    }

    // Observa alterações do blog para atualizar contador e aplicar a pesquisa.
    const blogGrid = $('#blogGrid');
    if (blogGrid) new MutationObserver(() => {
        const cards = $$('#blogGrid .post-card');
        if (search?.value) applyBlogSearch(); else updateCount(cards.length);
        cards.forEach(card => card.classList.add('reveal', 'visible'));
    }).observe(blogGrid, { childList: true });

    // Preview e drag-and-drop do upload.
    function showFilePreview(file) {
        if (!filePreview || !file) return;
        filePreview.innerHTML = '';
        const url = URL.createObjectURL(file);
        const el = file.type.startsWith('video/') ? document.createElement('video') : document.createElement('img');
        el.src = url;
        if (el.tagName === 'VIDEO') { el.controls = true; el.muted = true; }
        filePreview.appendChild(el);
        filePreview.classList.add('show');
    }
    fileInput?.addEventListener('change', () => showFilePreview(fileInput.files?.[0]));
    ['dragenter','dragover'].forEach(evt => fileDrop?.addEventListener(evt, e => {
        e.preventDefault(); fileDrop.classList.add('dragover');
    }));
    ['dragleave','drop'].forEach(evt => fileDrop?.addEventListener(evt, e => {
        e.preventDefault(); fileDrop.classList.remove('dragover');
    }));
    fileDrop?.addEventListener('drop', e => {
        const file = e.dataTransfer.files?.[0];
        if (!file || !fileInput) return;
        try { fileInput.files = e.dataTransfer.files; } catch {}
        showFilePreview(file);
    });

    // Mensagens visuais reutilizáveis. Disponibiliza window.showToast para extensões futuras.
    window.showToast = (message, type = 'success') => {
        if (!toastContainer) return;
        const toast = document.createElement('div');
        toast.className = `toast ${type === 'error' ? 'error' : ''}`;
        toast.textContent = message;
        toastContainer.appendChild(toast);
        setTimeout(() => toast.remove(), 3600);
    };

    // Substitui alert() apenas nas mensagens mais comuns do front-end.
    const nativeAlert = window.alert;
    window.alert = (message) => {
        if (typeof message === 'string' && toastContainer) window.showToast(message, /erro|inválido|grande|não/i.test(message) ? 'error' : 'success');
        else nativeAlert(message);
    };
})();
