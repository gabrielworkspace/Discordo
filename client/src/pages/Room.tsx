import { useEffect, useContext, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { LiveKitContext } from '../contexts/LiveKitContext';
import type { LiveKitParticipant } from '../contexts/LiveKitContext';
import { supabase } from '../supabase';
import { Mic, MicOff, PhoneOff, Users, Settings, X, Loader2, MonitorUp } from 'lucide-react';
import { ParticipantEvent, Track } from 'livekit-client';

const ParticipantVideo = ({ participant }: { participant: any }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!videoRef.current) return;

    const el = videoRef.current;

    const attachTracks = () => {
      participant.getTrackPublications?.().forEach((pub: any) => {
        if (pub.isSubscribed && pub.track && pub.track.kind === Track.Kind.Video) {
          pub.track.attach(el);
        }
      });
    };

    attachTracks();

    const handleTrackSubscribed = (track: Track) => {
      if (track.kind === Track.Kind.Video) {
        track.attach(el);
      }
    };

    const handleTrackUnsubscribed = (track: Track) => {
      if (track.kind === Track.Kind.Video) {
        track.detach(el);
      }
    };

    const handleLocalTrackPublished = (pub: any) => {
      if (pub.track && pub.track.kind === Track.Kind.Video) {
         pub.track.attach(el);
      }
    };

    const handleLocalTrackUnpublished = (pub: any) => {
      if (pub.track && pub.track.kind === Track.Kind.Video) {
         pub.track.detach(el);
      }
    };

    participant.on(ParticipantEvent.TrackSubscribed, handleTrackSubscribed);
    participant.on(ParticipantEvent.TrackUnsubscribed, handleTrackUnsubscribed);
    participant.on(ParticipantEvent.LocalTrackPublished, handleLocalTrackPublished);
    participant.on(ParticipantEvent.LocalTrackUnpublished, handleLocalTrackUnpublished);

    return () => {
      participant.off(ParticipantEvent.TrackSubscribed, handleTrackSubscribed);
      participant.off(ParticipantEvent.TrackUnsubscribed, handleTrackUnsubscribed);
      participant.off(ParticipantEvent.LocalTrackPublished, handleLocalTrackPublished);
      participant.off(ParticipantEvent.LocalTrackUnpublished, handleLocalTrackUnpublished);
    };
  }, [participant]);

  return <video ref={videoRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 'var(--radius-md)', backgroundColor: '#000' }} />;
};

const ParticipantAudio = ({ participant, outputId }: { participant: any, outputId: string }) => {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (!audioRef.current) return;

    const el = audioRef.current;

    const attachTracks = () => {
      participant.getTrackPublications?.().forEach((pub: any) => {
        if (pub.isSubscribed && pub.track && pub.track.kind === Track.Kind.Audio) {
          pub.track.attach(el);
        }
      });
    };

    attachTracks();

    const handleTrackSubscribed = (track: Track) => {
      if (track.kind === Track.Kind.Audio) {
        track.attach(el);
      }
    };

    const handleTrackUnsubscribed = (track: Track) => {
      if (track.kind === Track.Kind.Audio) {
        track.detach(el);
      }
    };

    participant.on(ParticipantEvent.TrackSubscribed, handleTrackSubscribed);
    participant.on(ParticipantEvent.TrackUnsubscribed, handleTrackUnsubscribed);

    return () => {
      participant.off(ParticipantEvent.TrackSubscribed, handleTrackSubscribed);
      participant.off(ParticipantEvent.TrackUnsubscribed, handleTrackUnsubscribed);
    };
  }, [participant]);

  useEffect(() => {
    const el = audioRef.current as any;
    if (el && typeof el.setSinkId === 'function' && outputId !== 'default') {
      el.setSinkId(outputId).catch(console.error);
    }
  }, [outputId]);

  return <audio ref={audioRef} autoPlay />;
};

const ParticipantCard = ({ p }: { p: LiveKitParticipant }) => {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'var(--color-bg-elevated)',
      borderRadius: 'var(--radius-md)',
      padding: '24px',
      position: 'relative',
      boxShadow: p.isSpeaking && !p.isMuted ? '0 0 0 4px var(--color-primary)' : 'none',
      transition: 'all 0.2s ease',
      minHeight: '200px'
    }}>
      {p.isScreenSharing ? (
        <div style={{ flex: 1, width: '100%', display: 'flex', justifyContent: 'center', overflow: 'hidden', marginBottom: '16px', borderRadius: 'var(--radius-md)' }}>
          <ParticipantVideo participant={p.participant} />
        </div>
      ) : (
        <div style={{
          width: '80px',
          height: '80px',
          borderRadius: '50%',
          backgroundColor: p.isLocal ? 'var(--color-primary)' : '#4a5568',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '2rem',
          fontWeight: 'bold',
          color: p.isLocal ? 'var(--color-bg-base)' : 'white',
          marginBottom: '16px'
        }}>
          {p.name.charAt(0).toUpperCase()}
        </div>
      )}
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontWeight: '600', fontSize: '1.1rem' }}>
          {p.name} {p.isLocal ? '(Você)' : ''}
        </span>
        {p.isMuted && <MicOff size={16} color="var(--color-danger)" />}
        {p.isScreenSharing && <MonitorUp size={16} color="var(--color-primary)" />}
      </div>
      
      {!p.isLocal && <ParticipantAudio participant={p.participant} outputId="default" />}
    </div>
  );
};

