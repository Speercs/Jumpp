'use strict';

let recycleCache = {};

function findRecyclePositionsBunker(room) {
    let positions = [];

    for (let index in room.spawns) {
        let spawn = room.spawns[index];

        for (let dir = 1; dir <= 8; dir++) {
            let pos = spawn.pos.oneStep(dir);
            if (pos.getRangeTo(room.bunkerCenter) == 2 &&
                pos.getRangeTo(room.cranePosition) > 1 &&
                pos.isWalkable()) {
                positions.push(pos);
            }
        }
    }

    return positions;
}

function findRecyclePositionsNonBunker(room) {
    if (room.memory.recyclePosition) {
        return [room.getPositionAt(room.memory.recyclePosition.x, room.memory.recyclePosition.y)];
    }

    if (room.baseType == 'lw' && room.mineralContainer) {
        return [room.mineralContainer.pos];
    }

    let possibles = [];

    let sessileCreepPositions = _.map(room.sessileCreeps, 'pos');

    let constructionSitePositions = _.map(room.constructionSitePositions, 'pos');

    for (let index in room.spawns) {
        let spawn = room.spawns[index];

        for (let dir = 1; dir <= 8; dir++) {
            let pos = spawn.pos.oneStep(dir);
            if (pos.isWalkable() &&
                !_.any(sessileCreepPositions, s => s.isEqualTo(pos)) &&
                !_.any(constructionSitePositions, s => s.isEqualTo(pos))) {
              possibles.push(pos);
            }
        }
    }

    if (!room.cranePosition) {
        return possibles;
    }

    let nearest = _.min(possibles, p => p.getRangeTo(room.cranePosition));
    let nearestDistance = nearest.getRangeTo(room.cranePosition);
    return _.filter(possibles, p => p.getRangeTo(room.cranePosition) == nearestDistance);
}

function checkRecycleCache(room) {
    let key = room.spawns.length + (room.storage ? 10 : 0);

    if (recycleCache[room.name] && recycleCache[room.name].key == key) {
        return;
    }

    if (!room.spawns.length) {
        return [];
    }

    let positions = [];

    if (room.baseType == 'bunker') {
        positions = findRecyclePositionsBunker(room);
    } else {
        positions = findRecyclePositionsNonBunker(room);
    }

    recycleCache[room.name] = {positions, key};
}

Object.defineProperty(Room.prototype, 'recyclePositions', {
    get: function() {
        if (this._recyclePositions) {
            return this._recyclePositions;
        } else {
            checkRecycleCache(this);
            return this._recyclePositions = recycleCache[this.name].positions;
        }
    },
    set: function(){},
    enumerable: false,
    configurable: true,
});
