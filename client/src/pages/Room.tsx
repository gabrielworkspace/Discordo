import { useEffect, useContext, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { WebRTCContext } from '../contexts/WebRTCContext';
import { AuthContext } from '../contexts/AuthContext';
import { supabase } from '../supabase';
import { Mic, MicOff, MonitorUp, PhoneOff, Users, Settings, X } from 'lucide-react';

const ParticipantAudio = ({ stream, outputId }: { stream?: MediaStream, outputId: string }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  
  useEffect(() => {
    if (audioRef.current) {
      if (stream) audioRef.current.srcObject = stream;
      
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
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  if (!stream || stream.getVideoTracks().length === 0) return null;

  return (
    <video 
      ref={videoRef} 
      autoPlay 
      playsInline 
      style={{
        width: '100%',
        maxHeight: '70vh',
        backgroundColor: '#000',
        borderRadius: 'var(--radius-md)'
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
  const showLocalScreenShare = isSharingScreen && localStream?.getVideoTracks().length;

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
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-md)' }}>
          {showLocalScreenShare ? (
            <ScreenShareVideo stream={localStream!} />
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', backgroundColor: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-bg-base)', fontWeight: 'bold' }}>
                  {user?.displayName.charAt(0).toUpperCase()}
                </div>
                <span>{user?.displayName} (Você)</span>
              </div>
              {isMuted ? <MicOff size={16} color="var(--color-danger)" /> : <Mic size={16} color="var(--color-primary)" />}
            </div>

            {/* Remote Users */}
            {participants.map(p => (
              <div key={p.socketId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', backgroundColor: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#4a5568', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>
                    {p.displayName.charAt(0).toUpperCase()}
                  </div>
                  <span>{p.displayName}</span>
                </div>
                {p.isMuted ? <MicOff size={16} color="var(--color-danger)" /> : <Mic size={16} color="var(--color-primary)" />}
                <ParticipantAudio stream={p.stream} outputId={audioOutputId} />
              </div>
            ))}

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
