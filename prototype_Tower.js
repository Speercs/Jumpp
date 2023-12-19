'use strict';

let Books = require('util_books');
let Threat = require('room_components_threat');

StructureTower.prototype.attackDamage = function(target) {
  return calcTowerDamageAtRange(this.pos.getRangeTo(target.pos));
}

StructureTower.prototype.healAmount = function(target) {
  let distance = this.pos.getRangeTo(target.pos);
  return Math.min(400, Math.max(100, (500 - distance * 20)));
}

StructureTower.prototype.myAttack = function(target) {
  this.attack(target);
  this.busy = true;
  Books.logEnergy(this, 'tower', TOWER_ENERGY_COST);
  target.incomingDamage += this.attackDamage(target);
}

Object.defineProperty(StructureTower.prototype, 'active', {
  get: function() {
    if (this.invader) {
      return !!this.room.invaderCore;
    }
    return this.__active;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

StructureTower.prototype.attackPowerAtPos = function(targetPos) {
  if (!targetPos instanceof RoomPosition ) return ERR_INVALID_ARGS;

  if (targetPos.roomName != this.room.name) return 0;

  if (!this.active) return 0;

  if (this.store[RESOURCE_ENERGY] < TOWER_ENERGY_COST) return 0;

  let multiplier = 1.0;

  if (this.effects && this.effects.length) {
    for (let effect of this.effects) {
      multiplier *= POWER_INFO[effect.power].effect[effect.level-1];
    }
  }
  
  let range = this.pos.getRangeTo(targetPos);
  return Math.floor(calcTowerDamageAtRange(range) * multiplier);
}

Object.defineProperty(StructureTower.prototype, 'disruptTicksRemaining', {
  get: function() {
    let effect = _.find(this.effects, e => e.power == PWR_DISRUPT_TOWER);

    return (effect && effect.ticksRemaining) || 0;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(StructureTower.prototype, 'needsOperate', {
  get: function() {
    let canOperate = this.active &&
        this.room.controller &&
        this.room.controller.isPowerEnabled &&
        !_.any(this.effects, e => e.power == PWR_OPERATE_TOWER);
            
    if (!canOperate) {
      return false;
    }

    let shouldOperate = this.room.alertCondition == ALERT_CONDITION_RED ||
        _.any(this.effects, e => e.power == PWR_DISRUPT_TOWER) ||
        this.room.memory.operateTowersUntil > Game.time;
        
    return shouldOperate;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

StructureTower.prototype.run = function() {
  this.room.logError(`Room using tower.run, which I thought was dead.`);
    let maxRange = this.room.memory.maxTowerRange || 50;
    let hostileCreeps = this.pos.findInRange(this.room.hostileCreeps, maxRange);
    
    if (hostileCreeps.length &&
        this.room.threatLevel != Threat.THREAT_NONE &&
        !this.room.memory.holdFire) {
        // Top priority: Healers.
      let closestHealer = this.pos.findClosestByRange(hostileCreeps, {
          filter: i => i.bodyTypeHits(HEAL) > 0 && i.hits > i.incomingDamage
      });
      if (closestHealer) {
        this.myAttack(closestHealer);
        return 1;
      }
        
        // Next priority: Enemies I can finish off.
      let closestHostile = this.pos.findClosestByRange(hostileCreeps, {
          filter: e => e.hits > e.incomingDamage &&
                  e.hits <= e.incomingDamage + this.attackDamage(e)
      });
      if (closestHostile) {
        this.myAttack(closestHostile);
        return 1;
      }
    
        // Next priority: Enemies.
      closestHostile = this.pos.findClosestByRange(hostileCreeps, {
          filter: e => e.hits > e.incomingDamage
      });
      if (closestHostile) {
        this.myAttack(closestHostile);
        return 1;
      }
    }

    // Next priority: Wounded.
  let closestWounded = this.pos.findClosestByRange(this.room.woundedCreeps);
  if (closestWounded && !this.room.memory.holdFire) {
    this.heal(closestWounded);
    closestWounded.incomingHeal = (closestWounded.incomingHeal || 0) + this.healAmount(closestWounded);
        Books.logEnergy(this, 'tower', TOWER_ENERGY_COST);
    return 1;
  }
  
  return 0;
}
