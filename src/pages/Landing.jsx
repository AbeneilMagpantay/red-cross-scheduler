import { ArrowUpRight, Bell, ClipboardList, ListChecks, QrCode } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import logoNew from '../assets/logo_new.png';

const modules = [
    {
        path: '/alerts',
        label: 'ALERTS',
        eyebrow: 'Operational feed',
        description: 'Deployment updates, urgent notices, training, and council announcements.',
        icon: Bell,
        tone: 'alerts'
    },
    {
        path: '/nexus',
        label: 'NEXUS',
        eyebrow: 'Resource board',
        description: 'Shared QR codes, links, files, and quick-access council resources.',
        icon: QrCode,
        tone: 'nexus'
    },
    {
        path: '/core',
        label: 'CORE',
        eyebrow: 'Deliverables',
        description: 'Committee commitments, progress, deadlines, and officer coordination.',
        icon: ListChecks,
        tone: 'core'
    },
    {
        path: '/tracker',
        label: 'TRACKER',
        eyebrow: 'Volunteer operations',
        description: 'Personnel, schedules, attendance, duty records, and shift swaps.',
        icon: ClipboardList,
        tone: 'tracker'
    }
];

export default function Landing() {
    const { profile } = useAuth();
    const firstName = profile?.name?.trim().split(/\s+/)[0];

    return (
        <div className="arc-landing-page">
            <div className="arc-landing-wash" aria-hidden="true" />
            <section className="arc-landing-shell" aria-labelledby="arc-landing-title">
                <div className="arc-landing-brand" data-tour="landing-brand">
                    <Link to="/" className="arc-landing-logo" aria-label="ARC home">
                        <img src={logoNew} alt="Ateneo de Naga College Red Cross Youth Council" />
                    </Link>
                    <p>Ateneo de Naga College Red Cross Youth Council</p>
                    <span aria-hidden="true" />
                </div>

                <div className="arc-landing-copy">
                    <span className="arc-landing-kicker">Always first • Always ready • Always there</span>
                    <h1 id="arc-landing-title">Welcome{firstName ? `, ${firstName}` : ''}.</h1>
                    <p>Your central space for council operations, shared deliverables, volunteer coordination, and the resources that help us serve with purpose.</p>
                </div>

                <nav className="arc-landing-actions" aria-label="ARC destinations" data-tour="landing-modules">
                    {modules.map((module) => {
                        const Icon = module.icon;
                        return (
                            <Link key={module.path} to={module.path} className={`arc-landing-action ${module.tone}`}>
                                <span className="arc-landing-action-icon"><Icon size={23} /></span>
                                <span className="arc-landing-action-copy">
                                    <small>{module.eyebrow}</small>
                                    <strong>{module.label}</strong>
                                    <em>{module.description}</em>
                                </span>
                                <ArrowUpRight className="arc-landing-arrow" size={20} />
                            </Link>
                        );
                    })}
                </nav>
            </section>
        </div>
    );
}
