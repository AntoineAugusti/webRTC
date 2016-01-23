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
    var currentRelay = null;
    var knownPeers = null;

    function switchRelay(peerId) {
        if (peerId != currentRelay) {
            console.log('setting RPC relay', peerId);
            currentRelay = peerId;
            signalingChannel.setCommunicationChannel(channels[peerId]);
        }
    }

    /**
     * Initiate a default RTC peer connection.
     * @param int peerId
     * @return RTCPeerConnection
     */
    function createBasicPeerConnection(peerId) {
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
        return pc;
    }

    /**
     * Start the communication by contacting the signaling server.
     */
    function initCommunication() {
        signalingChannel.onJoin = function(peer) {
            console.log("join: ", peer);
            startCommunication(peer, true);
        };
        signalingChannel.onDisconnect = function(peerId) {
            console.log("disconnect: ", peerId);
            delete channels[peerId];
            peersUpdateCallback(channels);
        };
        signalingChannel.onOffer = function(offer, source) {
            console.log('receive offer from ', source);
            // Got something not coming from the current relay? It must be
            // the original signaling server
            if (source != currentRelay) {
                currentRelay = null;
                signalingChannel.switchToWS();
            }
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

    /**
     * Create a RTC peer connection (callee side).
     * @param int peerId
     * @return RTCPeerConnection
     */
    function createPeerConnection(peerId) {
        var pc = createBasicPeerConnection(peerId);
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

    /**
     * Initiate a RTC peer connection (caller side).
     * @param int peerId
     * @param bool shouldUseAsRelay If true, the peer would be used as a relay to establish RPC connections
     */
    function startCommunication(peerId, shouldUseAsRelay) {
        var pc = createBasicPeerConnection(peerId);
        signalingChannel.onAnswer = function(answer, source) {
            console.log('receive answer from', source);
            pc.setRemoteDescription(new RTCSessionDescription(answer));
        };
        signalingChannel.onICECandidate = function(ICECandidate, source) {
            console.log("receiving ICE candidate from ", source);
            pc.addIceCandidate(new RTCIceCandidate(ICECandidate));
        };
        // :warning the dataChannel must be opened BEFORE creating the offer.
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

        _commChannel.onclose = function(evt) {
            console.log("dataChannel closed");
        };
        _commChannel.onerror = function(evt) {
            console.error("dataChannel error");
        };
        _commChannel.onopen = function() {
            console.log("dataChannel opened");
            peersUpdateCallback(channels);

            if (shouldUseAsRelay) {
                switchRelay(peerId);
                // Ask for the list of peers
                console.log('asking for the list of peers to', peerId);
                channels[peerId].send(JSON.stringify({
                    type: 'getPeersList',
                    source: uid
                }));
            }
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

    function dispatchPeersList(from) {
        // Construct a list of peers I already know:
        // - peers I'm already connected at
        // - peers I'm going to try to connect to
        var allPeers = Object.keys(channels).map(Number);
        if (knownPeers != null) {
            allPeers = arrayUnique(allPeers.concat(knownPeers));
        }
        channels[from].send(JSON.stringify({
            type: 'peers',
            peers: allPeers
        }));
    }

    function handleIncomingPeersList(peers) {
        console.log('got peers list', peers);
        knownPeers = peers;
        if (peers.length > 0) {
            (function myLoop(current, max, peersList) {
                setTimeout(function() {
                    if (peersList[current] != uid) {
                        startCommunication(peersList[current], false);
                    }
                    if (current < max) {
                        myLoop(current + 1, max, peersList);
                    }
                }, 1000)
            })(0, peers.length - 1, peers);
        }
    }

    function arrayUnique(array) {
        var a = array.concat();
        for (var i = 0; i < a.length; ++i) {
            for (var j = i + 1; j < a.length; ++j) {
                if (a[i] === a[j])
                    a.splice(j--, 1);
            }
        }

        return a;
    }

    function handleMessageWithDestination(msgObj) {
        // Message was not addressed to me, forward it
        if (msgObj.destination != uid) {
            // Say that the message was relayed by me
            msgObj.relayedBy = uid;
            // And send it to the final peer
            channels[msgObj.destination].send(JSON.stringify(msgObj));
        } else {
            // Message was addressed to me, handle it
            // Prepare to answer through a peer
            switchRelay(msgObj.relayedBy);
            // And handle the message
            signalingChannel.dispatchMessage(msgObj);
        }
    }

    function onRTCMessage(msg) {
        var msgObj = JSON.parse(msg);
        console.log('received RTC message', msgObj);
        if (msgObj.hasOwnProperty('destination')) {
            handleMessageWithDestination(msgObj);
        } else {
            switch (msgObj.type) {
                case "msg":
                    messageCallback(msgObj.message);
                    break;
                case "getPeersList":
                    dispatchPeersList(msgObj.source);
                    break;
                case "peers":
                    handleIncomingPeersList(msgObj.peers);
                    break;
                default:
                    console.error(msgObj);
            }
        }
    }

    window.sendRTCMessage = sendRTCMessage;
    window.setDestination = setDestination;
    initCommunication();
}
