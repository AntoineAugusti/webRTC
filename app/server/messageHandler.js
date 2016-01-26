var connectedPeers = {};

/**
 * Dispatch an incoming message to the right handler according to its type.
 * @param WebSocket ws
 * @param Object message
 */
function onMessage(ws, message) {
    var type = message.type;
    switch (type) {
        case "ICECandidate":
            onICECandidate(message.ICECandidate, message.destination, ws.id);
            break;
        case "offer":
            onOffer(message.offer, message.destination, ws.id);
            break;
        case "answer":
            onAnswer(message.answer, message.destination, ws.id);
            break;
        case "init":
            onInit(ws, message.init);
            break;
        default:
            throw new Error("invalid message type got " + type);
    }
}

function onInit(ws, id) {
    console.log("init from peer:", id);

    var peersList = Object.keys(connectedPeers);
    if (peersList.length > 0) {
        // Send to the new peer a random peer from the already connected peers
        ws.send(JSON.stringify({
            type: 'join',
            peer: parseInt(peersList[Math.floor(Math.random() * peersList.length)])
        }));
    }

    ws.id = id;
    connectedPeers[id] = ws;
}

function onDisconnect(disconnectedPeerId) {
    for (var peerId in connectedPeers) {
        if (connectedPeers.hasOwnProperty(peerId)) {
            try {
                connectedPeers[peerId].send(JSON.stringify({
                    type: 'disconnect',
                    id: disconnectedPeerId
                }));
            } catch (e) {
                console.log(e);
                disconnectPeer(peerId);
            }
        }
    }
}

function onOffer(offer, destination, source) {
    console.log("offer from peer", source, "to peer", destination);
    try {
        connectedPeers[destination].send(JSON.stringify({
            type: 'offer',
            offer: offer,
            source: source
        }));
    } catch (e) {
        disconnectPeer(destination);
    }
}

function onAnswer(answer, destination, source) {
    console.log("answer from peer:", source, "to peer", destination);
    connectedPeers[destination].send(JSON.stringify({
        type: 'answer',
        answer: answer,
        source: source
    }));
}

function onICECandidate(ICECandidate, destination, source) {
    console.log("ICECandidate from peer:", source, "to peer", destination);
    try {
        connectedPeers[destination].send(JSON.stringify({
            type: 'ICECandidate',
            ICECandidate: ICECandidate,
            source: source
        }));
    } catch (e) {
        disconnectPeer(destination);
    }
}

function disconnectPeer(id) {
    if (connectedPeers.hasOwnProperty(id)) {
        delete connectedPeers[id];
        console.log(id, "has been disconnected");

        onDisconnect(id);
    }
}

module.exports = onMessage;
module.exports.disconnectPeer = disconnectPeer;

// Exporting for unit tests only
module.exports._connectedPeers = connectedPeers;
