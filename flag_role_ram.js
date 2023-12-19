'use strict';

let Healer = require('role_healer');
let Sister = require('role_sister');
let Wrecker = require('role_wrecker');

let SpawnJob = require('util_spawnJob');

// Hasn't yet run. Sets some initial state and immediately goes to STANDBY.
const STATE_INIT = 'init';

// Waits for a spawn order. Updates position.
const STATE_STANDBY = 'standby';

// Issues spawn commands and waits until they're all assembled, then goes to
// FIGHT.
const STATE_SPAWN = 'spawn';

// Moves and fights.
const STATE_FIGHT = 'fight';

const MOVEMENT_MODE_RIGID = 'rigid';
const MOVEMENT_MODE_LOOSE = 'loose';

const killStructs = [STRUCTURE_TOWER, STRUCTURE_EXTENSION, STRUCTURE_SPAWN,
                    STRUCTURE_LINK, STRUCTURE_LAB, STRUCTURE_NUKER,
                    STRUCTURE_POWER_SPAWN, STRUCTURE_OBSERVER,
                    STRUCTURE_STORAGE, STRUCTURE_TERMINAL];

function setState(flag, state) {
    flag.memory.state = state;
    flag.memory.subState = 0;
}

function formationPosition(flag, role, subRole) {
    let centerPos = new RoomPosition(
        flag.memory.pos.x,
        flag.memory.pos.y,
        flag.memory.pos.roomName);
    
    let direction = flag.memory.facing;
    
    if (role == 'wrecker') {
        if (subRole == 'right') {
            direction = (direction + 0) % 8 + 1;
        } else if (subRole == 'left') {
            direction = (direction + 6) % 8 + 1;
        }
    } else if (role == 'healer') {
        if (subRole == 'right') {
            direction = (direction + 1) % 8 + 1;
        } else if (subRole == 'left') {
            direction = (direction + 5) % 8 + 1;
        } else {
            direction = 0;
        }
    } else if (role == 'sister') {
        direction = (direction + 3) % 8 + 1;
    }
    
    return centerPos.oneStep(direction);
}

function doInit(flag) {
    // Set facing
    flag.memory.facing = TOP;
    
    // Movement mode.
    flag.memory.movementMode = MOVEMENT_MODE_LOOSE;
    
    // Init sources
    delete flag.memory.sourceRooms;

    // Init enables & boosts
    if (!flag.memory.enable) {
        flag.memory.enable = {healer:false, healer_right: false, wrecker:false, wrecker_left: false, wrecker_right: false, sister:false};
    }

    if (flag.memory.boost == undefined) {
        flag.memory.boost = false;
    }
    
    // Init to test models.
    flag.memory.wreckerModel = flag.memory.wreckerModel || 21;
    flag.memory.healerModel = flag.memory.healerModel || 21;
    flag.memory.sisterModel = flag.memory.sisterModel || 21;
    
    flag.memory.spawnLock = true;
    
    // Stand by.
    setState(flag, STATE_STANDBY);
    return;
}

function doStandby(flag) {
    // Set position
    let waypointZero = getWaypoints(flag)[0];
    
    if (!waypointZero) {
        flag.logError('I need waypoints.');
        return;
    }
    flag.memory.pos = waypointZero.pos;
    flag.memory.currentWaypoint = waypointZero.name;
    
    if (Game.time >= flag.memory.spawnTime) {
        delete flag.memory.spawnTime;
        flag.memory.state = STATE_SPAWN;
        return;
    }
    
    // Run command flags.
    checkCommandFlags(flag);
}

function updateFormationPositions(flag) {
    for (let creepName in flag.creeps) {
        let creep = flag.creeps[creepName];
        creep.formationPos = formationPosition(flag, creep.memory.role, creep.memory.subRole);
        creep.inPosition = creep.pos.isEqualTo(creep.formationPos);
    }
}


