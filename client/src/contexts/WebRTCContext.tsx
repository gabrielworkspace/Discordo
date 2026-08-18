import { createContext, useState, useContext, useRef } from 'react';
import type { ReactNode } from 'react';
import { supabase } from '../supabase';
import { AuthContext } from './AuthContext';
import { RealtimeChannel } from '@supabase/supabase-js';

interface Participant {
  socketId: string; // we'll use user.id as socketId for simplicity
  userId: string;
  displayName: string;
  isMuted: boolean;
  isSharingScreen: boolean;
  stream?: MediaStream;
}

interface WebRTCContextType {
  participants: Participant[];
  localStream: MediaStream | null;
  isMuted: boolean;
  isSharingScreen: boolean;
  toggleMute: () => void;
  toggleScreenShare: () => Promise<void>;
  joinRoom: (roomId: string) => void;
  leaveRoom: () => void;
  error: string | null;
}

export const WebRTCContext = createContext<WebRTCContextType>({} as WebRTCContextType);

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ]
};

export const WebRTCProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useContext(AuthContext);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const peersRef = useRef<{ [userId: string]: RTCPeerConnection }>({});

  const initLocalStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      setLocalStream(stream);
      return stream;
    } catch (err) {
      console.error('Error accessing microphone', err);
      setError('Permissão de microfone negada ou indisponível.');
      return null;
    }
  };

  const createPeerConnection = (targetUserId: string, stream: MediaStream) => {
    const peer = new RTCPeerConnection(ICE_SERVERS);

    stream.getTracks().forEach(track => {
      peer.addTrack(track, stream);
    });

    peer.ontrack = (event) => {
      setParticipants(prev => prev.map(p => {
        if (p.userId === targetUserId) {
          return { ...p, stream: event.streams[0] };
        }
        return p;
      }));
    };

    peer.onicecandidate = (event) => {
      if (event.candidate && channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'ice-candidate',
          payload: { target: targetUserId, caller: user!.id, candidate: event.candidate }
        });
      }
    };

    peersRef.current[targetUserId] = peer;
    return peer;
  };

  const joinRoom = async (id: string) => {
    if (!user) return;
    const stream = await initLocalStream();
    if (!stream) return;

    const channel = supabase.channel(`room:${id}`, {
      config: {
        broadcast: { ack: false, self: false },
        presence: { key: user.id }
      }
    });

    channelRef.current = channel;

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const users: Participant[] = [];
        
        for (const [key, presences] of Object.entries(state)) {
          if (key === user.id) continue; // Skip self
          const presence: any = presences[0];
          users.push({
            socketId: key,
            userId: key,
            displayName: presence.displayName,
            isMuted: presence.isMuted || false,
            isSharingScreen: presence.isSharingScreen || false,
            stream: participants.find(p => p.userId === key)?.stream
          });
        }
        
        setParticipants(prev => {
          // keep streams from prev
          return users.map(u => {
            const existing = prev.find(p => p.userId === u.userId);
            return existing ? { ...u, stream: existing.stream } : u;
          });
        });
      })
      .on('presence', { event: 'join' }, async ({ key }) => {
        if (key === user.id) return;
        // User joined, we don't create offer immediately, we let the NEW user create offers for everyone
        // Actually, WebRTC standard is: newly joined user sends offers to existing users.
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        if (peersRef.current[key]) {
          peersRef.current[key].close();
          delete peersRef.current[key];
        }
      })
      .on('broadcast', { event: 'offer' }, async ({ payload }) => {
        if (payload.target !== user.id) return;
        
        const peer = createPeerConnection(payload.caller, localStream || stream);
        await peer.setRemoteDescription(new RTCSessionDescription(payload.offer));
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        
        channel.send({
          type: 'broadcast',
          event: 'answer',
          payload: { target: payload.caller, caller: user.id, answer }
        });
      })
      .on('broadcast', { event: 'answer' }, async ({ payload }) => {
        if (payload.target !== user.id) return;
        const peer = peersRef.current[payload.caller];
        if (peer) {
          await peer.setRemoteDescription(new RTCSessionDescription(payload.answer));
        }
      })
      .on('broadcast', { event: 'ice-candidate' }, async ({ payload }) => {
        if (payload.target !== user.id) return;
        const peer = peersRef.current[payload.caller];
        if (peer) {
          await peer.addIceCandidate(new RTCIceCandidate(payload.candidate));
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          // 1. Announce presence
          await channel.track({
            displayName: user.displayName,
            isMuted: false,
            isSharingScreen: false
          });

          // 2. We just joined. Get current presence state.
          const state = channel.presenceState();
          // We need to send offers to everyone currently in the room
          for (const key of Object.keys(state)) {
            if (key !== user.id) {
              const peer = createPeerConnection(key, stream);
              const offer = await peer.createOffer();
              await peer.setLocalDescription(offer);
              channel.send({
                type: 'broadcast',
                event: 'offer',
                payload: { target: key, caller: user.id, offer }
              });
            }
          }
        }
      });
  };

  const leaveRoom = () => {
    if (channelRef.current) {
      channelRef.current.unsubscribe();
      channelRef.current = null;
    }
    
    Object.values(peersRef.current).forEach(peer => peer.close());
    peersRef.current = {};
    
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }
    if (screenStream) {
      screenStream.getTracks().forEach(track => track.stop());
      setScreenStream(null);
    }
    
    setParticipants([]);
    setRoomId(null);
  };

  const toggleMute = async () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
        
        if (channelRef.current && user) {
          await channelRef.current.track({
            displayName: user.displayName,
            isMuted: !audioTrack.enabled,
            isSharingScreen
          });
        }
      }
    }
  };

  const replaceVideoTrack = (newTrack: MediaStreamTrack | null) => {
    Object.values(peersRef.current).forEach(peer => {
      const sender = peer.getSenders().find(s => s.track?.kind === 'video');
      if (sender) {
        if (newTrack) {
          sender.replaceTrack(newTrack);
        } else {
          peer.removeTrack(sender);
        }
      } else if (newTrack && localStream) {
        peer.addTrack(newTrack, localStream);
      }
    });
  };

  const toggleScreenShare = async () => {
    if (isSharingScreen && screenStream) {
      screenStream.getTracks().forEach(track => track.stop());
      setScreenStream(null);
      setIsSharingScreen(false);
      replaceVideoTrack(null);
      
      if (channelRef.current && user) {
        await channelRef.current.track({
          displayName: user.displayName,
          isMuted,
          isSharingScreen: false
        });
      }
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      setScreenStream(stream);
      setIsSharingScreen(true);
      
      const videoTrack = stream.getVideoTracks()[0];
      replaceVideoTrack(videoTrack);

      if (channelRef.current && user) {
        await channelRef.current.track({
          displayName: user.displayName,
          isMuted,
          isSharingScreen: true
        });
      }

      videoTrack.onended = async () => {
        setIsSharingScreen(false);
        setScreenStream(null);
        replaceVideoTrack(null);
        if (channelRef.current && user) {
          await channelRef.current.track({
            displayName: user.displayName,
            isMuted,
            isSharingScreen: false
          });
        }
      };
    } catch (err) {
      console.error('Error sharing screen', err);
    }
  };

  return (
    <WebRTCContext.Provider value={{
      participants,
      localStream: isSharingScreen && screenStream ? screenStream : localStream,
      isMuted,
      isSharingScreen,
      toggleMute,
      toggleScreenShare,
      joinRoom,
      leaveRoom,
      error
    }}>
      {children}
    </WebRTCContext.Provider>
  );
};
