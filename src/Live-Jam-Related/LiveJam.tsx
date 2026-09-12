import React, { useState, useRef } from 'react';
import { supabase } from '../supabaseClient';

/* A STUN server is a public service that helps your device figure out its own reachable public address 
   (most devices sit behind a router/NAT and don't know their outside facing address on their own) */
const iceServers = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

const LiveJam = ({ projectId }: { projectId: string }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [status, setStatus] = useState('Not connected');

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const startSession = async () => {
    setStatus('Connecting...');
    console.log('=== Starting jam session ===');

    try {
      // Same audio constraints as monitoring/recording
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      console.log('✓ Got local mic stream:', stream);
      localStreamRef.current = stream;

      // RTCPeerConnection is the actual object representing the connection to the other person
      const pc = new RTCPeerConnection(iceServers);
      console.log('✓ Created RTCPeerConnection:', pc);
      peerConnectionRef.current = pc;

      // Give mic audio to WebRTC so it gets sent when connected
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
        console.log('✓ Added track to peer connection:', track.kind);
      });

      pc.ontrack = (event) => {
        console.log('✓ Received remote track:', event.track.kind);
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = event.streams[0];
          console.log('✓ Attached remote audio to player');
        }
        setStatus('Connected!');
        setIsConnected(true);
      };

      // Fires repeatedly as WebRTC discovers possible network paths for reaching us
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log('✓ ICE candidate discovered:', event.candidate.candidate);
          channelRef.current?.send({
            type: 'broadcast',
            event: 'ice-candidate',
            payload: { candidate: event.candidate },
          });
        } else {
          console.log('✓ ICE candidate gathering complete');
        }
      };

      // pc.onerror = (error) => {
      //   console.error('✗ Peer connection error:', error);
      // };

      // One shared channel per project
      // Only carries small JSON payloads, never audio
      const channel = supabase.channel(`live-jam-${projectId}`);
      console.log('✓ Created Supabase channel:', `live-jam-${projectId}`);
      channelRef.current = channel;

      // Add the presence listener BEFORE subscribing
      channel.on('presence', { event: 'join' }, async ({ key, newPresences }) => {
        console.log('✓ Other peer joined! Presence key:', key);
        console.log('Initiating offer...');
        
        const offer = await pc.createOffer();
        console.log('✓ Created offer');
        await pc.setLocalDescription(offer);
        console.log('✓ Set local description (offer)');
        channel.send({ type: 'broadcast', event: 'offer', payload: { offer } });
        console.log('✓ Sent offer to remote peer');
      });

      // Someone else is already in live-jam and sent an offer, accept it and send back an answer
      channel.on('broadcast', { event: 'offer' }, async ({ payload }: { payload: { offer: RTCSessionDescriptionInit } }) => {
        console.log('✓ Received offer from remote peer');
        console.log('Offer details:', payload.offer);
        await pc.setRemoteDescription(new RTCSessionDescription(payload.offer));
        console.log('✓ Set remote description (offer)');
        const answer = await pc.createAnswer();
        console.log('✓ Created answer');
        await pc.setLocalDescription(answer);
        console.log('✓ Set local description (answer)');
        channel.send({ type: 'broadcast', event: 'answer', payload: { answer } });
        console.log('✓ Sent answer to remote peer');
      });

      channel.on('broadcast', { event: 'answer' }, async ({ payload }: { payload: { answer: RTCSessionDescriptionInit } }) => {
        console.log('✓ Received answer from remote peer');
        console.log('Answer details:', payload.answer);
        await pc.setRemoteDescription(new RTCSessionDescription(payload.answer));
        console.log('✓ Set remote description (answer)');
      });

      channel.on('broadcast', { event: 'ice-candidate' }, async ({ payload }: { payload: { candidate: RTCIceCandidateInit } }) => {
        try {
          console.log('✓ Received ICE candidate from remote peer');
          await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
          console.log('✓ Added remote ICE candidate');
        } catch (err) {
          console.error('Error adding ICE candidate:', err);
        }
      });

      // NOW subscribe, after all listeners are registered
      channel.subscribe(async (subStatus: string) => {
        console.log('Channel subscription status:', subStatus);
        if (subStatus !== 'SUBSCRIBED') return;

        console.log('✓ Channel subscribed successfully');

        await channel.track({ joinedAt: Date.now() });
        console.log('✓ Tracked own presence');
      });
    } catch (err) {
      console.error('✗ Error starting session:', err);
      setStatus(`Error: ${err}`);
    }
  };

  const endSession = () => {
    console.log('=== Ending jam session ===');
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    channelRef.current?.unsubscribe();
    channelRef.current = null;
    setIsConnected(false);
    setStatus('Not connected');
    console.log('✓ Session ended');
  };

  return (
    <div style={{ marginTop: 20 }}>
      <h3>Live Jam Session</h3>
      <p>Status: {status}</p>
      {!isConnected ? (
        <button onClick={startSession}>Start / Join Session</button>
      ) : (
        <button onClick={endSession}>Leave Session</button>
      )}
      <audio ref={remoteAudioRef} autoPlay />
    </div>
  );
};

export default LiveJam;