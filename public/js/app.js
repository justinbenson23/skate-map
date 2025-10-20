const mapImage = document.getElementById('mapImage');
const pinForm = document.getElementById('pin-form');
const pinTitle = document.getElementById('pin-title');
const pinDescription = document.getElementById('pin-description');
const pinSubmit = document.getElementById('pin-submit');
const pinCancel = document.getElementById('pin-cancel');
const pinsListEl = document.getElementById('pins-list');

let clickCoords = null;

// Handle click on map image
mapImage.addEventListener('click', (e) => {
  const rect = mapImage.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const x_pct = x / mapImage.offsetWidth;
  const y_pct = y / mapImage.offsetHeight;

  clickCoords = { x_pct, y_pct };

  pinForm.style.display = 'block';
});

// Cancel pin
pinCancel.addEventListener('click', () => {
  pinForm.style.display = 'none';
});

// Submit pin
pinSubmit.addEventListener('click', async () => {
  const title = pinTitle.value.trim();
  const description = pinDescription.value.trim();
  const fileInput = document.createElement('input');
  fileInput.type = 'file';

  fileInput.accept = 'image/*,video/*';
  fileInput.onchange = async () => {
    const file = fileInput.files[0];
    if (!file || !title || !description || !clickCoords) return alert('All fields are required.');

    const formData = new FormData();
    formData.append('title', title);
    formData.append('description', description);
    formData.append('x_pct', clickCoords.x_pct);
    formData.append('y_pct', clickCoords.y_pct);
    formData.append('media', file);

    try {
      await fetch('/api/pins-with-media', {
        method: 'POST',
        body: formData
      });
      pinForm.style.display = 'none';
      pinTitle.value = '';
      pinDescription.value = '';
      loadPins();
    } catch (err) {
      console.error('Upload failed', err);
      alert('Error submitting pin');
    }
  };

  fileInput.click();
});

// Load and render pins
async function loadPins() {
  const res = await fetch('/api/pins');
  const pins = await res.json();

  document.querySelectorAll('.pin').forEach(p => p.remove());
  pinsListEl.innerHTML = '';

  pins.forEach(pin => {
    const pinEl = document.createElement('div');
    pinEl.className = 'pin';
    pinEl.style.left = (pin.x_pct * mapImage.offsetWidth) + 'px';
    pinEl.style.top = (pin.y_pct * mapImage.offsetHeight) + 'px';

    pinEl.addEventListener('click', () => {
      const mediaHTML = pin.mediaType === 'image'
      ? `<img src="${pin.mediaUrl}" alt="media" width="200">`
      : `<video src="${pin.mediaUrl}" width="200" controls></video>`;

      const popup = document.createElement('div');
      popup.style.position = 'fixed';
      popup.style.top = '50%';
      popup.style.left = '50%';
      popup.style.transform = 'translate(-50%, -50%)';
      popup.style.background = '#fff';
      popup.style.padding = '16px';
      popup.style.border = '1px solid #ccc';
      popup.style.zIndex = 9999;

      popup.innerHTML = `
        <h3>${pin.title}</h3>
        <p>${pin.description}</p>
        ${mediaHTML}<br><br>
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

    const li = document.createElement('li');
    li.textContent = `${pin.title}: ${pin.description}`;
    pinsListEl.appendChild(li);
  });
}

loadPins();
