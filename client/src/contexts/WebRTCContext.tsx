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
  audioInputId: string;
  audioOutputId: string;
  setAudioOutputId: (id: string) => void;
  changeAudioInput: (deviceId: string) => Promise<void>;
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
  const [audioInputId, setAudioInputId] = useState<string>('default');
  const [audioOutputId, setAudioOutputId] = useState<string>('default');
  const [error, setError] = useState<string | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const peersRef = useRef<{ [userId: string]: RTCPeerConnection }>({});
  const remoteStreamsRef = useRef<{ [userId: string]: MediaStream }>({});

  const initLocalStream = async () => {
    try {
      const constraints = {
        audio: audioInputId === 'default' ? true : { deviceId: { exact: audioInputId } },
        video: false
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setLocalStream(stream);
      return stream;
    } catch (err) {
      console.error('Error accessing microphone', err);
      setError('Permissão de microfone negada ou indisponível.');
      return null;
    }
  };

  const changeAudioInput = async (deviceId: string) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } }, video: false });
      const newTrack = stream.getAudioTracks()[0];
      
      if (isMuted) {
        newTrack.enabled = false;
      }

      if (localStream) {
        const oldTrack = localStream.getAudioTracks()[0];
        if (oldTrack) {
          localStream.removeTrack(oldTrack);
          oldTrack.stop();
        }
        localStream.addTrack(newTrack);
      } else {
        setLocalStream(stream);
      }

      Object.values(peersRef.current).forEach(peer => {
        const sender = peer.getSenders().find(s => s.track?.kind === 'audio');
        if (sender) {
          sender.replaceTrack(newTrack);
        }
      });

      setAudioInputId(deviceId);
    } catch (err) {
      console.error('Error changing audio input', err);
      setError('Erro ao trocar microfone.');
    }
  };

  const createPeerConnection = (targetUserId: string, stream: MediaStream) => {
    const peer = new RTCPeerConnection(ICE_SERVERS);

    stream.getTracks().forEach(track => {
      peer.addTrack(track, stream);
    });

    peer.ontrack = (event) => {
      remoteStreamsRef.current[targetUserId] = event.streams[0];
      setParticipants(prev => {
        const exists = prev.some(p => p.userId === targetUserId);
        if (exists) {
          return prev.map(p => {
            if (p.userId === targetUserId) {
              return { ...p, stream: event.streams[0] };
            }
            return p;
          });
        }
        // If not in state yet, presence sync will pick it up from remoteStreamsRef later
        return prev;
      });
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

    peer.onnegotiationneeded = async () => {
      try {
        if (peer.signalingState !== 'stable') return;
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        if (channelRef.current && user) {
          channelRef.current.send({
            type: 'broadcast',
            event: 'offer',
            payload: { target: targetUserId, caller: user.id, offer }
          });
        }
      } catch (err) {
        console.error('Error during negotiation', err);
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
            stream: remoteStreamsRef.current[key] || participants.find(p => p.userId === key)?.stream
          });
        }
        
        setParticipants(prev => {
          return users.map(u => {
            // Priority to existing streams, but remoteStreamsRef handles race conditions
            const existing = prev.find(p => p.userId === u.userId);
            const streamToUse = u.stream || existing?.stream;
            return { ...u, stream: streamToUse };
          });
        });
      })
      .on('presence', { event: 'join' }, async ({ key }) => {
        if (key === user.id) return;
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        if (peersRef.current[key]) {
          peersRef.current[key].close();
          delete peersRef.current[key];
        }
      })
      .on('broadcast', { event: 'offer' }, async ({ payload }) => {
        if (payload.target !== user.id) return;
        
        try {
          let peer = peersRef.current[payload.caller];
          if (!peer) {
            peer = createPeerConnection(payload.caller, localStream || stream);
          }
          await peer.setRemoteDescription(new RTCSessionDescription(payload.offer));
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          
          channel.send({
            type: 'broadcast',
            event: 'answer',
            payload: { target: payload.caller, caller: user.id, answer }
          });
        } catch (err) {
          console.error('Error handling offer:', err);
        }
      })
      .on('broadcast', { event: 'answer' }, async ({ payload }) => {
        if (payload.target !== user.id) return;
        const peer = peersRef.current[payload.caller];
        if (peer) {
          try {
            await peer.setRemoteDescription(new RTCSessionDescription(payload.answer));
          } catch (err) {
            console.error('Error handling answer:', err);
          }
        }
      })
      .on('broadcast', { event: 'ice-candidate' }, async ({ payload }) => {
        if (payload.target !== user.id) return;
        const peer = peersRef.current[payload.caller];
        if (peer) {
          try {
            await peer.addIceCandidate(new RTCIceCandidate(payload.candidate));
          } catch (err) {
            console.error('Error handling ice candidate:', err);
          }
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            displayName: user.displayName,
            isMuted: false,
            isSharingScreen: false
          });

          const state = channel.presenceState();
          for (const key of Object.keys(state)) {
            if (key !== user.id) {
              // Creating the peer will automatically trigger onnegotiationneeded and send an offer
              createPeerConnection(key, stream);
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
      audioInputId,
      audioOutputId,
      setAudioOutputId,
      changeAudioInput,
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
