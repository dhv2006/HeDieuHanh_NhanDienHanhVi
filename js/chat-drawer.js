// Presentation only: desktop companion pane, mobile overlay, both slide from the right.
let returnFocus = null;
let drawerInitialized = false;
const mobileDrawerQuery = window.matchMedia('(max-width: 720px), (max-width: 960px) and (hover: none) and (pointer: coarse)');

function syncDrawerPresentation() {
  const chat = document.getElementById('chat');
  if (!chat) return;
  const open = !chat.classList.contains('is-collapsed');
  const modal = open && mobileDrawerQuery.matches;
  const app = document.querySelector('.app');
  if (modal && app?.contains(document.activeElement)) document.getElementById('chatToggle')?.focus({ preventScroll: true });
  if (app) app.inert = modal;
  document.body.classList.toggle('is-chat-modal', modal);
  chat.setAttribute('role', mobileDrawerQuery.matches ? 'dialog' : 'complementary');
  if (mobileDrawerQuery.matches) chat.setAttribute('aria-modal', 'true');
  else chat.removeAttribute('aria-modal');
}

export function setChatHidden(hidden) {
  const chat = document.getElementById('chat');
  if (!chat) return;
  const closed = typeof hidden === 'boolean' ? hidden : !chat.classList.contains('is-collapsed');
  const wasClosed = chat.classList.contains('is-collapsed');
  if (!closed && wasClosed) returnFocus = document.activeElement;

  if (closed && chat.contains(document.activeElement)) document.activeElement.blur();
  chat.classList.toggle('is-collapsed', closed);
  chat.setAttribute('aria-hidden', String(closed));
  chat.inert = closed;
  document.body.classList.toggle('is-chat-open', !closed);
  if (!closed) document.querySelector('.app')?.classList.remove('is-sidebar-open');
  syncDrawerPresentation();
  document.getElementById('chatFabBtn')?.setAttribute('aria-expanded', String(!closed));

  if (!closed) {
    // Focus the close button so opening the drawer does not summon the keyboard.
    document.getElementById('chatToggle')?.focus({ preventScroll: true });
  } else if (!wasClosed) {
    const target = returnFocus?.isConnected && !returnFocus.closest('[hidden]')
      ? returnFocus : document.getElementById('chatFabBtn');
    target?.focus({ preventScroll: true });
  }
}

export function initChatDrawer() {
  if (drawerInitialized) return;
  drawerInitialized = true;
  setChatHidden(true);
  mobileDrawerQuery.addEventListener('change', syncDrawerPresentation);
  document.getElementById('chatToggle')?.addEventListener('click', () => setChatHidden(true));
  document.getElementById('chatFabBtn')?.addEventListener('click', () => setChatHidden());
  document.getElementById('chatBackdrop')?.addEventListener('click', () => {
    if (mobileDrawerQuery.matches) setChatHidden(true);
  });
  document.addEventListener('keydown', (event) => {
    if (!document.body.classList.contains('is-chat-open')) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      setChatHidden(true);
    } else if (event.key === 'Tab' && document.body.classList.contains('is-chat-modal')) {
      const elements = [...document.getElementById('chat').querySelectorAll(
        'button:not(:disabled), textarea:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex="0"]'
      )].filter((element) => element.getClientRects().length && !element.closest('[hidden]'));
      const first = elements[0];
      const last = elements[elements.length - 1];
      if ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
      }
    }
  });
}
