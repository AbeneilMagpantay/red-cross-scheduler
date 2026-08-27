export const ARC_THEME_KEY = 'arc-theme';

export const getArcTheme = () => {
    if (typeof document === 'undefined') return 'light';
    return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
};

export const setArcTheme = (theme) => {
    const nextTheme = theme === 'dark' ? 'dark' : 'light';
    if (typeof document !== 'undefined') document.documentElement.dataset.theme = nextTheme;
    try {
        globalThis.localStorage?.setItem(ARC_THEME_KEY, nextTheme);
    } catch {
        // The theme still applies for this visit when storage is unavailable.
    }
    return nextTheme;
};