function doSpawn(flag) {
    // Update ram position.
    let waypointZero = getWaypoints(flag)[0];
    
    if (!waypointZero) {
        flag.logError('I need waypoints.');
        return;
    }
    flag.memory.pos = waypointZero.pos;
    flag.memory.currentWaypoint = waypointZero.name;
    
    // Update member formation positions.
    updateFormationPositions(flag);

    // If we have three creeps all in position, move to FIGHT.
    let expectedCreeps = _.filter(flag.memory.enable, e => e).length;
    if (_.filter(flag.creeps, c => c.inPosition).length == expectedCreeps) {
        flag.logError('Ready');
        _(flag.creeps).values().forEach(c => c.notifyWhenAttacked(false)).value();
        setState(flag, STATE_FIGHT);
        return;
    }

    // Run command flags.
    checkCommandFlags(flag);

    // Spawn anything that needs spawning.
    updateSpawns(flag, 'wrecker');
    updateSpawns(flag, 'wrecker', 'left');
    updateSpawns(flag, 'wrecker', 'right');
    updateSpawns(flag, 'healer');
    updateSpawns(flag, 'healer', 'right');
    updateSpawns(flag, 'sister');
    
    // Move anyone who isn't in position.
    let needsToMove = _.filter(
        flag.creeps,
        c => c.memory.state == STATE_APPENDAGE && !c.inPosition);
        
    for (let i=0; i < needsToMove.length; i++) {
        let creep = needsToMove[i];
        creep.travelTo2(creep.formationPos, {
            allowSK: true,
            ignoreCreeps: true,
            ignoreRoads: true,
            range: 0
        });
    }
}

function updateWaypoints(flag) {
    updateFormationPositions(flag);
    
    // If anyone is out of position, wait.
    if (!_.every(flag.creeps, 'inPosition')) {
        return;
    }
    
    let waypoint = Game.flags[flag.memory.currentWaypoint];
    if (!waypoint) {
        // No waypoint? We're done.
        return;
    }
    
    // If the waypoint has a facing instruction and we aren't facing that way,
    // make the change.
    if (waypoint.memory.face && waypoint.memory.face != flag.memory.facing) {
        flag.memory.facing = waypoint.memory.face;
        return;
    }
    
    // If the waypoint commands a change to rigid order, do that.
    if (waypoint.memory.rigid) {
        flag.memory.movementMode = MOVEMENT_MODE_RIGID;
        // Fall through -- Changing formation doesn't take any time.
    }
    
    // If the waypoint commands a change to loose order, do that.
    if (waypoint.memory.loose) {
        flag.memory.movementMode = MOVEMENT_MODE_LOOSE;
        // Fall through -- Changing formation doesn't take any time.
    }
    
    // Advance to the next waypoint, if there is one.
    let waypoints = getWaypoints(flag);
    
    let index = _.indexOf(waypoints, waypoint);
    
    if (index == -1) {
        flag.logError('Current waypoint no longer matches flag.');
        delete flag.memory.currentWaypoint;
        return;
    }
    
    if (index == waypoints.length - 1) {
        // This is the last waypoint.
        return;
    }
    
    // Move to the next waypoint.
    let nextWaypoint = waypoints[index+1];
    flag.memory.currentWaypoint = nextWaypoint.name;
}

function doFightMoveLoose(flag) {
    // Update ram position.
    let waypoint = Game.flags[flag.memory.currentWaypoint];
    if (waypoint) {
        flag.memory.pos = waypoint.pos;
    }

    // Update member formation positions.
    updateFormationPositions(flag);

    // Move any non-fatigued creeps toward their correct positions.
    for (let creepName in flag.creeps) {
        let creep = flag.creeps[creepName];
        
        if (!creep.inPosition) {
            creep.travelTo2(creep.formationPos, {
                allowSK: true,
                ignoreCreeps: true,
                ignoreRoads: true,
                range: 0
            });
        }
    }
}

