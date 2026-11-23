
import { backend } from './backend.js';
import { supabase } from './supabase-client.js';

function reportError(error) { console.error('Supabase:', error); alert(error?.message || 'Erro ao comunicar com o servidor.'); }
function mapInterest(i) {
    const p = i.perfis || {};
    return {
        id: i.id, petId: i.animal_id, petName: dbDogs.find(d => d.id === i.animal_id)?.name || 'Animal',
        userEmail: p.email || currentUser?.email || '', phone: p.telefone || '',
        date: new Date(i.criado_em).toLocaleDateString('pt-BR'), status: ({ 'pendente': 'Em análise', 'em_analise': 'Em análise', 'aprovado': 'Aprovado', 'recusado': 'Recusado', 'cancelado': 'Cancelado' })[i.status] || i.status
    };
}
async function refreshData() {
    dbDogs = await backend.animals.list();
    if (!currentUser) return;
    if (currentUser.role === 'admin') {
        const managed = await backend.animals.managed();
        managedDogs = managed;
        const results = await Promise.all(managed.map(p => backend.interests.forAnimal(p.id)));
        const unique = [...new Map(results.flat().map(i => [i.id, i])).values()];
        adoptionInterests = unique.map(mapInterest);
    } else {
        const ids = await backend.likes.list();
        likedDogs = ids.map(id => dbDogs.find(d => d.id === id)).filter(Boolean);
        adoptionInterests = (await backend.interests.mine()).map(mapInterest);
    }
}
async function refreshChat(interestId) {
    const data = await backend.chat.list(interestId);
    chatMessages = chatMessages.filter(m => m.interestId !== interestId).concat(data.map(m => ({
        id: m.id, interestId: m.interesse_id, senderId: m.remetente_id, sender: m.remetente_id === currentUser?.id ? currentUser.email : 'Outro participante',
        senderRole: m.remetente_id === currentUser?.id ? currentUser.role : 'other', message: m.conteudo,
        timestamp: new Date(m.criado_em).getTime(), time: new Date(m.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    })));
}
async function enterApp() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const p = await backend.auth.profile();
    currentUser = { id: user.id, email: user.email, phone: p.telefone, role: p.tipo === 'colaborador' ? 'admin' : 'user' };
    userProfile = currentUser.role === 'admin' ? null : await backend.quiz.get();
    await refreshData();
    document.getElementById('view-auth').classList.add('hidden');
    document.getElementById('view-admin').classList.add('hidden');
    document.getElementById('app').classList.add('hidden');
    document.getElementById('view-profile').classList.add('hidden');
    document.getElementById('view-profile').classList.remove('flex');
    if (currentUser.role === 'admin') {
        document.getElementById('view-admin').classList.remove('hidden'); renderAdminPets(); renderAdminInterests();
    } else {
        document.getElementById('profile-user-email').innerText = currentUser.email;
        if (!userProfile) { document.getElementById('view-profile').classList.remove('hidden'); document.getElementById('view-profile').classList.add('flex'); }
        else { document.getElementById('app').classList.remove('hidden'); initApp(); }
    }
}
// Dados Base Iniciais
console.log("APP.JS NOVO CARREGADO");

// Force a atualização dos dados de teste:
let currentUser = null;
let dbDogs = [];
let managedDogs = [];
let users = [];
let userProfile = null;
let likedDogs = [];
let adoptionInterests = [];
let chatMessages = [];
let currentModalPetId = null;
let currentChatInterestId = null;


let dogsList = [];
let isDragging = false;
let hasDragged = false;
let startX = 0, startY = 0, currentX = 0, currentY = 0;
let topCard = null;

function getLikedDogsKey() { return null; }

function loadLikedDogs() { return likedDogs; }
function saveStorage() { /* Persistência realizada via Supabase. */ }
function ensureInterestIds() { /* IDs gerados pelo PostgreSQL. */ }
ensureInterestIds();
function calculateAgeString(birthdateStr) {
    if (!birthdateStr) return "Idade não informada";

    const birth = new Date(birthdateStr);
    const now = new Date();

    if (isNaN(birth.getTime())) return birthdateStr; // Caso seja texto antigo como "2 anos"

    let years = now.getFullYear() - birth.getFullYear();
    let months = now.getMonth() - birth.getMonth();

    if (now.getDate() < birth.getDate()) {
        months--;
    }

    if (months < 0) {
        years--;
        months += 12;
    }

    if (years === 0 && months === 0) {
        return "Recém-nascido";
    }

    let result = [];
    if (years > 0) result.push(`${years} ${years === 1 ? 'ano' : 'anos'}`);
    if (months > 0) result.push(`${months} ${months === 1 ? 'mês' : 'meses'}`);

    return result.join(" e ");
}
function previewPetAge() {
    const val = document.getElementById('pet-form-birthdate').value;
    const preview = document.getElementById('pet-age-preview');
    if (val) {
        preview.innerText = `Idade calculada: ${calculateAgeString(val)}`;
    } else {
        preview.innerText = '';
    }
}
function setImgSourceMode(mode) {
    const modes = ['file', 'camera', 'url'];
    modes.forEach(m => {
        document.getElementById(`img-input-${m}`).classList.toggle('hidden', m !== mode);
        const btn = document.getElementById(`btn-mode-${m}`);
        if (m === mode) {
            btn.className = "flex-1 py-1.5 px-2 bg-teal-600 text-white rounded-lg font-bold text-[11px] flex items-center justify-center gap-1";
        } else {
            btn.className = "flex-1 py-1.5 px-2 bg-gray-100 text-gray-600 rounded-lg font-bold text-[11px] flex items-center justify-center gap-1";
        }
    });
}
function handleImageFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function (e) {
            const base64Img = e.target.result;
            document.getElementById('pet-form-img-value').value = base64Img;
            updateImgPreview(base64Img);
        };
        reader.readAsDataURL(file);
    }
}
function updateImgPreview(src) {
    const container = document.getElementById('img-preview-container');
    const img = document.getElementById('img-preview');
    if (src) {
        img.src = src;
        container.classList.remove('hidden');
        container.classList.add('flex');
    } else {
        container.classList.add('hidden');
        container.classList.remove('flex');
    }
}

