<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>Cloud OS Device Call</title>
    <style>
        :root {
            --bg: #020713;
            --panel: #071426;
            --panel-2: #0f172a;
            --text: #f8fafc;
            --muted: #94a3b8;
            --line: rgba(56, 189, 248, .22);
            --blue: #0284ff;
            --cyan: #22d3ee;
            --green: #22c55e;
            --red: #ef4444;
        }
        * { box-sizing: border-box; }
        body {
            margin: 0;
            min-height: 100vh;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
            background: radial-gradient(circle at 50% 0%, rgba(34, 211, 238, .18), transparent 34%), var(--bg);
            color: var(--text);
        }
        .shell {
            min-height: 100vh;
            display: grid;
            grid-template-rows: auto 1fr auto;
            padding: env(safe-area-inset-top) 14px env(safe-area-inset-bottom);
        }
        header {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 14px 2px 10px;
        }
        .logo {
            width: 48px;
            height: 34px;
            object-fit: contain;
        }
        h1 { margin: 0; font-size: 18px; letter-spacing: 0; }
        .status { margin-top: 3px; color: var(--muted); font-size: 12px; }
        .stage {
            position: relative;
            overflow: hidden;
            border: 1px solid var(--line);
            border-radius: 8px;
            background: var(--panel-2);
            min-height: 0;
        }
        .stage:fullscreen,
        .stage.fullscreen-fallback {
            position: fixed;
            inset: 0;
            z-index: 50;
            width: 100vw;
            height: 100vh;
            border: 0;
            border-radius: 0;
            background: #000;
        }
        video {
            width: 100%;
            height: 100%;
            object-fit: cover;
            background: #020617;
        }
        #remoteVideo {
            position: absolute;
            inset: 0;
        }
        #localVideo {
            position: absolute;
            right: 12px;
            top: 12px;
            width: 108px;
            height: 152px;
            border: 2px solid rgba(255, 255, 255, .92);
            border-radius: 8px;
            transform: scaleX(-1);
            box-shadow: 0 16px 40px rgba(0, 0, 0, .38);
            cursor: pointer;
            z-index: 4;
        }
        body.local-primary #remoteVideo {
            right: 12px;
            top: 12px;
            left: auto;
            bottom: auto;
            width: 108px;
            height: 152px;
            border: 2px solid rgba(255, 255, 255, .92);
            border-radius: 8px;
            box-shadow: 0 16px 40px rgba(0, 0, 0, .38);
            z-index: 4;
            cursor: pointer;
        }
        body.local-primary #localVideo {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            border: 0;
            border-radius: 0;
            box-shadow: none;
            z-index: 1;
        }
        body.voice-call #remoteVideo {
            opacity: 0;
        }
        body.voice-call #localVideo {
            display: none;
        }
        .placeholder {
            position: absolute;
            inset: 0;
            display: grid;
            place-items: center;
            padding: 24px;
            text-align: center;
            color: var(--muted);
        }
        .placeholder strong {
            display: block;
            margin-bottom: 8px;
            color: var(--text);
            font-size: 18px;
        }
        footer {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 18px;
            min-height: 104px;
        }
        button {
            border: 0;
            min-width: 68px;
            height: 68px;
            border-radius: 999px;
            color: #fff;
            font-weight: 800;
            font-size: 13px;
            cursor: pointer;
        }
        .primary { background: linear-gradient(135deg, var(--blue), var(--cyan)); }
        .accept { background: var(--green); }
        .danger { background: var(--red); }
        .secondary { background: rgba(148, 163, 184, .28); }
        .muted { background: #f59e0b; }
        .hidden { display: none; }
        .fullscreen-btn {
            position: absolute;
            right: 12px;
            bottom: 12px;
            z-index: 8;
            min-width: 48px;
            width: 48px;
            height: 48px;
            border-radius: 24px;
            background: rgba(15, 23, 42, .72);
            border: 1px solid rgba(255, 255, 255, .22);
            font-size: 22px;
            line-height: 1;
        }
        body.voice-call .fullscreen-btn {
            display: none;
        }
    </style>
</head>
<body>
    <main class="shell">
        <header>
            <img class="logo" src="{{ asset('images/cloud-os-logo.png') }}" alt="Cloud OS">
            <div>
                <h1>Device Call</h1>
                <div id="status" class="status">Preparing call...</div>
            </div>
        </header>

        <section class="stage">
            <video id="remoteVideo" autoplay playsinline></video>
            <div id="placeholder" class="placeholder">
                <div>
                    <strong>Cloud OS call</strong>
                    <span id="placeholderText">Waiting for the call to connect.</span>
                </div>
            </div>
            <video id="localVideo" autoplay playsinline muted></video>
            <button id="fullscreenBtn" class="fullscreen-btn" type="button" aria-label="Toggle fullscreen">FS</button>
        </section>

        <footer>
            <button id="startBtn" class="primary" type="button">Start</button>
            <button id="acceptBtn" class="accept hidden" type="button">Accept</button>
            <button id="muteBtn" class="secondary" type="button">Mic</button>
            <button id="endBtn" class="danger" type="button">End</button>
        </footer>
    </main>

    <script>
        const apiEndpoint = @json(url('/api/signals'));
        const mode = @json(request('mode', 'outgoing'));
        const localUser = normalizePhone(@json(request('user', '')));
        let targetUser = normalizePhone(@json(request('target', '')));
        let callType = @json(request('call_type', 'video')) === 'voice' ? 'voice' : 'video';

        const statusEl = document.getElementById('status');
        const placeholderEl = document.getElementById('placeholder');
        const placeholderTextEl = document.getElementById('placeholderText');
        const localVideo = document.getElementById('localVideo');
        const remoteVideo = document.getElementById('remoteVideo');
        const startBtn = document.getElementById('startBtn');
        const acceptBtn = document.getElementById('acceptBtn');
        const muteBtn = document.getElementById('muteBtn');
        const endBtn = document.getElementById('endBtn');
        const fullscreenBtn = document.getElementById('fullscreenBtn');
        const stageEl = document.querySelector('.stage');

        let peer = null;
        let localStream = null;
        let receivedOffer = null;
        let remoteDescriptionSet = false;
        let pendingCandidates = [];
        let handledSignals = new Set();
        let outgoingStarted = false;
        let incomingAccepted = false;
        let microphoneMuted = false;
        let localVideoIsPrimary = false;

        document.body.classList.toggle('voice-call', callType === 'voice');

        const rtcConfig = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:global.stun.twilio.com:3478' },
                {
                    urls: [
                        'turn:openrelay.metered.ca:80',
                        'turn:openrelay.metered.ca:443',
                        'turn:openrelay.metered.ca:443?transport=tcp'
                    ],
                    username: 'openrelayproject',
                    credential: 'openrelayproject'
                }
            ]
        };

        function normalizePhone(value) {
            return String(value || '').replace(/\D+/g, '');
        }

        function setStatus(value) {
            statusEl.textContent = value;
            log(value);
        }

        function log(value) {
            console.debug('[Cloud OS call]', value);
        }

        function showRemotePlaceholder(text) {
            placeholderEl.style.display = 'grid';
            placeholderTextEl.textContent = text;
        }

        function hideRemotePlaceholder() {
            placeholderEl.style.display = 'none';
        }

        function callTypeLabel() {
            return callType === 'voice' ? 'voice call' : 'video call';
        }

        function syncMuteButton() {
            muteBtn.textContent = microphoneMuted ? 'Unmute' : 'Mute';
            muteBtn.classList.toggle('muted', microphoneMuted);
        }

        function applyMicrophoneState() {
            if (!localStream) return;
            localStream.getAudioTracks().forEach(track => {
                track.enabled = !microphoneMuted;
            });
            syncMuteButton();
        }

        function toggleMicrophone() {
            microphoneMuted = !microphoneMuted;
            applyMicrophoneState();
            setStatus(microphoneMuted ? 'Microphone muted' : 'Microphone on');
        }

        function syncVideoSwap() {
            document.body.classList.toggle('local-primary', localVideoIsPrimary && callType === 'video');
        }

        function toggleVideoSwap() {
            if (callType !== 'video') return;
            localVideoIsPrimary = !localVideoIsPrimary;
            syncVideoSwap();
        }

        function isFullscreen() {
            return document.fullscreenElement === stageEl || stageEl.classList.contains('fullscreen-fallback');
        }

        function syncFullscreenButton() {
            fullscreenBtn.textContent = isFullscreen() ? 'X' : 'FS';
        }

        async function toggleFullscreen() {
            if (callType === 'voice') return;

            try {
                if (document.fullscreenElement) {
                    await document.exitFullscreen();
                    stageEl.classList.remove('fullscreen-fallback');
                } else if (stageEl.requestFullscreen) {
                    await stageEl.requestFullscreen();
                } else {
                    stageEl.classList.toggle('fullscreen-fallback');
                }
            } catch {
                stageEl.classList.toggle('fullscreen-fallback');
            }

            syncFullscreenButton();
        }

        function unwrapSessionDescription(data) {
            return data && data.description ? data.description : data;
        }

        async function postSignal(payload) {
            const response = await fetch(apiEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`Signal request failed (${response.status})`);
            }

            return response.json();
        }

        async function sendSignal(type, data) {
            if (!localUser || !targetUser) return;
            await postSignal({
                type: 'send',
                sender: localUser,
                receiver: targetUser,
                signalType: type,
                data: JSON.stringify(data)
            });
            log(`sent ${type} to ${targetUser}`);
        }

        function stopLocalMedia() {
            if (localStream) {
                localStream.getTracks().forEach(track => track.stop());
                localStream = null;
            }
            localVideo.srcObject = null;
            syncMuteButton();
        }

        function resetPeer() {
            if (peer) {
                peer.ontrack = null;
                peer.onicecandidate = null;
                peer.onconnectionstatechange = null;
                peer.oniceconnectionstatechange = null;
                try { peer.close(); } catch {}
                peer = null;
            }
            remoteDescriptionSet = false;
            pendingCandidates = [];
            remoteVideo.srcObject = null;
            showRemotePlaceholder('Waiting for the call to connect.');
        }

        function cleanup() {
            resetPeer();
            stopLocalMedia();
        }

        async function initMedia() {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('Camera and microphone are not available in this web view.');
            }

            setStatus(callType === 'voice' ? 'Requesting microphone' : 'Requesting camera and microphone');
            localStream = await navigator.mediaDevices.getUserMedia({
                video: callType === 'video'
                    ? { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
                    : false,
                audio: { echoCancellation: true, noiseSuppression: true }
            });
            applyMicrophoneState();
            localVideo.srcObject = localStream;
            if (callType === 'video') {
                await localVideo.play().catch(() => {});
            }
            setStatus('Media ready');
        }

        function createPeer() {
            peer = new RTCPeerConnection(rtcConfig);
            localStream.getTracks().forEach(track => peer.addTrack(track, localStream));

            peer.ontrack = event => {
                const [remoteStream] = event.streams;
                if (remoteStream) {
                    remoteVideo.srcObject = remoteStream;
                    remoteVideo.play().catch(() => {});
                    if (callType === 'video') {
                        hideRemotePlaceholder();
                    } else {
                        showRemotePlaceholder('Voice call connected.');
                    }
                    setStatus('Connected');
                    syncVideoSwap();
                }
            };

            peer.onicecandidate = event => {
                if (event.candidate) {
                    sendSignal('candidate', event.candidate).catch(error => log(error.message));
                }
            };

            peer.onconnectionstatechange = () => {
                if (peer) setStatus(`Peer ${peer.connectionState}`);
            };

            peer.oniceconnectionstatechange = () => {
                if (peer) log(`ICE ${peer.iceConnectionState}`);
            };
        }

        async function addOrQueueCandidate(candidateData) {
            if (!peer || !candidateData) return;
            if (!remoteDescriptionSet || !peer.remoteDescription) {
                pendingCandidates.push(candidateData);
                return;
            }

            try {
                await peer.addIceCandidate(new RTCIceCandidate(candidateData));
            } catch (error) {
                log(`candidate failed: ${error.name || error.message}`);
            }
        }

        async function flushCandidates() {
            const queued = [...pendingCandidates];
            pendingCandidates = [];
            for (const candidate of queued) {
                await addOrQueueCandidate(candidate);
            }
        }

        async function startCall() {
            if (outgoingStarted) return;
            if (!localUser || !targetUser) {
                setStatus('Missing caller or receiver device number');
                return;
            }

            outgoingStarted = true;
            startBtn.classList.add('hidden');
            cleanup();

            try {
                await initMedia();
                createPeer();
                const offer = await peer.createOffer();
                await peer.setLocalDescription(offer);
                await sendSignal('offer', { description: offer, callType });
                setStatus(`Starting ${callTypeLabel()} with ${targetUser}`);
            } catch (error) {
                outgoingStarted = false;
                startBtn.classList.remove('hidden');
                setStatus(error.message || 'Could not start call');
            }
        }

        async function acceptCall() {
            if (incomingAccepted) return;
            if (!receivedOffer || !targetUser) {
                setStatus('No incoming offer found');
                return;
            }

            incomingAccepted = true;
            acceptBtn.classList.add('hidden');
            cleanup();

            try {
                await initMedia();
                createPeer();
                await peer.setRemoteDescription(new RTCSessionDescription(unwrapSessionDescription(receivedOffer)));
                remoteDescriptionSet = true;
                await flushCandidates();
                const answer = await peer.createAnswer();
                await peer.setLocalDescription(answer);
                await sendSignal('answer', { description: answer, callType });
                setStatus('Connecting');
            } catch (error) {
                incomingAccepted = false;
                acceptBtn.classList.remove('hidden');
                setStatus(error.message || 'Could not accept call');
            }
        }

        async function endCall() {
            if (targetUser) {
                await sendSignal('hangup', { at: new Date().toISOString() }).catch(() => {});
            }
            cleanup();
            setStatus('Call ended');
            startBtn.classList.toggle('hidden', mode === 'incoming');
        }

        async function processSignal(signal) {
            if (!signal || handledSignals.has(signal.id)) return;
            handledSignals.add(signal.id);

            if (signal.sender) {
                targetUser = normalizePhone(signal.sender);
            }

            let data = signal.data;
            try {
                data = typeof data === 'string' ? JSON.parse(data) : data;
            } catch {
                log('signal parse failed');
                return;
            }

            if (signal.type === 'offer') {
                callType = data?.callType === 'voice' ? 'voice' : 'video';
                document.body.classList.toggle('voice-call', callType === 'voice');
                syncVideoSwap();
                receivedOffer = data;
                startBtn.classList.add('hidden');
                if (!incomingAccepted) {
                    acceptBtn.classList.remove('hidden');
                }
                showRemotePlaceholder(`Incoming ${callTypeLabel()} from ${targetUser}`);
                setStatus(`Incoming ${callTypeLabel()} from ${targetUser}`);
                return;
            }

            if (signal.type === 'answer' && peer) {
                await peer.setRemoteDescription(new RTCSessionDescription(unwrapSessionDescription(data)));
                remoteDescriptionSet = true;
                await flushCandidates();
                setStatus('Connecting');
                return;
            }

            if (signal.type === 'candidate') {
                await addOrQueueCandidate(data);
                return;
            }

            if (signal.type === 'hangup') {
                cleanup();
                setStatus('The other device ended the call');
            }
        }

        async function pollSignals() {
            if (!localUser) return;

            try {
                const signals = await postSignal({ type: 'receive', user: localUser });
                if (!Array.isArray(signals)) return;
                for (const signal of signals) {
                    await processSignal(signal);
                }
            } catch (error) {
                log(error.message || 'poll failed');
            }
        }

        startBtn.addEventListener('click', startCall);
        acceptBtn.addEventListener('click', acceptCall);
        muteBtn.addEventListener('click', toggleMicrophone);
        endBtn.addEventListener('click', endCall);
        fullscreenBtn.addEventListener('click', toggleFullscreen);
        localVideo.addEventListener('click', toggleVideoSwap);
        remoteVideo.addEventListener('click', () => {
            if (localVideoIsPrimary) toggleVideoSwap();
        });
        document.addEventListener('fullscreenchange', syncFullscreenButton);
        syncMuteButton();

        if (mode === 'incoming') {
            startBtn.classList.add('hidden');
            acceptBtn.classList.add('hidden');
            showRemotePlaceholder('Waiting for incoming call signal.');
        } else {
            startBtn.classList.add('hidden');
            showRemotePlaceholder(targetUser ? `Ready to start a ${callTypeLabel()} with ${targetUser}.` : 'Choose a receiver device number.');
            setTimeout(() => startCall(), 250);
        }

        setStatus(localUser ? `Ready as ${localUser}` : 'Missing local device number');
        pollSignals();
        setInterval(pollSignals, 2000);
    </script>
</body>
</html>
