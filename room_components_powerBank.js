'use strict';

let Bankhauler = require('role_bankhauler');
let Bankhealer = require('role_bankhealer');
let Guardian = require('role_guardian');
let Robber = require('role_robber');

let SpawnJob = require('util_spawnJob');
let EventLog = require('util_event_log');

// Bank has just been identified. No other processing has been done yet.
const STATE_INIT = 'init';

// Effort to open bank is underway.
const STATE_WORK = 'work';

// Bank has been opened. Some loot is still available or in transit.
const STATE_LOOTING = 'looting';

// Bank is open and no more loot is available or in transit.
const STATE_DONE = 'done';

// Bank and its loot has been abandoned, for whatever reason.
const STATE_ABANDONED = 'abandoned';

// Don't pursue banks smaller than this.
const MIN_POWER_BANK_SIZE = 3000;

function log(room, key, message) {
    if (!(room instanceof Room)) {
        console.log('Bad args to log -- remember room and key.');
        return ERR_INVALID_ARGS;
    }
    room.logDebug(message);
    room.memory.powerBanks[key].log.push(Game.time + ' ' + message);
}

function setState(room, key, state) {
    let mem = room.memory.powerBanks[key];
    mem.state = state;
    mem.subState = 0;
    mem.lastStateTransition[state] = Game.time;
}

function estimatedTimeToKillBank(powerBank) {
	// Figure that it takes 500 ticks or so to get creeps to the target.
	// Robbers hit for 600 a tick, and there will be at most three at a time.
	// Safety margin of, say, 500 ticks.
	let initialEngagementDelay = 500;
	let robberHitsPerTick = 600;

    // Three is enough to do the job. Don't use more, even if we're in a hurry.
    // Because we won't be. In practice, banks will always be spotted within a
    // few ticks of their appearance.
    let maxAttackers = Math.min(3,powerBank.getMaxAttackers());

	let ticksToKill = Math.ceil(
		POWER_BANK_HITS / (robberHitsPerTick * maxAttackers));
	let safetyMargin = 500;
	let requiredTime = initialEngagementDelay + ticksToKill + safetyMargin;
	
	return requiredTime;
}

function doInit(room, key) {
    let powerBank = Game.getObjectById(key);

    let mem = room.memory.powerBanks[key];

    mem.initTime = Game.time;
    mem.log = [];
    mem.lastStateTransition = {init: Game.time};
    mem.powerInBank = powerBank.power;
    mem.powerLoaded = 0;
    mem.powerDelivered = 0;
    
    // If the bank is too small, ignore it.
    if (powerBank.power < MIN_POWER_BANK_SIZE) {
        log(room, key, `Bank too small (${powerBank.power}). Abandoning it.`);
        mem.finalResult = `abandoned, size`;
        setState(room, key, STATE_ABANDONED);
        return;
    }
    
    // If it's damaged and there are hostile creeps near it, ignore it.
    if (powerBank.hits < POWER_BANK_HITS &&
        powerBank.pos.findInRange(room.foreignCreeps, 6).length) {
        log(room, key, `Hostiles are already working the site. Abandoning it.`);
        mem.finalResult = `abandoned, taken`;
        setState(room, key, STATE_ABANDONED);
        return;
    }
    
    // If there isn't enough time, ignore it.
    let requiredTime = estimatedTimeToKillBank(powerBank);
    log(room, key, `est. time=${requiredTime}, ttl=${powerBank.ticksToDecay}`);
    if (powerBank.ticksToDecay < requiredTime) {
        log(room, key, `Not enough time. Abandoning it.`);
        mem.finalResult = `abandoned, time (rt=${requiredTime}. ttd=${powerBank.ticksToDecay})`;
        setState(room, key, STATE_ABANDONED);
        return;
    }

    // Identify source rooms.
    let sourceRooms = _.map(powerBank.getBasesInRange(), 'roomName');
    if (!sourceRooms.length) {
        log(room, key, `No eligible bases within reach. Abandoning it.`);
        mem.finalResult = `abandoned, too far`;
        setState(room, key, STATE_ABANDONED);
        return;
    }
    
    // Find nearest terminal.
    let nearestTerminal = powerBank.pos.findClosestTerminal();
    if (!nearestTerminal) {
        log(room, key, `No terminal to deliver to? Wtf?`);
        mem.finalResult = `abandoned, no terminal`;
        setState(room, key, STATE_ABANDONED);
        return;
    }
    
    // Open this bank.
    log(room, key, `Attempting to open bank.`);
    mem.sourceRooms = sourceRooms;
    mem.destination = nearestTerminal.id;
    // TODO: Have the bankhaulers switch from destination to deliveryRoom.
    mem.deliveryRoom = nearestTerminal.pos.roomName;
    mem.noKill = true;
    mem.pos = powerBank.pos;
    mem.maxAttackers = Math.min(3,powerBank.getMaxAttackers());
    setState(room, key, STATE_WORK);
    return;
}

