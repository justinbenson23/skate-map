const mapImage = document.getElementById('mapImage');
const pinForm = document.getElementById('pin-form');
const pinTitle = document.getElementById('pin-title');
const pinDescription = document.getElementById('pin-description');
const pinMediaInput = document.getElementById('pinMedia');
const pinSubmit = document.getElementById('pin-submit');
const pinCancel = document.getElementById('pin-cancel');

let clickCoords = null;

// Click on map to open form
mapImage.addEventListener('click', (e) => {
  const rect = mapImage.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const x_pct = x / mapImage.offsetWidth;
  const y_pct = y / mapImage.offsetHeight;

  clickCoords = { x_pct, y_pct };

  pinForm.style.left = e.pageX + 'px';
  pinForm.style.top = e.pageY + 'px';
  pinForm.style.display = 'block';
});

// Cancel form
pinCancel.addEventListener('click', () => {
  pinForm.style.display = 'none';
});

// Validate video upload
pinMediaInput.addEventListener('change', () => {
  const file = pinMediaInput.files[0];

  if (!file) return;

  if (!file.type.startsWith('video/') || file.type !== 'video/mp4') {
    alert('Only MP4 video files are allowed.');
    pinMediaInput.value = '';
    return;
  }

  if (file.size > 25 * 1024 * 1024) {
    alert('Video must be less than 25MB.');
    pinMediaInput.value = '';
  }
});

// Submit pin
pinSubmit.addEventListener('click', async () => {
  const title = pinTitle.value.trim();
  const description = pinDescription.value.trim();
  const file = pinMediaInput.files[0];

  if (!title || !description || !clickCoords || !file) {
    return alert('All fields and a video file are required.');
  }

  const formData = new FormData();
  formData.append('title', title);
  formData.append('description', description);
  formData.append('x_pct', clickCoords.x_pct);
  formData.append('y_pct', clickCoords.y_pct);
  formData.append('video', file);

  try {
    await fetch('/api/pins-with-media', {
      method: 'POST',
      body: formData
    });

    pinForm.style.display = 'none';
    pinTitle.value = '';
    pinDescription.value = '';
    pinMediaInput.value = '';
    loadPins();
  } catch (err) {
    console.error('Upload failed', err);
    alert('Error submitting pin');
  }
});

// Load pins and avoid overlaps
async function loadPins() {
  const res = await fetch('/api/pins');
  const pins = await res.json();

  document.querySelectorAll('.pin').forEach(p => p.remove());

  const placed = [];
  const buffer = 1.5;

  pins.forEach(pin => {
    let x = pin.x_pct * 100;
    let y = pin.y_pct * 100;
    let attempts = 0;

    while (attempts < 10 && placed.some(p => Math.abs(p.x - x) < buffer && Math.abs(p.y - y) < buffer)) {
      x += (Math.random() - 0.5) * buffer;
      y += (Math.random() - 0.5) * buffer;
      attempts++;
    }

    placed.push({ x, y });

    const pinEl = document.createElement('div');
    pinEl.className = 'pin';
    pinEl.style.left = `${x}%`;
    pinEl.style.top = `${y}%`;
    pinEl.title = pin.title;

    pinEl.addEventListener('click', () => {
      const popup = document.createElement('div');
      popup.className = 'popup-gallery';

      let mediaHTML = '';
      if (Array.isArray(pin.media) && pin.media.length > 0) {
        pin.media.forEach(media => {
          if (media.type === 'video') {
            mediaHTML += `<video src="${media.url}" controls style="max-width: 100%; margin-top: 10px;"></video>`;
          }
        });
      } else {
        mediaHTML = '<p>No media available.</p>';
      }

      popup.innerHTML = `
        <h3>${pin.title}</h3>
        <p>${pin.description}</p>
        ${mediaHTML}
        <br>
        <button id="report-pin-btn">🚩 Report Inappropriate</button>
        <button id="close-pin-btn">Close</button>
      `;

      document.body.appendChild(popup);

      document.getElementById('report-pin-btn').onclick = async () => {
        await fetch(`/api/pin/${pin._id}/report`, { method: 'POST' });
        alert('Thanks for reporting. This pin will be reviewed.');
        popup.remove();
        loadPins();
      };

      document.getElementById('close-pin-btn').onclick = () => popup.remove();
    });

    document.getElementById('viewer').appendChild(pinEl);
  });
}

loadPins();
