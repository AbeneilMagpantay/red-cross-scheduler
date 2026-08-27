import { createElement } from 'react';
import {
    BellRing,
    CalendarDays,
    ChartNoAxesColumnIncreasing,
    History,
    LogIn,
    Megaphone,
    PanelsTopLeft,
    Rocket,
    Smartphone,
    Sparkles,
    UserRoundCheck,
    Wrench
} from 'lucide-react';
import Modal from './Modal';

const fixes = [
    {
        icon: CalendarDays,
        title: 'Mobile calendar visibility',
        description: 'Scheduled duties are now visible in portrait mode, so you no longer need to rotate your phone.'
    },
    {
        icon: ChartNoAxesColumnIncreasing,
        title: 'Organized duty records',
        description: 'Attendance from different time slots of the same event is combined into one organized record.'
    },
    {
        icon: History,
        title: 'Reliable personnel history',
        description: 'Removing access now archives personnel so their names remain visible in past duty records.'
    }
];

const features = [
    {
        icon: UserRoundCheck,
        title: 'Your duty summary',
        description: 'See a personal overview of your attendance, duty status, and logged hours.'
    },
    {
        icon: BellRing,
        title: 'ARC notifications',
        description: 'Turn on notifications in Settings for new deployment duties and council announcements.'
    },
    {
        icon: LogIn,
        title: 'Continue with Google',
        description: 'Sign in more quickly with a Google account that uses the same email as your existing account.'
    },
    {
        icon: Smartphone,
        title: 'A mobile-first experience',
        description: 'Use fixed app navigation, readable record cards, responsive controls, and mobile-friendly dialogs.'
    },
    {
        icon: CalendarDays,
        title: 'Enhanced Schedule',
        description: 'Create and manage duties with a guided workflow, detailed instructions, configurable reminders, flexible teams, and clearer volunteer assignments.'
    },
    {
        icon: PanelsTopLeft,
        title: 'One ARC workspace',
        description: 'Officers and administrators can now open NEXUS resources and CORE deliverables alongside schedules, attendance, and records.'
    },
    {
        icon: Megaphone,
        title: 'Alerts and smarter NEXUS',
        description: 'Read categorized council announcements, receive unread badges, and search NEXUS or switch to its compact resource view.'
    }
];

const sections = [
    {
        id: 'fixes',
        icon: Wrench,
        title: 'Fixes & improvements',
        description: 'Problems addressed in this release.',
        updates: fixes
    },
    {
        id: 'features',
        icon: Rocket,
        title: 'New features',
        description: 'New ways to access information and stay updated.',
        updates: features
    }
];

export default function WhatsNew({ isOpen, onClose }) {
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="What's New" size="lg">
            <div className="whats-new">
                <div className="whats-new-hero">
                    <div className="whats-new-icon" aria-hidden="true">
                        <Sparkles size={25} />
                    </div>
                    <div>
                        <span className="whats-new-version">V3 Update</span>
                        <h3>Everything ACRCY needs, together.</h3>
                        <p>A unified, mobile-friendly workspace for volunteers.</p>
                    </div>
                </div>

                {sections.map((section) => (
                    <section
                        className={`whats-new-section whats-new-section-${section.id}`}
                        key={section.id}
                    >
                        <div className="whats-new-section-heading">
                            <div className="whats-new-section-icon" aria-hidden="true">
                                {createElement(section.icon, { size: 18 })}
                            </div>
                            <div>
                                <h4>{section.title}</h4>
                                <p>{section.description}</p>
                            </div>
                        </div>

                        <div className="whats-new-list">
                            {section.updates.map(({ icon, title, description }) => (
                                <article className="whats-new-item" key={title}>
                                    <div className="whats-new-item-icon" aria-hidden="true">
                                        {createElement(icon, { size: 20 })}
                                    </div>
                                    <div>
                                        <h4>{title}</h4>
                                        <p>{description}</p>
                                    </div>
                                </article>
                            ))}
                        </div>
                    </section>
                ))}

                <div className="whats-new-footer">
                    <p>You can open this anytime from the <strong>What's New</strong> button in the menu.</p>
                    <button type="button" className="btn btn-primary" onClick={onClose}>
                        Got it
                    </button>
                </div>
            </div>
        </Modal>
    );
}
