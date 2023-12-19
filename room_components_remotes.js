'use strict';

const STATE_SETUP = 'setup';

function needsDefender(room) {
    // TODO!
    return true;
}

function defenderFlagPosition(room) {
    // TODO!
    return new RoomPosition(29, 20, room.name);
}

let prior = [];

function roadCallback(roomName) {
    let room = Game.rooms[roomName];
    if (!room) {
        return false;
    }
    
    let costs = new PathFinder.CostMatrix;
    
    for (let i = 0; i < prior.length; i++) {
        let pos = prior[i];
        if (pos.roomName == roomName) {
            costs.set(pos.x, pos.y, 18);
        }
    }

    room.find(FIND_STRUCTURES).forEach(function(struct) {
      if (struct.structureType === STRUCTURE_ROAD) {
        // Favor roads over plain tiles
        costs.set(struct.pos.x, struct.pos.y, 18);
      } else if (struct.structureType !== STRUCTURE_CONTAINER &&
                 (struct.structureType !== STRUCTURE_RAMPART ||
                  !struct.my)) {
        // Can't walk through non-walkable buildings
        costs.set(struct.pos.x, struct.pos.y, 0xff);
      }
    });    

    return costs;
}

function getRoad(base, destination) {
    let result = PathFinder.search(
        base.storage.pos,
        {pos: destination.pos, range:1},
        {
            plainCost: 19,
            swampCost: 20,
            roomCallback: roadCallback,
            maxOps: 30000
        });
    if (result.incomplete) {
        base.logError('Failed to make road: incomplete path.')
        return [];
    }

    base.logError('Found path of length ' + result.path.length);
    return result.path;
}

function orderRoad(road) {
    for (let i = 0; i < road.length; i++) {
        road[i].createConstructionSite(STRUCTURE_ROAD);
    }
    return;
}

function orderRoads(base, remote) {
    let sources = remote.find(FIND_SOURCES);
    
    if (sources.length == 2) {
        let sourceA = sources[0];
        let sourceB = sources[1];
        
        prior = [];
        let roadA = getRoad(base, sourceA);
        prior = roadA;
        let roadBgivenA = getRoad(base, sourceB);

        prior = [];
        let roadB = getRoad(base, sourceB);
        prior = roadB;
        let roadAgivenB = getRoad(base, sourceA);
        
        let planA = roadA.concat(roadBgivenA);
        let planB = roadB.concat(roadAgivenB);
        
        if (planA.length < planB) {
            orderRoad(planA);
        } else {
            orderRoad(planB);
        }
    } else if (sources.length == 1) {
        orderRoad(getRoad(base, sources[0]));
    }
}

function doSetup(base, remoteRoomName) {
    // Wait for visibility.
    let remote = Game.rooms[remoteRoomName];
    
    if (!remote) {
        return;
    }
    
    // If the room needs roads, build them.
    if (remote.memory.makeRoads) {
        orderRoads(base, remote);
        delete remote.memory.makeRoads;
    }
}

function updateRemote(base, remoteRoomName) {
    // Set up memory for the remote if it doesn't have any.
    if (!Memory.rooms[remoteRoomName]) {
        Memory.rooms[remoteRoomName] = {};
    }
    
    let mem = Memory.rooms[remoteRoomName];
    
    // Check fields.
    mem.execute = true;
    mem.role = 'mine';
    mem.base = base.name;
    mem.reserve = true;

    switch (mem.state) {
        case STATE_SETUP:
            doSetup(base, remoteRoomName);
            break;
        default:
            mem.state = STATE_SETUP;
            mem.makeRoads = true;
            break;
    }
}

exports.update = function(room) {
    if (!room.memory.remotes || !room.memory.remotes.length) {
        return;
    }

    for (let i = 0; i < room.memory.remotes.length; i++) {
        updateRemote(room, room.memory.remotes[i]);
    }
}