'use strict';

let Observe = require('util_observe');

function update() {
    if (!Memory.otacon) {
        Memory.otacon = {};
    }

    let roomTargets = _.groupBy(Memory.worms, 'targetRoom');

    function needsTarget(wormId) {
        return !(['countdown', 'spawn'].includes(Memory.worms[wormId].state));
    }

    for (let key in roomTargets) {
        if (!Memory.rooms[key]) {
            Memory.rooms[key] = {role:'wilderness', execute:true};
        }
        if (!Memory.rooms[key].execute) {
            Memory.rooms[key].execute = true;
        }
        if (!Memory.otacon[key]) {
            Memory.otacon[key] = {};
        }
        let roomWorms = _.map(roomTargets[key], 'id');
        let activeRoomWorms = _.filter(roomWorms, id => needsTarget(id));
        assignTargets(key, activeRoomWorms);
    }

    let roomsWithTargeting = _.keys(Memory.otacon);
    let roomsToForget = _.difference(roomsWithTargeting, _.keys(roomTargets));
    for (let key in roomsToForget) {
        delete Memory.otacon[roomsToForget[key]];
    }
}

function assignTargets(roomName, worms) {
    let room = Game.rooms[roomName];
    let numTargets = worms.length;
    let assignments = {};

    if (room) {
        let targets = chooseTargets(room, numTargets);
        let numTargetsToAssign = Math.min(targets.length, worms.length);

        for (let i = 0; i < numTargetsToAssign; i++) {
            // If the head element exists, assign the target that's best for it.
            let headElement = Game.getObjectById(Memory.worms[worms[i]].creeps[0]);
            if (headElement) {
                let headPosition = headElement.pos;
                let chosenTarget;
                if (headPosition.roomName == roomName) {
                    // If the head's old target is one of the options, and that target has a
                    // normal, and the head is on that normal, assign it again.
                    let oldTarget = Memory.otacon[roomName] &&
                        Memory.otacon[roomName].targets &&
                        Memory.otacon[roomName].targets[worms[i]];
                    let currentInstanceOfOldTarget = oldTarget &&
                        _.find(targets, t => t.isEqualTo(oldTarget.x, oldTarget.y));
                    let oldTargetNormal = oldTarget && oldTarget.normal;
                    let directionFromOldTarget =
                        currentInstanceOfOldTarget &&
                        currentInstanceOfOldTarget.getExactDirectionTo(headPosition);
                    if (currentInstanceOfOldTarget &&
                        oldTargetNormal &&
                        oldTargetNormal == directionFromOldTarget) {
                        chosenTarget = currentInstanceOfOldTarget;
                    } else {
                        chosenTarget = headPosition.findClosestByPath(targets);
                    }
                } else {
                    chosenTarget = _.min(targets, t => t.getRangeTo(headPosition));
                }
                assignments[worms[i]] = chosenTarget;
                _.pull(targets, chosenTarget);
            } else {
                // TODO: Something better!
                let chosenTarget = targets[0];
                assignments[worms[i]] = chosenTarget;
                _.pull(targets, chosenTarget);
            }
        }
    } else {
        // Let the old assignments stand.
        return;
    }

    Memory.otacon[roomName].targets = assignments;
}

function manualFlags(room) {
    return _(room.find(FIND_FLAGS))
        .filter(f => f.name.startsWith('gohere'))
        .sortBy('name')
        .value();
}

const TARGETABLE_STRUCTURES = new Set([STRUCTURE_EXTENSION, STRUCTURE_SPAWN, STRUCTURE_TOWER,
    STRUCTURE_POWER_SPAWN, STRUCTURE_OBSERVER, STRUCTURE_LAB, STRUCTURE_NUKER,
    STRUCTURE_TERMINAL, STRUCTURE_STORAGE, STRUCTURE_FACTORY]);
    
/**
 * Returns all naked targetable structures in the room, in any order.
 * TODO: Sort by priority.
 * @param {Room} room 
 */
function nakedTargetableStructures(room) {
    if (room._nakedTargetableStructures) {
        return room._nakedTargetableStructures;
    }

    return room._nakedTargetableStructures = _(room.find(FIND_STRUCTURES))
        .filter(s => s.pos.tileType == TILE_EXTERIOR && TARGETABLE_STRUCTURES.has(s.structureType))
        .value();
}

/**
 * Returns array of RoomPositions of all tiles adjacent to target that are walkable and EXTERIOR.
 */
