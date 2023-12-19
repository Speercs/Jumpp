'use strict';

require('prototype_Creep.actions');
require('prototype_Creep.boost');
require('prototype_Creep.likelyNextPos');
require('prototype_Creep.ram');
require('prototype_Creep.xshard');

let RoomCallback = require('util_roomCallback');


Creep.prototype.execute = function() {
  let role = creepExecutionOrder.get(this.memory.role);

  if (this.spawning) {
    if (role.runSpawning) {
      role.runSpawning(this);
    }
  } else {
    role.run(this);
  }
}

Creep.prototype.canQuad = function() {
  let role = creepExecutionOrder.get(this.memory.role);

  return role && !!role.canQuad && role.canQuad(this);
}

Creep.prototype.needsPreUpdate = function() {
  let role = creepExecutionOrder.get(this.memory.role);

  return role && !!role.preUpdate;
}

Creep.prototype.preUpdate = function() {
  let role = creepExecutionOrder.get(this.memory.role);

  if (role.preUpdate) {
    role.preUpdate(this);
  }
}

Creep.prototype.bodyCost = function() {
  return _.sum(this.body, p => BODYPART_COST[p.type])
}

Creep.prototype.bodyTypeHits = function(bodyType) {
  return _.sum(this.body, function(b) {return b.type == bodyType ? b.hits : 0;});
}

Creep.prototype.doDieIfNuke = function (ticks) {
  if (!this.room.controller ||
    !this.room.controller.my ||
    !this.room.nukes.length ||
    this.memory.state == 99) {
    return;
  }

  let nextNuke = _.min(this.room.nukes, 'timeToLand');

  if (nextNuke.timeToLand < (ticks || 10)) {
    this.setState(99);
  }
}

Creep.prototype.doDie = function () {
  let creep = this;

  // If my current room has spawns, die here.
  let activeSpawns = _.filter(creep.room.spawns, s => s.my && s.active);
  if (activeSpawns.length) {
    if (!creep.isEmpty && creep.room.storage && creep.room.storage.my && creep.room.storage.active) {
      if (creep.myTransfer(creep.room.storage, creep.mainCargo()) == ERR_NOT_IN_RANGE) {
        creep.travelTo2(creep.room.storage);
      }
    } else {
      let availableRecyclePositions =
          _.filter(creep.room.recyclePositions, p => creep.pos.isEqualTo(p) || !p.hasCreep());

      let dieSpot = creep.pos.findClosestByPath(availableRecyclePositions);

      if (creep.pos.getRangeTo(dieSpot) == 0) {
        creep.memory.killMe = true;
        let spawns = creep.pos.findInRange(creep.room.spawns, 1);
        if (spawns.length) {
          spawns[0].myRecycleCreep(creep);
        }
      } else {
        creep.travelTo2(dieSpot, {range: 0, roomCallback: RoomCallback.avoidKeepersCallback});
      }
    }
  // Otherwise go to the room where I was spawned.
  } else {
    let spawn = Game.spawns[creep.memory.spawnedBy];
    creep.travelTo2(spawn, {roomCallback: RoomCallback.avoidKeepersCallback});
  }
}

function getWaypointPrefix(creep) {
  if (creep.flag && creep.flag.memory.waypointPrefix) {
    return creep.flag.memory.waypointPrefix;
  }

  if (creep.memory.waypointPrefix) {
    return creep.memory.waypointPrefix;
  }

  return undefined;
}

/**
 * Set the creep's currentWaypoint to whichever comes next. Return false
 * if there are no (more) waypoints, or true if we found and set one.
 */
function setNextWaypoint(creep, currentWaypoint) {
  let waypointPrefix = getWaypointPrefix(creep);
  if (!waypointPrefix) return false;

  let waypoints = _.filter(
    Game.flags, f => f.name.startsWith(waypointPrefix) && !(f.name <= currentWaypoint));

   if (!waypoints.length) {
     return false;
   }

  creep.memory.currentWaypoint = waypoints.sort()[0].name;
  return true;
}

Creep.prototype.doUnblock = function() {
  let blocked = this.pos.blockedCreep();

  if (blocked) {
    return this.travelTo2(blocked, {range: 0}) == OK;
  }
}

