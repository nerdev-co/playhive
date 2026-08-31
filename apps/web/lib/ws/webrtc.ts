"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useWebSocket } from "./hooks";

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

function isValidSdp(sdp: unknown): sdp is RTCSessionDescriptionInit {
  return (
    typeof sdp === "object" &&
    sdp !== null &&
    "type" in sdp &&
    "sdp" in sdp &&
    typeof (sdp as RTCSessionDescriptionInit).type === "string" &&
    typeof (sdp as RTCSessionDescriptionInit).sdp === "string" &&
    (sdp as RTCSessionDescriptionInit).sdp!.length > 0
  );
}

export function useWebRTC({ roomId, targetPlayerId, iceServers = DEFAULT_ICE_SERVERS }: UseWebRTCOptions) {
  const { send, on } = useWebSocket();
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [mediaState, setMediaState] = useState<MediaState>({ audio: false, video: false });
  const [connected, setConnected] = useState(false);

  const getOrCreatePC = useCallback(() => {
    if (pcRef.current) return pcRef.current;

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

  const startMedia = useCallback(
    async (constraints: MediaStreamConstraints) => {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;

      const pc = getOrCreatePC();
      for (const track of stream.getTracks()) {
        pc.addTrack(track, stream);
      }

      const offer = await pc.createOffer();
      console.log("[webrtc] startMedia offer:", JSON.stringify({ type: offer.type, sdpLen: offer.sdp?.length }));
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
        type: "MEDIA_OFFER",
        payload: {
          to: targetPlayerId,
          payload: { sdp: { type: offer.type!, sdp: offer.sdp! } },
        },
      });
      setMediaState((s) => ({ ...s, audio: true }));
    }
  }, [mediaState.audio, getOrCreatePC, targetPlayerId, send]);

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
      const sdpPayload = { type: offer.type!, sdp: offer.sdp! };
      send({
        v: 1,
        type: "MEDIA_OFFER",
        payload: {
          to: targetPlayerId,
          payload: { sdp: sdpPayload },
        },
      });
      setMediaState((s) => ({ ...s, video: true }));
    }
  }, [mediaState.video, getOrCreatePC, targetPlayerId, send]);

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
    const unsubs = [
      on("MEDIA_OFFER", (data: unknown) => {
        const raw = JSON.stringify(data);
        console.log("[webrtc] MEDIA_OFFER raw:", raw);
        (async () => {
          try {
            const d = data as Record<string, unknown>;
            const p = d.payload as Record<string, unknown> | undefined;
            if (!p) return;
            const from = p.from as string | undefined;
            const inner = p.payload as Record<string, unknown> | undefined;
            if (!from || !inner) return;
            if (from === targetPlayerId) return;
            const sdp = inner.sdp as Record<string, unknown> | undefined;
            if (!sdp || typeof sdp.type !== "string" || typeof sdp.sdp !== "string") {
              console.warn("[webrtc] MEDIA_OFFER bad SDP:", JSON.stringify(sdp));
              return;
            }
            const desc: RTCSessionDescriptionInit = { type: sdp.type as RTCSdpType, sdp: sdp.sdp as string };
            console.log("[webrtc] MEDIA_OFFER setRemoteDescription:", JSON.stringify(desc));
            const pc = getOrCreatePC();
            await pc.setRemoteDescription(desc);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            send({
              v: 1,
              type: "MEDIA_ANSWER",
              payload: {
                to: from,
                payload: { sdp: { type: answer.type!, sdp: answer.sdp! } },
              },
            });
          } catch (err) {
            console.warn("[webrtc] MEDIA_OFFER handling failed:", err);
          }
        })();
      }),

      on("MEDIA_ANSWER", (data: unknown) => {
        (async () => {
          try {
            const d = data as Record<string, unknown>;
            const p = d.payload as Record<string, unknown> | undefined;
            if (!p) return;
            const from = p.from as string | undefined;
            const inner = p.payload as Record<string, unknown> | undefined;
            if (!inner) return;
            if (from === targetPlayerId) return;
            const sdp = inner.sdp as Record<string, unknown> | undefined;
            if (!sdp || typeof sdp.type !== "string" || typeof sdp.sdp !== "string") return;
            const desc: RTCSessionDescriptionInit = { type: sdp.type as RTCSdpType, sdp: sdp.sdp as string };

            const pc = pcRef.current;
            if (pc) {
              await pc.setRemoteDescription(desc);
            }
          } catch (err) {
            console.warn("[webrtc] MEDIA_ANSWER handling failed:", err);
          }
        })();
      }),

      on("MEDIA_ICE", (data: unknown) => {
        (async () => {
          try {
            const d = data as Record<string, unknown>;
            const p = d.payload as Record<string, unknown> | undefined;
            if (!p) return;
            const from = p.from as string | undefined;
            const inner = p.payload as Record<string, unknown> | undefined;
            if (!inner?.candidate) return;
            if (from === targetPlayerId) return;

            const pc = pcRef.current;
            if (pc) {
              await pc.addIceCandidate(inner.candidate as RTCIceCandidateInit);
            }
          } catch (err) {
            console.warn("[webrtc] MEDIA_ICE handling failed:", err);
          }
        })();
      }),
    ];

    return () => unsubs.forEach((u) => u());
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
