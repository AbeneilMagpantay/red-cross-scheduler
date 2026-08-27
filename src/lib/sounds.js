const SOUND_KEY = 'arc_sound_enabled';
let audioContext = null;
let masterBus = null;

const getAudioContext = () => {
    if (typeof window === 'undefined') return null;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;

    if (!audioContext) {
        audioContext = new AudioContextClass();
        masterBus = audioContext.createGain();
        masterBus.gain.value = 1;
        const compressor = audioContext.createDynamicsCompressor();
        compressor.threshold.value = -22;
        compressor.ratio.value = 6;
        masterBus.connect(compressor);
        compressor.connect(audioContext.destination);
    }
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    return audioContext;
};

export const isArcSoundEnabled = () => {
    try {
        return localStorage.getItem(SOUND_KEY) !== 'false';
    } catch {
        return true;
    }
};

export const setArcSoundEnabled = (enabled) => {
    try {
        localStorage.setItem(SOUND_KEY, String(Boolean(enabled)));
    } catch {
        // The in-memory preference still takes effect for the current click.
    }
    return Boolean(enabled);
};

export const playArcTap = () => {
    if (!isArcSoundEnabled() || typeof window === 'undefined') return;

    try {
        const context = getAudioContext();
        if (!context) return;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(420, context.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(90, context.currentTime + 0.04);
        gain.gain.setValueAtTime(0.04, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.045);
        oscillator.connect(gain);
        gain.connect(masterBus || context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + 0.05);
    } catch {
        // Sound is a non-essential enhancement; unsupported devices stay silent.
    }
};
