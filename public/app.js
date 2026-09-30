const screenContent = document.getElementById('screenContent');
const codeForm = document.getElementById('codeForm');
const codeInput = document.getElementById('codeInput');
const message = document.getElementById('message');
const adminPanel = document.getElementById('adminPanel');
const newCodeForm = document.getElementById('newCodeForm');
const newCode = document.getElementById('newCode');
const newContent = document.getElementById('newContent');
const codeList = document.getElementById('codeList');

let adminToken = null;

function setScreen(text) {
  screenContent.innerHTML = '';
  const p = document.createElement('p');
  p.className = 'prompt';
  p.textContent = text;
  screenContent.appendChild(p);
}

function setMessage(text) {
  message.textContent = text;
}

codeForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = codeInput.value.trim();
  if (!code) return;
  setMessage('checking...');

  try {
    const res = await fetch('/api/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();

    if (!res.ok) {
      setMessage(data.error || 'something went wrong.');
      return;
    }

    if (data.admin) {
      adminToken = data.token;
      setScreen('welcome back.');
      setMessage('admin unlocked.');
      adminPanel.classList.remove('hidden');
      await loadCodes();
    } else if (data.found) {
      setScreen(data.content);
      setMessage('');
    } else {
      setScreen('???');
      setMessage('that code does not exist.');
    }
  } catch (err) {
    setMessage('network error.');
  }

  codeInput.value = '';
});

newCodeForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!adminToken) return;
  const code = newCode.value.trim();
  const content = newContent.value.trim();
  if (!code || !content) return;

  const res = await fetch('/api/admin/codes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ code, content }),
  });
  const data = await res.json();

  if (!res.ok) {
    setMessage(data.error || 'could not create code.');
    return;
  }

  newCode.value = '';
  newContent.value = '';
  await loadCodes();
});

async function loadCodes() {
  if (!adminToken) return;
  const res = await fetch('/api/admin/codes', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  if (!res.ok) return;
  const data = await res.json();

  codeList.innerHTML = '';
  for (const row of data.codes) {
    const li = document.createElement('li');

    const label = document.createElement('span');
    label.innerHTML = `<code>${escapeHtml(row.code)}</code> &rarr; ${escapeHtml(row.content)}`;

    const del = document.createElement('button');
    del.textContent = 'delete';
    del.addEventListener('click', async () => {
      await fetch(`/api/admin/codes/${row.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      await loadCodes();
    });

    li.appendChild(label);
    li.appendChild(del);
    codeList.appendChild(li);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