function robberDamage(robbers) {
    // Estimate that robbers will reach the bank no later than TTL 1200.
    return 600 * _.sum(
        robbers,
        function(c) {
            return Math.min(c.ticksToLive || 1200, 1200);
        });
}

function ticksToDeath(powerBank) {
    // Very crude: Just assume all nearby robbers will live forever.
    let nearbyCreeps = powerBank.pos.findInRange(FIND_CREEPS, 1);
    let totalHits = _.sum(nearbyCreeps, 'attackPower');

    return Math.floor(powerBank.hits / (totalHits || 1));
}

const ROBBER_MODEL = 1;
const HEALER_MODEL = 1;
const GUARDIAN_MODEL = 6;
const LARGEST_HAULER = 16;
const SMALLEST_HAULER = 8;

function doWork(room, key) {
    let powerBank = Game.getObjectById(key);
    let mem = room.memory.powerBanks[key];
    
    if (!powerBank) {
        let piles = room.find(FIND_DROPPED_RESOURCES, {
            filter: p => p.resourceType == RESOURCE_POWER
        });

        let ruins = room.find(FIND_RUINS, {filter: r => r.store.power});
        
        if (piles.length || ruins.length) {
            room.logDebug('Bank is gone. Looting.');
            setState(room, key, STATE_LOOTING);
            return;
        } else {
            room.logError('Bank is gone. Abandoning.');
            mem.finalResult = `abandoned, vanished`;
            setState(room, key, STATE_ABANDONED);
            return;
        }
    }

    let guards = _.filter(
        room.ownedCreeps,
        c => c.memory.role == 'guardian' && c.memory.workRoom == room.name);

    let longLivedGuards = _.filter(guards, c => c.spawning || c.ticksToLive > 350);

    let robbers = _.filter(
        room.ownedCreeps,
        c => c.memory.role == 'robber' && c.memory.target == key);

    let longLivedRobbers = _.filter(robbers, c => c.spawning || c.ticksToLive > 350);

    let healers = _.filter(
        room.ownedCreeps,
        c => c.memory.role == 'bankhealer' && c.memory.target == key);
        
    let longLivedHealers = _.filter(healers, c => c.spawning || c.ticksToLive > 350);

    let ticksLeft = ticksToDeath(powerBank);
    
    // Spawn a guard if there are too few, and if there's been any recent resistance.
    let desiredGuards = room.memory.guardianCount || 1;
    let insufficientGuards = longLivedGuards.length < desiredGuards;
    let dangerousRoom = room.memory.uncontestedBanks < 2 &&
                        room.memory.clearedBanks > room.memory.uncontestedBanks;
    let resistance = room.memory.powerBanks[key].firstAttack > 0;
    let enoughTimeToMakeEffectiveGuards = ticksLeft > 350;

    if (insufficientGuards && (dangerousRoom || resistance) && enoughTimeToMakeEffectiveGuards) {
        let result = Guardian.requestSpawnRoom(
            room.memory.powerBanks[key].sourceRooms,
            room.memory.guardianModel || GUARDIAN_MODEL,
            room.name,
            SpawnJob.PRIORITY_HIGH);
        if (result != OK) {
            room.logError('Failed to spawn Guardian:' + result);
        }
    }
    
    
    // Spawn a robber if there's an equal number of robbers and healers, we
    // need yet more robbers to open the bank, and there's room for another
    // attacker on the bank.
    if (longLivedRobbers.length < room.memory.powerBanks[key].maxAttackers &&
        healers.length >= longLivedRobbers.length &&
        powerBank.hits > robberDamage(robbers)) {
        let result = Robber.requestSpawn(
            room.memory.powerBanks[key].sourceRooms,
            ROBBER_MODEL,
            room.name,
            powerBank.id,
            SpawnJob.PRIORITY_HIGH+1);
        if (result != OK) {
            room.logError('Failed to spawn Robber:' + result);
        }
    }

    // Spawn a healer if there are more robbers than healers.
    if (longLivedRobbers.length > longLivedHealers.length) {
        let result = Bankhealer.requestSpawn(
            room.memory.powerBanks[key].sourceRooms,
            HEALER_MODEL,
            room.name,
            powerBank.id,
            SpawnJob.PRIORITY_HIGH+1);
        if (result != OK) {
            room.logError('Failed to spawn Bankhealer:' + result);
        }
    }
    
    if (ticksLeft > 500) {
        return;
    }

    // Spawn a hauler if the bank is likely to die within 500 ticks and we
    // don't have enough on the way.
    let haulers = _.filter(
        room.ownedCreeps,
        c => c.memory.role == 'bankhauler' && c.memory.target == key);
        
    let haulerCapacity = _.sum(haulers, c => c.store.getCapacity());
    
    if (haulerCapacity < powerBank.power) {
        let excess = powerBank.power - haulerCapacity;
        let model = Math.min(LARGEST_HAULER, Math.ceil(excess / 100));
        model = Math.max(model, SMALLEST_HAULER);
        let result = Bankhauler.requestSpawn(
            room.memory.powerBanks[key].sourceRooms,
            model,
            room.name,
            powerBank.id,
            SpawnJob.PRIORITY_HIGH+2);
        if (result != OK) {
            room.logError('Failed to spawn Bankhauler:' + result);
        }
    }
    
    let nearbyHaulers = powerBank.pos.findInRange(haulers, 8);
    let nearbyHaulerCapacity = _.sum(nearbyHaulers, c => c.store.getCapacity());

    // Turn off the noKill flag if there are enough haulers nearby to haul away
    // all of the power.
    if (room.memory.powerBanks[key].noKill &&
        nearbyHaulerCapacity >= powerBank.power &&
        powerBank.hits < 25000) {
        room.memory.powerBanks[key].noKill = false;
        log(room, key, 'Sufficient haulers present. Turning off noKill flag.');
        return;
    }

    if (room.memory.powerBanks[key].noKill && powerBank.ticksToDecay < 25) {
        room.memory.powerBanks[key].noKill = false;
        log(room, key, 'Bank about to decay. Turning off noKill flag.');
        return;
    }
}

