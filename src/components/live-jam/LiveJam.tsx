import React, { useEffect, useState, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { supabase } from '../../supabaseClient';
import { TrackEffectInstance } from '../effects/Effects';
import { LIVE_EFFECT_DEFINITIONS } from '../effects/LiveEffects';
import LiveEffectsPanel from '../effects/LiveEffectsPanel';
import { EffectUpdateRegistry } from '../../audio/connectEffectsChain';
import { ConnectEffectsChain } from '../../hooks/useEffectsEngine';

/* A STUN server is a public service that helps your device figure out its own reachable public address 
   (most devices sit behind a router/NAT and don't know their outside facing address on their own) */
const iceServers = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

type Props = {
  projectId: string;
  selectedDeviceId: string;
  getAudioContext: () => AudioContext;
  registryRef: MutableRefObject<EffectUpdateRegistry>;
  connectEffectsChain: ConnectEffectsChain;
};

const LiveJam = ({ projectId, selectedDeviceId, getAudioContext, registryRef, connectEffectsChain }: Props) => {
  const [isConnected, setIsConnected] = useState(false);
  const [status, setStatus] = useState('Not connected');
  const [isMuted, setIsMuted] = useState(false);
  const [liveEffects, setLiveEffects] = useState<TrackEffectInstance[]>([]);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const rawStreamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const destinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const cleanupEffectsRef = useRef<(() => void) | null>(null);
  const senderRef = useRef<RTCRtpSender | null>(null);
  const isMutedRef = useRef(false);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const offerSentRef = useRef(false);
  const liveEffectsRef = useRef<TrackEffectInstance[]>([]);
  const liveEffectTypes = liveEffects.map((effect) => effect.type).join('|');

  liveEffectsRef.current = liveEffects;

  useEffect(() => {
    liveEffects.forEach((effect) => {
      registryRef.current.get(`live-jam:${effect.type}`)?.(effect.params);
    });
  }, [liveEffects, registryRef]);

  useEffect(() => {
    configureSendPath(liveEffectTypes ? liveEffectsRef.current : []);
  }, [liveEffectTypes, connectEffectsChain, getAudioContext]);

  useEffect(() => {
    return () => {
      cleanupEffectsRef.current?.();
      sourceRef.current?.disconnect();
      rawStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      peerConnectionRef.current?.close();
      channelRef.current?.unsubscribe();
    };
  }, []);

  const configureSendPath = async (effects: TrackEffectInstance[]) => {
    if (!rawStreamRef.current) return;

    const rawTrack = rawStreamRef.current.getAudioTracks()[0];
    if (!rawTrack) return;

    if (effects.length === 0) {
      cleanupEffectsRef.current?.();
      cleanupEffectsRef.current = null;
      sourceRef.current?.disconnect();
      sourceRef.current = null;
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      destinationRef.current = null;
      localStreamRef.current = null;

      if (senderRef.current) {
        await senderRef.current.replaceTrack(rawTrack);
        if (senderRef.current.track) {
          senderRef.current.track.enabled = !isMutedRef.current;
        }
      }
      return;
    }

    cleanupEffectsRef.current?.();
    sourceRef.current?.disconnect();

    const ctx = getAudioContext();
    if (ctx.state === 'suspended') await ctx.resume();

    const source = ctx.createMediaStreamSource(rawStreamRef.current);
    const destination = ctx.createMediaStreamDestination();
    sourceRef.current = source;
    destinationRef.current = destination;
    cleanupEffectsRef.current = connectEffectsChain(
      ctx,
      source,
      destination,
      effects,
      'live-jam'
    );
    localStreamRef.current = destination.stream;

    const processedTrack = destination.stream.getAudioTracks()[0];
    if (processedTrack && senderRef.current) {
      await senderRef.current.replaceTrack(processedTrack);
      processedTrack.enabled = !isMutedRef.current;
    }
  };

  const startSession = async () => {
    setStatus('Connecting...');
    console.log('=== Starting jam session ===');

    try {
      const audioConstraints: MediaTrackConstraints & { latency: number } = {
        deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
        latency: 0,
      };
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
      });
      console.log('Got local audio stream:', stream);
      rawStreamRef.current = stream;

      // RTCPeerConnection is the actual object representing the connection to the other person
      const pc = new RTCPeerConnection(iceServers);
      console.log('Created RTCPeerConnection:', pc);
      peerConnectionRef.current = pc;

      // Give mic audio to WebRTC so it gets sent when connected
      rawStreamRef.current.getAudioTracks().forEach((track) => {
        senderRef.current = pc.addTrack(track, rawStreamRef.current!);
        track.enabled = !isMutedRef.current;
        console.log('Added track to peer connection:', track.kind);
      });

      if (liveEffectsRef.current.length > 0) {
        await configureSendPath(liveEffectsRef.current);
      }

      pc.ontrack = (event) => {
        console.log('Received remote track:', event.track.kind);
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = event.streams[0];
          console.log('Attached remote audio to player');
        }
        setStatus('Connected!');
        setIsConnected(true);
      };

      // Fires repeatedly as WebRTC discovers possible network paths for reaching us
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log('ICE candidate discovered:', event.candidate.candidate);
          channelRef.current?.send({
            type: 'broadcast',
            event: 'ice-candidate',
            payload: { candidate: event.candidate },
          });
        } else {
          console.log('ICE candidate gathering complete');
        }
      };

      // pc.onerror = (error) => {
      //   console.error('✗ Peer connection error:', error);
      // };

      // One shared channel per project
      // Only carries small JSON payloads, never audio
      const channel = supabase.channel(`live-jam-${projectId}`);
      console.log('Created Supabase channel:', `live-jam-${projectId}`);
      channelRef.current = channel;

      // Add the presence listener BEFORE subscribing
      channel.on('presence', { event: 'join' }, async ({ key, newPresences }) => {
        console.log('Other peer joined! Presence key:', key);

        // Only create offer if we haven't already
        if (offerSentRef.current) {
          console.log('Offer already sent, waiting for answer...');
          return;
        }

        console.log('Initiating offer...');
        offerSentRef.current = true;

        try {
          const offer = await pc.createOffer();
          console.log('Created offer');
          await pc.setLocalDescription(offer);
          console.log('Set local description (offer)');
          channel.send({ type: 'broadcast', event: 'offer', payload: { offer } });
          console.log('Sent offer to remote peer');
        } catch (err) {
          console.error('Error creating/sending offer:', err);
          offerSentRef.current = false; // Reset on error
        }
      });

      // Someone else is already in live-jam and sent an offer, accept it and send back an answer
      channel.on('broadcast', { event: 'offer' }, async ({ payload }: { payload: { offer: RTCSessionDescriptionInit } }) => {
        console.log('Received offer from remote peer');
        console.log('Offer details:', payload.offer);
        await pc.setRemoteDescription(new RTCSessionDescription(payload.offer));
        console.log('Set remote description (offer)');
        const answer = await pc.createAnswer();
        console.log('Created answer');
        await pc.setLocalDescription(answer);
        console.log('Set local description (answer)');
        channel.send({ type: 'broadcast', event: 'answer', payload: { answer } });
        console.log('Sent answer to remote peer');
      });

      channel.on('broadcast', { event: 'answer' }, async ({ payload }: { payload: { answer: RTCSessionDescriptionInit } }) => {
        console.log('Received answer from remote peer');
        console.log('Answer details:', payload.answer);
        await pc.setRemoteDescription(new RTCSessionDescription(payload.answer));
        console.log('Set remote description (answer)');
      });

      channel.on('broadcast', { event: 'ice-candidate' }, async ({ payload }: { payload: { candidate: RTCIceCandidateInit } }) => {
        try {
          console.log('Received ICE candidate from remote peer');
          await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
          console.log('Added remote ICE candidate');
        } catch (err) {
          console.error('Error adding ICE candidate:', err);
        }
      });

      // NOW subscribe, after all listeners are registered
      channel.subscribe(async (subStatus: string) => {
        console.log('Channel subscription status:', subStatus);
        if (subStatus !== 'SUBSCRIBED') return;

        console.log('Channel subscribed successfully');

        await channel.track({ joinedAt: Date.now() });
        console.log('Tracked own presence');
      });
    } catch (err) {
      console.error('Error starting session:', err);
      setStatus(`Error: ${err}`);
    }
  };

  const toggleMute = () => {
    const nextMuted = !isMutedRef.current;
    isMutedRef.current = nextMuted;
    senderRef.current?.track && (senderRef.current.track.enabled = !nextMuted);
    setIsMuted(nextMuted);
    console.log(nextMuted ? 'Muted' : 'Unmuted');
  };

  const toggleEffect = (type: string) => {
    setLiveEffects((current) => {
      const exists = current.some((effect) => effect.type === type);
      if (exists) return current.filter((effect) => effect.type !== type);

      const definition = LIVE_EFFECT_DEFINITIONS.find((effect) => effect.type === type);
      if (!definition) return current;
      return [...current, { type, params: { ...definition.defaultParams } }];
    });
  };

  const updateEffectParam = (type: string, key: string, value: number) => {
    setLiveEffects((current) =>
      current.map((effect) =>
        effect.type === type
          ? { ...effect, params: { ...effect.params, [key]: value } }
          : effect
      )
    );
  };

  const endSession = () => {
    console.log('=== Ending jam session ===');
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    senderRef.current = null;
    cleanupEffectsRef.current?.();
    cleanupEffectsRef.current = null;
    sourceRef.current?.disconnect();
    sourceRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    rawStreamRef.current?.getTracks().forEach((track) => track.stop());
    rawStreamRef.current = null;
    destinationRef.current = null;
    channelRef.current?.unsubscribe();
    channelRef.current = null;
    offerSentRef.current = false;
    isMutedRef.current = false;
    setIsConnected(false);
    setStatus('Not connected');
    setIsMuted(false);
    console.log('Session ended');
  };

  return (
    <div style={{ marginTop: 20 }}>
      <h3>Live Jam Session</h3>
      <p>Status: {status}</p>
      <LiveEffectsPanel
        definitions={LIVE_EFFECT_DEFINITIONS}
        effects={liveEffects}
        onToggleEffect={toggleEffect}
        onUpdateEffectParam={updateEffectParam}
      />

      {!isConnected ? (
        <button onClick={startSession}>Start / Join Session</button>
      ) : (
        <div style={{display: 'flex', gap: '10px'}}>
          <button onClick={toggleMute}>
            {isMuted ? 'Unmute' : 'Mute'}
          </button>
          <button onClick={endSession}>Leave Session</button>
        </div>
      )}
      <audio ref={remoteAudioRef} autoPlay />
    </div>
  );
};

export default LiveJam;