import React, { useEffect, useRef, useState } from 'react';

const MAX_PHOTO_WIDTH = 720; // keeps uploads ~60-120 KB so they finish on slow networks

function getPosition(options) {
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, options));
}

// High-accuracy GPS often times out indoors. Fall back to a network/cached
// fix instead of failing the whole attendance attempt.
async function getLocation() {
  if (!navigator.geolocation) throw new Error('This browser cannot share location. Please use Chrome or Safari.');
  try {
    return await getPosition({ enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
  } catch (err) {
    if (err.code === 1) throw err; // permission denied - retrying won't help
    return await getPosition({ enableHighAccuracy: false, timeout: 15000, maximumAge: 5 * 60 * 1000 });
  }
}

function locationErrorMessage(err) {
  if (err?.code === 1) return 'Location permission is blocked. Allow location for this site in your browser settings, then tap Capture again.';
  if (err?.code === 3) return 'Getting your location took too long. Move near a window or turn on Wi-Fi, then tap Capture again.';
  return err?.message || 'Could not read your location. Turn on location services and tap Capture again.';
}

export default function CameraCapture({ mode, onCapture, onCancel }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const [status, setStatus] = useState('Starting camera…');
  const [ready, setReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [captureError, setCaptureError] = useState('');

  function stopStream() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Camera is not available. Open this site over https in Chrome or Safari.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        if (cancelled) return;
        setStatus('Position your face in the frame, then tap Capture');
        setReady(true);
      } catch (err) {
        if (!cancelled) {
          setCameraError('Camera access is required to mark attendance. Allow camera permission for this site and reopen.');
        }
      }
    }

    start();
    return () => {
      cancelled = true;
      stopStream();
    };
  }, []);

  function grabFrame() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return Promise.resolve(null);

    const scale = Math.min(1, MAX_PHOTO_WIDTH / vw);
    canvas.width = Math.round(vw * scale);
    canvas.height = Math.round(vh * scale);
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
  }

  async function handleCapture() {
    setCapturing(true);
    setCaptureError('');
    try {
      const blob = await grabFrame();
      if (!blob) throw new Error('The camera is not ready yet. Wait a second and tap Capture again.');

      setStatus('Getting your location…');
      let pos;
      try {
        pos = await getLocation();
      } catch (err) {
        throw new Error(locationErrorMessage(err));
      }

      stopStream();
      onCapture(blob, pos.coords.latitude, pos.coords.longitude);
    } catch (err) {
      setCaptureError(err.message);
      setStatus('Position your face in the frame, then tap Capture');
      setCapturing(false);
    }
  }

  function handleCancel() {
    stopStream();
    onCancel();
  }

  const message = cameraError || captureError || status;

  return (
    <div className="camera-overlay">
      <video ref={videoRef} className="camera-video" muted playsInline autoPlay />
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      <div className="camera-face-ring" />
      <button className="camera-cancel" onClick={handleCancel}>Cancel</button>

      <div className="camera-prompt-bar">
        <div className={`prompt ${cameraError || captureError ? 'prompt-error' : ''}`}>{message}</div>
        <div className="mode">{mode === 'login' ? 'Marking Login' : 'Marking Logout'}</div>
        <button className="camera-capture-btn" onClick={handleCapture} disabled={!ready || capturing || !!cameraError}>
          {capturing ? 'Capturing…' : 'Capture Photo'}
        </button>
      </div>
    </div>
  );
}
