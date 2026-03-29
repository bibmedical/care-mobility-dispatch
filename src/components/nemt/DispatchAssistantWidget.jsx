'use client';

import { DEFAULT_ASSISTANT_AVATAR } from '@/helpers/nemt-dispatch-state';
import useLocalStorage from '@/hooks/useLocalStorage';
import { signOut, useSession } from 'next-auth/react';
import { usePathname, useRouter } from 'next/navigation';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from 'react-bootstrap';

const STORAGE_KEY = '__CARE_MOBILITY_AI_ASSISTANT__';
const CLIENT_KEY = '__CARE_MOBILITY_AI_ASSISTANT_CLIENT__';
const MODE_KEY = '__CARE_MOBILITY_AI_ASSISTANT_MODE__';
const DRIVER_MESSAGES_KEY = '__CARE_MOBILITY_DISPATCH_MESSAGES__';

const buildInitialState = assistantName => ({
  open: false,
  messages: [{
    id: 'welcome',
    role: 'assistant',
    text: `Hola, soy ${assistantName || DEFAULT_ASSISTANT_AVATAR.name}. Puedo ayudarte con viajes, choferes, notas, rutas y preguntas de dispatch.`,
    createdAt: Date.now()
  }]
});

const widgetStyles = {
  shell: {
    position: 'fixed',
    right: 20,
    bottom: 20,
    zIndex: 1400,
    pointerEvents: 'none'
  },
  dock: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 8,
    pointerEvents: 'auto'
  },
  panel: {
    position: 'absolute',
    right: 0,
    bottom: 110,
    width: 182,
    maxWidth: 'calc(100vw - 24px)',
    minHeight: 172,
    borderRadius: 20,
    background: 'rgba(13, 18, 28, 0.92)',
    boxShadow: '0 16px 36px rgba(3, 8, 20, 0.34)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    pointerEvents: 'auto'
  },
  launcher: {
    width: 92,
    minHeight: 112,
    borderRadius: 24,
    border: 'none',
    background: 'rgba(12, 18, 28, 0.94)',
    boxShadow: '0 12px 26px rgba(4, 10, 21, 0.30)',
    color: '#ffffff',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '10px 8px 8px',
    pointerEvents: 'auto',
    marginLeft: 'auto'
  },
  avatarFrame: {
    width: 72,
    height: 78,
    borderRadius: 20,
    overflow: 'hidden',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.14)',
    boxShadow: '0 8px 18px rgba(0, 0, 0, 0.24)',
    position: 'relative'
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block'
  },
  mouthOverlay: {
    position: 'absolute',
    left: '50%',
    top: '60.5%',
    width: '17%',
    height: '4.8%',
    transform: 'translateX(-50%)',
    background: 'linear-gradient(180deg, #78404b 0%, #d8808c 100%)',
    border: '1px solid rgba(71, 18, 28, 0.45)',
    boxShadow: '0 0 0 1px rgba(255, 196, 205, 0.18), 0 1px 4px rgba(48, 9, 16, 0.34)',
    zIndex: 3,
    transition: 'all 120ms ease'
  },
  launcherModeRow: {
    width: '100%',
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 4
  },
  launcherModeButton: {
    minHeight: 20,
    borderRadius: 999,
    padding: '0 6px',
    fontSize: 9,
    fontWeight: 800,
    lineHeight: 1.1
  },
  launcherStatus: {
    minWidth: 42,
    height: 18,
    borderRadius: 999,
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.12)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 8px',
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: '0.08em',
    textTransform: 'uppercase'
  },
  header: {
    padding: '10px 10px 8px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    background: 'rgba(255, 255, 255, 0.02)',
    backdropFilter: 'blur(10px)',
    color: '#ffffff'
  },
  body: {
    flex: 1,
    padding: '10px',
    display: 'flex',
    flexDirection: 'column',
    gap: 7
  },
  statusPill: {
    borderRadius: 999,
    minHeight: 28,
    padding: '5px 9px',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.10)',
    color: '#ffffff',
    fontSize: 11,
    lineHeight: 1.4,
    textAlign: 'center'
  },
  providerPill: {
    alignSelf: 'center',
    borderRadius: 999,
    minHeight: 22,
    padding: '3px 8px',
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.12)',
    color: '#dceeff',
    fontSize: 10,
    fontWeight: 700,
    textAlign: 'center'
  },
  smallGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 8
  },
  miniButton: {
    minHeight: 28,
    borderRadius: 999,
    fontSize: 10,
    fontWeight: 700,
    padding: '4px 8px'
  },
  modeRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 8
  },
  noteLine: {
    minHeight: 18,
    color: 'rgba(255,255,255,0.84)',
    fontSize: 10,
    textAlign: 'center'
  }
};

