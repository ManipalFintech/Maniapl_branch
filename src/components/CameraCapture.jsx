import React, { useEffect, useRef, useState } from 'react';

export default function CameraCapture({ mode, onCapture, onCancel }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const [status, setStatus] = useState('Starting camera…');
  const [ready, setReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setStatus('Position your face in the frame, then tap Capture');
        setReady(true);
      } catch (err) {
        setError('Camera access is required to mark attendance. Please allow camera permission and reload.');
      }
    }

    start();
    return () => {
      cancelled = true;
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function handleCapture() {
    setCapturing(true);
    setStatus('Getting your location…');

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);

    canvas.toBlob((blob) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
          onCapture(blob, pos.coords.latitude, pos.coords.longitude);
        },
        () => {
          setCapturing(false);
          setError('Could not read your location. Please enable location access and try again.');
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }, 'image/jpeg', 0.85);
  }

  function handleCancel() {
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    onCancel();
  }

  return (
    <div className="camera-overlay">
      <video ref={videoRef} className="camera-video" muted playsInline />
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      <div className="camera-face-ring" />
      <button className="camera-cancel" onClick={handleCancel}>Cancel</button>

      <div className="camera-prompt-bar">
        <div className="prompt">{error || status}</div>
        <div className="mode">{mode === 'login' ? 'Marking Login' : 'Marking Logout'}</div>
        <button className="camera-capture-btn" onClick={handleCapture} disabled={!ready || capturing || !!error}>
          {capturing ? 'Capturing…' : 'Capture Photo'}
        </button>
      </div>
    </div>
  );
}