function doFightMoveRigid(flag) {
    let formationPos = new RoomPosition(
        flag.memory.pos.x,
        flag.memory.pos.y,
        flag.memory.pos.roomName);

    // Update member formation positions.
    updateFormationPositions(flag);

    // If the flag wants to move, all creeps have zero fatigue, and all creeps
    // are in position, move a notch and update member formation positions.
    let waypoint = Game.flags[flag.memory.currentWaypoint];
    if (waypoint &&
        !waypoint.pos.isEqualTo(formationPos) &&
        !_.sum(flag.creeps, 'fatigue') &&
        _.every(flag.creeps, 'inPosition')) {
        let ramMoveDirection = formationPos.getDirectionTo(waypoint);
        flag.memory.pos = formationPos.oneStep(ramMoveDirection);
        updateFormationPositions(flag);
    }
    
    // Move any non-fatigued creeps one step toward their correct positions.
    for (let creepName in flag.creeps) {
        let creep = flag.creeps[creepName];
        
        if (!creep.inPosition) {
            let direction = creep.pos.getDirectionTo(creep.formationPos);
            creep.move(direction);
        }
    }
}

function doFight(flag) {
    // If I've got no creeps left, go back to init.
    if (_.keys(flag.creeps).length == 0) {
        setState(flag, STATE_INIT);
        return;
    }

    // Run command flags.
    try {
        checkCommandFlags(flag);
    } catch (err) {
        console.log('checkCommandFlags error: ' + err);
    }

    // Update waypoints.
    try {
        updateWaypoints(flag);
    } catch (err) {
        console.log('updateWaypoints error: ' + err);
    }

    try {
        if (flag.memory.movementMode == MOVEMENT_MODE_RIGID) {
            doFightMoveRigid(flag);
        } else {
            doFightMoveLoose(flag);
        }
    } catch (err) {
        console.log('fightMove error: ' + err);
    }
    
    // Do non-movement actions
    for (let creepName in flag.creeps) {
        let creep = flag.creeps[creepName];
        doCreepActions(creep);
    }
}

function recycleCreeps(flag) {
    _(flag.creeps).forEach(function(creep) {creep.memory.state = 99;}).value();
}

function getWaypoints(flag) {
    let waypointPrefix = flag.memory.waypointPrefix || (flag.name + 'wp');
    return _(Game.flags)
        .filter(f => f.name.startsWith(waypointPrefix))
        .sortBy('name')
        .value();
}

function updateSpawns(flag, role, subRole) {
    let compositeRole = subRole ? role + '_' + subRole : role;

    if (!flag.memory.enable[compositeRole]) {
        return;
    }
    
    // How many are built or building?
    // TODO: Could this be flag.creeps?
    let creeps = _.filter(
        Game.creeps,
        c => c.memory.flagName == flag.name &&
             c.memory.role == role &&
             c.memory.subRole == subRole);

    let roles = {
        wrecker: {obj: Wrecker, model: 21},
        healer: {obj: Healer, model: 21},
        sister: {obj: Sister, model: 21},
    };
    
    if (!creeps.length) {
        // queue one
        flag.logDebug('Ordering a ' + role + '...');
        let rooms = [flag.pos.roomName];

        if (roles[role].obj.requestSpawnRam(
            rooms,
            flag.memory[role + 'Model'],
            flag.name,
            subRole,
            SpawnJob.PRIORITY_UNIT) == OK) {
            flag.logDebug('...success.');
        } else {
            flag.logError('Failed to queue ' + role + '.');
        }
    }
}

function validateSpawn(flag) {
    // Complain if we're not in standby mode.
    if (flag.memory.state != STATE_STANDBY) {
        flag.logError('spawn is valid only in STANDBY mode.');
        return ERR_INVALID_ARGS;
    }

    // Complain if the sourceRoom isn't set.
    let sourceRoom = Game.rooms[flag.memory.sourceRooms[0]];
    if (!sourceRoom || !sourceRoom.controller.my || sourceRoom.controller.level != 8) {
        flag.logError('Flag needs sourceRoom set.');
        return ERR_INVALID_TARGET;
    }

    return OK;
}

