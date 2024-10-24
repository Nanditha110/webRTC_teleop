/// WebRTC variables
let localStream;
let remoteStream;
let pc1, pc2;
let dataChannel;
let selectedFile;

// STUN server configuration
const configuration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

// Get references to HTML elements
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const callButton = document.getElementById('callButton');
const hangupButton = document.getElementById('hangupButton');
const fileInput = document.getElementById('fileInput');

// Disable buttons initially
callButton.disabled = true;
hangupButton.disabled = true;

// Event listeners
fileInput.addEventListener('change', handleFileSelection);
callButton.addEventListener('click', call);
hangupButton.addEventListener('click', hangup);

// Step 1: Handle file selection and prepare video for streaming
function handleFileSelection(event) {
  selectedFile = event.target.files[0];
  if (selectedFile) {
    const fileURL = URL.createObjectURL(selectedFile);
    localVideo.src = fileURL;  // Load the video in the local player
    localVideo.play();
    callButton.disabled = false;  // Enable the "Call" button once a file is selected
  }
}

// Step 2: Set up the WebRTC connection between two peers and start streaming
async function call() {
  callButton.disabled = true;
  hangupButton.disabled = false;

  // Create peer connections for both peers
  pc1 = new RTCPeerConnection(configuration);
  pc2 = new RTCPeerConnection(configuration);

  // Set up ICE candidate exchange
  pc1.onicecandidate = e => pc2.addIceCandidate(e.candidate);
  pc2.onicecandidate = e => pc1.addIceCandidate(e.candidate);

  // Handle remote stream when received by pc2
  pc2.ontrack = event => {
    remoteStream = event.streams[0];
    remoteVideo.srcObject = remoteStream;  // Display remote video stream
  };

  // Create a MediaStream for pc1
  localStream = localVideo.captureStream();  // Capture the video file as a MediaStream
  localStream.getTracks().forEach(track => pc1.addTrack(track, localStream));  // Add tracks to pc1

  // Create a data channel on pc1 for file transfer
  dataChannel = pc1.createDataChannel('fileTransfer');
  dataChannel.onopen = () => console.log('Data channel is open');
  dataChannel.onclose = () => console.log('Data channel is closed');

  // Receive data channel on pc2
  pc2.ondatachannel = event => {
    const receiveChannel = event.channel;
    let receivedChunks = [];

    // Handle file chunks as they arrive
    receiveChannel.onmessage = e => {
      receivedChunks.push(e.data);
      if (e.data === 'done') {
        const receivedBlob = new Blob(receivedChunks);
        const downloadLink = document.createElement('a');
        downloadLink.href = URL.createObjectURL(receivedBlob);
        downloadLink.download = 'received-video-file.mp4';
        downloadLink.click();  // Automatically trigger download
      }
    };
  };

  // Create offer from pc1, set local/remote descriptions, and exchange with pc2
  const offer = await pc1.createOffer();
  await pc1.setLocalDescription(offer);
  await pc2.setRemoteDescription(pc1.localDescription);

  // Create answer from pc2, set local/remote descriptions, and finalize connection
  const answer = await pc2.createAnswer();
  await pc2.setLocalDescription(answer);
  await pc1.setRemoteDescription(pc2.localDescription);
}

// Step 3: Hang up the call and close the connection
function hangup() {
  pc1.close();
  pc2.close();
  pc1 = null;
  pc2 = null;
  hangupButton.disabled = true;
  callButton.disabled = false;
}

// Step 4: Send the selected video file after streaming
fileInput.addEventListener('change', handleFileSelection);
function sendFile(file) {
  const chunkSize = 16384;  // 16KB chunks for efficient transfer
  let offset = 0;
  const reader = new FileReader();

  reader.onload = e => {
    dataChannel.send(e.target.result);  // Send file chunk to the peer
    offset += e.target.result.byteLength;

    if (offset < file.size) {
      readSlice(offset);  // Continue sending the next chunk
    } else {
      dataChannel.send('done');  // Signal that the file is fully sent
    }
  };

  // Function to read a chunk of the file
  const readSlice = o => {
    const slice = file.slice(offset, o + chunkSize);
    reader.readAsArrayBuffer(slice);
  };

  readSlice(0);  // Start reading from the beginning of the file
}