// --- SISTEMA DE AUTENTICAÇÃO E ROTEAMENTO ---
function toggleAuth(mode) {
    const loginForm = document.getElementById('form-login');
    const registerForm = document.getElementById('form-register');

    if (mode === 'register') {
        loginForm.classList.add('hidden');
        registerForm.classList.remove('hidden');

        document.getElementById('register-email').value = '';
        document.getElementById('register-phone').value = '';
        document.getElementById('register-password').value = '';

    } else {
        registerForm.classList.add('hidden');
        loginForm.classList.remove('hidden');

        document.getElementById('login-email').value = '';
        document.getElementById('login-password').value = '';
    }
}

async function login() {
    const email = document.getElementById('login-email').value.trim(), password = document.getElementById('login-password').value;
    if (!email || !password) return alert('Preencha e-mail e senha.');
    try { await backend.auth.login(email, password); await enterApp(); } catch (e) { reportError(e); }
}

async function register() {
    const email = document.getElementById('register-email').value.trim(), phone = document.getElementById('register-phone').value, password = document.getElementById('register-password').value;
    if (!email || !phone || !password) return alert('Preencha todos os campos.');
    try {
        const result = await backend.auth.register(email, password, phone);
        if (!result.session) { alert('Cadastro realizado. Confirme seu e-mail antes de entrar.'); toggleAuth('login'); return; }
        await enterApp();
    } catch (e) { reportError(e); }
}

async function logout() {
    try {
        await backend.auth.logout(); currentUser = null; userProfile = null; likedDogs = []; adoptionInterests = []; chatMessages = [];
        document.getElementById('view-admin').classList.add('hidden'); document.getElementById('app').classList.add('hidden');
        document.getElementById('view-profile').classList.add('hidden'); document.getElementById('view-profile').classList.remove('flex');
        document.getElementById('view-auth').classList.remove('hidden'); toggleAuth('login');
    } catch (e) { reportError(e); }
}

function deleteAccount() { alert('Exclusão definitiva exige uma função segura no servidor. Nenhuma conta foi excluída.'); }

// --- PAINEL DA ONG (ADMINISTRATIVO) ---
function switchAdminTab(tab) {
    const isPets = tab === 'pets';
    document.getElementById('admin-tab-pets').classList.toggle('hidden', !isPets);
    document.getElementById('admin-tab-interests').classList.toggle('hidden', isPets);

    document.getElementById('admin-tab-btn-pets').className = isPets
        ? "flex-1 py-3 text-xs font-bold text-teal-600 border-b-2 border-teal-600 transition-colors flex items-center justify-center gap-1"
        : "flex-1 py-3 text-xs font-bold text-gray-400 border-b-2 border-transparent transition-colors flex items-center justify-center gap-1";

    document.getElementById('admin-tab-btn-interests').className = !isPets
        ? "flex-1 py-3 text-xs font-bold text-teal-600 border-b-2 border-teal-600 transition-colors flex items-center justify-center gap-1 relative"
        : "flex-1 py-3 text-xs font-bold text-gray-400 border-b-2 border-transparent transition-colors flex items-center justify-center gap-1 relative";
}