function checkCommandFlags(flag) {
    let waypoint = Game.flags[flag.memory.currentWaypoint];
    // Can't check for command flags in rooms with no visibility.
    if (!waypoint.room) {
        return;
    }
    let candidates = waypoint.pos.findInRange(FIND_FLAGS, 3);

    for (let i=0; i < candidates.length; i++) {
        switch (candidates[i].name) {
            case 'face':
                flag.memory.facing = waypoint.pos.getDirectionTo(candidates[i]);
                candidates[i].remove();
                break;
            case 'force':
                flag.memory.pos = candidates[i].pos;
                candidates[i].remove();
                break;
            case 'loose':
                flag.memory.movementMode = MOVEMENT_MODE_LOOSE;
                candidates[i].remove();
                break;
            case 'rigid':
                flag.memory.movementMode = MOVEMENT_MODE_RIGID;
                candidates[i].remove();
                break;
            case 'spawn':
                if (validateSpawn(flag) == OK) {
                    setState(flag, STATE_SPAWN);
                }
                candidates[i].remove();
                break;
            case 'reset':
                setState(flag, STATE_INIT);
                candidates[i].remove();
                break;
            case 'recycle':
                recycleCreeps(flag);
                setState(flag, STATE_INIT);
                candidates[i].remove();
                break;
            default:
                break;
        }
    }
}

const actions = {
    healer: doHealerActions,
    sister: doSisterActions,
    wrecker: doWreckerActions,
}

function doCreepActions(creep) {
    if (creep.getActiveBodyparts(WORK)) {
        try {
            doWreckerActions(creep);
        } catch (err) {
            console.log('doWreckerAction err: ' + err);
        }
    }

    if (creep.getActiveBodyparts(RANGED_ATTACK)) {
        try {
            doSisterActions(creep);
        } catch (err) {
            console.log('doSisterActions err: ' + err);
        }
    }

    if (creep.getActiveBodyparts(HEAL)) {
        try {
            doHealerActions(creep);
        } catch (err) {
            console.log('doHealerActions err: ' + err);
        }
    }

    if (creep.getActiveBodyparts(ATTACK)) {
        try {
            doBruiserActions(creep);
        } catch (err) {
            console.log('doBruiserActions err: ' + err);
        }
    }
}

function healerHeal(healer, target) {
    if (healer.pos.isNearTo(target)) {
        healer.heal(target);
        target.incomingHeal += healer.getActiveBodyparts(HEAL) * HEAL_POWER;
    } else {
        healer.rangedHeal(target);
        target.incomingHeal += healer.getActiveBodyparts(HEAL) * RANGED_HEAL_POWER;
    }
}

function doHealerActions(creep) {
    let touchRangeFriendlies = creep.pos.findInRange(creep.room.myCreeps, 1);
    
    // Adjacent wounded unit, counting likely damage and incoming heals.
    let mostHurt = _.max(touchRangeFriendlies, function(c) {
        return c.hitsMax - (c.hits + c.incomingHeal - c.likelyDamage)
    });
    
    if (mostHurt &&
        mostHurt.hitsMax > mostHurt.hits + mostHurt.incomingHeal - mostHurt.maxDamage) {
        healerHeal(creep, mostHurt);
        return;
    }
    
    let distantFriendlies = creep.pos.findInRange(creep.room.myCreeps, 3);

    // Distant wounded unit, counting likely damage and incoming heals.
    mostHurt = _.max(distantFriendlies, function(c) {
        return c.hitsMax - (c.hits + c.incomingHeal - c.likelyDamage)
    });
    
    if (!creep.isShooting &&
        mostHurt &&
        mostHurt.hitsMax > mostHurt.hits + mostHurt.incomingHeal - mostHurt.likelyDamage) {
        healerHeal(creep, mostHurt);
        return;
    }
    
    // Adjacent wounded unit, not counting incoming heals.
    mostHurt = _.max(touchRangeFriendlies, function(c) {
        return c.hitsMax - c.hits;
    });
    
    if (mostHurt && mostHurt.hitsMax > mostHurt.hits + mostHurt.incomingHeal) {
        healerHeal(creep, mostHurt);
        return;
    }
    
    // Distant wounded unit, not counting incoming heals.
    mostHurt = _.max(distantFriendlies, function(c) {
        return c.hitsMax - c.hits;
    });
    
    if (!creep.isShooting &&
        mostHurt && mostHurt.hitsMax > mostHurt.hits + mostHurt.incomingHeal) {
        healerHeal(creep, mostHurt);
        return;
    }
    
    // My wrecker.
    let myWrecker = _.filter(
        touchRangeFriendlies,
        c => c.memory.flagName == creep.memory.flagName && c.memory.role == 'wrecker')[0];

    if (myWrecker) {
        healerHeal(creep, myWrecker);
        return;
    }
    
    // Any wrecker in touch range.
    let anyWrecker = _.filter(touchRangeFriendlies,  c => c.memory.role == 'wrecker')[0];

    if (anyWrecker) {
        healerHeal(creep, anyWrecker);
        return;
    }

    // Myself.
    healerHeal(creep, creep);
}

