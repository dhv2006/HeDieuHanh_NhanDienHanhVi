const THEME_KEY = 'behaviorlens-theme';

export function initThemeUi() {
  const button = document.getElementById('themeToggle');
  const apply = (theme) => {
    const light = theme === 'light';
    document.documentElement.dataset.theme = light ? 'light' : 'dark';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', light ? '#ffffff' : '#0a1017');
    const label = light ? 'Chuyển sang chế độ tối' : 'Chuyển sang chế độ sáng';
    button?.setAttribute('aria-label', label);
    button?.setAttribute('title', label);
    button?.setAttribute('aria-pressed', String(light));
  };
  apply(document.documentElement.dataset.theme || 'dark');
  button?.addEventListener('click', () => {
    const theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    apply(theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* Private browsing can disable storage. */ }
  });
  window.addEventListener('storage', (event) => {
    if (event.key === THEME_KEY) apply(event.newValue);
  });
}