function renderAdminPets() {
    const grid = document.getElementById('admin-pets-grid');
    grid.innerHTML = "";

    (managedDogs || dbDogs).forEach(pet => {
        const sexIcon = pet.sex === "Fêmea" ? '<i class="ph-bold ph-gender-female text-pink-500"></i>' : '<i class="ph-bold ph-gender-male text-blue-500"></i>';

        const card = document.createElement('div');
        card.className = "bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden relative flex flex-col cursor-pointer group hover:shadow-md transition-shadow";
        card.innerHTML = `
            <div class="relative h-32 md:h-44 lg:h-48 w-full bg-gray-100" onclick="openModal(${pet.id})">
                <img src="${pet.img}" class="w-full h-full object-cover">
                <div class="absolute top-2 right-2 flex gap-1">
                    <button onclick="event.stopPropagation(); openPetFormModal(${pet.id})" 
                        class="bg-white/90 text-gray-700 hover:text-teal-600 rounded-full w-7 h-7 flex items-center justify-center shadow backdrop-blur-sm transition-colors" title="Editar Pet">
                        <i class="ph-bold ph-pencil-simple text-sm"></i>
                    </button>
                    <button onclick="event.stopPropagation(); deletePet(${pet.id})" 
                        class="bg-white/90 text-gray-700 hover:text-teal-600 rounded-full w-8 h-8 lg:w-9 lg:h-9 flex items-center justify-center shadow backdrop-blur-sm transition-colors" title="Excluir Pet">
                        <i class="ph-bold ph-trash text-sm"></i>
                    </button>
                </div>
            </div>
            <div class="p-2.5 md:p-4 flex flex-col justify-between flex-1" onclick="openModal(${pet.id})">
                <div class="flex items-center justify-between">
                    <h3 class="font-bold text-gray-800 text-xs md:text-base truncate max-w-[80px] md:max-w-[160px]">${pet.name}</h3>
                    <span class="text-xs flex items-center gap-0.5 font-semibold text-gray-600">${sexIcon} ${pet.sex || 'Macho'}</span>
                </div>
                <p class="text-[10px] md:text-sm text-gray-500 truncate mt-1">${pet.breed} • ${pet.age}</p>
            </div>
        `;
        grid.appendChild(card);
    });
}

function renderAdminInterests() {
    const list = document.getElementById('admin-interests-list');
    const badge = document.getElementById('admin-interest-badge');
    list.innerHTML = "";

    if (adoptionInterests.length === 0) {
        list.innerHTML = `<p class="text-xs text-gray-500 text-center py-8">Nenhum interesse registrado até o momento.</p>`;
        badge.classList.add('hidden');
        return;
    }

    badge.innerText = adoptionInterests.length;
    badge.classList.remove('hidden');

    adoptionInterests.forEach((item, index) => {
        const card = document.createElement('div');
        card.className = "bg-white p-3.5 rounded-2xl border border-gray-100 shadow-sm flex flex-col gap-2 text-xs";
        card.innerHTML = `

    <div class="flex items-center justify-between">

        <span class="bg-teal-100 text-teal-800 font-bold px-2 py-0.5 rounded-md text-[10px]">
            Pet: ${item.petName}
        </span>

        <div class="flex items-center gap-2">

            <span class="text-[10px] text-gray-500">
                ${item.date || 'Hoje'}
            </span>

            <button
                onclick="removeInterest(${index})"
                class="text-red-400 hover:text-red-600 p-1"
                title="Remover">

                <i class="ph-bold ph-trash text-base"></i>

            </button>

        </div>

    </div>


    <div class="space-y-1 text-gray-700">

        <p class="font-bold text-gray-900">

            <i class="ph-fill ph-envelope mr-1 text-gray-500"></i>

            ${item.userEmail}

        </p>

        <p>

            <i class="ph-fill ph-phone mr-1 text-gray-500"></i>

            <strong>Tel:</strong>

            ${item.phone || 'Não informado'}

        </p>

    </div>


    <div class="pt-2 border-t border-gray-100">

        <button
            onclick="openChat(${item.id})"
            class="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2">

            <i class="ph-bold ph-chat-circle-dots text-base"></i>

            Conversar com adotante

        </button>

    </div>

`;
        list.appendChild(card);
    });
}

async function removeInterest(index) {
    const item = adoptionInterests[index]; if (!item || !confirm('Remover este interesse?')) return;
    try { await backend.interests.remove(item.id); await refreshData(); renderAdminInterests(); } catch (e) { reportError(e); }
}