function getDrillFlag(creep, range) {
    return creep.pos.findInRange(
        FIND_FLAGS,
        range,
        {filter: f => f.name.startsWith('drill') && !f.naked}).sort()[0];
}

function doSisterActions(creep) {
    try {
        let nakedHostiles = _.filter(creep.room.hostileCreeps, c => c.naked);
    
        let healers = creep.pos.findInRange(nakedHostiles, 3, {
            filter: c => c.healPower && !c.pos.findInRange(c.room.ramparts,0).length
        });
        
        if (healers.length) {
            creep.myRangedAttack(_.min(healers, 'hits'));
            return;
        }
    
        let creeps = creep.pos.findInRange(nakedHostiles, 3, {
            filter: c => !c.pos.findInRange(c.room.ramparts,0).length
        });
        
        if (creeps.length) {
            creep.myRangedAttack(_.min(creeps, 'hits'));
            return;
        }
        
        if (creep.memory.ae) {
            creep.myRangedMassAttack();
            return;
        }
    } catch (err) {
        creep.logError('sister part 1: ' + err);
    }
    
    try {
        let nakedStructure = creep.pos.findInRange(FIND_HOSTILE_STRUCTURES, 3, {
            filter: s => !s.my && s.naked && killStructs.includes(s.structureType)
        })[0];
        
        if (nakedStructure) {
            creep.myRangedAttack(nakedStructure);
            return;
        }
    } catch (err) {
        creep.logError('sister part 2: ' + err);
    }

    try {
        let drillFlag = getDrillFlag(creep, 3);
        if (drillFlag) {
            let flaggedRampart = drillFlag.pos.findInRange(
                _.union(creep.room.ramparts, creep.room.constructedWalls),
                0,
                {filter: s => !s.my})[0];
            
            if (flaggedRampart) {
                creep.myRangedAttack(flaggedRampart);
                return;
            }
        }
    } catch (err) {
        creep.logError('sister part 3: ' + err);
    }
    
    try {
        let wreckerPosition = creep.pos.oneStep(creep.flag.memory.facing);
        let forePosition = wreckerPosition.oneStep(creep.flag.memory.facing);
            
        if (forePosition.roomName == creep.pos.roomName) {
            let rampartAhead = forePosition.findInRange(creep.room.ramparts, 0, {
                filter: s => !s.my
            })[0];

            if (rampartAhead) {
                creep.myRangedAttack(rampartAhead);
                return;
            }
        }

        if (wreckerPosition.roomName == creep.pos.roomName) {
            let anyRampart = wreckerPosition.findInRange(creep.room.ramparts, 1, {
                filter: s=> !s.my
            });

            if (anyRampart.length) {
                let weakest = _.min(anyRampart, 'hits');
                creep.myRangedAttack(weakest);
                return;
            }
        }
    } catch (err) {
        creep.logError('sister part 4: ' + err + ' ' + creep.pos);
    }
}

