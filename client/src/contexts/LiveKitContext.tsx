import { createContext, useState, useEffect, useContext, useRef } from 'react';
import type { ReactNode } from 'react';
import { Room, RoomEvent, ConnectionState, Participant } from 'livekit-client';
import { AuthContext } from './AuthContext';
import { createLiveKitToken } from '../lib/livekit';

export interface ChatMessage {
  id: string;
  senderName: string;
  text: string;
  time: string;
}

export interface LiveKitParticipant {
  identity: string;
  name: string;
  isMuted: boolean;
  isSpeaking: boolean;
  isLocal: boolean;
  participant: Participant;
}

interface LiveKitContextType {
  room: Room | null;
  participants: LiveKitParticipant[];
  messages: ChatMessage[];
  sendMessage: (text: string) => Promise<void>;
  isMuted: boolean;
  audioInputId: string;
  audioOutputId: string;
  setAudioOutputId: (id: string) => void;
  changeAudioInput: (deviceId: string) => Promise<void>;
  toggleMute: () => Promise<void>;
  joinRoom: (roomId: string) => Promise<void>;
  leaveRoom: () => void;
  error: string | null;
  connectionState: ConnectionState;
}

export const LiveKitContext = createContext<LiveKitContextType>({} as LiveKitContextType);

export const LiveKitProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useContext(AuthContext);
  
  const [room, setRoom] = useState<Room | null>(null);
  const [participants, setParticipants] = useState<LiveKitParticipant[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isMuted, setIsMuted] = useState(true);
  const [audioInputId, setAudioInputId] = useState<string>('default');
  const [audioOutputId, setAudioOutputId] = useState<string>('default');
  const [error, setError] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.Disconnected);

  const roomRef = useRef<Room | null>(null);

  // Helper to map LiveKit Participants to our interface
  const updateParticipants = (currentRoom: Room) => {
    const list: LiveKitParticipant[] = [];
    
    // Local
    list.push({
      identity: currentRoom.localParticipant.identity,
      name: currentRoom.localParticipant.name || 'Você',
      isMuted: !currentRoom.localParticipant.isMicrophoneEnabled,
      isSpeaking: currentRoom.localParticipant.isSpeaking,
      isLocal: true,
      participant: currentRoom.localParticipant
    });

    // Remote
    currentRoom.remoteParticipants.forEach((p) => {
      list.push({
        identity: p.identity,
        name: p.name || 'Usuário',
        isMuted: !p.isMicrophoneEnabled,
        isSpeaking: p.isSpeaking,
        isLocal: false,
        participant: p
      });
    });

    setParticipants(list);
  };

  const joinRoom = async (roomId: string) => {
    if (!user) return;
    setError(null);
    setMessages([]);

    try {
      const url = import.meta.env.VITE_LIVEKIT_URL;
      if (!url) throw new Error('VITE_LIVEKIT_URL is not configured');

      const token = await createLiveKitToken(roomId, user.displayName, user.id);

      const newRoom = new Room({
        adaptiveStream: true,
        dynacast: true,
      });

      roomRef.current = newRoom;
      setRoom(newRoom);
      
      // Events setup
      newRoom
        .on(RoomEvent.ConnectionStateChanged, (state) => {
          setConnectionState(state);
        })
        .on(RoomEvent.ParticipantConnected, () => updateParticipants(newRoom))
        .on(RoomEvent.ParticipantDisconnected, () => updateParticipants(newRoom))
        .on(RoomEvent.ActiveSpeakersChanged, () => updateParticipants(newRoom))
        .on(RoomEvent.TrackMuted, () => updateParticipants(newRoom))
        .on(RoomEvent.TrackUnmuted, () => updateParticipants(newRoom))
        .on(RoomEvent.LocalTrackPublished, () => updateParticipants(newRoom))
        .on(RoomEvent.LocalTrackUnpublished, () => updateParticipants(newRoom))
        .on(RoomEvent.DataReceived, (payload) => {
          const decoder = new TextDecoder();
          const strData = decoder.decode(payload);
          try {
            const data = JSON.parse(strData);
            if (data.type === 'chat') {
              setMessages(prev => [...prev, data.message]);
            }
          } catch (e) {
            console.error('Error parsing data packet', e);
          }
        });

      await newRoom.connect(url, token);
      
      // Request mic permission and publish
      try {
        await newRoom.localParticipant.setMicrophoneEnabled(true);
        setIsMuted(false);
      } catch (err) {
        console.warn('Microphone permission denied initially', err);
        setIsMuted(true);
      }

      updateParticipants(newRoom);

    } catch (err: any) {
      console.error('Failed to join LiveKit room', err);
      setError(err.message || 'Erro ao conectar na sala.');
    }
  };

  const leaveRoom = () => {
    if (roomRef.current) {
      roomRef.current.disconnect();
      roomRef.current = null;
    }
    setRoom(null);
    setParticipants([]);
    setMessages([]);
    setIsMuted(true);
  };

  const toggleMute = async () => {
    if (!roomRef.current) return;
    const currentMuteStatus = !isMuted;
    await roomRef.current.localParticipant.setMicrophoneEnabled(!currentMuteStatus);
    setIsMuted(currentMuteStatus);
    updateParticipants(roomRef.current);
  };

  const changeAudioInput = async (deviceId: string) => {
    if (!roomRef.current) return;
    try {
      await roomRef.current.switchActiveDevice('audioinput', deviceId);
      setAudioInputId(deviceId);
    } catch (err) {
      console.error('Error changing audio input', err);
    }
  };

  const setAudioOutput = async (deviceId: string) => {
    setAudioOutputId(deviceId);
    if (!roomRef.current) return;
    try {
      // In a real application, you might use an AudioContext or HTMLAudioElement.setSinkId
      // For now, LiveKit's room can help route audio if implemented.
      // But typically we do this by rendering Audio tracks and calling setSinkId on them.
      // Room.switchActiveDevice for output will route new tracks.
      await roomRef.current.switchActiveDevice('audiooutput', deviceId);
    } catch (err) {
      console.error('Error changing audio output', err);
    }
  };

  const sendMessage = async (text: string) => {
    if (!roomRef.current || !user || !text.trim()) return;
    
    const msg: ChatMessage = {
      id: Math.random().toString(),
      senderName: user.displayName,
      text: text.trim(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify({ type: 'chat', message: msg }));
    
    await roomRef.current.localParticipant.publishData(data, { reliable: true });
    
    setMessages(prev => [...prev, msg]);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      leaveRoom();
    };
  }, []);

  return (
    <LiveKitContext.Provider value={{
      room,
      participants,
      messages,
      sendMessage,
      isMuted,
      audioInputId,
      audioOutputId,
      setAudioOutputId: setAudioOutput,
      changeAudioInput,
      toggleMute,
      joinRoom,
      leaveRoom,
      error,
      connectionState
    }}>
      {children}
    </LiveKitContext.Provider>
  );
};