function openPetFormModal(petId = null) {
    const modal = document.getElementById('pet-form-modal');
    const title = document.getElementById('pet-form-title');
    const form = document.getElementById('form-pet-editor');

    form.reset();
    document.getElementById('pet-age-preview').innerText = '';
    updateImgPreview('');
    setImgSourceMode('file');

    if (petId) {
        const pet = dbDogs.find(d => d.id === petId);
        if (!pet) return;
        title.innerText = "Editar Animal";
        document.getElementById('pet-form-id').value = pet.id;
        document.getElementById('pet-form-name').value = pet.name || '';
        document.getElementById('pet-form-sex').value = pet.sex || 'Macho';
        document.getElementById('pet-form-species').value = pet.species || 'cão';
        document.getElementById('pet-form-birthdate').value = pet.birthdate || '';
        document.getElementById('pet-form-size').value = pet.size || 'médio';
        document.getElementById('pet-form-breed').value = pet.breed || '';
        document.getElementById('pet-form-city').value = pet.city || '';

        const imgSrc = pet.img || '';
        document.getElementById('pet-form-img-value').value = imgSrc;
        if (imgSrc.startsWith('http')) {
            setImgSourceMode('url');
            document.getElementById('pet-form-img-url').value = imgSrc;
        }
        updateImgPreview(imgSrc);

        document.getElementById('pet-form-medical').value = pet.medical || '';
        document.getElementById('pet-form-past').value = pet.past || '';
        document.getElementById('pet-form-desc').value = pet.desc || '';
        document.getElementById('pet-form-castrated').checked = !!pet.castrated;
        document.getElementById('pet-form-specialNeed').checked = !!pet.specialNeed;
        previewPetAge();
    } else {
        title.innerText = "Cadastrar Novo Pet";
        document.getElementById('pet-form-id').value = "";
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closePetFormModal() {
    const modal = document.getElementById('pet-form-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

async function savePetForm(e) {
    e.preventDefault();
    const idVal = document.getElementById('pet-form-id').value;
    let img = document.getElementById('pet-form-img-value').value;
    if (!img) return alert('Selecione uma imagem.');
    try {
        if (img.startsWith('data:')) {
            const file = document.getElementById('pet-file-input')?.files?.[0] || document.getElementById('pet-camera-input')?.files?.[0];
            if (!file) throw new Error('Selecione novamente o arquivo de imagem.');
            img = await backend.animals.uploadImage(file);
        }
        const birthdate = document.getElementById('pet-form-birthdate').value;
        const pet = {
            id: idVal ? Number(idVal) : undefined, name: document.getElementById('pet-form-name').value,
            sex: document.getElementById('pet-form-sex').value, species: document.getElementById('pet-form-species').value,
            birthdate, age: calculateAgeString(birthdate), size: document.getElementById('pet-form-size').value,
            breed: document.getElementById('pet-form-breed').value, city: document.getElementById('pet-form-city').value, img,
            medical: document.getElementById('pet-form-medical').value, past: document.getElementById('pet-form-past').value,
            desc: document.getElementById('pet-form-desc').value, castrated: document.getElementById('pet-form-castrated').checked,
            specialNeed: document.getElementById('pet-form-specialNeed').checked, singlePet: false, purpose: 'companhia'
        };
        await backend.animals.save(pet); await refreshData(); closePetFormModal(); renderAdminPets(); alert('Pet salvo!');
    } catch (err) { reportError(err); }
}

async function deletePet(id) {
    if (!confirm('Excluir este animal permanentemente?')) return;
    try { await backend.animals.remove(id); await refreshData(); closeModal(); renderAdminPets(); } catch (e) { reportError(e); }
}

// --- SISTEMA DE CORRESPONDÊNCIA / QUIZ ---
function updateFileLabel(inputId, labelId) {
    const input = document.getElementById(inputId);
    const label = document.getElementById(labelId);
    if (input.files && input.files[0]) {
        label.innerText = "✓ " + input.files[0].name;
        label.classList.add("text-green-600", "font-bold");
    }
}

async function saveProfile() {
    const p = {
        species: document.querySelector('input[name="p-species"]:checked')?.value || '',
        size: document.getElementById('p-size').value, age: document.getElementById('p-age').value,
        housing: document.querySelector('input[name="p-housing"]:checked')?.value || 'casa',
        activity: document.getElementById('p-activity-select').value, routine: document.getElementById('p-routine').value,
        kids: document.getElementById('p-kids').checked, otherPets: document.getElementById('p-otherPets').checked,
        acceptSpecial: document.getElementById('p-acceptSpecial').checked
    };
    try {
        await backend.quiz.save(p); userProfile = p;
        document.getElementById('view-profile').classList.add('hidden'); document.getElementById('view-profile').classList.remove('flex');
        document.getElementById('app').classList.remove('hidden'); initApp();
    } catch (e) { reportError(e); }
}

function openProfileEdit() {
    document.getElementById('app').classList.add('hidden');
    document.getElementById('view-profile').classList.remove('hidden');
}

function calculateMatch(profile, pet) {
    if (!profile) return 85;
    let score = 50;

    if (!profile.acceptSpecial && pet.specialNeed) return 0;
    if (profile.species && pet.species && profile.species === pet.species) score += 15;
    if (profile.size && pet.size && profile.size === pet.size) score += 15;
    if (profile.housing === 'apartamento' && pet.size === 'grande') score -= 10;
    if (profile.housing === 'casa_quintal' && pet.size === 'grande') score += 10;

    return Math.min(Math.max(score, 40), 99);
}

function enrichPet(pet) {
    return {
        ...pet,
        sex: pet.sex || "Macho",
        matchScore: calculateMatch(userProfile, pet)
    };
}

// --- APPLICAÇÃO ADOTANTE (SWIPE & INTERFACE) ---
function initApp() {
    dogsList = dbDogs
        .map(enrichPet)
        .filter(pet => !likedDogs.some(liked => liked.id === pet.id))
        .sort((a, b) => b.matchScore - a.matchScore);

    updateLikedView();
    updateBadge();
    renderUserInterests();
    renderCards();
}

function renderCards() {
    const container = document.getElementById('cards-container');
    const emptyState = document.getElementById('empty-state');
    container.innerHTML = '';

    if (dogsList.length === 0) {
        emptyState.classList.remove('hidden');
        return;
    }
    emptyState.classList.add('hidden');

    const petsToRender = dogsList.slice(0, 5).reverse();

    petsToRender.forEach((pet, index) => {
        const card = document.createElement('div');
        card.className = 'swipe-card flex flex-col justify-between cursor-pointer';
        card.dataset.id = pet.id;

        const sexIcon = pet.sex === "Fêmea" ? '<i class="ph-bold ph-gender-female text-pink-400"></i>' : '<i class="ph-bold ph-gender-male text-blue-400"></i>';

        card.innerHTML = `
                    <div class="relative w-full h-full bg-cover bg-center" style="background-image: url('${pet.img}')">
                        <div class="stamp stamp-like">AMEI</div>
                        <div class="stamp stamp-nope">PASSO</div>
                        
                        <div class="absolute top-4 left-4 bg-teal-600 text-white font-bold text-xs px-3 py-1.5 rounded-full shadow-md flex items-center gap-1 z-10">
                            <i class="ph-fill ph-sparkle"></i> ${pet.matchScore}% Match
                        </div>

                        <div class="absolute inset-0 card-gradient flex flex-col justify-end p-5 text-white">
                            <div class="flex justify-between items-end mb-1">
                                <div>
                                    <h2 class="text-3xl font-bold leading-none flex items-center gap-2">${pet.name} <span class="text-xl font-normal opacity-90">${pet.age}</span> ${sexIcon}</h2>
                                    <p class="text-sm font-medium text-gray-200 mt-1"><i class="ph-fill ph-map-pin"></i> ${pet.city} • ${pet.breed}</p>
                                </div>
                                <button onclick="event.stopPropagation(); openModal(${pet.id})" class="bg-white/20 backdrop-blur-md p-2.5 rounded-full hover:bg-white/30 transition-colors">
                                    <i class="ph-bold ph-info text-xl"></i>
                                </button>
                            </div>
                            <p class="text-xs text-gray-300 line-clamp-2 mt-2">${pet.desc}</p>
                        </div>
                    </div>
                `;

        container.appendChild(card);
    });

    setupDragEvents();
}

function setupDragEvents() {
    const cards = document.querySelectorAll('.swipe-card');

    if (cards.length === 0) return;

    topCard = cards[cards.length - 1];

    topCard.addEventListener('pointerdown', handleDragStart);
    topCard.addEventListener('pointermove', handleDragMove);
    topCard.addEventListener('pointerup', handleDragEnd);
    topCard.addEventListener('pointercancel', handleDragEnd);

    // Segurança extra caso o ponteiro seja perdido
    topCard.addEventListener('lostpointercapture', () => {
        if (isDragging) {
            handleDragEnd();
        }
    });

    topCard.addEventListener('click', (e) => {
        if (hasDragged) {
            e.preventDefault();
            e.stopPropagation();

            hasDragged = false;
            return;
        }

        const id = parseInt(topCard.dataset.id);
        openModal(id);
    });
}

function handleDragStart(e) {
    if (!topCard) return;

    if (e.pointerType === 'mouse' && e.button !== 0) {
        return;
    }

    isDragging = true;
    hasDragged = false;

    startX = e.clientX;
    startY = e.clientY;

    currentX = 0;
    currentY = 0;

    topCard.style.transition = 'none';

    topCard.setPointerCapture(e.pointerId);
}

function handleDragMove(e) {
    if (!isDragging) return;
    currentX = e.clientX - startX;
    currentY = e.clientY - startY;
    if (Math.abs(currentX) > 10 || Math.abs(currentY) > 10) {
        hasDragged = true;
    }

    const rotate = currentX * 0.05;
    topCard.style.transform = `translate(${currentX}px, ${currentY}px) rotate(${rotate}deg)`;

    const likeStamp = topCard.querySelector('.stamp-like');
    const nopeStamp = topCard.querySelector('.stamp-nope');

    if (currentX > 50) {
        likeStamp.style.opacity = Math.min(currentX / 100, 1);
        nopeStamp.style.opacity = 0;
    } else if (currentX < -50) {
        nopeStamp.style.opacity = Math.min(Math.abs(currentX) / 100, 1);
        likeStamp.style.opacity = 0;
    } else {
        likeStamp.style.opacity = 0;
        nopeStamp.style.opacity = 0;
    }
}

function handleDragEnd(e) {
    if (!isDragging) return;

    isDragging = false;

    // Libera o mouse
    if (
        e &&
        e.pointerId !== undefined &&
        topCard &&
        topCard.hasPointerCapture?.(e.pointerId)
    ) {
        topCard.releasePointerCapture(e.pointerId);
    }

    if (!topCard) return;

    topCard.style.transition = 'transform 0.3s ease-out';

    if (currentX > 100) {

        swipeCard('right');

    } else if (currentX < -100) {

        swipeCard('left');

    } else {

        topCard.style.transform =
            'translate(0px, 0px) rotate(0deg)';

        const stamps = topCard.querySelectorAll('.stamp');

        stamps.forEach(s => {
            s.style.opacity = 0;
        });
    }

    currentX = 0;
    currentY = 0;
}

function swipeCard(direction) {
    if (!topCard) return;

    const petId = parseInt(topCard.dataset.id);
    const pet = dbDogs.find(d => d.id === petId);

    if (direction === 'right' && pet) {
        likedDogs.push(pet);
        backend.likes.add(pet.id).catch(async e => { reportError(e); await refreshData(); updateLikedView(); updateBadge(); });
        updateLikedView();
        updateBadge();
    }

    topCard.classList.add('animating');
    topCard.classList.add(direction === 'right' ? 'swipe-right' : 'swipe-left');

    setTimeout(() => {
        dogsList.shift();
        renderCards();
    }, 300);
}

// --- FILTROS ---
function toggleFilterMenu() {
    document.getElementById('filter-menu').classList.toggle('hidden');
}

function applyFilters() {
    const species = document.getElementById('filter-species').value;
    const size = document.getElementById('filter-size').value;
    const special = document.getElementById('filter-special').value;

    let filtered = dbDogs.map(enrichPet).filter(pet => !likedDogs.some(liked => liked.id === pet.id));

    if (species) filtered = filtered.filter(p => p.species === species);
    if (size) filtered = filtered.filter(p => p.size === size);
    if (special === 'true') filtered = filtered.filter(p => p.specialNeed);
    if (special === 'false') filtered = filtered.filter(p => !p.specialNeed);

    dogsList = filtered;
    toggleFilterMenu();
    renderCards();
}

function resetApp() {
    likedDogs = [];
    saveStorage();
    initApp();
}

// --- NAVEGAÇÃO ENTRE ABAS DO USUÁRIO ---
function switchTab(tab) {

    const tabs = [
        'swipe',
        'liked',
        'interests',
        'settings'
    ];

    tabs.forEach(t => {

        const viewId =
            t === 'settings'
                ? 'view-settings-tab'
                : `view-${t}`;

        const view =
            document.getElementById(viewId);

        const navBtn =
            document.getElementById(
                `nav-tab-${t}`
            );

        if (view) {
            view.classList.toggle(
                'hidden',
                t !== tab
            );
        }

        if (navBtn) {

            navBtn.className =
                t === tab

                    ? 'flex flex-col items-center justify-center text-teal-600 flex-1 h-full transition-all relative'

                    : 'flex flex-col items-center justify-center text-gray-400 flex-1 h-full transition-all relative';

        }

    });


    if (tab === 'interests') {
        renderUserInterests();
    }

}

function updateLikedView() {
    const grid = document.getElementById('liked-grid');
    const noLikes = document.getElementById('no-likes');
    grid.innerHTML = '';

    if (likedDogs.length === 0) {
        noLikes.classList.remove('hidden');
        return;
    }
    noLikes.classList.add('hidden');

    likedDogs.forEach(pet => {
        const sexIcon = pet.sex === "Fêmea" ? '<i class="ph-bold ph-gender-female text-pink-500"></i>' : '<i class="ph-bold ph-gender-male text-blue-500"></i>';

        const card = document.createElement('div');
        card.className = "bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm cursor-pointer hover:shadow-md transition-shadow";
        card.onclick = () => openModal(pet.id);
        card.innerHTML = `
                    <div class="h-32 bg-cover bg-center" style="background-image: url('${pet.img}')"></div>
                    <div class="p-3">
                        <div class="flex justify-between items-center">
                            <h3 class="font-bold text-gray-800 text-sm truncate">${pet.name}</h3>
                            <span class="text-xs">${sexIcon}</span>
                        </div>
                        <p class="text-xs text-gray-400 truncate mt-0.5">${pet.city}</p>
                    </div>
                `;
        grid.appendChild(card);
    });
}
function renderUserInterests() {

    const list =
        document.getElementById(
            'user-interests-list'
        );

    const empty =
        document.getElementById(
            'no-interests'
        );

    const badge =
        document.getElementById(
            'interest-badge'
        );

    if (!list || !currentUser) return;


    const userInterests =
        adoptionInterests.filter(
            interest =>
                interest.userEmail ===
                currentUser.email
        );


    list.innerHTML = '';


    if (badge) {

        if (userInterests.length > 0) {

            badge.innerText =
                userInterests.length;

            badge.classList.remove(
                'hidden'
            );

            badge.classList.add(
                'flex'
            );

        } else {

            badge.classList.add(
                'hidden'
            );

            badge.classList.remove(
                'flex'
            );

        }

    }


    if (userInterests.length === 0) {

        empty.classList.remove(
            'hidden'
        );

        return;

    }


    empty.classList.add(
        'hidden'
    );


    userInterests.forEach(
        interest => {

            const pet =
                dbDogs.find(
                    p =>
                        p.id ===
                        interest.petId
                );


            const image =
                pet?.img || '';


            const breed =
                pet?.breed ||
                'Animal para adoção';


            const city =
                pet?.city || '';


            const messageCount =
                chatMessages.filter(
                    message =>
                        message.interestId ===
                        interest.id
                ).length;


            const card =
                document.createElement(
                    'div'
                );


            card.className =
                'interest-card bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden';


            card.innerHTML = `

                <div class="flex p-3 gap-3">

                    <img
                        src="${image}"
                        alt="${interest.petName}"
                        class="w-24 h-24 rounded-xl object-cover bg-gray-100 shrink-0">

                    <div class="flex-1 min-w-0">

                        <div class="flex items-start justify-between gap-2">

                            <div>

                                <h3 class="font-bold text-gray-800 text-base">
                                    ${interest.petName}
                                </h3>

                                <p class="text-xs text-gray-500 mt-0.5">
                                    ${breed}
                                </p>

                            </div>

                            <span
                                class="bg-teal-50 text-teal-700 text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap">

                                ${interest.status || 'Em análise'}

                            </span>

                        </div>

                        ${city
                    ? `
                                    <p class="text-xs text-gray-400 mt-2">
                                        <i class="ph-fill ph-map-pin"></i>
                                        ${city}
                                    </p>
                                `
                    : ''
                }

                        <p class="text-[10px] text-gray-400 mt-1">
                            Interesse enviado em ${interest.date || ''}
                        </p>

                    </div>

                </div>


                <div
                    class="px-3 pb-3 flex gap-2">

                    <button
                        onclick="openModal(${interest.petId})"
                        class="flex-1 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold transition-colors">

                        <i class="ph-bold ph-paw-print mr-1"></i>

                        Ver animal

                    </button>


                    <button
                        onclick="openChat(${interest.id})"
                        class="flex-1 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition-colors relative">

                        <i class="ph-bold ph-chat-circle-dots mr-1"></i>

                        Conversar

                        ${messageCount > 0
                    ? `
                                    <span class="ml-1 bg-white/20 px-1.5 py-0.5 rounded-full">
                                        ${messageCount}
                                    </span>
                                `
                    : ''
                }

                    </button>

                </div>

            `;


            list.appendChild(card);

        }
    );

}
async function openChat(interestId) {

    const interest =
        adoptionInterests.find(
            item =>
                item.id === interestId
        );


    if (!interest) {
        alert(
            'Interesse não encontrado.'
        );
        return;
    }


    currentChatInterestId =
        interestId;


    const pet =
        dbDogs.find(
            p =>
                p.id === interest.petId
        );


    document.getElementById(
        'chat-title'
    ).innerText =
        interest.petName;


    document.getElementById(
        'chat-pet-image'
    ).src =
        pet?.img || '';


    const subtitle =
        document.getElementById(
            'chat-subtitle'
        );


    if (
        currentUser &&
        currentUser.role === 'admin'
    ) {

        subtitle.innerText =
            interest.userEmail;

    } else {

        subtitle.innerText =
            'Conversa com a ONG';

    }


    document.getElementById(
        'chat-interest-info'
    ).innerHTML = `

        <i class="ph-fill ph-heart mr-1"></i>

        Interesse em
        <strong>${interest.petName}</strong>

        • ${interest.date || ''}

    `;


    try { await refreshChat(interestId); } catch (e) { reportError(e); return; }
    renderChatMessages();

    const modal =
        document.getElementById(
            'chat-modal'
        );


    modal.classList.remove(
        'hidden'
    );

    modal.classList.add(
        'flex'
    );


    setTimeout(() => {

        document.getElementById(
            'chat-input'
        ).focus();

    }, 100);

}
function closeChat() {

    const modal =
        document.getElementById(
            'chat-modal'
        );


    modal.classList.add(
        'hidden'
    );

    modal.classList.remove(
        'flex'
    );


    currentChatInterestId =
        null;


    document.getElementById(
        'chat-input'
    ).value = '';

}
function renderChatMessages() {

    const container =
        document.getElementById(
            'chat-messages'
        );


    if (!container) return;


    container.innerHTML = '';


    const messages =
        chatMessages
            .filter(
                message =>
                    message.interestId ===
                    currentChatInterestId
            )
            .sort(
                (a, b) =>
                    a.timestamp -
                    b.timestamp
            );


    if (messages.length === 0) {

        container.innerHTML = `

            <div class="text-center py-12">

                <div
                    class="w-14 h-14 bg-teal-50 rounded-full flex items-center justify-center mx-auto mb-3">

                    <i
                        class="ph-fill ph-chat-circle-dots text-2xl text-teal-500">
                    </i>

                </div>

                <p class="text-sm font-semibold text-gray-600">
                    Inicie uma conversa
                </p>

                <p class="text-xs text-gray-400 mt-1">
                    Envie uma mensagem sobre o processo de adoção.
                </p>

            </div>

        `;

        return;

    }


    messages.forEach(
        message => {

            const mine =
                message.senderId ===
                currentUser.id;


            const wrapper =
                document.createElement(
                    'div'
                );


            wrapper.className =
                `chat-message ${mine
                    ? 'mine'
                    : 'other'
                }`;


            wrapper.innerHTML = `

                <div class="chat-bubble">

                    ${!mine
                    ? `
                                <div class="text-[10px] font-bold mb-1 opacity-70">
                                    ${message.senderRole === 'admin'
                        ? 'ONG'
                        : message.sender
                    }
                                </div>
                            `
                    : ''
                }

                    <div>
                        ${escapeHTML(message.message)}
                    </div>

                    <span class="chat-time">
                        ${message.time}
                    </span>

                </div>

            `;


            container.appendChild(
                wrapper
            );

        }
    );


    container.scrollTop =
        container.scrollHeight;

}
function escapeHTML(text) {

    const div =
        document.createElement('div');

    div.textContent = text;

    return div.innerHTML;

}
async function sendChatMessage(event) {
    event.preventDefault(); const input = document.getElementById('chat-input'), value = input.value.trim();
    if (!value || !currentChatInterestId) return;
    try { await backend.chat.send(currentChatInterestId, value); input.value = ''; await refreshChat(currentChatInterestId); renderChatMessages(); }
    catch (e) { reportError(e); }
}

function updateBadge() {
    const badge = document.getElementById('liked-badge');
    if (likedDogs.length > 0) {
        badge.innerText = likedDogs.length;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

// --- MODAL DE DETALHES ---
function openModal(petId) {
    const pet = dbDogs.find(d => d.id === petId);
    if (!pet) return;

    currentModalPetId = pet.id;

    document.getElementById('modal-img').src = pet.img;
    document.getElementById('modal-name').innerText = pet.name;
    document.getElementById('modal-breed').innerText = pet.breed;
    document.getElementById('modal-age').innerHTML = `<i class="ph-fill ph-clock"></i> ${pet.age}`;
    document.getElementById('modal-city').innerHTML = `<i class="ph-fill ph-map-pin"></i> ${pet.city}`;
    document.getElementById('modal-size').innerText = pet.size;
    document.getElementById('modal-castrated').innerText = pet.castrated ? "Castrado" : "Não castrado";
    document.getElementById('modal-medical').innerText = pet.medical || "Saúde ok";
    document.getElementById('modal-past').innerText = pet.past || "Sem detalhes informados.";
    document.getElementById('modal-desc').innerText = pet.desc;

    // Configurar botões com base no tipo de usuário logado
    const userActions = document.getElementById('modal-user-actions');
    const adminActions = document.getElementById('modal-admin-actions');

    if (currentUser && currentUser.role === 'admin') {
        userActions.classList.add('hidden');
        adminActions.classList.remove('hidden');

        document.getElementById('btn-modal-edit').onclick = () => {
            closeModal();
            openPetFormModal(pet.id);
        };
        document.getElementById('btn-modal-delete').onclick = () => {
            deletePet(pet.id);
        };
    } else {
        userActions.classList.remove('hidden');
        adminActions.classList.add('hidden');
    }

    const modal = document.getElementById('pet-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeModal() {
    const modal = document.getElementById('pet-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    currentModalPetId = null;
}

async function fakeAdoptionAction() {
    if (!currentModalPetId || !currentUser) return alert('Faça login e selecione um pet.');
    const pet = dbDogs.find(p => p.id === currentModalPetId); if (!pet) return;
    if (adoptionInterests.some(i => i.petId === pet.id)) return alert('Você já demonstrou interesse neste animal.');
    try {
        await backend.interests.add(pet.id); await refreshData(); renderUserInterests(); closeModal();
        alert('Interesse registrado! A ONG poderá entrar em contato pelo telefone cadastrado.');
    } catch (e) { reportError(e); }
}
async function restoreSession() {
    try {
        const { data, error } = await backend.auth.session();

        if (error) throw error;

        if (data?.session?.user) {
            console.log("Sessão restaurada:", data.session.user.email);

            await enterApp();
        } else {
            console.log("Nenhuma sessão ativa.");

            document.getElementById("view-auth")
                .classList.remove("hidden");
        }

    } catch (error) {
        reportError(error);

        document.getElementById("view-auth")
            .classList.remove("hidden");
    }
}

document.addEventListener('DOMContentLoaded', restoreSession);

// Handlers usados pelos atributos onclick existentes no HTML.
Object.assign(window, { sendChatMessage, reportError, mapInterest, refreshData, refreshChat, enterApp, getLikedDogsKey, loadLikedDogs, saveStorage, ensureInterestIds, calculateAgeString, previewPetAge, setImgSourceMode, handleImageFileSelect, updateImgPreview, toggleAuth, login, register, logout, deleteAccount, switchAdminTab, renderAdminPets, renderAdminInterests, removeInterest, openPetFormModal, closePetFormModal, savePetForm, deletePet, updateFileLabel, saveProfile, openProfileEdit, calculateMatch, enrichPet, initApp, renderCards, setupDragEvents, handleDragStart, handleDragMove, handleDragEnd, swipeCard, toggleFilterMenu, applyFilters, resetApp, switchTab, updateLikedView, renderUserInterests, openChat, closeChat, renderChatMessages, escapeHTML, updateBadge, openModal, closeModal, fakeAdoptionAction, restoreSession });

// Disponibiliza funções para os eventos onclick do HTML

window.toggleAuth = toggleAuth;
window.login = login;
window.register = register;
window.logout = logout;

document.addEventListener("DOMContentLoaded", async () => {
    await restoreSession();
});