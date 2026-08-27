try {
    document.documentElement.dataset.theme = localStorage.getItem('arc-theme') === 'dark' ? 'dark' : 'light';
} catch {
    document.documentElement.dataset.theme = 'light';
}
