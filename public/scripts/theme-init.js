try {
  var t = localStorage.getItem('theme') || 'system';
  if (t === 'system') {
    t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-theme', t);
} catch {}