function doBruiserActions(creep) {
    try {
        let nakedHostiles = _.filter(creep.room.hostileCreeps, c => c.naked);
    
        let healers = creep.pos.findInRange(nakedHostiles, 1, {
            filter: c => c.healPower
        });
        
        if (healers.length) {
            creep.myAttack(_.min(healers, 'hits'));
            return;
        }
    
        let creeps = creep.pos.findInRange(nakedHostiles, 1);
        
        if (creeps.length) {
            creep.myAttack(_.min(creeps, 'hits'));
            return;
        }
    } catch (err) {
        creep.logError('bruiser part 1: ' + err);
    }
    
    try {
        let nakedStructure = creep.pos.findInRange(FIND_HOSTILE_STRUCTURES, 1, {
            filter: s => !s.my && s.naked && killStructs.includes(s.structureType)
        })[0];
        
        if (nakedStructure) {
            creep.myAttack(nakedStructure);
            return;
        }
    } catch (err) {
        creep.logError('bruiser part 2: ' + err);
    }

    try {
        let drillFlag = getDrillFlag(creep, 1);
        if (drillFlag) {
            let flaggedRampart = drillFlag.pos.findInRange(
                _.union(creep.room.ramparts, creep.room.constructedWalls),
                0,
                {filter: s => !s.my})[0];
            
            if (flaggedRampart) {
                creep.myAttack(flaggedRampart);
                return;
            }
        }
    } catch (err) {
        creep.logError('bruiser part 3: ' + err);
    }
}

function doWreckerActions(creep) {
    if (creep.room.controller && creep.room.controller.my) {
        return;
    }

    let nearbyWallsAndRamparts = creep.pos.findInRange(
        _.union(creep.room.ramparts, creep.room.constructedWalls),
        1);
    let drillFlag = getDrillFlag(creep, 1);
    if (drillFlag) {
        let flaggedRampart = drillFlag.pos.findInRange(nearbyWallsAndRamparts, 0, {
            filter: s => !s.my
        })[0];
        
        if (flaggedRampart) {
            creep.myDismantle(flaggedRampart);
            return;
        }
    }

    let nakedStructures = creep.pos.findInRange(FIND_HOSTILE_STRUCTURES, 1, {
        filter: s => s.naked && s.hostile && killStructs.includes(s.structureType)
    });
    
    if (nakedStructures.length) {
        creep.myDismantle(nakedStructures[0]);
        return;
    }
    
    let forePosition = creep.pos.oneStep(creep.flag.memory.facing);
    if (Game.rooms[forePosition.roomName]) {
        let rampartAhead = forePosition.findInRange(nearbyWallsAndRamparts, 0, {
            filter: s => !s.my
        })[0];
    
        if (rampartAhead) {
            creep.myDismantle(rampartAhead);
            return;
        }
    }
    
    let anyRampart = creep.pos.findInRange(nearbyWallsAndRamparts, 1, {
        filter: s => !s.my
    });
    
    if (anyRampart.length) {
        let weakest = _.min(anyRampart, 'hits');
        creep.myDismantle(weakest);
        return;
    }
    
    if (creep.memory.ham) {
        let anyStructure = creep.pos.findInRange(FIND_STRUCTURES, 1)[0];
        
        if (anyStructure) {
            creep.myDismantle(anyStructure);
        }
    }
}


function draw(flag) {
    if (!flag.memory.pos) {
        return;
    }

    let visual = new RoomVisual(flag.memory.pos.roomName);
    
    // Draw a circle at our present location.
    visual.circle(
        flag.memory.pos.x,
        flag.memory.pos.y,
        {
            fill: 'transparent',
            stroke: 'yellow',
            strokeWidth: 0.15,
            opacity: 0.3,
            radius: 0.65
        });
        
    // Draw the facing indicator.
    let dx = [0,0,1,1,1,0,-1,-1,-1][flag.memory.facing];
    let dy = [0,-1,-1,0,1,1,1,0,-1][flag.memory.facing];
    let length = Math.sqrt(dx*dx + dy*dy);
    visual.line(
        flag.memory.pos.x,
        flag.memory.pos.y,
        flag.memory.pos.x + dx * length,
        flag.memory.pos.y + dy * length,
        {
            color: 'yellow',
            width: 0.15,
            opacity: 0.3,
        }
        );
}

exports.run = function(flag) {
    switch (flag.memory.state) {
        case STATE_INIT:
            doInit(flag);
            break;
        case STATE_STANDBY:
            doStandby(flag);
            break;
        case STATE_SPAWN:
            doSpawn(flag);
            break;
        case STATE_FIGHT:
            doFight(flag);
            break;
        default:
            setState(flag, STATE_INIT);
            break;
    }

    draw(flag);
}
