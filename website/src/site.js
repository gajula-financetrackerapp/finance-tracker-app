const toggle = document.querySelector('[data-menu-toggle]');
const nav = document.querySelector('[data-nav]');

toggle?.addEventListener('click', () => {
  const open = nav?.classList.toggle('open') ?? false;
  toggle.setAttribute('aria-expanded', String(open));
});

document.addEventListener('click', (event) => {
  const details = document.querySelector('.legal-menu[open]');
  if (details && !details.contains(event.target)) details.removeAttribute('open');
});

const form = document.querySelector('[data-contact-form]');

form?.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;

  const data = new FormData(form);
  const name = String(data.get('name') || '').trim();
  const email = String(data.get('email') || '').trim();
  const phone = String(data.get('phone') || '').trim() || 'Not provided';
  const subject = String(data.get('subject') || 'General feedback').trim();
  const message = String(data.get('message') || '').trim();

  const body = [
    'MoneyLit website feedback',
    '',
    `Name: ${name}`,
    `Email: ${email}`,
    `Phone: ${phone}`,
    `Topic: ${subject}`,
    '',
    'Message:',
    message,
  ].join('\n');

  const mailto =
    'mailto:gajulaallinonefinancetracker@gmail.com' +
    `?subject=${encodeURIComponent(`MoneyLit: ${subject}`)}` +
    `&body=${encodeURIComponent(body)}`;

  window.location.href = mailto;
});