Creep.prototype.doWaypoint = function(endState) {
  if (!this.memory.currentWaypoint) {
    if (!setNextWaypoint(this)) {
      this.setState(endState);
      return;
    }
  }

  let flag = Game.flags[this.memory.currentWaypoint];

  if (this.pos.isNearTo(flag)) {
    if (setNextWaypoint(this, this.memory.currentWaypoint)) {
      flag = Game.flags[this.memory.currentWaypoint];
    } else {
      this.setState(endState);
      return;
    }
  }

  this.say(this.memory.currentWaypoint);
  this.travelTo2(flag, {range:0});
}

Creep.prototype.setState = function(state) {
  this.memory.state = state;
  this.memory.subState = 0;
}

/**
 * Given the current state of the creep, how many hits of actual damage will be suffered if 'damage'
 * hits are applied?
 */
Creep.prototype.getEffectiveDamage = function(damage) {
  return getEffectiveDamage(this.body, damage);
}

function getEffectiveDamage(body, damage) {
  let damageReduce = 0, damageEffective = damage;

  if(_.any(body, i => !!i.boost)) {
    for(let i = 0; i < body.length; i++) {
      if(damageEffective <= 0) {
        break;
      }
      let bodyPart = body[i], damageRatio = 1;
      if (bodyPart.boost &&
          BOOSTS[bodyPart.type][bodyPart.boost] &&
          BOOSTS[bodyPart.type][bodyPart.boost].damage) {
        damageRatio = BOOSTS[bodyPart.type][bodyPart.boost].damage;
      }
      let bodyPartHitsEffective = bodyPart.hits / damageRatio;
      damageReduce += Math.min(bodyPartHitsEffective, damageEffective) * (1 - damageRatio);
      damageEffective -= Math.min(bodyPartHitsEffective, damageEffective);
    }
  }

  return damage - Math.round(damageReduce);
}

/**
 * Given the current state of the creep, how many hits will it have if it sustains damaga0 damage
 * and receives heal0 heal this tick, and sustains damage1 damage and receives heal1 heal next
 * tick?
 */
Creep.prototype.getFutureHits = function(damage0, heal0, damage1, heal1) {
  let body = _.cloneDeep(this.body);
  applyDamage(body, damage0 || 0);
  healDamage(body, heal0 || 0);
  applyDamage(body, damage1 || 0);
  healDamage(body, heal1 || 0);
  return _.sum(body, 'hits');
}

function applyDamage(body, damage) {
  let damageEffective = getEffectiveDamage(body, damage);
  for (let i = 0; i < body.length; i++) {
    if (damageEffective <= 0) {
      break;
    }
    let damageToApply = Math.min(damageEffective, body[i].hits);
    damageEffective -= damageToApply;
    body[i].hits -= damageToApply;
  }
  return body;
}

function healDamage(body, damage) {
  if (body[body.length-1].hits < 1) return;

  for (let i = body.length-1; i >= 0; i--) {
    if (damage <= 0) {
      break;
    }
    let damageToHeal = Math.min(damage, 100-body[i].hits);
    damage -= damageToHeal;
    body[i].hits += damageToHeal;
  }
  return body;
}

/**
 * Given the current state of the creep, what's the largest amount of hits that can be applied
 * without inflicting more than 'damage' actual damage
 */
Creep.prototype.getRawDamage = function(damage) {
  let damageReduce = 0, damageActual = damage + 0.499;

  if (_.any(this.body, i => !!i.boost)) {
    for (let i = 0; i < this.body.length; i++) {
      if (damageActual <= 0) {
        break;
      }
      let bodyPart = this.body[i], damageRatio = 1;
      if (bodyPart.boost &&
          BOOSTS[bodyPart.type][bodyPart.boost] &&
          BOOSTS[bodyPart.type][bodyPart.boost].damage) {
        damageRatio = BOOSTS[bodyPart.type][bodyPart.boost].damage;
      }
      let hitsActual = Math.min(damageActual, bodyPart.hits);
      let hitsEffective = hitsActual / damageRatio;
      damageReduce += hitsEffective - hitsActual;
      damageActual -= hitsActual;
    }
  }

  return damage + Math.round(damageReduce);
}

Creep.prototype.numBodyparts = function(type) {
  return _.filter(this.body, p => p.type == type).length
}

Creep.prototype.hasParts = function(type) {
  return _.any(this.body, part => part.type == type);
}

