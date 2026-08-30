"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useWebSocket } from "./hooks";

export interface MediaState {
  audio: boolean;
  video: boolean;
  screen: boolean;
}

interface UseWebRTCOptions {
  roomId: string;
  seatIndex: number;
  iceServers?: RTCIceServer[];
}

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export function useWebRTC({ roomId, seatIndex, iceServers = DEFAULT_ICE_SERVERS }: UseWebRTCOptions) {
  const { send, on } = useWebSocket();
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [mediaState, setMediaState] = useState<MediaState>({ audio: false, video: false, screen: false });
  const [connected, setConnected] = useState(false);

  const getOrCreatePC = useCallback(() => {
    if (pcRef.current) return pcRef.current;

    const pc = new RTCPeerConnection({ iceServers });
    pcRef.current = pc;

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        send({
          v: 1,
          type: "WEBRTC_ICE",
          roomId,
          payload: { seat: seatIndex, candidate: e.candidate.toJSON() },
        });
      }
    };

    pc.ontrack = (e) => {
      setRemoteStream(e.streams[0] ?? null);
    };

    pc.onconnectionstatechange = () => {
      setConnected(pc.connectionState === "connected");
    };

    return pc;
  }, [roomId, seatIndex, iceServers, send]);

  const startMedia = useCallback(
    async (constraints: MediaStreamConstraints) => {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;

      const pc = getOrCreatePC();
      for (const track of stream.getTracks()) {
        pc.addTrack(track, stream);
      }

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      send({
        v: 1,
        type: "WEBRTC_OFFER",
        roomId,
        payload: { seat: seatIndex, sdp: offer },
      });

      setMediaState({
        audio: !!constraints.audio,
        video: !!constraints.video,
        screen: false,
      });

      return stream;
    },
    [getOrCreatePC, roomId, seatIndex, send],
  );

  const toggleAudio = useCallback(async () => {
    if (mediaState.audio) {
      localStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = false));
      setMediaState((s) => ({ ...s, audio: false }));
    } else {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const pc = getOrCreatePC();
      for (const track of stream.getAudioTracks()) {
        pc.addTrack(track, stream);
      }
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      send({
        v: 1,
        type: "WEBRTC_OFFER",
        roomId,
        payload: { seat: seatIndex, sdp: offer },
      });
      setMediaState((s) => ({ ...s, audio: true }));
    }
  }, [mediaState.audio, getOrCreatePC, roomId, seatIndex, send]);

  const toggleVideo = useCallback(async () => {
    if (mediaState.video) {
      localStreamRef.current?.getVideoTracks().forEach((t) => (t.enabled = false));
      setMediaState((s) => ({ ...s, video: false }));
    } else {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      const pc = getOrCreatePC();
      for (const track of stream.getVideoTracks()) {
        pc.addTrack(track, stream);
      }
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      send({
        v: 1,
        type: "WEBRTC_OFFER",
        roomId,
        payload: { seat: seatIndex, sdp: offer },
      });
      setMediaState((s) => ({ ...s, video: true }));
    }
  }, [mediaState.video, getOrCreatePC, roomId, seatIndex, send]);

  const stopAll = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    setRemoteStream(null);
    setMediaState({ audio: false, video: false, screen: false });
    setConnected(false);
  }, []);

  useEffect(() => {
    const unsubs = [
      on("WEBRTC_OFFER", async (data: unknown) => {
        const msg = data as { seat: number; sdp: RTCSessionDescriptionInit };
        if (msg.seat === seatIndex) return;

        const pc = getOrCreatePC();
        await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        send({
          v: 1,
          type: "WEBRTC_ANSWER",
          roomId,
          payload: { seat: seatIndex, sdp: answer },
        });
      }),

      on("WEBRTC_ANSWER", async (data: unknown) => {
        const msg = data as { seat: number; sdp: RTCSessionDescriptionInit };
        if (msg.seat === seatIndex) return;
        const pc = pcRef.current;
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        }
      }),

      on("WEBRTC_ICE", async (data: unknown) => {
        const msg = data as { seat: number; candidate: RTCIceCandidateInit };
        if (msg.seat === seatIndex) return;
        const pc = pcRef.current;
        if (pc && msg.candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
        }
      }),
    ];

    return () => unsubs.forEach((u) => u());
  }, [on, seatIndex, roomId, send, getOrCreatePC]);

  return {
    remoteStream,
    mediaState,
    connected,
    startMedia,
    toggleAudio,
    toggleVideo,
    stopAll,
  };
}
