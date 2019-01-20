export default {
    "development": {
        "gate": [
            { "id": "gate-server-1", "host": "127.0.0.1", "port": 4010, "frontend": true, "alone": true }
        ],
        "connector": [
            { "id": "connector-server-1", "host": "127.0.0.1", "port": 4020, "frontend": true }
        ],
        "chat": [
            { "id": "chat-server-1", "host": "127.0.0.1", "port": 4030, "name": "聊天大厅1" },
            { "id": "chat-server-2", "host": "127.0.0.1", "port": 4031, "name": "聊天大厅2" },
        ]
    },
    "production": {
        "gate": [
            { "id": "gate-server-1", "host": "127.0.0.1", "port": 4010, "frontend": true, "alone": true }
        ],
        "connector": [
            { "id": "connector-server-1", "host": "127.0.0.1", "port": 4020, "frontend": true },
            { "id": "connector-server-2", "host": "127.0.0.1", "port": 4021, "frontend": true }
        ],
        "chat": [
            { "id": "chat-server-1", "host": "127.0.0.1", "port": 4030, "name": "聊天大厅1" },
            { "id": "chat-server-2", "host": "127.0.0.1", "port": 4031, "name": "聊天大厅2" }
        ]
    }
}