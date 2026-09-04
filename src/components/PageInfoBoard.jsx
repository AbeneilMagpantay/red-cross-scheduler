import { useState } from 'react';
import { HelpCircle, Info, Sparkles } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import Modal from './Modal';
import { getPageInfo } from '../lib/appExperience';

export default function PageInfoBoard() {
    const { pathname } = useLocation();
    const [isOpen, setIsOpen] = useState(false);
    const page = getPageInfo(pathname);

    return (
        <>
            <button
                type="button"
                className="page-infoboard-trigger"
                onClick={() => setIsOpen(true)}
                aria-label={`About ${page.label}`}
                title={`About ${page.label}`}
                data-tour="page-info"
            >
                <HelpCircle size={21} />
                <span>Page info</span>
            </button>

            <Modal
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
                title={page.title}
                size="md"
                className="page-infoboard-modal"
            >
                <div className="page-infoboard">
                    <div className="page-infoboard-heading">
                        <span><Info size={22} /></span>
                        <div>
                            <small>{page.label}</small>
                            <p>{page.description}</p>
                        </div>
                    </div>
                    <ul>
                        {page.items.map((item) => (
                            <li key={item}><Sparkles size={16} /> <span>{item}</span></li>
                        ))}
                    </ul>
                    <button type="button" className="btn btn-primary" onClick={() => setIsOpen(false)}>Got it</button>
                </div>
            </Modal>
        </>
    );
}
