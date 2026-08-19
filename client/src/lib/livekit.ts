import { SignJWT } from 'jose';

export async function createLiveKitToken(roomName: string, participantName: string, participantId: string): Promise<string> {
  const apiKey = import.meta.env.VITE_LIVEKIT_API_KEY;
  const apiSecret = import.meta.env.VITE_LIVEKIT_API_SECRET;
  
  if (!apiKey || !apiSecret) {
    console.error('Status das chaves -> API_KEY:', !!apiKey, '| API_SECRET:', !!apiSecret);
    throw new Error(`Credenciais do LiveKit ausentes nas variáveis de ambiente. Verifique o console.`);
  }

  const secret = new TextEncoder().encode(apiSecret);
  
  const token = await new SignJWT({
    name: participantName,
    video: {
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    }
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(apiKey)
    .setExpirationTime('12h')
    .setSubject(participantId)
    .setNotBefore(Math.floor(Date.now() / 1000) - 10) // Allow 10 sec clock skew
    .sign(secret);
    
  return token;
}