Creep.prototype.isFighter = function() {
  return this.getActiveBodyparts(ATTACK) ||
      this.getActiveBodyparts(RANGED_ATTACK) ||
      this.getActiveBodyparts(HEAL);
}

function bodyPartAttack(bodyPart) {
  if (bodyPart.type != ATTACK) {
    return 0;
  }

  if (!bodyPart.hits) {
    return 0;
  }

  let attackPower = ATTACK_POWER;

  if (bodyPart.boost) {
    attackPower *= BOOSTS.attack[bodyPart.boost].attack;
  }

  return attackPower;
}

Object.defineProperty(Creep.prototype, 'attackPower', {
  get: function() {
    if (this._attackPower != undefined) {
      return this._attackPower;
    }

    if (this.invader && this.room.name.isCenterNine() && this.room.invaderCoreRuin) {
      return this._attackPower = 0;
    }

    return this._attackPower = _.sum(this.body, bodyPartAttack);
  },
  set: function() {},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Creep.prototype, 'boosted', {
  get: function() {
    if (this._boosted) {
      return this._boosted;
    } else {
      return this._boosted = _.any(this.body, b => b.boost);
    }
  },
  set: function() {},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Creep.prototype, 'damageTolerance', {
  get: function() {
    if (this._damageTolerance !== undefined) {
    }

    return this._damageTolerance = this.getRawDamage(this.healPower);
  },
  set: function() {},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Creep.prototype, 'naked', {
  get: function() {
    if (this._naked) {
      return this._naked;
    }

    return this._naked = !this.pos.hasRampart();
  },
  set: function() {},
  enumerable: false,
  configurable: true,
});

function bodyPartBuild(bodyPart) {
  if (bodyPart.type != WORK) {
    return 0;
  }

  if (!bodyPart.hits) {
    return 0;
  }

  let buildPower = BUILD_POWER;

  if (bodyPart.boost) {
    buildPower *= BOOSTS.work[bodyPart.boost].build;
  }

  return buildPower;
}

Object.defineProperty(Creep.prototype, 'buildPower', {
  get: function() {
    if (this._buildPower != undefined) {
      return this._buildPower;
    }

    return this._buildPower = _.sum(this.body, bodyPartBuild);
  },
  set: function() {},
  enumerable: false,
  configurable: true,
});

function bodyPartDismantle(bodyPart) {
  if (bodyPart.type != WORK) {
    return 0;
  }

  if (!bodyPart.hits) {
    return 0;
  }

  let dismantlePower = DISMANTLE_POWER;

  if (bodyPart.boost) {
    dismantlePower *= BOOSTS.work[bodyPart.boost].dismantle;
  }

  return dismantlePower;
}

Object.defineProperty(Creep.prototype, 'dismantlePower', {
  get: function() {
    if (this._dismantlePower != undefined) {
      return this._dismantlePower;
    }

    return this._dismantlePower = _.sum(this.body, bodyPartDismantle);
  },
  set: function() {},
  enumerable: false,
  configurable: true,
});

function bodyPartHarvest(bodyPart) {
  if (bodyPart.type != WORK) {
    return 0;
  }

  if (!bodyPart.hits) {
    return 0;
  }

  let harvestPower = HARVEST_POWER;

  if (bodyPart.boost) {
    harvestPower *= BOOSTS.work[bodyPart.boost].harvest;
  }

  return harvestPower;
}

Object.defineProperty(Creep.prototype, 'harvestPower', {
  get: function() {
    if (this._harvestPower != undefined) {
      return this._harvestPower;
    }

    return this._harvestPower = _.sum(this.body, bodyPartHarvest);
  },
  set: function() {},
  enumerable: false,
  configurable: true,
});

function bodyPartRepair(bodyPart) {
  if (bodyPart.type != WORK) {
    return 0;
  }

  if (!bodyPart.hits) {
    return 0;
  }

  let repairPower = REPAIR_POWER;

  if (bodyPart.boost) {
    repairPower *= BOOSTS.work[bodyPart.boost].repair;
  }

  return repairPower;
}

Object.defineProperty(Creep.prototype, 'repairPower', {
  get: function() {
    if (this._repairPower != undefined) {
      return this._repairPower;
    }

    if (this.invader && this.room.name.isCenterNine() && this.room.invaderCoreRuin) {
      return this._repairPower = 0;
    }

    return this._repairPower = _.sum(this.body, bodyPartRepair);
  },
  set: function() {},
  enumerable: false,
  configurable: true,
});

function bodyPartShoot(bodyPart) {
  if (bodyPart.type != RANGED_ATTACK) {
    return 0;
  }

  if (!bodyPart.hits) {
    return 0;
  }

  let shootPower = RANGED_ATTACK_POWER;

  if (bodyPart.boost) {
    shootPower *= BOOSTS.ranged_attack[bodyPart.boost].rangedAttack;
  }

  return shootPower;
}

Object.defineProperty(Creep.prototype, 'shootPower', {
  get: function() {
    if (this._shootPower != undefined) {
      return this._shootPower;
    }

    if (this.invader && this.room.name.isCenterNine() && this.room.invaderCoreRuin) {
      return this._shootPower = 0;
    }

    return this._shootPower = _.sum(this.body, bodyPartShoot);
  },
  set: function() {},
  enumerable: false,
  configurable: true,
});

function bodyPartUpgrade(bodyPart) {
  if (bodyPart.type != WORK) {
    return 0;
  }

  if (!bodyPart.hits) {
    return 0;
  }

  let upgradePower = UPGRADE_CONTROLLER_POWER;

  if (bodyPart.boost) {
    upgradePower *= BOOSTS.work[bodyPart.boost].upgradeController;
  }

  return upgradePower;
}

Object.defineProperty(Creep.prototype, 'upgradePower', {
  get: function() {
    if (this._upgradePower != undefined) {
      return this._upgradePower;
    }

    return this._upgradePower = _.sum(this.body, bodyPartUpgrade);
  },
  set: function() {},
  enumerable: false,
  configurable: true,
});

function bodyPartHeal(bodyPart) {
  if (bodyPart.type != HEAL) {
    return 0;
  }

  if (!bodyPart.hits) {
    return 0;
  }

  let healPower = HEAL_POWER;

  if (bodyPart.boost) {
    healPower *= BOOSTS.heal[bodyPart.boost].heal;
  }

  return healPower;
}

Object.defineProperty(Creep.prototype, 'healPower', {
  get: function() {
    if (this._healPower != undefined) {
      return this._healPower;
    }

    if (this.room.controller &&
        this.room.controller.safeMode &&
        this.owner.username != this.room.controller.owner.username) {
      return this._healPower = 0;
    }

    if (this.invader && this.room.name.isCenterNine() && this.room.invaderCoreRuin) {
      return this._healPower = 0;
    }

    return this._healPower = _.sum(this.body, bodyPartHeal);
  },
  set: function() {},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Creep.prototype, 'invader', {
  get: function() {return this.owner.username == 'Invader';},
  set: function() {},
  enumerable: false,
  configurable: true,
});

// Some creeps get treated as hostile, even if they're civilians in an intersection.
function isHostileAnyway(creep) {
  let myMiners = _.filter(creep.room.myCreeps, c => c.memory.role == 'miner');
  let myMinersWithinThree = creep.pos.findInRange(myMiners, 3);
  if (myMinersWithinThree.length) return true;
  let depositsWithinFour = creep.pos.findInRange(FIND_DEPOSITS, 4);
  if (depositsWithinFour.length) return true;
  return false;
}

Object.defineProperty(Creep.prototype, 'hostile', {
  get: function() {
    if (this.my || isFriendly(this.owner.username)) return false;

    // In highway intersections, treat as friendly any creep with only move and/or carry parts.
    if (this.room.name.isHighwayIntersection() && !isHostileAnyway(this)) {
      let bodyCounts = _(this.body).map('type').countBy().value();
      if (this.body.length == bodyCounts.move + (bodyCounts.carry || 0) + (bodyCounts.claim || 0)) {
        return false;
      }
    }
    return true;
  },
  set: function() {},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Creep.prototype, 'npc', {
  get: function() {return _.includes(NPCS, this.owner.username);},
  set: function() {},
  enumerable: false,
  configurable: true,
});

Creep.prototype.checkSuppressNotify = function() {
    if (this.memory.suppressNotify) {
      this.notifyWhenAttacked(false);
      delete this.memory.suppressNotify;
    }
}

Object.defineProperty(Creep.prototype, 'likelyDamage', {
  get: function() {
    // TODO: cache this.
    let rampartStrength = this.pos.rampart() && this.pos.rampart().hits || 0;
    return Math.max(this.getEffectiveDamage(this.likelyRawDamage) - rampartStrength, 0);
  },
  set: function() {},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Creep.prototype, 'maxDamage', {
  get: function() {
    // TODO: cache this.
    let rampartStrength = this.pos.rampart() && this.pos.rampart().hits || 0;
    return Math.max(this.getEffectiveDamage(this.maxRawDamage) - rampartStrength, 0);
  },
  set: function() {},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Creep.prototype, 'rangedHealPower', {
  get: function() {
    return this.healPower * RANGED_HEAL_POWER / HEAL_POWER;
  },
  set: function() {},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Creep.prototype, 'renewTicks', {
  get: function() {return Math.floor(600/this.body.length)},
  set: function() {},
  enumerable: false,
  configurable: true,
});

Creep.prototype.logDebug = function(text) {
  this.memory.logDebug = text;
  if (this.memory.debug) {
    console.log(`${this.pos.link} ${this.name}: ${text}`);
  }
}

Creep.prototype.logError = function(text) {
  this.memory.logError = text;
  console.log(`${this.pos.link} ${this.name}: ${text}`);
}

Creep.prototype.mainCargo = function() {
  const obj = this.store;
  let keys = Object.keys(obj);

  if (!keys.length) {
    return;
  }

  return keys.reduce(function(a, b){ return obj[a] > obj[b] ? a : b });
}

function checkTarget(target) {
  if (target.structureType && target.incomingDamage >= target.hits) {
    target.room.invalidateStructuresCache();
  }
}

Creep.prototype.myAttack = function(target) {
  if (!target) {
    return ERR_INVALID_ARGS;
  }
  let result = this.attack(target);
  if (result == OK) {
    if (target.hostile && !target.npc) {
      this.reportEngagement(`${this.name} attacks.`);
    }
    target.incomingDamage = (target.incomingDamage || 0) + this.attackPower;
    checkTarget(target);
  }
  return result;
}

Creep.prototype.myBuild = function(target) {
  let result = this.build(target);

  if (result != OK) {
    return result;
  }

  // Note: This is an optimistic estimate. Actual build may be less, depending on the energy
  // in hand and being withdrawn. Optimistic estimate is fine. We can tolerate lots of
  // false positives on the 'shoud we invalidate cache' thing.
  target.incomingBuild = (target.incomingBuild || 0) + this.buildPower;

  if (target.incomingBuild + target.progress >= target.progressTotal) {
    target.room.invalidateStructuresCache();
    this.logDebug('invalidating');
    if (this.room.isMyBase) {
      this.logDebug('setting _lastConstructTime');
      this.room.memory._lastConstructTime = Game.time+1;
    }
  }

  return result;
}

Creep.prototype.myDismantle = function(target) {
  if (!target) {
    return ERR_INVALID_ARGS;
  }
  let result = this.dismantle(target);
  if (result == OK) {
    if (target.hostile && !target.npc) {
      this.reportEngagement(`${this.name} dismantles.`);
    }
    target.incomingDamage = (target.incomingDamage || 0) + this.dismantlePower;
    checkTarget(target);
  }
  return result;
}

Creep.prototype.myHeal = function(target) {
  if (!target) {
    return ERR_INVALID_ARGS;
  }
  let result = this.heal(target);
  if (result == OK) {
    target.incomingHeal = (target.incomingHeal || 0) + this.healPower;
    this.isHealing = target;
  }
  return result;
}

Creep.prototype.myRangedAttack = function(target) {
  if (!target) {
    return ERR_INVALID_ARGS;
  }
  let result = this.rangedAttack(target);
  if (result == OK) {
    if (target.hostile && !target.npc) {
      this.reportEngagement(`${this.name} shoots.`);
    }
    target.incomingDamage = (target.incomingDamage || 0) + this.shootPower;
    this.isShooting = target;
    checkTarget(target);
  }
  return result;
}

Creep.prototype.myRangedHeal = function(target) {
  if (!target) {
    return ERR_INVALID_ARGS;
  }
  let result = this.rangedHeal(target);

  if (result == OK) {
    target.incomingHeal = (target.incomingHeal || 0) + this.rangedHealPower;
    this.isHealing = target;
  }

  return result;
}

Creep.prototype.myRangedMassAttack = function() {
  // TODO: Apply damage to targets.
  this.isShooting = true;
  this.reportEngagement(`${this.name} AEs.`);
  return this.rangedMassAttack();
}

Creep.prototype.mySignController = function() {
  if (!this.room.controller) return;

  if (this.room.controller.sign && this.room.controller.sign.text == MY_MARK) return;

  return this.signController(this.room.controller, MY_MARK);
}

Creep.prototype.myTransfer = function(target, resourceType, amount)  {
  if (target instanceof StructureLink && resourceType == RESOURCE_ENERGY) {
    if (!this.pos.isNearTo(target.pos)) {
      return ERR_NOT_IN_RANGE;
    }
    if (target.energy == LINK_CAPACITY) {
      return ERR_FULL;
    }
    target.registerTransfer(this, amount);
    return OK;
  }

  return this.transfer(target, resourceType, amount);
}

Creep.prototype.needsBoostedMove = function() {
  return this.getActiveBodyparts(MOVE) * 2 < this.body.length;
}

Creep.prototype.reportEngagement = function(message) {
  if (this.memory.noReport) {
    return;
  }

  this.room.reportEngagement(message);
}

Creep.prototype.roadTicksPerMove = function() {
  const moveParts = this.getActiveBodyparts(MOVE);
  const carryParts = this.getActiveBodyparts(CARRY);
  const carryPartsInUse = Math.ceil(this.store.getUsedCapacity() / 50);
  const allParts = this.body.length;
  const fatiguePerMove = allParts - moveParts - carryParts + carryPartsInUse;
  const ticksPerMove = Math.ceil(fatiguePerMove / (moveParts * 2));
  return ticksPerMove;
}

Object.defineProperty(Creep.prototype, 'totalTicksToLive', {
  get: function() {
    return this.ticksToSpawn + (this.ticksToLive || 1499);
  },
  set: function() {},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Creep.prototype, 'ticksToSpawn', {
  get: function() {
    if (!this.spawning) {
      return 0;
    }

    if (this._ticksToSpawn) {
      return this._ticksToSpawn;
    }

    let spawn = Game.spawns[this.memory.spawnedBy];
    if (!spawn) {
      this.logError(`(${this.room.link}) spawning creep has no spawn?`);
      return 0;
    }

    if (!spawn.spawning) {
      return 0;
    }

    return this._ticksToSpawn = spawn.spawning.remainingTime;
  },
  set: function() {},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Creep.prototype, 'workRoomControllerPos', {
  get: function() {
    if (this.memory.workRoom) {
      if (Game.rooms[this.memory.workRoom] && Game.rooms[this.memory.workRoom].controller) {
        // We have visibility on the room. Return its controller pos.
        return this.workRoomControllerPos = Game.rooms[this.memory.workRoom].controller.pos;
      } else if (Memory.rooms[this.memory.workRoom] &&
          Memory.rooms[this.memory.workRoom].controllerPos) {
        // We don't have visibility on the room, but we've stored its
        // controller position. Return that.
        return this.workRoomControllerPos = new RoomPosition(
            Memory.rooms[this.memory.workRoom].controllerPos.x,
            Memory.rooms[this.memory.workRoom].controllerPos.y,
            this.memory.workRoom);
      } else {
        // We don't have any idea where the room's controller is. Just
        // return the center position of the room.
        return this.workRoomControllerPos = new RoomPosition(25, 25, this.memory.workRoom);
      }
    }

    return this.workRoomControllerPos = undefined;
  },
  set: function() {},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Creep.prototype, 'isFull', {
  get: function() {
    if (this._isFull !== undefined) return this._isFull;

    return this._isFull = !this.store.getFreeCapacity();
  },
  set: function() {},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Creep.prototype, 'isEmpty', {
  get: function() {
    if (this._isEmpty !== undefined) return this._isEmpty;

    return this._isEmpty = !this.store.getUsedCapacity();
  },
  set: function() {},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Creep.prototype, 'worldPos', {
  get: function() {
    if (this._worldPos !== undefined) return this._worldPos;

    return this._worldPos = WorldPosition.fromRoomPosition(this.pos);
  },
  set: function() {},
  enumerable: false,
  configurable: true,
});
