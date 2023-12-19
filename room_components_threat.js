'use strict';

// No dangerous hostiles.
const THREAT_NONE = 1;

// Hostiles that can be destroyed by a base's towers (base rooms) or a single
// model-1 guardian (other room types).
const THREAT_MINOR = 2;

// Anything bigger than MINOR.
const THREAT_MAJOR = 3;

function totalHeals(hostiles) {
    let totalHeal = 0;

    for (let i=0; i < hostiles.length; i++) {
        totalHeal += hostiles[i].healPower;
    }
    
    return totalHeal;
}

function onlyOneScout(hostiles) {
    return hostiles.length == 1 && hostiles[0].body.length == 1;
}

function otherThreat(room) {
    if (room.invaderCore) {
        return THREAT_MAJOR;
    }

    // Disregard unarmed scouts.
    if (onlyOneScout(room.hostileCreeps)) {
        return THREAT_NONE;
    }
    
    // A model-1 guardian can do 110 damage. Classify as MINOR any force that
    // heals less than that, and MAJOR as any force that heals 110+.
    let heals = totalHeals(room.hostileCreeps);
    
    if (heals < 110) {
        return THREAT_MINOR;
    }

    return THREAT_MAJOR;
}

const PLANNING_TOWER_DAMAGE = 300;

function baseThreat(room) {
    // No threat in safemode.
    if (room.controller.safeMode) {
        return THREAT_NONE;
    }

    // Disregard unarmed scouts unless they get near creeps or construction
    // sites.
    if (onlyOneScout(room.hostileCreeps) &&
        !room.hostileCreeps[0].pos.findInRange(FIND_MY_CREEPS, 1).length &&
        !room.hostileCreeps[0].pos.findInRange(FIND_MY_CONSTRUCTION_SITES, 3).length) {
        return THREAT_NONE;
    }
    
    // Anything player-owned and boosted is a MAJOR threat.
    if (_.any(room.hostileCreeps, c => c.owner.username != 'Invader' && c.boosted)) {
        return THREAT_MAJOR;
    }
    
    // Nothing is player-owned and boosted. A MAJOR threat is anything our
    // towers might not be able to handle.
    
    let enemyHeals = totalHeals(room.hostileCreeps);
    let activeTowers = _.filter(
        room.towers,
        t => t.active && t.energy >= TOWER_ENERGY_COST);

    let roughTowerDamage = activeTowers.length * PLANNING_TOWER_DAMAGE;
    
    if (enemyHeals < roughTowerDamage) {
        return THREAT_MINOR;
    }
    
    return THREAT_MAJOR;
}

function getThreatLevel(room) {
    if (!room.hostileCreeps.length) {
        return THREAT_NONE;
    }
    
    if (room.memory.role == 'base') {
        return baseThreat(room);
    } else {
        return otherThreat(room);
    }
}

module.exports = {
    THREAT_NONE,
    THREAT_MINOR,
    THREAT_MAJOR,
    getThreatLevel,
};