function doLooting(room, key) {
    let piles = room.find(FIND_DROPPED_RESOURCES, {
        filter: p => p.resourceType == RESOURCE_POWER
    });

    let ruins = room.find(FIND_RUINS, {filter: r => r.store.power});
    let mem = room.memory.powerBanks[key];
    
    if (!piles.length && !ruins.length) {
        room.logDebug('Loot is collected. Done.');
        mem.finalResult = `collected`;
        setState(room, key, STATE_DONE);
        return;
    }
}

function checkCommandFlags(room, key) {
    let powerBank = Game.getObjectById(key);
    let mem = room.memory.powerBanks[key];
    let pos;
    if (powerBank) {
        pos = powerBank.pos;
    } else if (mem.pos) {
        pos = room.getPositionAt(mem.pos.x, mem.pos.y);
    } else {
        return;
    }
    let flags = pos.findInRange(FIND_FLAGS, 3);
    
    for (let i=0; i < flags.length; i++) {
        let flag = flags[i];
        
        if (flag.name.startsWith('abandon')) {
            setState(room, key, STATE_ABANDONED);
            mem.finalResult = `abandoned, flag`;
            _(Game.creeps)
                .filter(c => c.memory.target == key)
                .forEach(function(c) {c.memory.state = 99;})
                .value();
            flag.remove();
            return;
        }
    }
}

function logBankCompletion(room, key) {
    let mem = room.memory.powerBanks[key];

    if (mem.powerInBank < MIN_POWER_BANK_SIZE) {
        return;
    }

    let roomName = room.name;
    let stateTimes = mem.lastStateTransition;
    let powerAvailable = mem.powerInBank;
    let powerLoaded = mem.powerLoaded;
    let powerDelivered = mem.powerDelivered;
    let finalResult = mem.finalResult;

    if (!Memory.powerBankLog) {
        Memory.powerBankLog = [];
    }

    Memory.powerBankLog.unshift(
        {roomName, stateTimes, powerAvailable, powerLoaded, powerDelivered, finalResult});
    Memory.powerBankLog = _.slice(Memory.powerBankLog, 0, 50);

    room.logDebug(
        `Logging completed bank. Power = ${powerAvailable}, ${powerLoaded}, ${powerDelivered}`);
}

function doDone(room, key) {
    let bank = Game.getObjectById(key);
    
    if (bank) {
        return;
    }

    let creeps = _.filter(
        Game.creeps,
        c => c.memory.target == key);
        
    if (creeps.length) {
        return;
    }

    room.memory.clearedBanks = (room.memory.clearedBanks || 0) + 1;

    if (room.memory.powerBanks[key].firstAttack) {
        room.memory.uncontestedBanks = 0;
        room.logError(`Finished bank, was resisted at ${room.memory.powerBanks[key].firstAttack}.`);
        if (!room.memory.guardianModel) {
            room.logError(`Room maybe needs guardianModel?`);
        }
    } else {
        room.memory.uncontestedBanks = (room.memory.uncontestedBanks || 0) + 1;
        //room.logError('Finished uncontested bank.');
    }

    logBankCompletion(room, key);

    //room.logError('Cleaning up power bank ' + key);
    delete room.memory.powerBanks[key];
}

