import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Compass, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Modal from './Modal';
import { useAuth } from '../context/AuthContext';

export default function AppGuide({ isOpen, onClose }) {
    const { canAccessArc } = useAuth();
    const navigate = useNavigate();
    const [stepIndex, setStepIndex] = useState(0);
    const steps = useMemo(() => [
        {
            title: 'Your ARC dashboard',
            path: '/',
            body: 'Start here for duty totals, upcoming deployments, and shortcuts to the modules available to your role.'
        },
        {
            title: 'Plan and join duties',
            path: '/schedule',
            body: 'Use Schedule to view duties, register your time, read reminders, and check your team assignment.'
        },
        {
            title: 'Review your service',
            path: '/records',
            body: 'Duty Records combines shifts from the same event and includes your personal attendance summary.'
        },
        {
            title: 'Keep up with Alerts',
            path: '/alerts',
            body: 'Alerts contains urgent information, deployment updates, training notices, and general announcements.'
        },
        ...(canAccessArc ? [
            {
                title: 'Find resources in NEXUS',
                path: '/nexus',
                body: 'Search QR resources, switch between grid and compact views, copy links, and maintain the shared resource board.'
            },
            {
                title: 'Track officer work in CORE',
                path: '/core',
                body: 'CORE is the shared monthly deliverables sheet for Officers and Administrators.'
            }
        ] : [])
    ], [canAccessArc]);

    const step = steps[stepIndex] || steps[0];

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="ARC walkthrough" size="md" className="app-guide-modal">
            <div className="app-guide">
                <div className="app-guide-progress" aria-label={`Step ${stepIndex + 1} of ${steps.length}`}>
                    {steps.map((item, index) => <span key={item.path} className={index <= stepIndex ? 'is-active' : ''} />)}
                </div>
                <span className="app-guide-icon"><Compass size={28} /></span>
                <small>Step {stepIndex + 1} of {steps.length}</small>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
                <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                        navigate(step.path);
                        onClose();
                    }}
                >
                    <ExternalLink size={16} /> Open this module
                </button>
                <div className="app-guide-actions">
                    <button type="button" className="btn btn-ghost" onClick={() => setStepIndex((index) => Math.max(0, index - 1))} disabled={stepIndex === 0}><ArrowLeft size={16} /> Previous</button>
                    {stepIndex < steps.length - 1
                        ? <button type="button" className="btn btn-primary" onClick={() => setStepIndex((index) => index + 1)}>Next <ArrowRight size={16} /></button>
                        : <button type="button" className="btn btn-primary" onClick={onClose}>Finish</button>}
                </div>
            </div>
        </Modal>
    );
}