export default function Room() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const { 
    joinRoom, 
    leaveRoom, 
    participants, 
    messages,
    sendMessage,
    isMuted, 
    isScreenSharing,
    toggleMute, 
    toggleScreenShare,
    error,
    connectionState,
    audioInputId,
    audioOutputId,
    changeAudioInput,
    setAudioOutputId
  } = useContext(LiveKitContext);

  const [roomName, setRoomName] = useState('Sala de Voz');
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

  const audioInputs = devices.filter(d => d.kind === 'audioinput');
  const audioOutputs = devices.filter(d => d.kind === 'audiooutput');

  const isConnecting = connectionState === 'connecting' || connectionState === 'reconnecting';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: 'var(--color-bg-base)' }}>
      {/* Header */}
      <header style={{ padding: '16px 24px', backgroundColor: 'var(--color-bg-surface)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem' }}>{roomName}</h2>
            <span style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>Código: {id}</span>
          </div>
          {isConnecting && <Loader2 size={16} className="spin" color="var(--color-primary)" />}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', color: 'var(--color-text-muted)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Users size={18} />
            <span>{participants.length}</span>
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
        
        {/* Participants Grid */}
        <div style={{ 
          flex: 1, 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
          gap: '24px', 
          alignContent: 'start',
          overflowY: 'auto',
          paddingRight: '8px'
        }}>
          {participants.map(p => (
            <ParticipantCard key={p.identity} p={p} />
          ))}
          {participants.length === 0 && !isConnecting && (
             <div style={{ color: 'var(--color-text-muted)', textAlign: 'center', gridColumn: '1 / -1', marginTop: '40px' }}>
               Aguardando participantes...
             </div>
          )}
        </div>

        {/* Chat Sidebar */}
        <aside style={{ width: '350px', backgroundColor: 'var(--color-bg-surface)', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '16px', borderBottom: '1px solid var(--color-bg-base)', fontWeight: 'bold' }}>Chat da Sala</div>
          
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--color-text-muted)', marginTop: '20px', fontSize: '0.875rem' }}>
                Envie uma mensagem para começar a conversa.
              </div>
            )}
            {messages.map(m => (
              <div key={m.id} style={{ fontSize: '0.875rem', backgroundColor: 'var(--color-bg-elevated)', padding: '8px 12px', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <strong style={{ color: 'var(--color-primary)' }}>{m.senderName}</strong>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{m.time}</span>
                </div>
                <div style={{ color: 'var(--color-text-main)', wordBreak: 'break-word', lineHeight: '1.4' }}>{m.text}</div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <form 
            onSubmit={e => { e.preventDefault(); sendMessage(chatInput); setChatInput(''); }}
            style={{ padding: '16px', backgroundColor: 'var(--color-bg-elevated)' }}
          >
            <input 
              type="text" 
              placeholder="Digite aqui..." 
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              style={{ width: '100%', padding: '12px', borderRadius: 'var(--radius-sm)', border: 'none', backgroundColor: 'var(--color-bg-base)', color: 'white', fontSize: '0.875rem' }}
            />
          </form>
        </aside>
      </main>

      {/* Controls Footer */}
      <footer style={{ padding: '24px', backgroundColor: 'var(--color-bg-surface)', display: 'flex', justifyContent: 'center', gap: '24px' }}>
        <button 
          onClick={toggleMute} 
          style={{ 
            backgroundColor: isMuted ? 'var(--color-danger)' : 'var(--color-bg-elevated)',
            color: 'white',
            borderRadius: '50%',
            width: '64px',
            height: '64px',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'var(--shadow-md)'
          }}
          title={isMuted ? "Desmutar" : "Mutar"}
        >
          {isMuted ? <MicOff size={28} /> : <Mic size={28} />}
        </button>

        <button 
          onClick={toggleScreenShare} 
          style={{ 
            backgroundColor: isScreenSharing ? 'var(--color-primary)' : 'var(--color-bg-elevated)',
            color: 'white',
            borderRadius: '50%',
            width: '64px',
            height: '64px',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'var(--shadow-md)',
            transition: 'background-color 0.2s'
          }}
          title={isScreenSharing ? "Parar Transmissão" : "Transmitir Tela"}
        >
          <MonitorUp size={28} />
        </button>

        <button 
          onClick={handleLeave} 
          style={{ 
            backgroundColor: 'var(--color-danger)',
            color: 'white',
            borderRadius: '50%',
            width: '64px',
            height: '64px',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'var(--shadow-md)'
          }}
          title="Sair da Sala"
        >
          <PhoneOff size={28} />
        </button>
      </footer>

      {/* Settings Modal */}
      {showSettings && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ width: '400px', position: 'relative' }}>
            <button 
              onClick={() => setShowSettings(false)}
              style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}
            >
              <X size={20} />
            </button>
            <h2 style={{ marginBottom: '24px' }}>Dispositivos</h2>
            
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label>Microfone</label>
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
              <label>Alto-falante</label>
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
