'use strict';

function routeCallback(roomName) {
    if (roomName.isHighway()) {
        return 1;
    }

    let room = Game.rooms[roomName];

    if (room && room.controller && room.controller.my) {
        return 1;
    }

    if (Memory.rooms[roomName] && Memory.rooms[roomName].avoid) {
        return Infinity;
    }

    return 2.5;
}
