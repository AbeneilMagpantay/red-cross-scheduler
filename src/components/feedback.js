import { createContext, useContext } from 'react';

export const FeedbackContext = createContext(null);

const useFeedback = () => {
    const feedback = useContext(FeedbackContext);
    if (!feedback) throw new Error('Wrap the app in <FeedbackProvider> to use dialogs and toasts.');
    return feedback;
};

// const confirm = useConfirm(); if (await confirm({ title, message, confirmLabel, tone: 'danger' })) { ... }
export const useConfirm = () => useFeedback().confirm;

// const toast = useToast(); toast.error('Could not save.');
export const useToast = () => useFeedback().toast;
