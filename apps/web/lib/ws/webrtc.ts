"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useWebSocket } from "./hooks";

const WEBRTC_HOOK_VERSION = 3;

export interface MediaState {
  audio: boolean;
  video: boolean;
}

interface UseWebRTCOptions {
  roomId: string;
  targetPlayerId: string;
  iceServers?: RTCIceServer[];
}

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  {
    urls: ["turn:localhost:3478?transport=udp", "turn:localhost:3478?transport=tcp"],
    username: "turnuser",
    credential: "turnpass",
  },
];

function safeSetRemoteDescription(pc: RTCPeerConnection, desc: RTCSessionDescriptionInit): Promise<void> {
  const plain = { type: desc.type, sdp: desc.sdp };
  console.log("[webrtc] setRemoteDescription called with:", JSON.stringify(plain));
  if (!plain.type || !plain.sdp) {
    console.error("[webrtc] REJECTED: desc is", plain);
    return Promise.resolve();
  }
  return pc.setRemoteDescription(plain);
}

function extractSdpFromPayload(data: unknown): { from: string; sdp: RTCSessionDescriptionInit } | null {
  const d = data as Record<string, unknown>;
  const p = d?.payload as Record<string, unknown> | undefined;
  if (!p) return null;
  const from = p.from as string | undefined;
  const inner = p.payload as Record<string, unknown> | undefined;
  if (!from || !inner) return null;
  const sdp = inner.sdp as Record<string, unknown> | undefined;
  if (!sdp || typeof sdp.type !== "string" || typeof sdp.sdp !== "string" || (sdp.sdp as string).length === 0) {
    return null;
  }
  return { from, sdp: { type: sdp.type as RTCSdpType, sdp: sdp.sdp as string } };
}

export function useWebRTC({ roomId, targetPlayerId, iceServers = DEFAULT_ICE_SERVERS }: UseWebRTCOptions) {
  const { send, on } = useWebSocket();
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [mediaState, setMediaState] = useState<MediaState>({ audio: false, video: false });
  const [connected, setConnected] = useState(false);

  const getOrCreatePC = useCallback(() => {
    if (pcRef.current && pcRef.current.connectionState !== "closed") return pcRef.current;

    const pc = new RTCPeerConnection({ iceServers });
    pcRef.current = pc;

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        send({
          v: 1,
          type: "MEDIA_ICE",
          payload: {
            to: targetPlayerId,
            payload: { candidate: e.candidate.toJSON() },
          },
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
  }, [targetPlayerId, iceServers, send]);

  const sendOffer = useCallback(
    async (constraints: MediaStreamConstraints) => {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;

      const pc = getOrCreatePC();
      for (const track of stream.getTracks()) {
        pc.addTrack(track, stream);
      }

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const sdp = { type: offer.type!, sdp: offer.sdp! };

      send({
        v: 1,
        type: "MEDIA_OFFER",
        payload: {
          to: targetPlayerId,
          payload: { sdp },
        },
      });

      setMediaState({
        audio: !!constraints.audio,
        video: !!constraints.video,
      });

      return stream;
    },
    [getOrCreatePC, targetPlayerId, send],
  );

  const startMedia = useCallback(
    (constraints: MediaStreamConstraints) => sendOffer(constraints),
    [sendOffer],
  );

  const toggleAudio = useCallback(async () => {
    if (mediaState.audio) {
      localStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = false));
      setMediaState((s) => ({ ...s, audio: false }));
    } else {
      await sendOffer({ audio: true });
      setMediaState((s) => ({ ...s, audio: true }));
    }
  }, [mediaState.audio, sendOffer]);

  const toggleVideo = useCallback(async () => {
    if (mediaState.video) {
      localStreamRef.current?.getVideoTracks().forEach((t) => (t.enabled = false));
      setMediaState((s) => ({ ...s, video: false }));
    } else {
      await sendOffer({ video: true });
      setMediaState((s) => ({ ...s, video: true }));
    }
  }, [mediaState.video, sendOffer]);

  const stopAll = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    setRemoteStream(null);
    setMediaState({ audio: false, video: false });
    setConnected(false);
  }, []);

  useEffect(() => {
    console.log(`[webrtc] hook v${WEBRTC_HOOK_VERSION} effect running, target=${targetPlayerId}`);

    const unsubOffer = on("MEDIA_OFFER", (data: unknown) => {
      console.log("[webrtc] MEDIA_OFFER received, raw:", JSON.stringify(data).slice(0, 500));
      const parsed = extractSdpFromPayload(data);
      if (!parsed) {
        console.warn("[webrtc] MEDIA_OFFER: could not extract SDP from payload");
        return;
      }
      if (parsed.from === targetPlayerId) {
        console.log("[webrtc] MEDIA_OFFER: skipping self");
        return;
      }
      console.log("[webrtc] MEDIA_OFFER: SDP OK, setting remote description");
      (async () => {
        try {
          const pc = getOrCreatePC();
          await safeSetRemoteDescription(pc, parsed.sdp);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          send({
            v: 1,
            type: "MEDIA_ANSWER",
            payload: {
              to: parsed.from,
              payload: { sdp: { type: answer.type!, sdp: answer.sdp! } },
            },
          });
          console.log("[webrtc] MEDIA_ANSWER sent to", parsed.from);
        } catch (err) {
          console.error("[webrtc] MEDIA_OFFER handling error:", err);
        }
      })();
    });

    const unsubAnswer = on("MEDIA_ANSWER", (data: unknown) => {
      console.log("[webrtc] MEDIA_ANSWER received, raw:", JSON.stringify(data).slice(0, 500));
      const parsed = extractSdpFromPayload(data);
      if (!parsed) return;
      if (parsed.from === targetPlayerId) return;
      (async () => {
        try {
          const pc = pcRef.current;
          if (pc) {
            await safeSetRemoteDescription(pc, parsed.sdp);
          }
        } catch (err) {
          console.error("[webrtc] MEDIA_ANSWER handling error:", err);
        }
      })();
    });

    const unsubIce = on("MEDIA_ICE", (data: unknown) => {
      const d = data as Record<string, unknown>;
      const p = d?.payload as Record<string, unknown> | undefined;
      if (!p) return;
      const from = p.from as string | undefined;
      const inner = p.payload as Record<string, unknown> | undefined;
      if (!inner?.candidate || from === targetPlayerId) return;
      (async () => {
        try {
          const pc = pcRef.current;
          if (pc) {
            await pc.addIceCandidate(inner.candidate as RTCIceCandidateInit);
          }
        } catch (err) {
          console.warn("[webrtc] MEDIA_ICE handling error:", err);
        }
      })();
    });

    return () => {
      console.log(`[webrtc] hook v${WEBRTC_HOOK_VERSION} effect cleanup`);
      unsubOffer();
      unsubAnswer();
      unsubIce();
    };
  }, [on, targetPlayerId, send, getOrCreatePC]);

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
