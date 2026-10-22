import { Bold, Italic, List, ListOrdered, Strikethrough, Underline } from 'lucide-react';

const TOOLS = {
    bold: { label: 'Bold', icon: <Bold size={16} />, command: 'bold' },
    italic: { label: 'Italic', icon: <Italic size={16} />, command: 'italic' },
    underline: { label: 'Underline', icon: <Underline size={16} />, command: 'underline' },
    strikethrough: { label: 'Strikethrough', icon: <Strikethrough size={16} />, command: 'strikeThrough' },
    orderedList: { label: 'Numbered list', icon: <ListOrdered size={16} />, command: 'insertOrderedList' },
    bulletList: { label: 'Bulleted list', icon: <List size={16} />, command: 'insertUnorderedList' },
    h2: { label: 'Heading 2', icon: 'H2', command: 'formatBlock', value: '<h2>' },
    h3: { label: 'Heading 3', icon: 'H3', command: 'formatBlock', value: '<h3>' }
};

export default function FormatToolbar({ tools, label, className = '', onBeforeFormat, children }) {
    return (
        <div className={`arc-format-toolbar ${className}`.trim()} aria-label={label}>
            {children}
            {tools.map((name) => {
                const tool = TOOLS[name];
                return (
                    <button
                        key={name}
                        type="button"
                        aria-label={tool.label}
                        onMouseDown={(event) => {
                            // Keep focus (and the selection) in the editor.
                            event.preventDefault();
                            onBeforeFormat?.();
                            document.execCommand(tool.command, false, tool.value);
                        }}
                    >
                        {tool.icon}
                    </button>
                );
            })}
        </div>
    );
}
