import { useEffect, useContext, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { WebRTCContext } from '../contexts/WebRTCContext';
import { AuthContext } from '../contexts/AuthContext';
import { supabase } from '../supabase';
import { Mic, MicOff, MonitorUp, PhoneOff, Users, Settings, X } from 'lucide-react';

let sharedAudioContext: AudioContext | null = null;
const getAudioContext = () => {
  if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
    sharedAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return sharedAudioContext;
};

const useAudioVolume = (stream: MediaStream | null | undefined) => {
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    if (!stream || stream.getAudioTracks().length === 0) {
      setIsSpeaking(false);
      return;
    }

    const audioContext = getAudioContext();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.minDecibels = -70;

    let source: MediaStreamAudioSourceNode | null = null;
    try {
      source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
    } catch (err) {
      console.warn("Could not create stream source for volume detection", err);
      return;
    }

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    let animationFrameId: number;

    const updateVolume = () => {
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const average = sum / dataArray.length;
      
      setIsSpeaking(average > 10);
      
      animationFrameId = requestAnimationFrame(updateVolume);
    };

    updateVolume();

    return () => {
      cancelAnimationFrame(animationFrameId);
      if (source) source.disconnect();
    };
  }, [stream]);

  return isSpeaking;
};

const ParticipantItem = ({ 
  displayName, 
  isMuted, 
  stream, 
  isLocal 
}: { 
  displayName: string, 
  isMuted: boolean, 
  stream?: MediaStream | null, 
  isLocal?: boolean 
}) => {
  const isSpeaking = useAudioVolume(isMuted ? null : stream);
  
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', backgroundColor: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-sm)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ 
          width: '32px', height: '32px', borderRadius: '50%', 
          backgroundColor: isLocal ? 'var(--color-primary)' : '#4a5568', 
          display: 'flex', alignItems: 'center', justifyContent: 'center', 
          color: isLocal ? 'var(--color-bg-base)' : 'white', fontWeight: 'bold',
          boxShadow: isSpeaking && !isMuted ? '0 0 0 3px #4ade80' : 'none',
          transition: 'box-shadow 0.1s'
        }}>
          {displayName.charAt(0).toUpperCase()}
        </div>
        <span style={{ fontWeight: isSpeaking && !isMuted ? 'bold' : 'normal', transition: 'font-weight 0.1s' }}>
          {displayName} {isLocal ? '(Você)' : ''}
        </span>
      </div>
      {isMuted ? <MicOff size={16} color="var(--color-danger)" /> : <Mic size={16} color="var(--color-primary)" />}
    </div>
  );
};

const ParticipantAudio = ({ stream, outputId }: { stream?: MediaStream, outputId: string }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  
  useEffect(() => {
    if (audioRef.current && stream) {
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length > 0) {
        const newTrack = audioTracks[0];
        const currentStream = audioRef.current.srcObject as MediaStream;
        const currentTrack = currentStream?.getAudioTracks()[0];
        
        if (newTrack !== currentTrack) {
          audioRef.current.srcObject = new MediaStream([newTrack]);
          audioRef.current.play().catch(console.error);
        }
      }
      
      const audioEl = audioRef.current as any;
      if (typeof audioEl.setSinkId === 'function') {
        audioEl.setSinkId(outputId).catch(console.error);
      }
    }
  }, [stream, outputId]);

  return <audio ref={audioRef} autoPlay />;
};

const ScreenShareVideo = ({ stream }: { stream?: MediaStream }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  
  useEffect(() => {
    if (videoRef.current && stream) {
      const videoTracks = stream.getVideoTracks();
      if (videoTracks.length > 0) {
        const newTrack = videoTracks[0];
        const currentStream = videoRef.current.srcObject as MediaStream;
        const currentTrack = currentStream?.getVideoTracks()[0];
        
        if (newTrack !== currentTrack) {
          videoRef.current.srcObject = new MediaStream([newTrack]);
          videoRef.current.play().catch(err => console.error('Erro ao tocar vídeo:', err));
        }
      }
    }
  }, [stream]);

  if (!stream || stream.getVideoTracks().length === 0) return null;

  return (
    <video 
      ref={videoRef} 
      autoPlay 
      playsInline
      muted
      style={{
        width: '100%',
        maxHeight: '70vh',
        backgroundColor: '#000',
        borderRadius: 'var(--radius-md)',
        objectFit: 'contain'
      }}
    />
  );
};

