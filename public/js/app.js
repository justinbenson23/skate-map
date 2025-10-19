// ===== CONFIG =====
const mapWidth  = 4824;
const mapHeight = 2952;

// ===== AUTH STATE =====
let isLoggedIn   = false;
let currentUser  = null;

// ===== DOM ELEMENTS =====
const viewer        = document.getElementById('viewer');
const mapImage      = document.getElementById('mapImage');
const btnLogin      = document.getElementById('btn‑login');
const btnSignup     = document.getElementById('btn‑signup');
const btnLogout     = document.getElementById('btn‑logout');
const loggedInText  = document.getElementById('logged‑in‑text');
const btnDiscord    = document.getElementById('btn‑discord');

const pinForm       = document.getElementById('pin‑form');
const pinTitleEl    = document.getElementById('pin‑title');
const pinDescEl     = document.getElementById('pin‑description');
const pinMediaType  = document.getElementById('pin‑mediaType');
const pinUploadEl   = document.getElementById('pin‑mediaUpload');
const pinSubmit     = document.getElementById('pin‑submit');
const pinCancel     = document.getElementById('pin‑cancel');

const pinsListEl    = document.getElementById('pins‑list');

// ===== PAN & ZOOM SETUP using panzoom library :contentReference[oaicite:0]{index=0}
const panzoomInstance = Panzoom(viewer, {
  maxScale: 4,
  minScale: 0.5,
  contain: 'invert'
});
viewer.parentElement.addEventListener('wheel', panzoomInstance.zoomWithWheel);

// ===== PIN DATA & RENDERING =====
let pins = [];

// Fetch pins from backend
async function loadPins() {
  const res = await fetch('/api/pins');
  pins      = await res.json();
  renderPins();
}

function renderPins() {
  // remove existing pins
  document.querySelectorAll('.pin').forEach(el => el.remove());

  pins.forEach(pin => {
    const el = document.createElement('div');
    el.className     = 'pin';
    el.title         = pin.title;
    el.style.left    = (pin.x_pct * mapWidth) + 'px';
    el.style.top     = (pin.y_pct * mapHeight) + 'px';
    el.addEventListener('click', () => {
      window.open(pin.mediaUrl, '_blank');
    });
    viewer.appendChild(el);
  });
}

// ===== ADD PIN FLOW =====
viewer.addEventListener('dblclick', (e) => {
  if (!isLoggedIn) {
    alert('Please log in to add a pin');
    return;
  }
  const rect = viewer.getBoundingClientRect();
  const xPct = (e.clientX - rect.left    ) / rect.width;
  const yPct = (e.clientY - rect.top     ) / rect.height;

  // Store relative coords
  pinForm.style.display = 'flex';
  pinSubmit.onclick    = async () => {
    const payload = {
      title       : pinTitleEl.value,
      description : pinDescEl.value,
      x_pct       : xPct,
      y_pct       : yPct,
      mediaType   : pinMediaType.value
    };
    const mediaFile = pinUploadEl.files[0];
    const form    = new FormData();
    form.append('payload', JSON.stringify(payload));
    form.append('file',    mediaFile);

    const res = await fetch('/api/pins', {
      method : 'POST',
      body   : form
    });
    const data = await res.json();
    pinForm.style.display = 'none';
    loadPins();
  };

  pinCancel.onclick = () => {
    pinForm.style.display = 'none';
  };
});

// ===== AUTH UI CALL‑BACKS =====
btnLogin.onclick  = () => { /* show login UI, not shown here for brevity */ };
btnSignup.onclick = () => { /* show signup UI, not shown here for brevity */ };
btnLogout.onclick = async () => {
  await fetch('/api/logout', { method: 'POST' });
  isLoggedIn  = false;
  currentUser = null;
  updateAuthUI();
};

function updateAuthUI() {
  if (isLoggedIn) {
    loggedInText.innerText     = `Logged in as ${currentUser.username}`;
    btnLogin.style.display     = 'none';
    btnSignup.style.display    = 'none';
    btnLogout.style.display    = '';
  } else {
    loggedInText.innerText     = 'Logged out';
    btnLogin.style.display     = '';
    btnSignup.style.display    = '';
    btnLogout.style.display    = 'none';
  }
}

async function checkAuth() {
  const res = await fetch('/api/me');
  if (res.ok) {
    currentUser = await res.json();
    isLoggedIn  = true;
  } else {
    isLoggedIn  = false;
    currentUser = null;
  }
  updateAuthUI();
}

// ===== INIT =====
(async () => {
  await checkAuth();
  await loadPins();
})();