function isHostileAttack(entry) {
    if (entry.event != EVENT_ATTACK) {
        return false;
    }

    let target = Game.getObjectById(entry.data.targetId);
    let actor = Game.getObjectById(entry.objectId);

    if (!target || !actor) {
        return false;
    }

    if (target.npc || actor.npc) {
        return false;
    }

    if (target.hostile || actor.hostile) {
        return true;
    }

    return false;
}

function checkHostileActivity(room, key) {
    if (room.memory.powerBanks[key].firstAttack) {
        // Room has already logged an attack. Don't look for more.
        return;
    }

    if (room.hostileAttackEvents.length) {
        room.memory.powerBanks[key].firstAttack = Game.time;
        EventLog.writeEntry(EventLog.POWER_BANK, room.name, 'Player interference.');
    }
}

function runPowerBank(room, key) {
    try {
    checkCommandFlags(room, key);
    } catch (err) {
        console.log('checkCommandFlags err=' + err);
    }

    checkHostileActivity(room, key);

    switch (room.memory.powerBanks[key].state) {
        case STATE_INIT:
            try {
            doInit(room, key);
            } catch (err) {
                room.logError('doInit err=' + err);
            }
            break;
        case STATE_WORK:
            try {
            doWork(room, key);
            } catch (err) {
                room.logError('doWork err=' + err);
            }
            break;
        case STATE_LOOTING:
            try {
            doLooting(room, key);
            } catch (err) {
                room.logError('doLooting err=' + err);
            }
            break;
        case STATE_DONE:
        case STATE_ABANDONED:
            doDone(room, key);
            break;
        default:
            room.logError('Bad state in powerBank. Should never happen.');
            return;
    }
}

function checkPowerFarms(room) {
    if (room.controller.level < 8 ||
        room.memory.noPowerFarming ||
        room.baseType == 'lw') {
        return OK;
    }

    const MAX_RANGE = 6;
    let highwayRooms = room.findHighwaysInRangeManhattan(MAX_RANGE);

    for (let i = 0; i < highwayRooms.length; i++) {
        let roomName = highwayRooms[i];
        let roomStatus = Game.map.getRoomStatus(roomName);
        if (!roomStatus || roomStatus.status == 'closed') {
            continue;
        }

        let mem = Memory.rooms[roomName];

        if (!mem) {
            console.log(`Highway room ${roomName} in farming range of base ${room.memory.code}` +
            ` has no room memory.`);
            continue;
        }

        if (!mem.farmPower && !mem.noFarm) {
            console.log(`Highway room ${roomName} in farming range of base ${room.memory.code}` +
            ` has neither farmPower no noFarm set.`);
        }

        if (mem.farmPower && mem.noFarm) {
            console.log(`Highway room ${roomName} in farming range of base ${room.memory.code}` +
            ` has both farmPower and noFarm set.`);
        }
    }

    return OK;
}

Room.prototype.checkPowerFarms = function() {
    return checkPowerFarms(this);
}

function update(room) {
    if (room.memory.uncontestedBanks > 10 && room.memory.guardianModel) {
        room.logError(`I have a guardianModel ${room.memory.guardianModel} and probably don't ` +
            `need it. Deleting.`);
        delete room.memory.guardianModel;
    }

    if (!room.memory.farmPower) {
        return;
    }

    if (!room.powerBanks.length &&
        (!room.memory.powerBanks || !_.keys(room.memory.powerBanks).length))  {
        return;
    }

    if (!room.memory.powerBanks) {
        room.memory.powerBanks = {};
    }

    // Look for new ones.
    if (Game.cpu.bucket > 8000) {
        for (let i = 0; i < room.powerBanks.length; i++) {
            let powerBank = room.powerBanks[i];
            if (!room.memory.powerBanks[powerBank.id]) {
                room.logDebug('New power bank.');
                room.memory.powerBanks[powerBank.id] = {
                    id: powerBank.id,
                    state: STATE_INIT
                }
            }
        }
    }

    // Maintain existing ones.
    for (let key in room.memory.powerBanks) {
        runPowerBank(room, key);
    }
}

module.exports = {
    checkPowerFarms,
    update
}