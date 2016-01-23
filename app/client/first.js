function initCaller(uid, messageCallback, peersUpdateCallback) {
    var RTCSessionDescription = window.RTCSessionDescription || window.mozRTCSessionDescription;
    var RTCPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection;
    var RTCIceCandidate = window.RTCIceCandidate || window.mozRTCIceCandidate;
    var wsUri = "ws://localhost:8090/";

    var signalingChannel = createSignalingChannel(wsUri, uid);
    var servers = {
        iceServers: [{
            urls: "stun:stun.1.google.com:19302"
        }]
    };
    var channels = {};
    var destination = null;

    function initCommunication() {
        signalingChannel.onJoin = function(peers) {
            console.log("join: ", peers);
            if (peers.length > 0) {
                (function myLoop(current, max, peersList) {
                    setTimeout(function() {
                        startCommunication(peersList[current]);
                        if (current < max) {
                            myLoop(current + 1, max, peersList);
                        }
                    }, 1000)
                })(0, peers.length - 1, peers);
            }
        };
        signalingChannel.onDisconnect = function(peerId) {
            console.log("disconnect: ", peerId);
            delete channels[peerId];
            peersUpdateCallback(channels);
        };
        signalingChannel.onOffer = function(offer, source) {
            console.log('receive offer from ', source);
            var peerConnection = createPeerConnection(source);
            peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            peerConnection.createAnswer(function(answer) {
                peerConnection.setLocalDescription(answer);
                console.log('send answer');
                signalingChannel.sendAnswer(answer, source);
            }, function(e) {
                console.error(e);
            });
        };
    }

    function createPeerConnection(peerId) {
        var pc = new RTCPeerConnection(servers, {
            optional: [{
                DtlsSrtpKeyAgreement: true
            }]
        });
        pc.onicecandidate = function(evt) {
            if (evt.candidate) { // empty candidate (with evt.candidate === null) are often generated
                signalingChannel.sendICECandidate(evt.candidate, peerId);
            }
        };
        signalingChannel.onICECandidate = function(ICECandidate, source) {
            console.log("receiving ICE candidate from ", source);
            pc.addIceCandidate(new RTCIceCandidate(ICECandidate));
        };
        pc.ondatachannel = function(event) {
            var receiveChannel = event.channel;
            console.log("channel received");

            channels[peerId] = receiveChannel;
            peersUpdateCallback(channels);

            receiveChannel.onmessage = function(event) {
                onRTCMessage(event.data);
            };
        };
        return pc;
    }

    function startCommunication(peerId) {
        var pc = new RTCPeerConnection(servers, {
            optional: [{
                DtlsSrtpKeyAgreement: true
            }]
        });
        pc.onicecandidate = function(evt) {
            if (evt.candidate) { // empty candidate (wirth evt.candidate === null) are often generated
                signalingChannel.sendICECandidate(evt.candidate, peerId);
            }
        };
        signalingChannel.onAnswer = function(answer, source) {
            console.log('receive answer from', source);
            pc.setRemoteDescription(new RTCSessionDescription(answer));
        };
        signalingChannel.onICECandidate = function(ICECandidate, source) {
            console.log("receiving ICE candidate from ", source);
            pc.addIceCandidate(new RTCIceCandidate(ICECandidate));
        };
        //:warning the dataChannel must be opened BEFORE creating the offer.
        var _commChannel = pc.createDataChannel('communication', {
            reliable: false
        });
        pc.createOffer(function(offer) {
            pc.setLocalDescription(offer);
            console.log('send offer to', peerId);
            signalingChannel.sendOffer(offer, peerId);
        }, function(e) {
            console.error(e);
        });

        channels[peerId] = _commChannel;
        peersUpdateCallback(channels);

        _commChannel.onclose = function(evt) {
            console.log("dataChannel closed");
        };
        _commChannel.onerror = function(evt) {
            console.error("dataChannel error");
        };
        _commChannel.onopen = function() {
            console.log("dataChannel opened");
        };
        _commChannel.onmessage = function(message) {
            onRTCMessage(message.data);
        };
    }

    function setDestination(dst) {
        destination = dst;
    }

    function sendRTCMessage(msg) {
        if (destination != null) {
            console.log('Sending msg', msg, 'to', destination);
            channels[destination].send(JSON.stringify({
                type: 'msg',
                message: msg
            }));
        } else {
            console.error(destination)
        }
    }

    function onRTCMessage(msg) {
        var messageObj = JSON.parse(msg);
        if (messageObj.type == "msg") {
            messageCallback(messageObj.message);
        } else {
            console.error(messageObj)
        }
    }

    window.sendRTCMessage = sendRTCMessage;
    window.setDestination = setDestination;
    initCommunication();
}
