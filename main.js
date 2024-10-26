/*
 *  Copyright (c) 2015 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree.
 */
'use strict';

// Button and video elements
const startButton = document.getElementById('startButton');
const callButton = document.getElementById('callButton');
const hangupButton = document.getElementById('hangupButton');
callButton.disabled = true;
hangupButton.disabled = true;
startButton.addEventListener('click', start);
callButton.addEventListener('click', call);
hangupButton.addEventListener('click', hangup);

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

let localStream;
let pc1;
let pc2;
let localRecorder;       // MediaRecorder for local stream
let remoteRecorder;      // MediaRecorder for remote stream
let localChunks = [];    // Array to store local stream chunks
let remoteChunks = [];   // Array to store remote stream chunks

const offerOptions = {
  offerToReceiveAudio: 1,
  offerToReceiveVideo: 1
};

// Start capturing local media (video/audio)
async function start() {
  console.log('Requesting local stream');
  startButton.disabled = true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    console.log('Received local stream');
    localVideo.srcObject = stream; // Display local video
    localStream = stream; // Save local stream
    callButton.disabled = false; // Enable call button

    // Setup local recording
    setupLocalRecorder();
  } catch (e) {
    console.error(`getUserMedia() error: ${e.name}`);
  }
}

// Function to setup the local recorder
function setupLocalRecorder() {
  localRecorder = new MediaRecorder(localStream);
  localRecorder.ondataavailable = event => localChunks.push(event.data);
  localRecorder.onstop = () => {
    const localBlob = new Blob(localChunks, { type: 'video/webm' });
    const url = URL.createObjectURL(localBlob);
    downloadRecording(url, 'local-recording.webm');
  };
}

// Function to setup the remote recorder
function setupRemoteRecorder(stream) {
  remoteRecorder = new MediaRecorder(stream);
  remoteRecorder.ondataavailable = event => remoteChunks.push(event.data);
  remoteRecorder.onstop = () => {
    const remoteBlob = new Blob(remoteChunks, { type: 'video/webm' });
    const url = URL.createObjectURL(remoteBlob);
    downloadRecording(url, 'remote-recording.webm');
  };
}

// Start the peer-to-peer connection
async function call() {
  console.log('Starting call');
  callButton.disabled = true;
  hangupButton.disabled = false;

  const configuration = {};
  pc1 = new RTCPeerConnection(configuration);
  pc1.addEventListener('icecandidate', e => onIceCandidate(pc1, e));
  pc1.addEventListener('iceconnectionstatechange', e => onIceStateChange(pc1, e));

  pc2 = new RTCPeerConnection(configuration);
  pc2.addEventListener('icecandidate', e => onIceCandidate(pc2, e));
  pc2.addEventListener('iceconnectionstatechange', e => onIceStateChange(pc2, e));
  pc2.addEventListener('track', gotRemoteStream);

  localStream.getTracks().forEach(track => pc1.addTrack(track, localStream));
  console.log('Added local stream to pc1');

  try {
    const offer = await pc1.createOffer(offerOptions);
    await onCreateOfferSuccess(offer);
  } catch (e) {
    console.error(`Failed to create offer: ${e}`);
  }
}

// Success handler for offer creation
async function onCreateOfferSuccess(desc) {
  console.log('Offer from pc1:', desc.sdp);
  await pc1.setLocalDescription(desc);
  await pc2.setRemoteDescription(desc);
  try {
    const answer = await pc2.createAnswer();
    await onCreateAnswerSuccess(answer);
  } catch (e) {
    console.error(`Failed to create answer: ${e}`);
  }
}

// Success handler for answer creation
async function onCreateAnswerSuccess(desc) {
  console.log('Answer from pc2:', desc.sdp);
  await pc2.setLocalDescription(desc);
  await pc1.setRemoteDescription(desc);
}

// Handler for ICE candidates
async function onIceCandidate(pc, event) {
  try {
    const otherPc = (pc === pc1) ? pc2 : pc1;
    if (event.candidate) {
      await otherPc.addIceCandidate(event.candidate);
      console.log(`ICE candidate from ${pc === pc1 ? 'pc1' : 'pc2'}: ${event.candidate.candidate}`);
    }
  } catch (e) {
    console.error(`Error adding ICE candidate: ${e}`);
  }
}

// Attach the remote stream to the remote video element and setup recorder
function gotRemoteStream(event) {
  if (remoteVideo.srcObject !== event.streams[0]) {
    remoteVideo.srcObject = event.streams[0];
    console.log('pc2 received remote stream');

    // Setup remote recording
    setupRemoteRecorder(event.streams[0]);
    remoteRecorder.start(); // Start recording the remote stream
  }
}

// Start recording both local and remote streams
function startRecording() {
  if (localRecorder && remoteRecorder) {
    localRecorder.start();
    remoteRecorder.start();
    console.log('Recording started for both streams.');
  }
}

// Stop recording and trigger download
function stopRecording() {
  if (localRecorder && localRecorder.state !== 'inactive') {
    localRecorder.stop();
  }
  if (remoteRecorder && remoteRecorder.state !== 'inactive') {
    remoteRecorder.stop();
  }
  console.log('Recording stopped for both streams.');
}

// Download the recorded media
function downloadRecording(url, filename) {
  const a = document.createElement('a');
  document.body.appendChild(a);
  a.style.display = 'none';
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
}

// Hang up  and stop recording
function hangup() {
  console.log('Ending call');
  stopRecording();
  pc1.close();
  pc2.close();
  pc1 = null;
  pc2 = null;
  hangupButton.disabled = true;
  callButton.disabled = false;
}
