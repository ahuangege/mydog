export default {
    "development": {
        "connector": [
            { "id": "connector-server-1", "host": "127.0.0.1", "port": 4021, "frontend": true, "clientPort": 4001, },
            { "id": "connector-server-2", "host": "127.0.0.1", "port": 4022, "frontend": true, "clientPort": 4002, },
        ],
    },
    "production": {
        "connector": [
            { "id": "connector-server-1", "host": "127.0.0.1", "port": 4021, "frontend": true, "clientPort": 4001, },
        ],
    }
}