function adjacentWalkableExteriorTiles(target) {
    let response = [];

    for (let y = target.pos.y - 1; y < target.pos.y + 2; y++) {
        for (let x = target.pos.x - 1; x < target.pos.x + 2; x++) {
            let pos = target.room.getPositionAt(x, y);
            if (pos.tileType == TILE_EXTERIOR && pos.isWalkable()) {
                response.push(pos);
            }
        }
    }

    return response;
}

/**
 * For each element in possibles, Find all the adjacent EXTERIOR tiles and add their positions
 * to targetArray.
 * @param {array[number]} targetArray 
 * @param {array[Structure]} possibles 
 */
function addTargets(targetArray, possibles) {
    for (let i in possibles) {
        let targetSites = adjacentWalkableExteriorTiles(possibles[i]);
        for (let j in targetSites) {
            targetArray.push(targetSites[j]);
        }
    }
}

/**
 * Returns all ramparts in the room that have targetNN flags on them.
 * @param {Room} room 
 */
function flaggedRampartsAndWalls(room) {
    if (room._flaggedRamparts) {
        return room._flaggedRamparts;
    }

    let ramparts = _(room.find(FIND_FLAGS))
        .filter(f => f.name.startsWith('target'))
        .sortBy('name')
        .map(f => f.pos.findInRange(room.ramparts, 0)[0])
        .compact()
        .value();

    return room._flaggedRamparts = ramparts;
}

/**
 * Returns all critical ramparts in the room, sorted by hits.
 * @param {Room} room 
 */
function criticalRamparts(room) {
    return _(_.union(room.ramparts, room.constructedWalls))
        .filter(r => r.pos.tileType == TILE_CRITICAL_WALL)
        .sortBy('hits')
        .value();
}

/**
 * Returns all ramparts in the room, sorted by hits.
 * @param {Room} room 
 */
function allRamparts(room) {
    return _(_.union(room.ramparts, room.constructedWalls))
        .sortBy('hits')
        .value();
}

/**
 * Identify enough targets for at least {number} worms. Return an array of at least {number}
 * objects {x, y}, each representing an external tile.
 * @param {StructureRoom} room 
 * @param {number} numTargets 
 */
function chooseTargets(room, numTargets) {
    let targets = [];

    // A flag named gohereNN
    let possibles = manualFlags(room);
    addTargets(targets, possibles);
    if (targets.length >= numTargets) {
        return targets;
    }

    // Naked spawns.
    possibles = _.filter(room.spawns, 'naked');
    addTargets(targets, possibles);
    if (targets.length >= numTargets) {
        return targets;
    }

    // Naked targetable structures.
    possibles = nakedTargetableStructures(room);
    addTargets(targets, possibles);
    if (targets.length >= numTargets) {
        return targets;
    }

    // Target-flagged ramparts.
    possibles = flaggedRampartsAndWalls(room);
    addTargets(targets, possibles);
    if (targets.length >= numTargets) {
        return targets;
    }

    // Towers.
    possibles = room.activeTowers;
    addTargets(targets, possibles);
    if (targets.length >= numTargets) {
        return targets;
    }

    // Spawns.
    possibles = room.spawns;
    addTargets(targets, possibles);
    if (targets.length >= numTargets) {
        return targets;
    }

    // Naked invader containers.
    possibles = _.filter(room.containers, c => c.naked && c.invader);
    addTargets(targets, possibles);
    if (targets.length >= numTargets) {
        return targets;
    }

    // Critical ramparts.
    possibles = criticalRamparts(room);
    addTargets(targets, possibles);
    if (targets.length >= numTargets) {
        return targets;
    }

    // Non-critical ramparts.
    possibles = allRamparts(room);
    addTargets(targets, possibles);
    if (targets.length >= numTargets) {
        return targets;
    }

    // Any walkable tile near the controller.
    possibles = [room.controller];
    addTargets(targets, possibles);
    if (targets.length >= numTargets) {
        return targets;
    }

    return targets;
}

function wormTarget(id) {
    if (Game.flags[id]) {
        return Game.flags[id].pos;
    }

    let oMem = Memory.otacon[Memory.worms[id].targetRoom];

    if (!oMem) {
        Observe.setNextScan(Memory.worms[id].targetRoom, 1);
        console.log(`otacon isn't getting visibility on ${Memory.worms[id].targetRoom}`);
        return;
    }

    let target = oMem.targets && oMem.targets[id];

    if (!target || !target.roomName) {
        // Normal for worms that haven't spawned yet.
        //console.log(`${id} (wormtarget) can't find a good target`);
        return;
    }

    return new RoomPosition(target.x, target.y, target.roomName);
}

module.exports = {
    TARGETABLE_STRUCTURES,
    flaggedRampartsAndWalls,
    nakedTargetableStructures,
    update,
    wormTarget
}
