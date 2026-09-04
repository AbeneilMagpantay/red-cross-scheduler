import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Compass, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getWalkthroughSteps } from '../lib/appExperience';

const VIEWPORT_MARGIN = 12;
const SPOTLIGHT_PADDING = 8;
const TOOLTIP_GAP = 18;

const findVisibleTarget = (selectors) => {
    const candidates = String(selectors || '')
        .split(',')
        .flatMap((selector) => [...document.querySelectorAll(selector.trim())]);

    return candidates.find((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0
            && rect.height > 0
            && rect.bottom > 0
            && rect.right > 0
            && rect.top < window.innerHeight
            && rect.left < window.innerWidth
            && style.display !== 'none'
            && style.visibility !== 'hidden';
    }) || null;
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));

export default function AppGuide({ isOpen, onClose }) {
    const { isAdmin } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const steps = useMemo(() => getWalkthroughSteps({ isAdmin }), [isAdmin]);
    const startingStep = useMemo(() => {
        const index = steps.findIndex((item) => item.path === location.pathname);
        return index >= 0 ? index : 0;
    }, [location.pathname, steps]);
    const [stepIndex, setStepIndex] = useState(startingStep);
    const [spotlight, setSpotlight] = useState(null);
    const [tooltipPosition, setTooltipPosition] = useState({ left: VIEWPORT_MARGIN, top: VIEWPORT_MARGIN });
    const [confirmExit, setConfirmExit] = useState(false);
    const tooltipRef = useRef(null);
    const step = steps[stepIndex] || steps[0];

    useEffect(() => {
        if (isOpen && location.pathname !== step.path) navigate(step.path);
    }, [isOpen, location.pathname, navigate, step.path]);

    const measure = useCallback(() => {
        if (!isOpen || location.pathname !== step.path) return;

        const target = findVisibleTarget(step.target) || document.querySelector('.main-content');
        if (!target) return;

        const rect = target.getBoundingClientRect();
        const spotlightLeft = Math.max(4, rect.left - SPOTLIGHT_PADDING);
        const spotlightTop = Math.max(4, rect.top - SPOTLIGHT_PADDING);
        const spotlightRight = Math.min(window.innerWidth - 4, rect.right + SPOTLIGHT_PADDING);
        const spotlightBottom = Math.min(window.innerHeight - 4, rect.bottom + SPOTLIGHT_PADDING);
        const nextSpotlight = {
            left: spotlightLeft,
            top: spotlightTop,
            width: Math.max(8, spotlightRight - spotlightLeft),
            height: Math.max(8, spotlightBottom - spotlightTop)
        };
        setSpotlight(nextSpotlight);

        const tooltipRect = tooltipRef.current?.getBoundingClientRect();
        const tooltipWidth = tooltipRect?.width || Math.min(370, window.innerWidth - VIEWPORT_MARGIN * 2);
        const tooltipHeight = tooltipRect?.height || 230;
        const placements = {
            top: {
                left: rect.left + (rect.width - tooltipWidth) / 2,
                top: rect.top - tooltipHeight - TOOLTIP_GAP
            },
            bottom: {
                left: rect.left + (rect.width - tooltipWidth) / 2,
                top: rect.bottom + TOOLTIP_GAP
            },
            left: {
                left: rect.left - tooltipWidth - TOOLTIP_GAP,
                top: rect.top + (rect.height - tooltipHeight) / 2
            },
            right: {
                left: rect.right + TOOLTIP_GAP,
                top: rect.top + (rect.height - tooltipHeight) / 2
            }
        };
        const preferred = placements[step.placement] || placements.bottom;
        const preferredFits = preferred.left >= VIEWPORT_MARGIN
            && preferred.top >= VIEWPORT_MARGIN
            && preferred.left + tooltipWidth <= window.innerWidth - VIEWPORT_MARGIN
            && preferred.top + tooltipHeight <= window.innerHeight - VIEWPORT_MARGIN;
        const fallback = rect.bottom + TOOLTIP_GAP + tooltipHeight <= window.innerHeight
            ? placements.bottom
            : placements.top;
        const position = preferredFits ? preferred : fallback;

        setTooltipPosition({
            left: clamp(position.left, VIEWPORT_MARGIN, window.innerWidth - tooltipWidth - VIEWPORT_MARGIN),
            top: clamp(position.top, VIEWPORT_MARGIN, window.innerHeight - tooltipHeight - VIEWPORT_MARGIN)
        });
    }, [isOpen, location.pathname, step.path, step.placement, step.target]);

    useLayoutEffect(() => {
        if (!isOpen || location.pathname !== step.path) return undefined;

        const target = findVisibleTarget(step.target);
        target?.scrollIntoView?.({
            behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
            block: 'center',
            inline: 'nearest'
        });

        const timers = [40, 260, 700].map((delay) => window.setTimeout(measure, delay));
        const handleViewportChange = () => window.requestAnimationFrame(measure);
        window.addEventListener('resize', handleViewportChange);
        window.addEventListener('scroll', handleViewportChange, true);

        return () => {
            timers.forEach(window.clearTimeout);
            window.removeEventListener('resize', handleViewportChange);
            window.removeEventListener('scroll', handleViewportChange, true);
        };
    }, [isOpen, location.pathname, measure, step.path, step.target]);

    useEffect(() => {
        if (!isOpen) return undefined;
        document.body.classList.add('walkthrough-active');
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') setConfirmExit(true);
            if (event.key === 'ArrowRight' && !confirmExit) setStepIndex((index) => Math.min(steps.length - 1, index + 1));
            if (event.key === 'ArrowLeft' && !confirmExit) setStepIndex((index) => Math.max(0, index - 1));
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            document.body.classList.remove('walkthrough-active');
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [confirmExit, isOpen, steps.length]);

    if (!isOpen) return null;

    const finish = () => {
        setConfirmExit(false);
        onClose();
    };

    return (
        <div className="tour-overlay" aria-live="polite">
            <button type="button" className="tour-screen-blocker" onClick={() => setConfirmExit(true)} aria-label="Pause walkthrough" />
            {spotlight && <div className="tour-spotlight" style={spotlight} aria-hidden="true" />}
            <section
                ref={tooltipRef}
                className="tour-tooltip"
                style={tooltipPosition}
                role="dialog"
                aria-modal="true"
                aria-labelledby="walkthrough-title"
            >
                {!confirmExit ? (
                    <>
                        <div className="tour-tooltip-topline">
                            <span className="tour-step-chip"><Compass size={14} /> Step {stepIndex + 1} of {steps.length}</span>
                            <button type="button" className="tour-icon-button" onClick={() => setConfirmExit(true)} aria-label="Exit walkthrough"><X size={18} /></button>
                        </div>
                        <h2 id="walkthrough-title">{step.title}</h2>
                        <p>{step.text}</p>
                        <div className="tour-actions">
                            <button type="button" className="btn btn-ghost" onClick={() => setStepIndex((index) => Math.max(0, index - 1))} disabled={stepIndex === 0}>
                                <ArrowLeft size={16} /> Back
                            </button>
                            {stepIndex < steps.length - 1 ? (
                                <button type="button" className="btn btn-primary" onClick={() => setStepIndex((index) => index + 1)}>
                                    Next <ArrowRight size={16} />
                                </button>
                            ) : (
                                <button type="button" className="btn btn-primary" onClick={finish}>
                                    Finish <Check size={16} />
                                </button>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="tour-exit-confirmation">
                        <span className="tour-exit-icon"><Compass size={22} /></span>
                        <h2 id="walkthrough-title">Exit walkthrough?</h2>
                        <p>You can restart it anytime from the Walkthrough button in the sidebar.</p>
                        <div className="tour-actions">
                            <button type="button" className="btn btn-secondary" onClick={() => setConfirmExit(false)}>Keep going</button>
                            <button type="button" className="btn btn-danger" onClick={finish}>Exit tour</button>
                        </div>
                    </div>
                )}
            </section>
        </div>
    );
}
