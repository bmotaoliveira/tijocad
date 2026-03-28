// ── Native modal (replaces browser alert/confirm) ─────────────────────────

const overlay = () => document.getElementById('app-modal-overlay');
const msgEl   = () => document.getElementById('app-modal-msg');
const btnsEl  = () => document.getElementById('app-modal-btns');

export function openModal(msg, buttons) {
  msgEl().textContent = msg;
  btnsEl().innerHTML = '';
  buttons.forEach(({label, cls, cb}) => {
    const b = document.createElement('button');
    b.textContent = label;
    if(cls) b.className = cls;
    b.addEventListener('click', () => { closeModal(); if(cb) cb(); });
    btnsEl().appendChild(b);
  });
  overlay().classList.add('visible');
  btnsEl().firstChild && btnsEl().firstChild.focus();
}

export function closeModal() {
  overlay().classList.remove('visible');
}

// Close with Escape
document.addEventListener('keydown', e => {
  if(e.key === 'Escape' && overlay().classList.contains('visible')) closeModal();
});
