/** Roda no <head> antes da pintura: escolha salva ou, sem ela, a preferência do sistema. */
export const THEME_SCRIPT = `(function(){var t;try{t=localStorage.getItem('theme')}catch(e){}if(t!=='light'&&t!=='dark')t=window.matchMedia&&matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';document.documentElement.dataset.theme=t})()`;
