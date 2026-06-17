declare module 'react-speech-recognition' {
    export interface SpeechRecognition {
        startListening: (options?: { continuous?: boolean; language?: string }) => void;
        stopListening: () => void;
        abortListening: () => void;
        browserSupportsSpeechRecognition: () => boolean;
    }

    export function useSpeechRecognition(): {
        transcript: string;
        finalTranscript: string;
        interimTranscript: string;
        listening: boolean;
        resetTranscript: () => void;
        browserSupportsSpeechRecognition: boolean;
    };

    const SpeechRecognition: SpeechRecognition;
    export default SpeechRecognition;
}