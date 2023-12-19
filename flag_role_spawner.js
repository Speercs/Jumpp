'use strict';

let SpawnJob = require('util_spawnJob');

function getRooms(flag, role) {
    let roleMem = flag.memory[role];
    let rooms = (roleMem.sourceRoom && [roleMem.sourceRoom]) ||
                roleMem.sourceRooms ||
                (flag.memory.sourceRoom && [flag.memory.sourceRoom]) ||
                flag.memory.sourceRooms ||
                (flag.room && flag.room.memory.base && [flag.room.memory.base]) ||
                [flag.pos.roomName];

    return rooms;
}

const SPAWNER_ROLES = {
    alfa:           {model: 1},
    basecourier:    {model: 4},
    builder:        {model: 1},
    claimer:        {model: 1},
    corer:          {model: 1},
    crane:          {model: 8, priority: SpawnJob.PRIORITY_HIGH},
    dismantler:     {model: 1},
    drone:          {model: 1},
    firefighter:    {model: 1},
    guardian:       {leadTime: 200, model: 1, priority: SpawnJob.PRIORITY_HIGH},
    healer:         {model: 1},
    loader:         {model: 4, priority: SpawnJob.PRIORITY_HIGH},
    queen:          {model: 2},
    robber:         {model: 2},
    settler:        {model: 2},
    steer:          {model: 2},
    template:       {model: 1},
    upgrader:       {model: 3, priority: SpawnJob.PRIORITY_LOW},
    wrecker:        {model: 1},
};

function doRole(flag, role) {
    let defaults = SPAWNER_ROLES[role];
    if (defaults == undefined) {
        flag.logError(`role ${role} missing from SPAWNER_ROLES.`);
        return;
    }

    let roleMem = flag.memory[role];

    let period = roleMem.period || flag.memory.period;

    if (period && (roleMem.count != undefined)) {
        flag.logError(`Flag ${flag.name} has invalid settings. Role ${role} has both count and period set.`);
        return;
    }

    if (period && roleMem._lastSpawn && (Game.time <= roleMem._lastSpawn.spawnTime + period)) {
        return;
    }

    let leadTime = roleMem.leadTime || defaults.leadTime || 0;
    let numExtant = _.filter(flag.creeps, c => c.memory.role == role && (c.ticksToLive > leadTime || c.spawning)).length;
    let numDesired = (roleMem.count == undefined && 1) || roleMem.count;

    let shouldSpawnMore = period || (numExtant < numDesired);
    
    if (shouldSpawnMore) {
        flag.logDebug('Ordering a ' + role + '...');
        
        let model = (roleMem.model == undefined) ? defaults.model : roleMem.model;
        let priority = roleMem.priority || defaults.priority || SpawnJob.PRIORITY_DEFAULT;
        
        try {
            if (creepExecutionOrder.get(role).requestSpawn(
                getRooms(flag, role),
                model,
                flag,
                priority) == OK) {
                flag.logDebug('...success.');
                flag.logDebug(getRooms(flag, role));
            } else {
                flag.logError('Failed to queue ' + role + '.');
            }
        } catch (err) {
            flag.logError('Exception in ' + role + ' requestSpawn: ' + err);
        }
    }
}

function evaluateFlagConditions(flag) {
    let mem = flag.memory.cond;
    let room = flag.room;

    if (!mem) {
        return true;
    }

    if (mem.roomLevel) {
        if (!room || mem.roomLevel > room.level) {
            return false;
        }
    }

    if (mem.hostilePlayerFighters) {
        if (!room || !_.any(room.hostilePlayerCreeps, c => c.isFighter())) {
            return false;
        }
    }

    return true;
}

function run(flag) {
    flag.logDebug('roleSpawn');
    
    if (!Memory.spawnEnabled) {
        flag.logError('Aborting. Global spawn disabled.');
        return;
    }

    if (flag.room &&
        flag.room.controller &&
        flag.room.controller.safeMode &&
        flag.room.controller.owner.username != MY_USERNAME) {
        return;
    }

    if (flag.memory.waitTime > Game.time) {
        return;
    }

    if (!evaluateFlagConditions(flag)) {
        return;
    }
    
    _(flag.memory)
        .keys()
        .intersection(_.keys(SPAWNER_ROLES))
        .forEach(function(role) {
            doRole(flag, role);
        })
        .value();
}

module.exports = {
    run
};