const getSpeechRecognition = () => {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
};

const getPreferredSpeechVoice = () => {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!Array.isArray(voices) || voices.length === 0) return null;
  return voices.find(voice => /^es(-|_)/i.test(voice.lang) && /female|helena|monica|paulina|sabina|sofia|espa/i.test(`${voice.name} ${voice.lang}`)) || voices.find(voice => /^es(-|_)/i.test(voice.lang)) || voices[0];
};

const applyAvatarPayload = payload => ({
  name: String(payload?.avatar?.name || payload?.name || DEFAULT_ASSISTANT_AVATAR.name),
  image: String(payload?.avatar?.image || payload?.image || DEFAULT_ASSISTANT_AVATAR.image),
  visible: payload?.avatar?.visible !== false && payload?.visible !== false
});

const appendDriverThreadMessage = action => {
  if (typeof window === 'undefined' || !action?.driverId || !action?.message) return;
  const existingThreads = (() => {
    try {
      const storedValue = window.localStorage.getItem(DRIVER_MESSAGES_KEY);
      return storedValue ? JSON.parse(storedValue) : [];
    } catch {
      return [];
    }
  })();
  const nextThreads = Array.isArray(existingThreads) ? [...existingThreads] : [];
  const threadIndex = nextThreads.findIndex(thread => thread?.driverId === action.driverId);
  const outgoingMessage = {
    id: `${action.driverId}-${Date.now()}`,
    direction: 'outgoing',
    text: String(action.message || '').trim(),
    timestamp: new Date().toISOString(),
    status: 'sent'
  };
  if (threadIndex >= 0) {
    nextThreads[threadIndex] = {
      ...nextThreads[threadIndex],
      messages: [...(Array.isArray(nextThreads[threadIndex]?.messages) ? nextThreads[threadIndex].messages : []), outgoingMessage]
    };
  } else {
    nextThreads.push({
      driverId: action.driverId,
      messages: [outgoingMessage]
    });
  }
  window.localStorage.setItem(DRIVER_MESSAGES_KEY, JSON.stringify(nextThreads));
  window.dispatchEvent(new CustomEvent('care-mobility-driver-message-sent', {
    detail: action
  }));
};

