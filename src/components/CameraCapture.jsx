import React, { useEffect, useRef, useState } from 'react';

const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';
const PROMPTS = [
  { key: 'blink', label: 'Please blink' },
  { key: 'smile', label: 'Please smile' },
  { key: 'turn', label: 'Turn your head slightly to either side' }
];

let modelsLoadedPromise = null;
function ensureModelsLoaded() {
  if (!modelsLoadedPromise) {
    modelsLoadedPromise = (async () => {
      // window.faceapi comes from the <script> tag loaded in index.html
      while (!window.faceapi) await new Promise((r) => setTimeout(r, 100));
      const faceapi = window.faceapi;
      await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
      await faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL);
      await faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL);
    })();
  }
  return modelsLoadedPromise;
}

function eyeAspectRatio(eye) {
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const vertical = dist(eye[1], eye[5]) + dist(eye[2], eye[4]);
  const horizontal = dist(eye[0], eye[3]);
  return vertical / (2 * horizontal);
}

function conditionMet(promptKey, detection) {
  const { landmarks, expressions } = detection;
  if (promptKey === 'blink') {
    const left = eyeAspectRatio(landmarks.getLeftEye());
    const right = eyeAspectRatio(landmarks.getRightEye());
    return left < 0.22 && right < 0.22;
  }
  if (promptKey === 'smile') {
    return (expressions?.happy || 0) > 0.7;
  }
  if (promptKey === 'turn') {
    const nose = landmarks.getNose();
    const leftEye = landmarks.getLeftEye();
    const rightEye = landmarks.getRightEye();
    const noseX = nose[3].x; // tip
    const eyeCenterX = (leftEye[0].x + rightEye[3].x) / 2;
    const faceWidth = Math.abs(rightEye[3].x - leftEye[0].x) || 1;
    const offset = Math.abs(noseX - eyeCenterX) / faceWidth;
    return offset > 0.18;
  }
  return false;
}

export default function CameraCapture({ mode, onCapture, onCancel }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const capturedRef = useRef(false);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);

  const [prompt] = useState(PROMPTS[Math.floor(Math.random() * PROMPTS.length)]);
  const [status, setStatus] = useState('Starting camera…');
  const [faceActive, setFaceActive] = useState(false);
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

        setStatus('Loading camera model…');
        await ensureModelsLoaded();
        if (cancelled) return;

        setStatus(prompt.label);
        const faceapi = window.faceapi;
        const options = new faceapi.TinyFaceDetectorOptions();

        intervalRef.current = setInterval(async () => {
          if (capturedRef.current || !videoRef.current) return;
          const detection = await faceapi
            .detectSingleFace(videoRef.current, options)
            .withFaceLandmarks(true)
            .withFaceExpressions();

          if (!detection) { setFaceActive(false); return; }
          setFaceActive(true);

          if (conditionMet(prompt.key, detection)) {
            capturedRef.current = true;
            await capture();
          }
        }, 250);
      } catch (err) {
        setError('Camera or location permission is required to mark attendance.');
      }
    }

    start();
    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function capture() {
    setStatus('Capturing…');
    if (intervalRef.current) clearInterval(intervalRef.current);

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);

    canvas.toBlob(async (blob) => {
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());

      navigator.geolocation.getCurrentPosition(
        (pos) => onCapture(blob, pos.coords.latitude, pos.coords.longitude),
        () => setError('Could not read your location. Please enable location access and try again.'),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }, 'image/jpeg', 0.8);
  }

  function handleCancel() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    onCancel();
  }

  return (
    <div className="camera-overlay">
      <video ref={videoRef} className="camera-video" muted playsInline />
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      <div className={`camera-face-ring ${faceActive ? 'active' : ''}`} />
      <button className="camera-cancel" onClick={handleCancel}>Cancel</button>
      <div className="camera-prompt-bar">
        <div className="prompt">{error || status}</div>
        <div className="mode">{mode === 'login' ? 'Marking Login' : 'Marking Logout'}</div>
      </div>
    </div>
  );
}