export default function Room() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const { 
    joinRoom, 
    leaveRoom, 
    participants, 
    localStream,
    screenStream,
    messages,
    sendMessage,
    isMuted, 
    isSharingScreen, 
    toggleMute, 
    toggleScreenShare,
    error,
    audioInputId,
    audioOutputId,
    changeAudioInput,
    setAudioOutputId
  } = useContext(WebRTCContext);

  const [roomName, setRoomName] = useState('Sala de Call');
  const [showSettings, setShowSettings] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [chatInput, setChatInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (id) {
      supabase.from('rooms').select('*').eq('code', id).single()
        .then(({ data }) => {
          if (data?.name) setRoomName(data.name);
        });

      joinRoom(id);
    }
    
    return () => {
      leaveRoom();
    };
  }, [id]);

  useEffect(() => {
    if (showSettings) {
      navigator.mediaDevices.enumerateDevices().then(setDevices).catch(console.error);
    }
  }, [showSettings]);

  const handleLeave = () => {
    leaveRoom();
    navigate('/');
  };

  const sharedScreenParticipant = participants.find(p => p.isSharingScreen && p.stream?.getVideoTracks().length);
  const showLocalScreenShare = isSharingScreen && screenStream?.getVideoTracks().length;

  const audioInputs = devices.filter(d => d.kind === 'audioinput');
  const audioOutputs = devices.filter(d => d.kind === 'audiooutput');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: 'var(--color-bg-base)' }}>
      {/* Header */}
      <header style={{ padding: '16px 24px', backgroundColor: 'var(--color-bg-surface)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.25rem' }}>{roomName}</h2>
          <span style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>Código: {id}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', color: 'var(--color-text-muted)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Users size={18} />
            <span>{participants.length + 1} participantes</span>
          </div>
          <button onClick={() => setShowSettings(true)} style={{ background: 'none', border: 'none', padding: '8px', cursor: 'pointer', color: 'var(--color-text-muted)' }}>
            <Settings size={20} />
          </button>
        </div>
      </header>

      {error && (
        <div style={{ backgroundColor: 'var(--color-danger)', color: 'white', padding: '12px', textAlign: 'center' }}>
          {error}
        </div>
      )}

      {/* Main Content Area */}
      <main style={{ flex: 1, display: 'flex', padding: '24px', gap: '24px', overflow: 'hidden' }}>
        
        {/* Video / Screen Share Area */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
          {showLocalScreenShare ? (
            <ScreenShareVideo stream={screenStream!} />
          ) : sharedScreenParticipant ? (
            <ScreenShareVideo stream={sharedScreenParticipant.stream} />
          ) : (
            <div style={{ color: 'var(--color-text-muted)', textAlign: 'center' }}>
              <div style={{ marginBottom: '16px' }}><Users size={48} opacity={0.5} /></div>
              <p>O compartilhamento de tela aparecerá aqui.</p>
            </div>
          )}
        </div>

        {/* Participants Sidebar */}
        <aside style={{ width: '300px', backgroundColor: 'var(--color-bg-surface)', borderRadius: 'var(--radius-md)', padding: '16px', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ marginBottom: '16px', fontSize: '1rem' }}>Participantes</h3>
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            
            {/* Local User */}
            <ParticipantItem 
              displayName={user?.displayName || 'Usuário'} 
              isMuted={isMuted} 
              stream={localStream} 
              isLocal 
            />

            {/* Remote Users */}
            {participants.map(p => (
              <div key={p.socketId}>
                <ParticipantItem 
                  displayName={p.displayName} 
                  isMuted={p.isMuted} 
                  stream={p.stream} 
                />
                <ParticipantAudio stream={p.stream} outputId={audioOutputId} />
              </div>
            ))}

          </div>

          {/* Chat Section */}
          <div style={{ marginTop: '16px', flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', minHeight: '200px' }}>
            <div style={{ padding: '12px', borderBottom: '1px solid var(--color-bg-base)', fontWeight: 'bold' }}>Chat</div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {messages.map(m => (
                <div key={m.id} style={{ fontSize: '0.875rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                    <strong style={{ color: 'var(--color-primary)' }}>{m.senderName}</strong>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{m.time}</span>
                  </div>
                  <div style={{ color: 'white', wordBreak: 'break-word' }}>{m.text}</div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            <form 
              onSubmit={e => { e.preventDefault(); sendMessage(chatInput); setChatInput(''); }}
              style={{ display: 'flex', padding: '8px', borderTop: '1px solid var(--color-bg-base)' }}
            >
              <input 
                type="text" 
                placeholder="Enviar mensagem..." 
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                style={{ flex: 1, padding: '8px', borderRadius: 'var(--radius-sm)', border: 'none', backgroundColor: 'var(--color-bg-base)', color: 'white', fontSize: '0.875rem' }}
              />
            </form>
          </div>
        </aside>
      </main>

      {/* Controls Footer */}
      <footer style={{ padding: '20px', backgroundColor: 'var(--color-bg-surface)', display: 'flex', justifyContent: 'center', gap: '16px' }}>
        <button 
          onClick={toggleMute} 
          style={{ 
            backgroundColor: isMuted ? 'var(--color-danger)' : 'var(--color-bg-elevated)',
            color: 'white',
            borderRadius: '50%',
            width: '56px',
            height: '56px',
            padding: 0
          }}
          title={isMuted ? "Desmutar" : "Mutar"}
        >
          {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
        </button>

        <button 
          onClick={toggleScreenShare} 
          style={{ 
            backgroundColor: isSharingScreen ? 'var(--color-primary)' : 'var(--color-bg-elevated)',
            color: isSharingScreen ? 'var(--color-bg-base)' : 'white',
            borderRadius: '50%',
            width: '56px',
            height: '56px',
            padding: 0
          }}
          title={isSharingScreen ? "Parar Compartilhamento" : "Compartilhar Tela"}
        >
          <MonitorUp size={24} />
        </button>

        <button 
          onClick={handleLeave} 
          style={{ 
            backgroundColor: 'var(--color-danger)',
            color: 'white',
            borderRadius: '50%',
            width: '56px',
            height: '56px',
            padding: 0
          }}
          title="Sair da Sala"
        >
          <PhoneOff size={24} />
        </button>
      </footer>

      {/* Settings Modal */}
      {showSettings && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ width: '400px', position: 'relative' }}>
            <button 
              onClick={() => setShowSettings(false)}
              style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}
            >
              <X size={20} />
            </button>
            <h2 style={{ marginBottom: '24px' }}>Configurações de Áudio</h2>
            
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label>Microfone (Entrada)</label>
              <select 
                value={audioInputId} 
                onChange={(e) => changeAudioInput(e.target.value)}
                style={{ width: '100%', padding: '12px', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--color-bg-base)', color: 'white', border: '1px solid var(--color-bg-elevated)' }}
              >
                {audioInputs.length === 0 && <option value="default">Padrão</option>}
                {audioInputs.map(d => (
                  <option key={d.deviceId} value={d.deviceId}>{d.label || `Microfone ${d.deviceId.slice(0,5)}`}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Alto-falante (Saída)</label>
              <select 
                value={audioOutputId} 
                onChange={(e) => setAudioOutputId(e.target.value)}
                style={{ width: '100%', padding: '12px', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--color-bg-base)', color: 'white', border: '1px solid var(--color-bg-elevated)' }}
              >
                {audioOutputs.length === 0 && <option value="default">Padrão</option>}
                {audioOutputs.map(d => (
                  <option key={d.deviceId} value={d.deviceId}>{d.label || `Saída ${d.deviceId.slice(0,5)}`}</option>
                ))}
              </select>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