const DispatchAssistantWidget = () => {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const [avatarConfig, setAvatarConfig] = useState({
    ...DEFAULT_ASSISTANT_AVATAR,
    visible: true
  });
  const [storedAssistantState, setStoredAssistantState] = useLocalStorage(STORAGE_KEY, buildInitialState(DEFAULT_ASSISTANT_AVATAR.name));
  const [clientId, setClientId] = useLocalStorage(CLIENT_KEY, `assistant-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
  const [assistantMode, setAssistantMode] = useLocalStorage(MODE_KEY, 'local');
  const [isSending, setIsSending] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [isHydrating, setIsHydrating] = useState(false);
  const recognitionRef = useRef(null);
  const preferredVoiceRef = useRef(null);
  const speechUtteranceRef = useRef(null);
  const [lastTranscript, setLastTranscript] = useState('');
  const [lastReply, setLastReply] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [mouthFrame, setMouthFrame] = useState(0);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [lastProvider, setLastProvider] = useState('local');
  const [listeningMode, setListeningMode] = useState(false);
  const assistantModeRef = useRef(assistantMode);
  const messagesRef = useRef([]);
  const isSendingRef = useRef(isSending);
  const voiceEnabledRef = useRef(voiceEnabled);
  const listeningModeRef = useRef(false);
  const isSpeakingRef = useRef(false);

  const open = Boolean(storedAssistantState?.open);
  const assistantName = avatarConfig?.name || DEFAULT_ASSISTANT_AVATAR.name;
  const avatarImage = avatarConfig?.image || DEFAULT_ASSISTANT_AVATAR.image;
  const assistantVisible = avatarConfig?.visible !== false;
  const messages = Array.isArray(storedAssistantState?.messages) && storedAssistantState.messages.length > 0 ? storedAssistantState.messages : buildInitialState(assistantName).messages;
  const speechRecognitionSupported = useMemo(() => Boolean(getSpeechRecognition()), []);
  const memoryScopeLabel = session?.user?.id ? `Memory: ${session.user.name || session.user.username || session.user.id}` : 'Browser memory';
  const showPhotoAvatar = !avatarLoadFailed;

  useEffect(() => {
    if (!clientId) {
      setClientId(`assistant-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
    }
  }, [clientId, setClientId]);

  useEffect(() => {
    let active = true;

    const loadAvatarConfig = async () => {
      try {
        const response = await fetch('/api/avatar', {
          cache: 'no-store'
        });
        const payload = await response.json();
        if (!response.ok || !active) return;
        setAvatarConfig(applyAvatarPayload(payload));
        setAvatarLoadFailed(false);
      } catch {
        if (active) {
          setAvatarConfig({
            ...DEFAULT_ASSISTANT_AVATAR,
            visible: true
          });
        }
      }
    };

    loadAvatarConfig();

    return () => {
      active = false;
    };
  }, [pathname, open]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleAvatarUpdated = event => {
      setAvatarConfig(applyAvatarPayload(event?.detail || {}));
      setAvatarLoadFailed(false);
    };
    window.addEventListener('care-mobility-avatar-settings-updated', handleAvatarUpdated);
    return () => {
      window.removeEventListener('care-mobility-avatar-settings-updated', handleAvatarUpdated);
    };
  }, []);

  useEffect(() => {
    assistantModeRef.current = assistantMode;
  }, [assistantMode]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    isSendingRef.current = isSending;
  }, [isSending]);

  useEffect(() => {
    voiceEnabledRef.current = voiceEnabled;
  }, [voiceEnabled]);

  useEffect(() => {
    listeningModeRef.current = listeningMode;
  }, [listeningMode]);

  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

  useEffect(() => {
    if (!clientId) return;
    let active = true;

    const loadConversation = async () => {
      setIsHydrating(true);
      try {
        const response = await fetch(`/api/assistant/dispatch?clientId=${encodeURIComponent(clientId)}`, {
          cache: 'no-store'
        });
        const payload = await response.json();
        if (!response.ok || !active) return;
        const remoteMessages = Array.isArray(payload?.conversation?.messages) ? payload.conversation.messages : [];
        if (remoteMessages.length === 0) return;
        const remoteAssistantReply = [...remoteMessages].reverse().find(message => message.role === 'assistant')?.text || '';
        const remoteTranscript = [...remoteMessages].reverse().find(message => message.role === 'user')?.text || '';
        const remoteProvider = [...remoteMessages].reverse().find(message => message.role === 'assistant')?.provider || 'local';
        setLastReply(remoteAssistantReply);
        setLastTranscript(remoteTranscript);
        setLastProvider(remoteProvider);
        setStoredAssistantState(currentState => {
          const currentMessages = Array.isArray(currentState?.messages) ? currentState.messages : [];
          return remoteMessages.length > currentMessages.length ? {
            ...buildInitialState(assistantName),
            ...currentState,
            messages: remoteMessages
          } : currentState;
        });
      } finally {
        if (active) {
          setIsHydrating(false);
        }
      }
    };

    loadConversation();

    return () => {
      active = false;
    };
  }, [assistantName, clientId, session?.user?.id, setStoredAssistantState]);

  useEffect(() => {
    if (!speechRecognitionSupported) return undefined;
    const Recognition = getSpeechRecognition();
    if (!Recognition) return undefined;

    const recognition = new Recognition();
    recognition.lang = 'es-MX';
    recognition.interimResults = false;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;
    recognition.onresult = event => {
      const transcript = Array.from(event.results || []).map(result => result?.[0]?.transcript || '').join(' ').trim();
      if (transcript) {
        setLastTranscript(transcript);
        void sendVoiceMessage(transcript);
      }
    };
    recognition.onerror = () => {
      setIsListening(false);
    };
    recognition.onend = () => {
      setIsListening(false);
      if (listeningModeRef.current && !isSpeakingRef.current && !isSendingRef.current) {
        window.setTimeout(() => {
          if (!recognitionRef.current || !listeningModeRef.current || isSpeakingRef.current || isSendingRef.current) return;
          try {
            recognitionRef.current.start();
            setIsListening(true);
          } catch {}
        }, 350);
      }
    };
    recognitionRef.current = recognition;

    return () => {
      recognition.stop();
      recognitionRef.current = null;
    };
  }, [speechRecognitionSupported]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return undefined;
    const resolveVoices = () => {
      preferredVoiceRef.current = getPreferredSpeechVoice();
    };
    resolveVoices();
    window.speechSynthesis.addEventListener?.('voiceschanged', resolveVoices);
    return () => {
      window.speechSynthesis.removeEventListener?.('voiceschanged', resolveVoices);
    };
  }, []);

  useEffect(() => {
    if (!isSpeaking) {
      setMouthFrame(0);
      return undefined;
    }
    const intervalId = window.setInterval(() => {
      setMouthFrame(currentValue => currentValue === 0 ? 1 : 0);
    }, 180);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [isSpeaking]);

  useEffect(() => {
    if (assistantVisible) return;
    stopSpeaking();
    setStoredAssistantState(currentState => ({
      ...buildInitialState(assistantName),
      ...currentState,
      open: false
    }));
  }, [assistantName, assistantVisible, setStoredAssistantState]);

  if (pathname?.startsWith('/auth') || pathname === '/map-screen') {
    return null;
  }

  if (!assistantVisible) {
    return null;
  }

  const appendMessage = message => {
    setStoredAssistantState(currentState => ({
      ...buildInitialState(assistantName),
      ...currentState,
      messages: [...(Array.isArray(currentState?.messages) ? currentState.messages : buildInitialState(assistantName).messages), message]
    }));
  };

  const toggleOpen = () => {
    setStoredAssistantState(currentState => ({
      ...buildInitialState(assistantName),
      ...currentState,
      open: !currentState?.open
    }));
  };

  const handleClearMemory = () => {
    setStoredAssistantState(buildInitialState(assistantName));
    setErrorMessage('');
    setLastTranscript('');
    setLastReply('');
    setIsSpeaking(false);
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  };

  const stopSpeaking = () => {
    setListeningMode(false);
    recognitionRef.current?.stop?.();
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setIsListening(false);
    setIsSpeaking(false);
  };

  const renderPhotoAvatar = frameStyle => <span style={frameStyle}>
      <img src={avatarImage} alt="Avatar del asistente" style={widgetStyles.avatarImage} onError={() => setAvatarLoadFailed(true)} />
      <span style={{
      ...widgetStyles.mouthOverlay,
      top: '53.8%',
      width: mouthFrame === 0 ? '15%' : '18.5%',
      height: mouthFrame === 0 ? '2.7%' : '6.8%',
      borderRadius: mouthFrame === 0 ? '999px' : '40% 40% 55% 55%',
      opacity: isSpeaking ? 0.96 : 0.72,
      transform: `translateX(-50%) scaleY(${mouthFrame === 0 ? 0.88 : 1.08})`
    }} />
    </span>;

  const speakReply = text => {
    if (!voiceEnabledRef.current || typeof window === 'undefined' || !window.speechSynthesis || !text) return;
    recognitionRef.current?.stop?.();
    setIsListening(false);
    window.speechSynthesis.cancel();
    const cleanText = String(text || '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/__(.*?)__/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/[•*-]\s+/g, '')
      .trim();
    const utterance = new SpeechSynthesisUtterance(cleanText);
    speechUtteranceRef.current = utterance;
    utterance.lang = 'es-MX';
    utterance.rate = 0.95;
    utterance.pitch = 0.92;
    if (preferredVoiceRef.current) {
      utterance.voice = preferredVoiceRef.current;
      utterance.lang = preferredVoiceRef.current.lang || utterance.lang;
    }
    utterance.onstart = () => {
      setIsSpeaking(true);
    };
    utterance.onend = () => {
      setIsSpeaking(false);
      speechUtteranceRef.current = null;
      if (listeningModeRef.current && recognitionRef.current) {
        window.setTimeout(() => {
          if (!recognitionRef.current || !listeningModeRef.current || isSendingRef.current) return;
          try {
            recognitionRef.current.start();
            setIsListening(true);
          } catch {}
        }, 250);
      }
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      speechUtteranceRef.current = null;
    };
    window.speechSynthesis.speak(utterance);
  };

  const sendVoiceMessage = async nextMessage => {
    if (!nextMessage || isSendingRef.current) return;

    const userMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: nextMessage,
      createdAt: Date.now()
    };

    appendMessage(userMessage);
    setIsSending(true);
    setErrorMessage('');

    try {
      const response = await fetch('/api/assistant/dispatch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: nextMessage,
          clientId,
          pathname,
          providerMode: assistantModeRef.current,
          history: [...messagesRef.current.slice(-10), userMessage].map(item => ({
            role: item.role,
            text: item.text
          }))
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to contact the assistant.');
      }

      const assistantMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        text: String(payload?.reply || 'I did not get a response.'),
        createdAt: Date.now(),
        provider: payload?.provider || 'local'
      };
      appendMessage(assistantMessage);
      setLastReply(assistantMessage.text);
      setLastProvider(assistantMessage.provider);
      speakReply(assistantMessage.text);
      if (payload?.action === 'signout') {
        window.setTimeout(() => {
          void signOut({
            callbackUrl: '/auth/login'
          });
        }, 700);
      } else if (payload?.action?.type === 'open-module' && payload?.action?.href) {
        window.setTimeout(() => {
          router.push(payload.action.href);
        }, 300);
      } else if (payload?.action?.type === 'driver-message') {
        appendDriverThreadMessage(payload.action);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to contact the assistant.');
    } finally {
      setIsSending(false);
    }
  };

  const handleToggleListening = () => {
    if (!recognitionRef.current) return;
    if (listeningModeRef.current || isListening) {
      setListeningMode(false);
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }
    setErrorMessage('');
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
    setListeningMode(true);
    setIsListening(true);
    recognitionRef.current.start();
  };

  const providerLabel = assistantMode === 'openai' ? 'GPT' : 'LOCAL';

  return <div style={widgetStyles.shell}>
      {open ? <div style={widgetStyles.panel}>
          <div style={widgetStyles.header}>
            <div className="d-flex align-items-start justify-content-between gap-3">
              <div>
                <div className="fw-bold" style={{ fontSize: 14 }}>{assistantName}</div>
                <div style={{ color: 'rgba(255,255,255,0.68)', lineHeight: 1.3, fontSize: 10 }}>{memoryScopeLabel}</div>
              </div>
              <Button variant="link" onClick={toggleOpen} className="p-0 text-decoration-none" style={{ color: '#ffffff' }}>Close</Button>
            </div>
          </div>

          <div style={widgetStyles.body}>
            <div style={widgetStyles.providerPill}>{lastProvider === 'openai-integrations' || lastProvider === 'openai' ? 'Respuesta: GPT' : 'Respuesta: IA local'}</div>
            <div style={widgetStyles.statusPill}>
              {errorMessage ? errorMessage : isSending ? 'Consultando...' : isListening ? 'Escuchando...' : isSpeaking ? 'Hablando...' : 'Lista'}
            </div>
            <div style={widgetStyles.modeRow}>
              <Button type="button" variant={assistantMode === 'openai' ? 'light' : 'outline-light'} onClick={() => setAssistantMode('openai')} style={widgetStyles.miniButton}>
                GPT
              </Button>
              <Button type="button" variant={assistantMode === 'local' ? 'light' : 'outline-light'} onClick={() => setAssistantMode('local')} style={widgetStyles.miniButton}>
                IA local
              </Button>
            </div>
            <div style={widgetStyles.smallGrid}>
              <Button type="button" variant={isListening ? 'danger' : 'light'} onClick={handleToggleListening} disabled={!speechRecognitionSupported || isSending} style={widgetStyles.miniButton}>
                {listeningMode || isListening ? 'Escucha on' : 'Escucha off'}
              </Button>
              <Button type="button" variant={voiceEnabled ? 'light' : 'outline-light'} onClick={() => setVoiceEnabled(currentValue => !currentValue)} style={widgetStyles.miniButton}>
                {voiceEnabled ? 'Voz on' : 'Mute'}
              </Button>
              <Button type="button" variant="outline-light" onClick={handleClearMemory} style={widgetStyles.miniButton}>
                Borrar
              </Button>
              <Button type="button" variant="outline-light" onClick={stopSpeaking} style={widgetStyles.miniButton}>
                Callar
              </Button>
            </div>
            <div style={widgetStyles.noteLine}>{assistantMode === 'local' ? 'Modo sin OpenAI' : `Modelo ${voiceEnabled ? 'con voz' : 'sin voz'}`}</div>
          </div>
        </div> : null}

      <div style={widgetStyles.dock}>
        <button type="button" aria-label="Open dispatch assistant" onClick={toggleOpen} style={widgetStyles.launcher}>
          {showPhotoAvatar ? renderPhotoAvatar(widgetStyles.avatarFrame) : null}
          <span style={widgetStyles.launcherStatus}>{providerLabel}</span>
        </button>
        <div style={widgetStyles.launcherModeRow}>
          <Button type="button" variant={assistantMode === 'openai' ? 'light' : 'outline-light'} onClick={() => setAssistantMode('openai')} style={widgetStyles.launcherModeButton}>
            GPT
          </Button>
          <Button type="button" variant={assistantMode === 'local' ? 'light' : 'outline-light'} onClick={() => setAssistantMode('local')} style={widgetStyles.launcherModeButton}>
            Local
          </Button>
        </div>
        <div style={widgetStyles.launcherModeRow}>
          <Button type="button" variant={listeningMode || isListening ? 'danger' : 'light'} onClick={handleToggleListening} disabled={!speechRecognitionSupported || isSending} style={widgetStyles.launcherModeButton}>
            {listeningMode || isListening ? 'On' : 'Off'}
          </Button>
          <Button type="button" variant={voiceEnabled ? 'light' : 'outline-light'} onClick={() => {
          if (voiceEnabledRef.current) {
            stopSpeaking();
          }
          setVoiceEnabled(currentValue => !currentValue);
        }} style={widgetStyles.launcherModeButton}>
            {voiceEnabled ? 'Voz on' : 'Mute'}
          </Button>
        </div>
      </div>
    </div>;
};

export default DispatchAssistantWidget;