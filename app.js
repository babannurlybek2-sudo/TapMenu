// =========================================================
// 1. SUPABASE БАЙЛАНЫСЫ
// =========================================================
const SUPABASE_URL = 'https://supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentProfile = null;
let currentCafe = null;
let currentSubscription = null;
let allPlans = [];
let authMode = 'login';
let uiLang = 'kk';
let publicLang = 'kk';
let publicCafeData = null;

// =========================================================
// 2. АУДАРМАЛАР (KZ / RU)
// =========================================================
const i18n = {
    kk: {
        nav_login: 'Кіру',
        nav_signup: 'Парақша ашу',
        hero_badge: 'Қазақстан HoReCa саласына арналған NFC шешім',
        hero_title: 'Үстелге бір рет тигізу — мәзір, Wi-Fi, пікірлер және Kaspi шайпұл.',
        hero_sub: 'Мекемеңіздің жеке NFC парақшасын 3 минутта жасаңыз. Қосымша орнатусыз. Тұрақты сілтеме tapmenu.kz/мекеме-аты.',
        hero_cta: 'Тегін бастау',
        hero_plans: 'Тарифтер',
        pricing_title: 'Ашық тарифтер',
        pricing_sub: 'Тегін бастаңыз. Ақылы тарифтер төлем жүйесі қосылғаннан кейін іске қосылады.',
        btn_menu: 'Мәзірді ашу',
        btn_kaspi: 'Kaspi арқылы шайпұл қалдыру',
        btn_2gis: '2GIS-те пікір қалдыру',
        btn_gmaps: 'Google Карталар',
        btn_whatsapp: 'WhatsApp-қа жазу',
        btn_instagram: 'Біздің Instagram',
        wifi_title: 'Тегін Wi-Fi',
        wifi_copy: 'Құпия сөзді көшіру',
        wifi_copied: 'Құпия сөз көшірілді!'
    },
    ru: {
        nav_login: 'Войти',
        nav_signup: 'Создать страницу',
        hero_badge: 'NFC-решение для HoReCa Казахстана',
        hero_title: 'Одно касание стола — меню, Wi-Fi, отзывы и чаевые Kaspi.',
        hero_sub: 'Создайте персональную NFC-страницу вашего заведения за 3 минуты. Без установки приложений. Постоянная ссылка tapmenu.kz/ваше-кафе.',
        hero_cta: 'Запустить бесплатно',
        hero_plans: 'Тарифы',
        pricing_title: 'Прозрачные тарифы',
        pricing_sub: 'Начните бесплатно. Подключение платных тарифов активируется после интеграции платежного шлюза.',
        btn_menu: 'Открыть меню',
        btn_kaspi: 'Оставить чаевые Kaspi',
        btn_2gis: 'Оставить отзыв в 2GIS',
        btn_gmaps: 'Google Карты',
        btn_whatsapp: 'Написать в WhatsApp',
        btn_instagram: 'Наш Instagram',
        wifi_title: 'Бесплатный Wi-Fi',
        wifi_copy: 'Скопировать пароль',
        wifi_copied: 'Пароль скопирован!'
    }
};

// =========================================================
// 3. МАРШРУТТАУ (ROUTER)
// =========================================================
window.addEventListener('DOMContentLoaded', async () => {
    await fetchPlans();
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        currentUser = session.user;
        await loadUserContext();
    }
    handleRoute();
});

window.addEventListener('popstate', handleRoute);

function navigateTo(path) {
    window.history.pushState({}, '', path);
    handleRoute();
}

async function handleRoute() {
    const path = window.location.pathname.replace(/\/+$/, '') || '/';
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));

    if (path === '/') {
        renderLandingPlans();
        document.getElementById('view-landing').classList.remove('hidden');
        return;
    }

    if (path === '/dashboard') {
        if (!currentUser) return navigateTo('/');
        await loadUserContext();
        populateDashboard();
        document.getElementById('view-dashboard').classList.remove('hidden');
        return;
    }

    if (path === '/admin') {
        if (!currentUser || currentProfile?.role !== 'super_admin') {
            showToast('Рұқсат жоқ', true);
            return navigateTo('/');
        }
        await loadAdminDashboard();
        document.getElementById('view-admin').classList.remove('hidden');
        return;
    }

    const slug = path.substring(1).toLowerCase();
    await loadPublicCafePage(slug);
}

