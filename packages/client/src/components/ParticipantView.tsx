/**
 * ParticipantView - Component for rendering a participant with their tracks
 */

import { useMemo } from 'react';
import type { Participant } from '../types';
import { VideoTrack } from './VideoTrack';
import { AudioTrack } from './AudioTrack';

interface ParticipantViewProps {
  participant: Participant;
  className?: string;
  videoClassName?: string;
  objectFit?: 'contain' | 'cover' | 'fill';
  showAudioIndicator?: boolean;
  showIdentity?: boolean;
  onVideoElement?: (element: HTMLVideoElement | null) => void;
}

/**
 * ParticipantView component - Renders a participant with their tracks
 */
export function ParticipantView({
  participant,
  className = '',
  videoClassName = '',
  objectFit = 'contain',
  showAudioIndicator = true,
  showIdentity = true,
  onVideoElement,
}: ParticipantViewProps): JSX.Element | null {
  const videoTracks = useMemo(() => {
    const tracks: Array<{ track: any; sid: string }> = [];
    for (const publication of participant.getTracks()) {
      if (publication.track && publication.track.kind === 'video') {
        tracks.push({ track: publication.track, sid: publication.sid });
      }
    }
    return tracks;
  }, [participant]);

  const audioTracks = useMemo(() => {
    const tracks: Array<{ track: any; sid: string }> = [];
    for (const publication of participant.getTracks()) {
      if (publication.track && publication.track.kind === 'audio') {
        tracks.push({ track: publication.track, sid: publication.sid });
      }
    }
    return tracks;
  }, [participant]);

  const hasAudio = audioTracks.length > 0;
  const isAudioMuted = hasAudio && audioTracks.some((t) => t.track.isMuted);

  if (!participant) {
    return null;
  }

  const displayName = participant.name || participant.identity;

  return (
    <div className={`participant-view ${className}`}>
      {/* Video tracks */}
      {videoTracks.length > 0 ? (
        <div className="participant-video">
          {videoTracks.map(({ track, sid }) => (
            <VideoTrack
              key={sid}
              track={track}
              className={videoClassName}
              objectFit={objectFit}
              onVideoElement={onVideoElement}
            />
          ))}
        </div>
      ) : (
        <div className="participant-placeholder">
          <div className="placeholder-avatar">{displayName.charAt(0).toUpperCase()}</div>
        </div>
      )}

      {/* Audio tracks (hidden) */}
      {audioTracks.map(({ track, sid }) => (
        <AudioTrack key={sid} track={track} />
      ))}

      {/* Audio indicator */}
      {showAudioIndicator && hasAudio && (
        <div className="participant-audio-indicator">
          {isAudioMuted ? (
            <span className="audio-muted">🔇</span>
          ) : (
            <span className="audio-active">🔊</span>
          )}
        </div>
      )}

      {/* Identity display */}
      {showIdentity && (
        <div className="participant-identity">
          <span className="participant-name">{displayName}</span>
        </div>
      )}
    </div>
  );
}
