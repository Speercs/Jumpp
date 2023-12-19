'use strict';

// Block spawning until all my squadmates are ready.
Creep.prototype.synchronizeRamSpawn = function() {
    let creep = this;

    if (creep.memory.holdSpawn === undefined) {
        creep.memory.holdSpawn = true;
    } else if (creep.memory.holdSpawn) {
        let squadSize = _.filter(creep.flag.memory.enable).length;
        let readySquadmates = _(creep.flag.creeps)
            .filter(c => !c.spawning || !Game.spawns[c.memory.spawnedBy].spawning.remainingTime)
            .value()
            .length;

        if (readySquadmates == squadSize) {
            creep.memory.holdSpawn = false;
        }
    } else {
        // Lock has been released. Don't re-engage.
    }
}