// =========================================================
// 4. КІРУ ЖӘНЕ ТІРКЕЛУ
// =========================================================
function openAuthModal(mode) {
    authMode = mode;
    const modal = document.getElementById('auth-modal');
    const signupFields = document.getElementById('signup-cafe-fields');
    const title = document.getElementById('auth-title');
    const switchBtn = document.getElementById('auth-switch-btn');

    if (mode === 'signup') {
        signupFields.classList.remove('hidden');
        document.getElementById('auth-cafe-name').required = true;
        document.getElementById('auth-cafe-slug').required = true;
        title.textContent = 'Мекемені тіркеу';
        switchBtn.textContent = 'Аккаунтыңыз бар ма? Кіру';
    } else {
        signupFields.classList.add('hidden');
        document.getElementById('auth-cafe-name').required = false;
        document.getElementById('auth-cafe-slug').required = false;
        title.textContent = 'TapMenu-ге кіру';
        switchBtn.textContent = 'Аккаунтыңыз жоқ па? Кафе тіркеу';
    }
    modal.classList.remove('hidden');
}

function closeAuthModal() {
    document.getElementById('auth-modal').classList.add('hidden');
}

function toggleAuthMode() {
    openAuthModal(authMode === 'login' ? 'signup' : 'login');
}

document.getElementById('auth-cafe-slug').addEventListener('input', (e) => {
    e.target.value = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
});

document.getElementById('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const btn = document.getElementById('auth-submit-btn');
    btn.disabled = true;

    try {
        if (authMode === 'signup') {
            const cafeName = document.getElementById('auth-cafe-name').value.trim();
            const slug = document.getElementById('auth-cafe-slug').value.trim();

            const { data: existingSlug } = await supabaseClient
                .from('cafes').select('id').eq('slug', slug).maybeSingle();
            if (existingSlug) {
                throw new Error('Бұл NFC-мекенжай (slug) бос емес. Басқасын таңдаңыз.');
            }

            const { data, error } = await supabaseClient.auth.signUp({
                email,
                password,
                options: { emailRedirectTo: window.location.origin + '/dashboard' }
            });
            if (error) throw error;

            if (data.user) {
                if (data.session) {
                    currentUser = data.user;
                    await createInitialCafeAndSub(data.user.id, cafeName, slug);
                    closeAuthModal();
                    navigateTo('/dashboard');
                } else {
                    localStorage.setItem('pending_cafe', JSON.stringify({ cafeName, slug }));
                    showToast('Поштаңызға растау хаты жіберілді!');
                    closeAuthModal();
                }
            }
        } else {
            const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
            if (error) throw error;

            currentUser = data.user;
            const pending = localStorage.getItem('pending_cafe');
            if (pending) {
                const { cafeName, slug } = JSON.parse(pending);
                await createInitialCafeAndSub(currentUser.id, cafeName, slug);
                localStorage.removeItem('pending_cafe');
            }

            await loadUserContext();
            if (currentProfile?.is_blocked) {
                await supabaseClient.auth.signOut();
                throw new Error('Аккаунтыңыз бұғатталған.');
            }
            closeAuthModal();
            navigateTo(currentProfile?.role === 'super_admin' ? '/admin' : '/dashboard');
        }
    } catch (err) {
        showToast(err.message, true);
    } finally {
        btn.disabled = false;
    }
});

async function createInitialCafeAndSub(userId, cafeName, slug) {
    const { data: cafe, error: cafeErr } = await supabaseClient
        .from('cafes')
        .insert([{ owner_id: userId, name: cafeName, slug: slug }])
        .select()
        .single();
    if (cafeErr) throw cafeErr;

    const freePlan = allPlans.find(p => p.name === 'Free') || allPlans[0];
    if (freePlan) {
        await supabaseClient.from('subscriptions').insert([{
            cafe_id: cafe.id,
            plan_id: freePlan.id,
            status: 'active',
            payment_provider_status: 'unconnected'
        }]);
    }
}

async function logout() {
    await supabaseClient.auth.signOut();
    currentUser = null;
    currentProfile = null;
    currentCafe = null;
    navigateTo('/');
}

async function loadUserContext() {
    if (!currentUser) return;
    const { data: profile } = await supabaseClient
        .from('profiles').select('*').eq('id', currentUser.id).single();
    currentProfile = profile;

    const { data: cafe } = await supabaseClient
        .from('cafes').select('*').eq('owner_id', currentUser.id).maybeSingle();
    currentCafe = cafe;

    if (cafe) {
        const { data: sub } = await supabaseClient
            .from('subscriptions').select('*, subscription_plans(*)').eq('cafe_id', cafe.id).maybeSingle();
        currentSubscription = sub;
    }
}

// =========================================================
// 5. КАФЕ КАБИНЕТІ ЖӘНЕ LIVE PREVIEW
// =========================================================
function populateDashboard() {
    if (!currentCafe) return;

    if (currentProfile?.role === 'super_admin') {
        document.getElementById('btn-open-admin').classList.remove('hidden');
