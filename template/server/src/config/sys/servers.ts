export default {
    "development": {
        "gate": [
            { "id": "gate-server-1", "host": "127.0.0.1", "port": 4010, "frontend": true, "clientPort": 4001 }
        ],
        "connector": [
            { "id": "connector-server-1", "host": "127.0.0.1", "port": 4020, "frontend": true, "clientPort": 4002 }
        ],
        "chat": [
            { "id": "chat-server-1", "host": "127.0.0.1", "port": 4030, "name": "聊天大厅1" },
            { "id": "chat-server-2", "host": "127.0.0.1", "port": 4031, "name": "聊天大厅2" }
        ]
    },
    "production": {
        "gate": [
            { "id": "gate-server-1", "host": "127.0.0.1", "port": 4010, "frontend": true, "clientPort": 4001 }
        ],
        "connector": [
            { "id": "connector-server-1", "host": "127.0.0.1", "port": 4020, "frontend": true, "clientPort": 4002 },
            { "id": "connector-server-2", "host": "127.0.0.1", "port": 4021, "frontend": true, "clientPort": 4003 }
        ],
        "chat": [
            { "id": "chat-server-1", "host": "127.0.0.1", "port": 4030, "name": "聊天大厅1" },
            { "id": "chat-server-2", "host": "127.0.0.1", "port": 4031, "name": "聊天大厅2" }
        ]
    }
}