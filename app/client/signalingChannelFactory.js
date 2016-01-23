function SignalingChannel(id) {

    var _ws;
    var self = this;
    var _communicationChannel = null;

    function connectToTracker(url) {
        _ws = new WebSocket(url);
        _ws.onmessage = _onMessage;
        _ws.onopen = function _onConnectionEstablished() {
            _sendMessage('init', id);
        };
        _ws.onclose = function _onClose() {
            console.error(id, 'closed the connection');
        };
        _ws.onerror = function _onError(err) {
            console.error("error:", err);
        };
        setCommunicationChannel(_ws);
    }

    function _onMessage(evt) {
        dispatchMessage(JSON.parse(evt.data));
    }

    function _sendMessage(type, data, destination) {
        var message = {};
        message.type = type;
        message[type] = data;
        message.destination = destination;
        message.source = id;
        _communicationChannel.send(JSON.stringify(message));
    }

    function sendICECandidate(ICECandidate, destination) {
        _sendMessage("ICECandidate", ICECandidate, destination);
    }

    function sendOffer(offer, destination) {
        _sendMessage("offer", offer, destination);
    }

    function sendAnswer(answer, destination) {
        _sendMessage("answer", answer, destination);
    }

    function setCommunicationChannel(commChannel) {
        _communicationChannel = commChannel;
    }

    function switchToWS() {
        setCommunicationChannel(_ws);
    }

    function dispatchMessage(objMessage) {
        switch (objMessage.type) {
            case "ICECandidate":
                self.onICECandidate(objMessage.ICECandidate, objMessage.source);
                break;
            case "offer":
                self.onOffer(objMessage.offer, objMessage.source);
                break;
            case "answer":
                self.onAnswer(objMessage.answer, objMessage.source);
                break;
            case "join":
                self.onJoin(objMessage.peer);
                break;
            case "disconnect":
                self.onDisconnect(objMessage.id);
                break;
            default:
                throw new Error("invalid message type got", objMessage.type);
        }
    }

    this.connectToTracker = connectToTracker;
    this.dispatchMessage = dispatchMessage;
    this.sendAnswer = sendAnswer;
    this.sendICECandidate = sendICECandidate;
    this.sendOffer = sendOffer;
    this.setCommunicationChannel = setCommunicationChannel;
    this.switchToWS = switchToWS;

    // Default handler, should be overwritten
    this.onOffer = function(offer, source) {
        console.log("offer from peer:", source, ':', offer);
    };

    // Default handler, should be overwritten
    this.onAnswer = function(answer, source) {
        console.log("answer from peer:", source, ':', answer);
    };

    // Default handler, should be overwritten
    this.onICECandidate = function(ICECandidate, source) {
        console.log("ICECandidate from peer:", source, ':', ICECandidate);
    };

    // Default handler, should be overwritten
    this.onJoin = function(peers) {
        console.log("join: ", peers);
    };

    // Default handler, should be overwritten
    this.onDisconnect = function(peerId) {
        console.log("disconnect: ", peerId);
    };
}

window.createSignalingChannel = function(url, id) {
    var signalingChannel = new SignalingChannel(id);
    signalingChannel.connectToTracker(url);
    return signalingChannel;
};
