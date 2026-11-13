'use client';

/**
 * Alterna tema claro/escuro. O tema atual vive em <html data-theme>, aplicado antes da
 * pintura por THEME_SCRIPT (sem "piscar"); a escolha fica no localStorage deste navegador.
 * Sem escolha salva, segue a preferência do sistema. Os ícones trocam via CSS (globals.css),
 * então o HTML do servidor e o do cliente são idênticos.
 */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const toggle = () => {
    const root = document.documentElement;
    const next = root.dataset.theme === 'light' ? 'dark' : 'light';
    root.dataset.theme = next;
    try {
      localStorage.setItem('theme', next);
    } catch {
      /* navegação privada: vale só para esta página */
    }
  };
  return (
    <button type="button" onClick={toggle} title="Alternar tema claro/escuro" aria-label="Alternar tema claro/escuro"
      className={`flex h-9 w-9 items-center justify-center rounded-md border border-mat-600 text-zinc-300 hover:bg-mat-800 hover:text-zinc-100 ${className}`}>
      <svg className="theme-icon-sun h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
      <svg className="theme-icon-moon h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    </button>
  );
}
